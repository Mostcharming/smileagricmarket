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
    const admin = '/web/admin/payments';
    spec.paths[admin + '/jobs'] = { get: operation('List payment jobs', 'Filter by status to find blocked, pending, retrying or completed jobs.') };
    spec.paths[admin + '/jobs/{jobId}/retry'] = { post: operation('Retry provider reconciliation', 'Retries the saved instruction without clearing uncertain creation markers or generating another reference.', null, 'jobId') };
    spec.paths[admin + '/deposits'] = { get: operation('List confirmed deposit audit records', 'Includes the verification source and provider transaction evidence, or manual statement evidence and reviewing admin.') };
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
    require('./investmentCheckoutSwagger').addInvestmentCheckoutSwagger(spec);
    const projectCreation = spec.paths['/web/farms/{farmId}/investment-projects']?.post;
    const projectMedia = projectCreation?.responses?.['201']?.content?.['application/json'];
    if (projectMedia) {
        spec.components.schemas.ProjectSubwalletAccount = object({
            reference: { ...string, pattern: '^[A-Za-z0-9]{10}$', minLength: 10, maxLength: 10,
                description: 'Unique saved ten-character alphanumeric project reference. Reused on all provisioning retries.' },
            name: { ...string, description: 'Farm name with whitespace removed plus the first six compact project UUID characters; suffix is extended on collisions.' },
            subwalletId: { ...uuid, nullable: true }, currency: { ...string, enum: ['NGN'] },
            bankName: { ...string, nullable: true }, accountNumber: { ...string, nullable: true },
            accountName: { ...string, nullable: true }, status: string, lastError: { ...string, nullable: true }
        });
        projectMedia.schema = { allOf: [projectMedia.schema, object({ data: object({
            paymentAccount: { $ref: '#/components/schemas/ProjectSubwalletAccount' }
        }) })] };
        if (projectMedia.example?.data) projectMedia.example.data.paymentAccount = {
            reference: 'A1B2C3D4E5', name: 'CassavaFarm-222222', subwalletId: 'adac6619-9dac-49f3-852b-03afc7c34ecf',
            currency: 'NGN', bankName: '9Payment (9PSB)', accountNumber: '5031681901',
            accountName: 'PAYPETAL-CASSAVA FARM', status: 'collecting', lastError: null
        };
    }
    require('./paypetalWebhookSwagger').addPaypetalWebhookSwagger(spec);
    require('./walletSwagger').addWalletSwagger(spec);
    return spec;
}

module.exports = { addPaymentSwagger };
