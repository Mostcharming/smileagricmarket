# PayPetal: customer creation after signup

This is step 1 of the confirmed flow: create customer, create subwallet, initiate payment, release funds.

Both web and mobile registration paths (`signup` and `set-password`) save the user, a `payment_profiles` row and a unique `create_customer` job in one transaction. With `PAYMENTS_PROVIDER=paypetal` and `PAYPETAL_ENABLED=true`, the existing payment worker calls `POST /api/v1/customer` after the transaction commits, normally within its 10-second polling interval. Existing PayPetal authentication is retained.

The request maps the saved user's `fullName` to the required `fullname`. It uses their email when available. For phone-only users, PayPetal receives `smile-paypetal-<user UUID>@example.com`: a stable placeholder using the reserved example domain. This address is saved only in the payment identity and PayPetal response; the user's account email stays empty. Available phone numbers are included; missing phone numbers are omitted. Whitespace is trimmed and real email is lowercased. No KYC or bank account is required for customer creation.

Live sandbox verification returned HTTP 400 (`Email is required`) when email was omitted, so the placeholder is supplied even though the provider team stated only fullname was required. Pending profiles without an email gain a placeholder before their next create attempt. Identities already submitted with an uncertain outcome are preserved for reconciliation.

Existing signup fields remain optional. Only a missing full name defers customer creation: the payment profile is saved without a customer job until the name is added through the web profile endpoint. An email-only or phone-only signup with a name queues customer creation immediately. Signup remains available when PayPetal is disabled; no customer job is created in that mode.

## Persisted response

On `payment_profiles`:

| Column | Contents |
| --- | --- |
| `customer_id` | The returned `dataResponse.customerId`, uniquely indexed and reused by later payment steps |
| `customer_response` | The entire successful response: `status`, `statusCode`, `message`, `dataResponse`, and any extra fields |
| `customer_data` | Every field inside `dataResponse`, including `customerId`, `fullname`, `email`, `phoneNumber`, the original `createdAt` string and any extra fields |
| `customer_last_error` | Customer provisioning/reconciliation error, separate from bank verification errors |
| `creation_attempted_at` | Durable marker written before the API call to prevent duplicate creation after a timeout/crash |

Creating a customer does not mark the payout bank account verified. Payout setup reuses `customer_id`, with customer creation retained as a fallback for older users.

## Wallet setup and payout registration

The **Web Profile Wallet** and **Mobile Profile Wallet** Swagger categories each contain three authenticated endpoints:

- `GET /v1/{web|mobile}/profile/wallet/banks` returns all supported banks as `bankCode`, `bankName`, and optional `logoUrl`. Bank codes stay strings, including leading zeros.
- `POST /v1/{web|mobile}/profile/wallet/setup` creates or updates the wallet. Submit `bankCode`, `accountNumber` and `accountName`. The supplied account name must match PayPetal's resolved account name, ignoring case and surrounding whitespace. Missing or blank account names return HTTP 400; a mismatched name returns HTTP 409 with the resolved name. `bankName` is optional and is resolved internally when omitted. Returns HTTP 202 while payout registration is queued.
- `GET /v1/{web|mobile}/profile/wallet/get` retrieves the user's saved wallet details, including bank code, bank and account names, account number, verification status, verification timestamp and latest registration error. Poll after setup for registration completion; returns 404 if the wallet has not been set up.

Approved KYC remains required for setup. Phone-only users do not need to supply a real email. The separate user-facing payment bank-list, account-validation, account-registration/status and ROI-payout-list routes were removed. Wallet details are available through the Profile Wallet category for both web and mobile. Web profile details also include the wallet and its verification flag.

After setup, the `sync_account` job reuses the saved PayPetal customer ID and posts to `/api/v1/escrow/trustcore/payout/{customerId}` with exactly `accountNumber` and `bankCode`. An existing payout account is reused when its details match; changing an existing account uses the provider's PUT endpoint.

`payment_profiles.payout_response` stores the complete provider envelope (`status`, `responseCode`, `message`, `responseData`, and any extra fields). `payout_data` retains every account field, including customer ID, account number, bank code, account name and provider `createdAt`. The wallet is marked verified only after customer ID, account number, bank code and resolved account name match. The provider's canonical account name is saved on both the wallet and payment profile.

`payout_attempted_at` records an outbound registration attempt. Following an uncertain outcome, the worker checks provider account records before trying another mutation. An unresolved outcome blocks duplicate registration and changing bank details until reconciliation. If the original response was lost, the reconciled record is saved as `payout_data`; the original response envelope cannot be reconstructed.

Apply `20261027000001-add-paypetal-payout-response.js` before running the updated server. It adds nullable payout response, data and attempt-marker columns.

## Failure handling

Provider availability does not block signup. The existing payment worker retries failed requests. After an uncertain outcome, it searches PayPetal customers for the saved identity instead of sending another create request. Missing or conflicting matches block the job for operator reconciliation. A reconciled customer record is retained in `customer_data`; the original POST response cannot be reconstructed if it was never received.

Apply `20261027000000-add-paypetal-customer-response.js` using `npm run migrate` before starting the updated server. It adds nullable response/error columns to existing payment profiles. Historical customer responses are not backfilled.

Run `npm run test:payments` for isolated tests of the API contract, transaction rollback, deferred profile completion, worker provisioning, full response retention and duplicate prevention. These tests do not call PayPetal or create real customers.
