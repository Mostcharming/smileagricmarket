# Mobile password recovery

All paths below are relative to `/v1/mobile/auth` (production: `/api/v1/mobile/auth`).

1. `POST /forgot-password` with `{"phoneNumber":"08012345678"}` or `{"email":"john@example.com"}` sends a six-digit OTP to the account's registered SMS/email destinations. If both identifiers are supplied, the phone number takes precedence.
2. `POST /verify-reset-otp` with the same account identifier and `"otp":"012345"`. Keep the OTP as a string to preserve leading zeros. Success returns `data.resetToken` and `data.expiresIn` (600 seconds).
3. `POST /reset-password` with `resetToken`, `password`, and matching `passwordConfirmation` (at least six characters). Success returns the existing login response: `data.token` and `data.user`, including `kycVerified`.

Use `POST /resend-reset-otp` with the account identifier to request another code. Codes expire after 10 minutes and allow five incorrect verification attempts. Request/resend calls within 60 seconds return the same generic success response without sending another code. A new code invalidates the previous mobile code and any pending mobile reset token. Successful verification consumes the OTP; successful password update consumes the reset token.

The previous `/resend-reset-token` and `/verify-reset-token` paths remain as deprecated aliases. Verification now requires an account identifier and `otp`, and returns a reset token. Link tokens and signup/login OTPs are not accepted by mobile password recovery. Web password recovery continues to use links.

Apply migration `20260911000000-create-mobile-password-resets.js` before serving the updated mobile endpoints. It creates separate recovery storage without modifying web reset fields or signup OTPs. The existing deployment workflow runs `npm run migrate` before restarting the server. For manual deployment, apply the migration using the intended environment's database configuration before restarting.

Swagger includes request and response examples for every step. Run `npm test` for regression coverage; mobile tests use the real controllers, password hashing and token generation with isolated in-memory persistence and notification stubs.
