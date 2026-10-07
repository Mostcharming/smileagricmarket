# PayPetal project wallets, milestone escrow and ROI payments

The implementation follows the requested **one physical account per project** and **ROI-only maturity payments**. It uses the published [merchant API](https://paypetal.readme.io/reference/auth), not the customer-authorized TrustVault product.

## Configuration and rollout

1. Run `npm test` and the optional disposable PostgreSQL integration test described below.
2. Apply `20261007000000-create-paypetal-escrow.js` with the normal Sequelize migration process. Do not remove payment tables after provider instructions have been created; rollback deliberately refuses to discard those records.
3. Set the variables in `.env.example`: `PAYPETAL_ENABLED=true`, `PAYMENTS_PROVIDER=paypetal`, sandbox keys, `PAYPETAL_DEPOSIT_RECONCILIATION=manual`, and a separately funded merchant `PAYPETAL_REPAYMENT_SUBWALLET_ID`. ROI-only is the default maturity policy.
4. Restart the server. Its payment worker claims durable jobs from PostgreSQL; multiple API instances can run workers because claims use row locks, leases and `SKIP LOCKED`.
5. Validate account registration, incoming statement matching, wallet-funded TrustCore creation, milestone list/status response shapes, fees, and outgoing bank confirmation with actual sandbox credentials before switching `PAYPETAL_BASE_URL` to `https://api.service.paypetal.co`.

The request amount is sent in minor units. The documentation's payment examples show response amounts in major units. `PAYPETAL_RESPONSE_AMOUNT_UNIT` explicitly controls response and account-balance normalization; confirm the unit in sandbox. A mismatch blocks reconciliation instead of crediting money. Do not change this setting with unresolved instructions.

## Project funding

Creating a farm investment project creates its local payment record and queues a PayPetal [subwallet](https://paypetal.readme.io/reference/createsubwallet), under the merchant's account. The worker provisions a unique physical bank account for the project. Farmers receive account information but have no app permission or endpoint to withdraw project funds.

Investors register their payout account first, then use the existing investment endpoint with `Idempotency-Key`. In PayPetal mode its `gateway` contains `method=bank_transfer`, the project account, the amount and a reference to include in the transfer description. This flow returns account instructions rather than a hosted checkout URL. A payment reservation is pending until it is matched to an actual deposit.

**Incoming deposit attribution is manual.** The provider contact reported no deposit webhooks; the published API does not expose incoming subwallet transaction history. There is no safe way to infer which investor paid from the account balance. An admin must inspect the provider/bank transaction statement and call:

```http
POST /web/admin/payments/deposits/{paymentId}/confirm
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "providerTransactionId": "actual-bank-transaction-id",
  "evidenceReference": "statement-2026-10-07:row-42",
  "receivedAt": "2026-10-07T12:00:00Z",
  "amount": 250000,
  "currency": "NGN"
}
```

The admin must check that the statement row identifies this investor, the correct project account and exact amount. The server checks the saved investment amount/currency, project wallet balance, funding target and unique transaction ID. Deposit, funding credit and ROI schedule commit together. Repeated confirmation returns the existing deposit without double crediting. Partial or unmatched deposits require operator investigation; never fabricate a transaction ID to bypass reconciliation. Pending reservations are not automatically expired because bank transfers may arrive late.

When the confirmed total reaches the funding target, the worker creates **one** [TrustCore escrow agreement](https://paypetal.readme.io/reference/createagreement_1-1) using the project subwallet as initiator and the farmer as receiver. PayPetal documents automatic funding when the initiator is a subwallet. During collection, money is in the merchant-controlled project wallet; after full funding it is in the project's milestone escrow. No investor-specific escrow accounts are created. Provider fees must be funded/configured so they do not reduce the required project principal.

Existing projects with no funding and no pending legacy payments can be provisioned through `POST /web/admin/payments/projects/{projectId}/provision`. Existing Paystack funds are not treated as PayPetal balances or moved automatically.

## Receiving accounts

Both farmers and investors use these authenticated web or mobile endpoints:

- `GET /payments/banks`
- `POST /payments/accounts/validate` with `bankCode` and `accountNumber`
- Show the returned account name to the user.
- `POST /payments/accounts` with those fields plus the confirmed `accountName` (and optional display `bankName`)
- `GET /payments/accounts` to check registration status

Use prefixes `/web` or `/mobile` (and the application's normal API-version prefix). Approved KYC is required. Provider customer creation and bank payout registration run as durable jobs. Registration is verified against the provider's saved payout accounts before the local wallet becomes verified. `bankCode=000000` represents an internal PayPetal account; it still must pass provider validation. The older web profile wallet setup endpoint also uses this workflow in PayPetal mode.

Accounts cannot change while associated funds are committed to outgoing payments. This prevents a saved instruction from silently changing beneficiary. Review PayPetal's merchant-dashboard permissions separately; the server cannot prevent changes made outside Smile by merchant operators.

## Milestone payments

Admin evidence/checklist approval queues a release in the same database transaction as the review audit. It sets `reviewStatus=approved`, `fundingStatus=processing_funding`, and `isCompleted=false`. Fully funded escrow, a verified farmer account, and payment completion of all earlier milestones are required. The legacy admin status route also goes through these checks.

The worker verifies the provider agreement's reference, amount, currency, receiver and Smile metadata, then verifies each milestone's identifier/order/amount. [Milestone releases](https://paypetal.readme.io/reference/releasemilestone) may be asynchronous. The worker polls the provider; only `COMPLETED` confirms payment and updates the milestone and released balance. Retry uses the original agreement and milestone identifiers. Admin approval alone never marks a payout completed.

The migration permits approved milestones awaiting bank settlement. Pre-existing completed milestones retain their historical state; this integration does not manufacture provider settlement evidence for them. New approval without a configured escrow is blocked.

## ROI payments

Each confirmed investment freezes its ROI, maturity date and payout policy from the server-generated investment terms. At the end of the maturity date (UTC), the worker creates a separate ROI payment instruction, funding it from the merchant repayment subwallet and using the investor as receiver. It then calls the documented [TrustCore release endpoint](https://paypetal.readme.io/reference/completetrustcore-1) and polls until completion. **Only ROI is paid; principal is not included.** The accepted investment agreement explicitly states this. ROI payouts never use a project funding wallet.

The merchant must fund this repayment account from farm revenue or another approved source, including fees. Escrow does not generate returns. An unfunded repayment account produces a blocked job, visible to admins, rather than a false successful payout. `/web/admin/payments/repayment-account` displays the configured funding account. Investors can inspect `/web/payments/returns` or `/mobile/payments/returns`. Portfolio earned returns for PayPetal reflect confirmed ROI payments rather than the passage of a maturity date.

## Recovery and operations

Use `/web/admin/payments/jobs`, `/returns`, `/deposits`, and `/projects/{projectId}` to inspect processing and audit records. Retry a blocked job with `POST /web/admin/payments/jobs/{jobId}/retry` after resolving its prerequisite. Retry retains the saved reference and creation-attempt markers.

Subwallet/customer/agreement creation is not assumed idempotent. Before creating, the worker checks provider records. Once a create call has been attempted, absence of a matching remote record is treated as an uncertain outcome requiring provider/operator reconciliation; it does not blindly create another potentially funded instruction. A record that becomes visible on a later retry is adopted only after identity checks. If PayPetal confirms an attempt was never executed, investigate and repair the stored attempt marker through a controlled operational change with an audit record; no user API clears it automatically.

Outgoing transfer confirmation uses polling. No PayPetal webhook or callback endpoint is registered. The required provider `redirectUrl` points to `WEBSITE_URL` (the public homepage), with no callback handler.

The server does not expose arbitrary withdrawal, arbitrary payout, or client-selected ROI endpoints. No real provider requests run until the feature is enabled with credentials. This implementation adds server APIs and Swagger; the separate frontend needs to display account-name confirmation, bank-transfer instructions, pending deposit status and payout status.

## Optional real PostgreSQL integration tests

Run `test/paypetalPostgres.test.js` against a **disposable local** PostgreSQL database named `smile_paypetal_test` using `PAYMENT_TEST_DATABASE_URL`. The test refuses non-local hosts or any other database name and resets that disposable database's tables. Example:

```powershell
$env:PAYMENT_TEST_DATABASE_URL='postgres://codex@127.0.0.1:55489/smile_paypetal_test'
node --test test/paypetalPostgres.test.js
```

The test uses a fake provider and real PostgreSQL transactions, uniqueness constraints, migration SQL and job locks; it does not move real money. Live PayPetal sandbox validation still requires provider credentials.
