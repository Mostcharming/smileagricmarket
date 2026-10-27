'use strict';

function addInvestmentCheckoutSwagger(spec) {
    const string = { type: 'string' };
    const uuid = { ...string, format: 'uuid' };
    const money = { type: 'number', minimum: 0 };
    const object = properties => ({ type: 'object', properties });
    const ref = name => ({ $ref: `#/components/schemas/${name}` });
    const parameter = name => ({ name, in: 'path', required: true, schema: uuid });
    const response = (description, data, example) => ({ description, content: { 'application/json': {
        schema: object({ error: { type: 'boolean' }, message: string, data }),
        ...(example ? { example: { error: false, message: description, data: example } } : {})
    } } });
    const failures = Object.fromEntries(Object.entries({ 400: 'Invalid request', 401: 'Authentication required',
        403: 'Approved KYC required, or user owns the farm', 404: 'Investment or owned payment not found',
        409: 'Funding limit, agreement, idempotency or provider transaction conflict',
        502: 'PayPetal request failed; a saved transactionId is included if checkout was reserved',
        503: 'PayPetal is not enabled or configured' }).map(([code, description]) => [code, { description }]));
    spec.components.schemas.InvestmentAgreementAcceptance = spec.components.schemas.MobileInvestmentAcceptance;
    spec.components.schemas.InvestorProjectTotal = object({ amount: money, currency: { ...string, example: 'NGN' },
        paymentCount: { type: 'integer', minimum: 0 } });
    spec.components.schemas.InvestmentCheckoutPayment = object({ id: uuid, transactionId: uuid, reference: string,
        farmId: uuid, investmentProjectId: uuid, investmentTemplateId: uuid, amount: money, currency: string,
        gateway: { ...string, enum: ['paypetal'] }, gatewayReference: string,
        gatewayTransactionId: { ...string, nullable: true }, authorizationUrl: { ...string, format: 'uri', nullable: true },
        accessCode: { ...string, nullable: true }, status: { ...string, enum: ['pending', 'successful', 'failed', 'cancelled', 'recorded'] },
        paidAt: { ...string, format: 'date-time', nullable: true }, createdAt: { ...string, format: 'date-time' }, updatedAt: { ...string, format: 'date-time' } });
    const funding = object({ farmId: uuid, investmentProjectId: uuid, fundingReceived: money, totalExpectedFunding: money,
        remainingFunding: money, percentFunded: money, investmentStatus: string, fundingStatus: string });
    const checkout = object({ provider: { ...string, enum: ['paypetal'] }, method: { ...string, enum: ['checkout'] },
        reference: string, providerTransactionId: string, paymentUrl: { ...string, format: 'uri' },
        amount: { ...string, example: '250000.00', description: 'Investment principal in major currency units.' }, currency: string,
        fee: { ...money, nullable: true }, totalAmount: { ...money, nullable: true, description: 'Amount payable including PayPetal fees.' },
        confirmation: { ...string, enum: ['provider_transaction'] }, investmentProjectId: uuid });
    const data = { transactionId: uuid, payment: ref('InvestmentCheckoutPayment'), investment: funding,
        investorInvestment: ref('InvestorProjectTotal') };
    for (const platform of ['web', 'mobile']) {
        const prefix = `/${platform}/investments`;
        const tags = [`${platform === 'web' ? 'Web' : 'Mobile'} Investments`];
        const body = { type: 'object', required: ['amount', 'currency', 'agreementAcceptance'],
            properties: { amount: { ...money, minimum: 0.01, example: 250000 }, currency: { ...string, enum: ['NGN'] },
                idempotencyKey: { ...string, maxLength: 100, description: 'Required unless supplied in the Idempotency-Key header. Use a new key for each top-up.' },
                agreementAcceptance: ref('InvestmentAgreementAcceptance') } };
        spec.paths[prefix + '/{investmentProjectId}/invest'] = { post: {
            tags, summary: 'Start an investment or top-up checkout', security: [{ bearerAuth: [] }],
            description: 'Requires approved KYC, a verified PayPetal payout account and the accepted agreement for this project and amount. Calls PayPetal POST /api/v1/pay/initiate and returns gateway.paymentUrl; open it to pay. The live provider response contains no bank account number. Amount is the additional principal, in NGN major units. A new idempotency key creates a separate top-up; replaying the same key and identical request returns the saved checkout without another initiation. Confirmed payments accumulate in investorInvestment. Fees are not invested principal. An uncertain initiation is not posted again; use its saved transactionId to check payment.',
            parameters: [parameter('investmentProjectId'), { name: 'Idempotency-Key', in: 'header', required: false, schema: { ...string, maxLength: 100 },
                description: 'Required unless idempotencyKey is supplied in the body.' }],
            requestBody: { required: true, content: { 'application/json': { schema: body,
                example: spec.paths['/mobile/investments/{investmentProjectId}/invest']?.post?.requestBody?.content?.['application/json']?.example } } },
            responses: { 200: response('Existing investment checkout', object({ ...data, gateway: checkout })),
                201: response('Investment checkout initialized', object({ ...data, gateway: checkout })), ...failures }
        } };
        spec.paths[prefix + '/payments/{transactionId}/confirm-payment'] = { post: {
            tags, summary: 'I have paid: check PayPetal and confirm the investment', security: [{ bearerAuth: [] }],
            description: 'No request body. Uses the internal transactionId returned by invest and checks its saved PayPetal transaction. Only its owner can call this endpoint. Reference, provider transaction ID, principal and currency must match. Only SUCCESS credits the project and the investor once; PENDING stays unconfirmed. Repeated or concurrent confirmations cannot add the same payment twice. investorInvestment contains the total successful principal and payment count for this investor and project, including top-ups.',
            parameters: [parameter('transactionId')], responses: { 200: response('Provider payment state checked', object({ ...data,
                confirmed: { type: 'boolean' }, credited: { type: 'boolean' }, alreadySettled: { type: 'boolean' } })), ...failures }
        } };
        delete spec.paths[prefix + '/payments/{transactionId}/verify'];
        if (platform === 'web') for (const suffix of ['/projects/{investmentProjectId}/quote', '/projects/{investmentProjectId}/agreement',
            '/payments/{transactionId}', '/payments/{transactionId}/agreement']) {
            spec.paths[prefix + suffix] = JSON.parse(JSON.stringify(spec.paths['/mobile/investments' + suffix]));
            for (const op of Object.values(spec.paths[prefix + suffix])) op.tags = tags;
        }
        const status = spec.paths[prefix + '/payments/{transactionId}']?.get;
        if (status) {
            status.description = 'Owner-only saved payment state, including automatic webhook confirmations. Call confirm-payment after checkout to query PayPetal; this GET reads the saved state only. investorInvestment includes all confirmed top-ups for this project.';
            status.responses['200'].content['application/json'].schema.properties.data.properties.investorInvestment = ref('InvestorProjectTotal');
        }
    }
    return spec;
}

module.exports = { addInvestmentCheckoutSwagger };
