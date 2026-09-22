'use strict';

const { buildInvestmentQuote, buildInvestmentAgreement } = require('../utils/investmentAgreement');

// Shared mobile endpoints use the web controllers. Copy their complete OpenAPI
// definitions so examples and filtering/payment contracts cannot drift apart.
function addMobileInvestmentSwagger(spec) {
    for (const [path, item] of Object.entries(spec.paths)) {
        if (!/^\/web\/(investments|portfolio|farm-categories)(\/|$)/.test(path)) continue;
        const mobilePath = path.replace('/web/', '/mobile/');
        const clone = JSON.parse(JSON.stringify(item)
            .replace(/\/web\/(investments|portfolio|farm-categories)/g, '/mobile/$1'));
        for (const operation of Object.values(clone)) {
            if (!operation.responses) continue;
            operation.tags = operation.tags.map(tag => tag.replace(/^Web /, 'Mobile '));
            if (operation.operationId) operation.operationId = `mobile_${operation.operationId}`;
        }
        spec.paths[mobilePath] = clone;
    }

    const uuid = { type: 'string', format: 'uuid' };
    const money = { type: 'number', minimum: 0 };
    const date = { type: 'string', format: 'date' };
    const ref = name => ({ $ref: `#/components/schemas/${name}` });
    const object = properties => ({ type: 'object', properties });
    const duration = object({ value: { type: 'integer' }, unit: { type: 'string', enum: ['weeks', 'months', 'years'] }, label: { type: 'string' } });
    const terms = {
        farmId: uuid, farmName: { type: 'string' }, investmentProjectId: uuid,
        investmentTemplateId: uuid, investmentName: { type: 'string' }, currency: { type: 'string', example: 'NGN' },
        principal: money, expectedProfit: money, totalReturn: money, roiPercentage: money,
        riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] }, duration, startDate: date, payoutDate: date
    };
    const quoteExample = buildInvestmentQuote({
        farm: { id: '11111111-1111-4111-8111-111111111111', name: 'Greenfield Cassava Cluster' },
        project: { id: '22222222-2222-4222-8222-222222222222', isActive: true, investmentStatus: 'funding_started', expectedInvestment: 10000000, investmentReceived: 2500000, currency: 'NGN', startDate: '2026-09-23', endDate: '2027-09-23' },
        template: { id: '33333333-3333-4333-8333-333333333333', name: 'Cassava', isActive: true, investmentMinGoal: 50000, investmentMaxGoal: 3000000, roiPercentage: 42, durationValue: 12, durationUnit: 'months', riskLevel: 'low' },
        amount: 250000, asOf: new Date('2026-09-23T00:00:00Z')
    });
    const agreementExample = buildInvestmentAgreement(quoteExample);
    spec.components.schemas.MobileInvestmentQuote = { ...object({
        ...terms, durationEditable: { type: 'boolean', enum: [false] },
        limits: object({ minimumAmount: money, maximumAmount: money, remainingFunding: money }),
        suggestedAmounts: { type: 'array', items: money }
    }), example: quoteExample };
    spec.components.schemas.MobileInvestmentAgreement = object({
        reference: { type: 'string' }, version: { type: 'string', minLength: 64, maxLength: 64 },
        revision: { type: 'string' }, terms: object({ ...terms,
            payoutFrequency: { type: 'string', enum: ['at_maturity'] }, earlyExitAllowed: { type: 'boolean', enum: [false] }
        }),
        sections: { type: 'array', items: object({ id: { type: 'string' }, title: { type: 'string' }, text: { type: 'string' } }) },
        acknowledgements: object(Object.fromEntries(Object.keys(agreementExample.acknowledgements).map(key => [key, { type: 'string' }]))),
        acceptedBy: { ...uuid, description: 'Present only after the authenticated investor accepts the agreement.' },
        acceptedAt: { type: 'string', format: 'date-time' },
        acceptance: object(Object.fromEntries(Object.keys(agreementExample.acknowledgements).map(key => [key, { type: 'boolean' }])))
    });
    const acceptance = {
        type: 'object', required: ['version', ...Object.keys(agreementExample.acknowledgements)],
        properties: {
            version: { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'Use the exact version from the agreement preview for this amount and project.' },
            ...Object.fromEntries(Object.keys(agreementExample.acknowledgements).map(key => [key, { type: 'boolean', enum: [true] }]))
        }
    };
    spec.components.schemas.MobileInvestmentAcceptance = acceptance;
    const invest = spec.paths['/mobile/investments/{investmentProjectId}/invest'].post;
    invest.description += ' Mobile checkout requires the reviewed agreement version, all three acknowledgements, and an Idempotency-Key (header or body). A changed amount or project term invalidates the review. No funds are credited until server-side Paystack verification. Use the returned accessCode with the mobile Paystack SDK or open authorizationUrl; verify the transaction after checkout. The existing signed /web/payments/paystack/webhook also settles mobile payments.';
    invest.requestBody.content['application/json'].schema.properties.agreementAcceptance = ref('MobileInvestmentAcceptance');
    invest.requestBody.content['application/json'].schema.required.push('agreementAcceptance');
    invest.requestBody.content['application/json'].example = {
        amount: 250000, currency: 'NGN', idempotencyKey: 'mobile-investment-example-001',
        agreementAcceptance: { version: agreementExample.version, risksUnderstood: true, termsAccepted: true, fundsLockedUntilMaturity: true }
    };
    invest.parameters.find(parameter => parameter.name === 'Idempotency-Key').description =
        'Required unless idempotencyKey is supplied in the body. Reuse the key only for retries of the exact same accepted investment.';
    invest.responses['409'].description += '; or agreement terms changed and must be reviewed again';

    const parameter = name => ({ name, in: 'path', required: true, schema: uuid });
    const success = (data, description, example) => ({ description, content: {
        'application/json': {
            schema: object({ error: { type: 'boolean', example: false }, message: { type: 'string' }, data }),
            ...(example ? { example: { error: false, message: description, data: example } } : {})
        }
    } });
    const failures = Object.fromEntries([
        ['400', 'Invalid identifier, amount, or query parameters'], ['401', 'Authentication required'],
        ['403', 'You cannot invest in your own farm'], ['404', 'Investment record not found'],
        ['409', 'Project unavailable or agreement not current'], ['500', 'Failed to retrieve investment information']
    ].map(([status, description]) => [status, { description, content: { 'application/json': { schema: ref('Error') } } }]));
    const operation = (summary, description, parameters, response) => ({
        tags: ['Mobile Investments'], summary, description, security: [{ bearerAuth: [] }],
        parameters, responses: { '200': response, ...JSON.parse(JSON.stringify(failures)) }
    });
    const quoteParams = [parameter('investmentProjectId'), {
        name: 'amount', in: 'query', schema: { type: 'number', minimum: 0.01 }, example: 250000,
        description: 'Principal in major currency units. Defaults to the minimum available investment; previewing does not reserve funds.'
    }, { name: 'currency', in: 'query', schema: { type: 'string' }, example: 'NGN', description: 'Must match the project currency if supplied.' }];
    spec.paths['/mobile/investments/projects/{investmentProjectId}/quote'] = {
        get: operation('Calculate a project investment',
            'Calculates projected profit and total return from the saved project ROI, amount and fixed term. Pending payments reduce available funding. Duration cannot be customized; select another project. Projected returns are estimates.',
            quoteParams, success(ref('MobileInvestmentQuote'), 'Investment calculation retrieved successfully', quoteExample))
    };
    spec.paths['/mobile/investments/projects/{investmentProjectId}/agreement'] = {
        get: operation('Preview the investment agreement before checkout',
            'Returns the calculator summary, review sections and three acknowledgement labels. Render these terms, collect each explicit acceptance and submit the returned agreement.version with the same amount. Preview does not record acceptance or make a payment.',
            JSON.parse(JSON.stringify(quoteParams)), success(object({ quote: ref('MobileInvestmentQuote'), agreement: ref('MobileInvestmentAgreement') }), 'Review your investment agreement', { quote: quoteExample, agreement: agreementExample }))
    };
    spec.paths['/mobile/investments/payments/{transactionId}'] = {
        get: operation('Read payment confirmation details',
            'Owner-only saved payment state for the confirmation screen. confirmed is true only for successful payments. Call the verify endpoint after checkout; this GET does not call Paystack. Terms are taken from the accepted snapshot; legacy web payments without a snapshot have null term fields.',
            [parameter('transactionId')], success(object({
                transactionId: uuid, reference: { type: 'string' },
                status: { type: 'string', enum: ['recorded', 'pending', 'successful', 'failed', 'cancelled'] },
                confirmed: { type: 'boolean' }, amount: money, currency: { type: 'string' },
                farmId: uuid, investmentProjectId: uuid, farmName: { type: 'string', nullable: true },
                roiPercentage: { ...money, nullable: true }, duration: { ...duration, nullable: true },
                expectedProfit: { ...money, nullable: true }, totalReturn: { ...money, nullable: true },
                payoutDate: { ...date, nullable: true }, paidAt: { type: 'string', format: 'date-time', nullable: true },
                agreementAvailable: { type: 'boolean' }
            }), 'Investment payment status retrieved', {
                transactionId: '44444444-4444-4444-8444-444444444444', reference: 'SMILE-INV-EXAMPLE', status: 'successful', confirmed: true,
                amount: 250000, currency: 'NGN', farmId: quoteExample.farmId, investmentProjectId: quoteExample.investmentProjectId,
                farmName: quoteExample.farmName, roiPercentage: 42, duration: quoteExample.duration, expectedProfit: 105000,
                totalReturn: 355000, payoutDate: quoteExample.payoutDate, paidAt: '2026-09-23T10:00:00.000Z', agreementAvailable: true
            }))
    };
    const acceptedExample = { ...agreementExample, acceptedBy: '55555555-5555-4555-8555-555555555555', acceptedAt: '2026-09-23T10:00:00.000Z',
        acceptance: { risksUnderstood: true, termsAccepted: true, fundsLockedUntilMaturity: true } };
    const agreementResponse = success(object({ transactionId: uuid, paymentStatus: { type: 'string' }, agreement: ref('MobileInvestmentAgreement') }), 'Accepted investment agreement retrieved', {
        transactionId: '44444444-4444-4444-8444-444444444444', paymentStatus: 'successful', agreement: acceptedExample
    });
    agreementResponse.content['text/plain'] = {
        schema: { type: 'string' }, example: 'SMILE AGRIC - INVESTMENT AGREEMENT\nPrincipal: NGN 250000.00\nProjected profit: NGN 105000.00\nProjected total return: NGN 355000.00'
    };
    agreementResponse.headers = { 'Content-Disposition': { description: 'attachment; filename="investment-agreement-<transactionId>.txt" when download=true', schema: { type: 'string' } } };
    spec.paths['/mobile/investments/payments/{transactionId}/agreement'] = {
        get: operation('Retrieve or download the accepted agreement',
            'Owner-only immutable terms, acceptance time, investor ID and acknowledgements. Default response is JSON. download=true returns a human-readable UTF-8 .txt attachment. An accepted agreement is not proof of successful payment; consult paymentStatus. Legacy payments without a snapshot return 404.',
            [parameter('transactionId'), { name: 'download', in: 'query', schema: { type: 'boolean', default: false } }], agreementResponse)
    };
    return spec;
}

module.exports = { addMobileInvestmentSwagger };
