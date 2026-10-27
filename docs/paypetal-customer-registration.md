# PayPetal: customer creation after signup

This is step 1 of the confirmed flow: create customer, create subwallet, initiate payment, release funds.

Both web and mobile registration paths (`signup` and `set-password`) save the user, a `payment_profiles` row and a unique `create_customer` job in one transaction. With `PAYMENTS_PROVIDER=paypetal` and `PAYPETAL_ENABLED=true`, the existing payment worker calls `POST /api/v1/customer` after the transaction commits, normally within its 10-second polling interval. Existing PayPetal authentication is retained.

The request maps the saved user's `fullName` to the required `fullname`. It includes `email` and/or `phoneNumber` when supplied at signup and omits absent contact fields. Whitespace is trimmed and email is lowercased. No KYC or bank account is required for customer creation.

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

## Failure handling

Provider availability does not block signup. The existing payment worker retries failed requests. After an uncertain outcome, it searches PayPetal customers for the saved identity instead of sending another create request. Missing or conflicting matches block the job for operator reconciliation. A reconciled customer record is retained in `customer_data`; the original POST response cannot be reconstructed if it was never received.

Apply `20261027000000-add-paypetal-customer-response.js` using `npm run migrate` before starting the updated server. It adds nullable response/error columns to existing payment profiles. Historical customer responses are not backfilled.

Run `npm run test:payments` for isolated tests of the API contract, transaction rollback, deferred profile completion, worker provisioning, full response retention and duplicate prevention. These tests do not call PayPetal or create real customers.
