'use strict';

const { DEFAULT_AUTH_HEADER } = require('../middlewares/common/paypetalWebhookSecurity');

function addPaypetalWebhookSwagger(spec) {
    spec.components.securitySchemes.PaypetalWebhookAuth = { type: 'apiKey', in: 'header',
        name: process.env.PAYPETAL_WEBHOOK_AUTH_HEADER || DEFAULT_AUTH_HEADER,
        description: 'Provisional contract: X-Paypetal-Signature contains the hexadecimal HMAC-SHA256 of the exact raw body, keyed by PAYPETAL_WEBHOOK_SECRET. Header and mode remain configurable for PayPetal’s final contract. The API bearer token is not webhook authentication.' };
    const ack = (description, received) => ({ description, content: { 'application/json': {
        schema: { type: 'object', required: ['received'], properties: { received: { type: 'boolean' } } }, example: { received }
    } } });
    spec.paths['/web/payments/paypetal/webhook'] = { post: {
        tags: ['Web Payments'], summary: 'Receive PayPetal payment notifications for web and mobile investments',
        description: 'Server-to-server endpoint; no user login token. The provisional default is X-Paypetal-Signature with hexadecimal HMAC-SHA256 over exact raw bytes. This is a locally selected contract, not a confirmed PayPetal specification, and can be edited later. A separate webhook secret is mandatory; returns 503 when missing. Shared-secret-header mode is also configurable. Accepted identities are reference and/or transactionId at the root, data, dataResponse, responseData or their supported nested data envelopes. Only known PayPetal checkout payments are queued. The worker re-queries PayPetal and verifies the saved reference, provider transaction ID, principal and currency before crediting SUCCESS once. Notification status and amount are never proof of payment. Acknowledges only committed jobs; storage failures return 503. Duplicates coalesce. Production requires HTTPS. Default authenticated limits are 120 requests/IP/minute and 600 globally/minute across workers; an additional bounded local guard covers unauthenticated traffic. JSON only, 16 KiB maximum, no compressed bodies, 10-second body deadline. Source-IP restrictions and explicitly trusted proxy networks are configurable.',
        security: [{ PaypetalWebhookAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', additionalProperties: true, properties: { event: { type: 'string', example: 'payment.received' }, data: { type: 'object', additionalProperties: true,
                properties: { reference: { type: 'string', maxLength: 100 }, transactionId: { type: 'string', maxLength: 100 } } } }
        }, example: { event: 'payment.received', data: { reference: 'SMILEWEBHOOKEXAMPLE001',
            transactionId: 'TXNWEBHOOKEXAMPLE001', amount: 250000, currency: 'NGN', status: 'SUCCESS' } } } } },
        responses: { 200: ack('Notification durably queued, duplicate acknowledged, or unrelated transaction ignored', true),
            400: ack('Invalid payload, transaction identity or HTTPS/proxy information', false),
            401: ack('Missing or invalid configured webhook authentication', false),
            403: ack('Source IP is not allowed', false), 408: ack('Request body timed out', false),
            413: ack('Request body exceeds 16 KiB', false), 415: ack('JSON required; compression unsupported', false),
            429: { ...ack('Rate limit exceeded; retry after the indicated interval', false),
                headers: { 'Retry-After': { schema: { type: 'integer', minimum: 1 }, description: 'Seconds until retry.' } } },
            503: ack('Webhook authentication is unconfigured, or durable storage is unavailable; retry delivery', false) }
    } };
    return spec;
}

module.exports = { addPaypetalWebhookSwagger };
