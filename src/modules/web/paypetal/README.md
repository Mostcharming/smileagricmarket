# PayPetal payment webhook

Register one backend URL for investments created on both web and mobile:

```text
POST /api/v1/web/payments/paypetal/webhook
```

The local alias is `/v1/web/payments/paypetal/webhook`. Do not register both URLs for the same subscription. The receiver is mounted before JSON parsing, input sanitization and user authentication. It accepts server-to-server notifications without a user login token.

## Provisional contract

This is a locally selected contract that can be edited when PayPetal supplies its actual specification. It is not a captured PayPetal webhook format.

- Default header: `X-Paypetal-Signature`.
- Default signing mode: `hmac_sha256`.
- Signature: hexadecimal HMAC-SHA256 of the exact raw request body bytes, keyed by `PAYPETAL_WEBHOOK_SECRET`. No `sha256=` prefix, JSON reformatting or timestamp is assumed.
- A separate webhook secret is mandatory. Requests with missing or invalid signatures return 401; a missing secret returns 503. The PayPetal API key and bearer token are never accepted as webhook authentication.

Example notification (also available in `test/fixtures/paypetal-webhook-provisional.json`):

```json
{
  "event": "payment.received",
  "data": {
    "reference": "SMILEWEBHOOKEXAMPLE001",
    "transactionId": "TXNWEBHOOKEXAMPLE001",
    "amount": 250000,
    "currency": "NGN",
    "status": "SUCCESS"
  }
}
```

The example identifies no real payment. `event`, `status` and `amount` are informational; only PayPetal's authenticated transaction lookup can authorize a credit.

Configuration remains editable:

- `PAYPETAL_WEBHOOK_AUTH_MODE` overrides the default; `shared_secret` mode supports an exact shared-secret header if PayPetal requires it later.
- `PAYPETAL_WEBHOOK_AUTH_HEADER` overrides the header name.
- `PAYPETAL_WEBHOOK_SECRET` is required, at least 32 characters and at most 512 bytes, without surrounding whitespace. Generate a random value and share it with the sender through a secure channel. The local sandbox has its own generated secret in the ignored `.env`; production must have its own deployment secret. No real secret is committed.
- `PAYPETAL_WEBHOOK_PREVIOUS_SECRET` optionally accepts the previous secret during rotation. All configured keys are checked without an early successful-match return.

To compute a signature in Node.js, keep the same bytes for signing and sending:

```javascript
const { createHmac } = require('node:crypto');
const body = Buffer.from(JSON.stringify(notification));
const signature = createHmac('sha256', process.env.PAYPETAL_WEBHOOK_SECRET)
  .update(body)
  .digest('hex');
// Send body unchanged with X-Paypetal-Signature: signature.
```

When the provider's format arrives, update the mode/header or verification adapter and payload mapping. If it signs a timestamp, adds a signature prefix or uses another algorithm, implement that exact format; keep authentication enabled while adapting it. Actual provider delivery still needs the deployed URL registered and agreement on the signing contract.

## Delivery and verification

Supported notification envelopes are `{reference, transactionId}`, `{data: {...}}`, `{dataResponse: {...}}`, `{responseData: {...}}` and the latter two with nested `data`. At least one identity must be present as a string; conflicting identities are rejected. The provisional example above uses the data envelope; adjust this adapter if the final provider payload differs. A claimed `SUCCESS`, amount, payer or user ID never determines settlement.

After authentication and rate checks, a known checkout notification is saved in `payment_webhooks`, deduplicated by its exact raw-body SHA256 digest. Its `confirm_investment` job is saved in the same transaction; HTTP 200 is sent only after commit. Unknown transactions and legacy payments without a PayPetal checkout are acknowledged and ignored. Payloads and authentication headers are not written to application logs; the authenticated payload is retained in the restricted database audit table.

The existing payment worker queries `/api/v1/transaction/{saved-transaction-id-or-reference}` using the backend's PayPetal credentials. Existing settlement code checks reference, provider transaction ID, principal and currency, locks payment/project rows, records a unique deposit and credits only verified `SUCCESS`. A webhook and the user pressing “I have paid” use the same settlement path and cannot credit the same payment twice. Each top-up remains a separate payment and contributes once to the investor's project total.

Pending provider transactions are retried at one-minute intervals for up to ten checks per notification cycle. Later notifications can requeue a still-pending payment with a one-minute cooldown. Provider connection failures use the existing durable job backoff and retry limit. Financial identity conflicts remain blocked for operator reconciliation; inspect `/web/admin/payments/jobs` and use the existing admin retry endpoint after investigation. A server restart recovers expired job leases. Webhooks do not change how funds reach the project subwallet or bypass its actual-balance check before escrow activation.

## Traffic controls and deployment

- JSON only, maximum 16 KiB; compressed bodies are rejected and a request-body deadline is enforced at ten seconds.
- A bounded local guard allows 240 requests/source/minute and 1,200 globally/minute per process, including invalid signatures. Its map resets every minute and cannot grow beyond the global allowance.
- Authenticated requests are additionally limited by atomic PostgreSQL counters, shared across processes/hosts: default 120/source/minute and 600 globally/minute. Override with `PAYPETAL_WEBHOOK_IP_LIMIT_PER_MINUTE` and `PAYPETAL_WEBHOOK_GLOBAL_LIMIT_PER_MINUTE`. Rejected requests return 429 with `Retry-After`. Expired per-source counters are pruned after ten minutes of inactivity.
- Production always requires HTTPS. Behind a TLS-terminating proxy, set `PAYPETAL_WEBHOOK_TRUSTED_PROXIES` to its exact IPs/CIDRs. Forwarded IP/protocol headers are ignored from every other source; the first untrusted hop determines the sender. Configure the proxy to append the real client address and overwrite the forwarded protocol. Do not broadly trust arbitrary internet clients.
- `PAYPETAL_WEBHOOK_ALLOWED_IPS` optionally restricts sender IPs/CIDRs once PayPetal confirms its stable egress ranges. Do not guess these ranges.
- Configure the public ingress with matching body/header timeouts and appropriate connection limits. Pass notification bodies unchanged. No CSRF token, browser CORS permission or user access token is needed on this server-to-server route.
- Run migration `20261027000004-add-paypetal-webhooks.js` before deployment and keep the payment worker running. It creates the durable receipt and shared rate-counter tables. Storage failures return 503 instead of falsely acknowledging delivery.

`npm run test:payments` checks authentication/tampering, rotation, proxy spoofing, payload limits, rate limits, durable delivery, duplicates and the shared settlement behavior. Real provider webhook delivery still requires PayPetal's final authentication/payload contract and registration of the deployed URL.
