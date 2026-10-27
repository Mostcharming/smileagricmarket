'use strict';

function addPaymentSwagger(spec) {
    const string = { type: 'string' };
    const uuid = { ...string, format: 'uuid' };
    const object = properties => ({ type: 'object', properties });
    const operation = (summary, description, body = null, id = null) => ({
        tags: ['Payments'], summary, description, security: [{ bearerAuth: [] }],
        ...(id ? { parameters: [{ in: 'path', name: id, required: true, schema: uuid }] } : {}),
        ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: body } } } } : {}),
        responses: { 200: { description: 'Operation completed', content: { 'application/json': { schema: object({ error: { type: 'boolean' }, message: string, data: { type: 'object', additionalProperties: true } }) } } },
            202: { description: 'Durable processing job queued', content: { 'application/json': {
                schema: object({ error: { type: 'boolean' }, message: string, data: { type: 'object', additionalProperties: true } })
            } } }, 400: { description: 'Invalid request' },
            401: { description: 'Authentication required' }, 403: { description: 'Not authorized' },
            409: { description: 'Payment precondition not met' }, 503: { description: 'PayPetal is not configured' } }
    });
    const paths = {
        '/projects/{projectId}': { get: operation('Get project payment account', 'Only the farm owner or an investor in this project can access these details. No withdrawal endpoint is provided.', null, 'projectId') }
    };
    for (const prefix of ['/web/payments', '/mobile/payments']) for (const [path, item] of Object.entries(paths)) spec.paths[prefix + path] = JSON.parse(JSON.stringify(item));
    const admin = '/web/admin/payments';
    spec.paths[admin + '/jobs'] = { get: operation('List payment jobs', 'Filter by status to find blocked, pending, retrying or completed jobs.') };
    spec.paths[admin + '/jobs/{jobId}/retry'] = { post: operation('Retry provider reconciliation', 'Retries the saved instruction without clearing uncertain creation markers or generating another reference.', null, 'jobId') };
    spec.paths[admin + '/deposits'] = { get: operation('List confirmed deposit audit records', 'Each record includes its statement evidence reference and reviewing admin.') };
    spec.paths[admin + '/deposits/{paymentId}/confirm'] = { post: operation('Match a statement deposit to an investment',
        'Admin must inspect the PayPetal statement and verify the actual deposit belongs to this investor and project. The shared account balance is checked but does not establish depositor identity. Duplicate transaction IDs cannot be credited twice.',
        { ...object({ providerTransactionId: { ...string, example: 'BANK-STATEMENT-TXN-0001' },
            evidenceReference: { ...string, example: 'statement-2026-10-07:row-42' },
            receivedAt: { ...string, format: 'date-time' }, amount: { type: 'number', example: 250000 }, currency: { ...string, example: 'NGN' } }),
        required: ['providerTransactionId', 'evidenceReference', 'receivedAt', 'amount', 'currency'] }, 'paymentId') };
    spec.paths[admin + '/returns'] = { get: operation('List investor ROI payments', 'Inspect scheduled, processing and blocked ROI instructions.') };
    spec.paths[admin + '/repayment-account'] = { get: operation('Get merchant ROI funding account', 'This account must be funded separately from project investment funds, including provider fees.') };
    spec.paths[admin + '/projects/{projectId}'] = { get: operation('Inspect project escrow', 'Returns the physical funding wallet, shared milestone escrow and individual release records.', null, 'projectId') };
    spec.paths[admin + '/projects/{projectId}/provision'] = { post: operation('Provision an unfunded existing project', 'Projects with existing or pending legacy payments cannot be moved automatically.', null, 'projectId') };
    for (const path of ['/web/investments/{investmentProjectId}/invest', '/mobile/investments/{investmentProjectId}/invest']) {
        const existing = spec.paths[path]?.post;
        if (!existing) continue;
        existing.summary = 'Reserve an investment and get PayPetal transfer instructions';
        existing.description = 'PayPetal is the default provider. Returns bank-transfer instructions for the shared physical project account. Requires approved KYC, a verified PayPetal payout account and Idempotency-Key. No checkout URL or SDK access code is returned. The payment stays pending until an admin reconciles the bank statement; verify/status calls do not credit unconfirmed deposits. Paystack is temporarily disabled; there is no fallback.'
            + (path.startsWith('/mobile/') ? ' Mobile also requires the reviewed agreement version and all three explicit acknowledgements.' : '');
        existing.parameters.find(parameter => parameter.name === 'investmentProjectId').description = 'ID of the investment project to fund.';
        existing.parameters.find(parameter => parameter.name === 'Idempotency-Key').description = 'Required unless idempotencyKey is supplied in the body. Reuse only for an identical investment retry.';
        const instructions = {
            provider: 'paypetal', method: 'bank_transfer', reference: 'SMILE-INV-EXAMPLE',
            amount: '250000.00', currency: 'NGN', bankName: 'Example Bank',
            accountNumber: '0123456789', accountName: 'Smile project funding',
            confirmation: 'admin_statement_reconciliation', investmentProjectId: '22222222-2222-4222-8222-222222222222'
        };
        const gatewaySchema = object(Object.fromEntries(Object.entries(instructions).map(([key, value]) => [key, { type: 'string', example: value }])));
        for (const code of ['200', '201']) {
            const response = existing.responses[code];
            response.description = code === '201' ? 'Investment reserved; transfer to the supplied project account' : 'Investment transaction already exists';
            const media = response.content['application/json'];
            const dataSchema = media.schema.properties.data.properties;
            dataSchema.gateway = gatewaySchema;
            dataSchema.payment.properties.gateway.example = 'paypetal';
            media.example.message = response.description;
            Object.assign(media.example.data.payment, { gateway: 'paypetal', status: 'pending', authorizationUrl: null, accessCode: null });
            media.example.data.gateway = { ...instructions };
        }
        existing.responses['502'].description = 'Payment provider request failed';
        existing.responses['503'].description = 'PayPetal is not enabled or configured; Paystack is temporarily disabled';
    }
    for (const prefix of ['/web', '/mobile']) {
        const verify = spec.paths[prefix + '/investments/payments/{transactionId}/verify']?.post;
        if (!verify) continue;
        verify.summary = 'Read the reconciled investment payment state';
        verify.description = 'For PayPetal, returns the saved deposit state. Funds are credited only when a financial admin matches the actual statement deposit; this endpoint never treats a client callback as proof of payment. Legacy Paystack verification is temporarily disabled and returns HTTP 503.';
        verify.responses['503'].description = 'Legacy Paystack verification is temporarily disabled';
    }
    const webhook = spec.paths['/web/payments/paystack/webhook']?.post;
    if (webhook) {
        webhook.deprecated = true;
        webhook.description = 'Temporarily disabled. Returns HTTP 503 with received=false without processing or settling Paystack events. Retained for explicit future reactivation.';
        webhook.responses['503'] = { description: 'Paystack is temporarily disabled' };
    }
    require('./walletSwagger').addWalletSwagger(spec);
    return spec;
}

module.exports = { addPaymentSwagger };
