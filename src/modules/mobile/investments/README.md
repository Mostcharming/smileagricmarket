# Mobile investment API

Production base: `https://app.smileagrimarket.com/api/v1/mobile`.
Local base: `http://localhost:5011/v1/mobile`.
All endpoints below require `Authorization: Bearer <mobile-login-token>` and use
the existing `{ error, message, data }` response envelope, except the text download.
Swagger is available at `/api-docs` and `/api-docs.json` under **Mobile Investments**,
**Mobile Portfolio**, and **Mobile Farm Categories**.

## Screen flow

| Screen/action | Endpoint | Notes |
| --- | --- | --- |
| Farm cards and filter sheet | `GET /investments` | Paginated verified farms. Supports category, search, location, risk, duration, funding status, ROI and investment amount ranges. |
| Category chips | `GET /farm-categories` | Categories with active investment templates. |
| Farm detail, projects, milestones and history | `GET /investments/{farmId}` | Use an ID from `investmentProjects` for the calculator and payment; the farm ID is not a project ID. |
| Calculator | `GET /investments/projects/{investmentProjectId}/quote?amount=250000` | Returns principal, expected profit, total return, fixed term, payout date, amount bounds and suggested amounts. No payment is created. |
| Review agreement | `GET /investments/projects/{investmentProjectId}/agreement?amount=250000` | Returns quote, agreement version, review sections and the three acknowledgement labels. |
| Make payment | `POST /investments/{investmentProjectId}/invest` | Requires approved KYC, verified PayPetal payout account, agreement acceptance, and an idempotency key. Returns gateway.paymentUrl for PayPetal checkout. |
| Check payment | `POST /investments/payments/{transactionId}/confirm-payment` | Checks the saved PayPetal transaction. Only a matching SUCCESS credits the investment, once. |
| Investment confirmed | `GET /investments/payments/{transactionId}` | Show success only when `confirmed` is true. Includes saved amount, ROI, duration, farm and projected return. |
| Agreement download | `GET /investments/payments/{transactionId}/agreement?download=true` | Authenticated UTF-8 `.txt` attachment. Omit `download` for JSON. Not proof of payment; the document includes payment status. |
| Portfolio overview | `GET /portfolio` | Investor totals and return summary. |
| Invested farms | `GET /portfolio/farms?status=active` | Supports `active` and `completed`; omit for all. |
| Invested farm details | `GET /portfolio/farms/{farmId}` | Own investment history and project milestones. |

The existing mobile KYC endpoints drive the KYC banner. Farm images, owner
information, funding amounts, project dates and milestones are included in the
shared farm detail response. Missing ratings are `null`; no ratings or growth
statistics are fabricated from the design's sample data.

## Filters and calculations

`riskLevel=low|medium|high`, `duration=12 months` (or `durationValue=12` plus
`durationUnit=months`), `farmCategoryId`, `search`, `location`, `investmentStatus`,
`page`, and `limit` retain the web contract. `minRoi`/`maxRoi` are percentages.
For the monetary slider shown in the design use `minInvestment`/`maxInvestment`
in major project currency units; these match overlapping project investment limits.
Ranges must be nonnegative, ascending, and have at most two decimal places.

For NGN 250,000 at 42% ROI, expected profit is NGN 105,000 and the projected total
is NGN 355,000. Principal and projected profit are calculated in integer subunits.
The ROI applies to the project's full term; it is not annualized or compounded.
The database's project maturity date is authoritative. The current data model
supports fixed project durations: selecting a different duration means choosing
a different project/template, not changing this project's terms at checkout.
Pending checkouts reduce availability. A final remaining balance smaller than
the ordinary minimum can be invested in full, matching the web funding rules.

## Checkout request

```http
POST /api/v1/mobile/investments/<investmentProjectId>/invest
Authorization: Bearer <access-token>
Content-Type: application/json
Idempotency-Key: <one-unique-key-per-investment-attempt>
```

```json
{
  "amount": 250000,
  "currency": "NGN",
  "agreementAcceptance": {
    "version": "<exact agreement.version returned by the preview>",
    "risksUnderstood": true,
    "termsAccepted": true,
    "fundsLockedUntilMaturity": true
  }
}
```

`idempotencyKey` in the body is an alternative to the header. Reuse the same key
and accepted version on network retries, including after a lost checkout response.
Use a new key for a new investment. Changed amounts/terms or a conflicting key
return 409; display a fresh agreement and ask the user to review it again.

Acceptance is timestamped server-side and stored with the investor ID in a nullable
`investment_payments.agreement` JSONB snapshot. The version binds the principal,
ROI, duration, project IDs, dates and displayed text. It is recomputed under the
payment transaction's project/template locks. Client-supplied ROI and return values
never determine payment amounts. Gateway updates do not overwrite the agreement.
Confirmation, download and portfolio profit use the accepted terms even after the
template changes. Legacy web payments have no agreement and keep their existing
portfolio calculation behavior; agreement download for these returns 404.

PayPetal is the default provider. Open `gateway.paymentUrl` and keep the internal
`transactionId`. When the user taps "I have paid", call
`POST /investments/payments/{transactionId}/confirm-payment` with no body.
The backend queries the saved provider transaction and checks its reference,
transaction ID, principal and currency. A pending payment is never credited.
A matching `SUCCESS` records the deposit and credits the project exactly once.
Once PayPetal webhook authentication is configured, provider notifications can
confirm the same payment automatically. Read the existing payment-status endpoint
for updates; the "I have paid" action remains available as a verification fallback.

For a top-up, preview and accept the agreement for the additional amount, then
call the same `/invest` endpoint with a new idempotency key. Each payment retains
its own immutable terms and maturity payout instruction. `investorInvestment`
contains this user's total confirmed amount and successful payment count for the
project. Replaying an existing key does not create another payment or checkout.
The amount is the investment principal; provider fees are separate. The former
`/verify` endpoint has been removed on both web and mobile. The same quote,
agreement, payment status and download routes are also available under `/web`.

The live sandbox `/pay/initiate` response contains `dataResponse.data` (reference,
transaction ID, principal, fees and status) and `dataResponse.paymentUrl`. It does
not contain bank details. Complete initiation and verification responses are
stored in `investment_payments.gateway_response`. Set `PAYPETAL_PAYMENT_REDIRECT_URL`
to the frontend confirmation page; the default redirects to the configured website
or the application home page. An uncertain initiation is
blocked from repeat POSTs; its saved payment can still be confirmed by reference.
Checkout does not select a project subwallet. Project escrow activation retains
its separate check of the actual project wallet balance before releasing funds.

## Deployment and design boundaries

Run `npm run migrate` before starting the new server version. This includes migration `20261027000003-add-paypetal-investment-checkout.js` for
checkout attempt tracking and automated deposit audit records; existing payments are retained. No seed data is required.
Run `npm run test:payments` for the regression suite. Tests mock the provider and
do not create real payments or alter a deployed database.

The supplied screenshot is the design reference because the Figma connector was
quota-limited. Its conflicting sample amounts are replaced by calculated values.
The downloadable document is a text agreement record, not a generated PDF or a
digitally signed certificate. Displayed sections are defined and versioned in
`src/utils/investmentAgreement.js`. The design's trustee/regulatory badges and
automatic reimbursement promise are not represented as operational guarantees:
the current backend has no trustee integration or automatic refund workflow.
Those require confirmed business/legal terms and a separate provider-backed flow.
