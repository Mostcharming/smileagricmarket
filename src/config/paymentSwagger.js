'use strict';

function addPaymentSwagger(spec) {
    const string = { type: 'string' };
    const uuid = { ...string, format: 'uuid' };
    const object = properties => ({ type: 'object', properties });
    const account = { bankCode: { ...string, example: '058' }, accountNumber: { ...string, example: '0123456789' },
        accountName: { ...string, example: 'ADA OKAFOR' }, bankName: { ...string, example: 'Guaranty Trust Bank' } };
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
        '/banks': { get: operation('List payout banks', 'Retrieve supported banks and their bank codes.') },
        '/accounts/validate': { post: operation('Resolve a payout account', 'Show the resolved accountName to the user for confirmation before saving.',
            { ...object(account), required: ['bankCode', 'accountNumber'] }) },
        '/accounts': {
            get: operation('Get payout account registration status', 'Returns pending or verified provider registration.'),
            post: operation('Register a payout account', 'Requires approved KYC and the exact accountName previously resolved. Both farmers and investors use this endpoint. Registration completes asynchronously.',
                { ...object(account), required: ['bankCode', 'accountNumber', 'accountName'] })
        },
        '/returns': { get: operation('List my ROI payouts', 'ROI only is paid at maturity. Scheduled and processing payments are not recorded as completed payments.') },
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
        if (existing) existing.description += ' When PAYMENTS_PROVIDER=paypetal, the response contains bank-transfer instructions for the shared physical project account. Idempotency-Key is required. No checkout URL is returned; confirmation requires statement reconciliation.';
    }
    const legacyWallet = spec.paths['/web/profile/wallet/setup']?.post;
    if (legacyWallet?.requestBody?.content?.['application/json']?.schema?.properties) {
        Object.assign(legacyWallet.requestBody.content['application/json'].schema.properties, account);
        legacyWallet.description += ' In PayPetal mode, bankCode and the confirmed resolved accountName are required and registration is asynchronous.';
    }
    return spec;
}

module.exports = { addPaymentSwagger };
