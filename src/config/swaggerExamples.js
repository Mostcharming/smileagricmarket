'use strict';

// Fill documentation gaps from the declared schemas. Handwritten examples always win.
// Endpoints whose response schemas are not yet declared have explicit samples below.
const UUID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const MILESTONE_ID = '33333333-3333-4333-8333-333333333333';
const DATE = '2026-09-08T10:00:00.000Z';
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const hasExample = value => own(value, 'example') || Object.keys(value.examples || {}).length > 0;

function resolve(spec, schema = {}) {
    if (!schema.$ref) return schema;
    return schema.$ref.split('/').slice(1).reduce((value, key) => value?.[key], spec) || {};
}

function sampleSchema(spec, input = {}, name = '', seen = new Set()) {
    if (input.$ref && seen.has(input.$ref)) return null;
    const visited = new Set(seen);
    if (input.$ref) visited.add(input.$ref);
    const schema = resolve(spec, input);
    if (own(schema, 'example')) return schema.example;
    if (own(schema, 'default')) return schema.default;
    if (schema.enum) return schema.enum[0];
    if (schema.oneOf || schema.anyOf) return sampleSchema(spec, (schema.oneOf || schema.anyOf)[0], name, visited);
    if (schema.allOf) return Object.assign({}, ...schema.allOf.map(item => sampleSchema(spec, item, name, visited)));
    if (schema.type === 'object' || schema.properties) {
        return Object.fromEntries(Object.entries(schema.properties || {}).map(([key, value]) =>
            [key, sampleSchema(spec, value, key, visited)]));
    }
    if (schema.type === 'array') return schema.maxItems === 0 ? [] : [sampleSchema(spec, schema.items, name, visited)];
    if (schema.type === 'boolean') return name === 'error' ? false : true;
    if (['integer', 'number'].includes(schema.type)) {
        return Math.min(schema.maximum ?? Infinity, Math.max(schema.minimum ?? 1, 1));
    }
    const formats = {
        uuid: UUID, email: 'farmer@example.com', date: '2026-09-08', 'date-time': DATE,
        uri: 'https://example.com/document.pdf', url: 'https://example.com/document.pdf',
        password: 'ExamplePassword123!', binary: '(binary file content)'
    };
    if (formats[schema.format]) return formats[schema.format];
    const fields = {
        name: 'Land preparation', fullName: 'Ada Okafor', firstName: 'Ada',
        email: 'farmer@example.com', phoneNumber: '08012345678',
        currency: 'NGN', description: 'Prepare the farm for planting',
        notes: 'Evidence of completed land preparation', internalNotes: 'Evidence checked',
        message: 'Success', search: 'Cassava', sortBy: 'createdAt',
        address: 'Ibadan', location: 'Ibadan', bankName: 'Example Bank',
        accountNumber: '0123456789', bankCode: '058', accountName: 'Ada Okafor',
        reference: 'smile_example_payment_001', idempotencyKey: 'example-investment-001',
        fileName: 'evidence.pdf', mimeType: 'application/pdf'
    };
    if (fields[name]) return fields[name];
    if (/id$/i.test(name)) return UUID;
    if (/url$/i.test(name)) return 'https://example.com/document.pdf';
    return 'example';
}

const milestone = {
    id: MILESTONE_ID, selectionId: UUID, investmentProjectId: PROJECT_ID,
    name: 'Land preparation', order: 1, fundReleasePercentage: 25,
    amount: 250000, allocatedAmount: 250000, fundingStatus: 'request_for_funding',
    status: 'request_for_funding', reviewStatus: 'pending', fundingRequestedAt: DATE,
    isCompleted: false, completedAt: null,
    fundingEvidence: [{ id: UUID, evidenceType: 'file', fileName: 'evidence.pdf',
        fileUrl: 'https://example.com/evidence.pdf', mimeType: 'application/pdf', fileSize: 2048 }]
};
const untouchedMilestone = {
    ...milestone, id: '44444444-4444-4444-8444-444444444444',
    selectionId: '55555555-5555-4555-8555-555555555555', name: 'Planting', order: 2,
    fundingStatus: 'not_requested', status: 'not_requested', fundingRequestedAt: null,
    fundingEvidence: []
};
const project = {
    id: PROJECT_ID, userFarmId: UUID, investmentId: UUID,
    investmentStatus: 'not_started', startDate: '2026-09-08', endDate: '2027-09-08',
    expectedInvestment: 1000000, fundingGoalAmount: 1000000, amountRaised: 0,
    investmentReceived: 0, investmentPending: 1000000, currency: 'NGN',
    completionPercentage: 0, percentRaised: 0, investorCount: 0,
    milestoneStats: { total: 2, notRequested: 1, requestForFunding: 1, processingFunding: 0, completed: 0 },
    milestones: [milestone, untouchedMilestone]
};
const farm = {
    id: UUID, name: 'Cassava Farm', location: 'Ibadan', address: 'Ibadan',
    size: 5, plotSize: 5, verificationStatus: 'approved',
    investmentProjects: [project], investmentProject: project, selectedMilestone: milestone,
    totalFundingGoalAmount: 1000000, totalFundsRaised: 0, percentRaised: 0,
    completionPercentage: 0, investorCount: 0, photos: [], farmDocuments: []
};
const pagination = { page: 1, limit: 20, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false };
const trend = { currentYear: 0, previousYear: 0, change: 0, displayChange: '0', percentageChange: 0, direction: 'unchanged' };
const reviewDetail = {
    id: UUID, userFarmInvestmentId: PROJECT_ID, investmentMilestoneId: MILESTONE_ID,
    name: milestone.name, fundingStatus: 'request_for_funding', reviewStatus: 'pending',
    status: 'pending', fundingRequestedAt: DATE, amount: '250000.00', amountRequested: 250000,
    isCompleted: false, completedAt: null, FundingEvidence: milestone.fundingEvidence,
    VerificationChecklist: [{ id: UUID, name: 'Land preparation evidence', status: 'verified', notes: 'Verified photo and report' }],
    ReviewAuditTrail: [], otherMilestones: []
};

function missingSuccessData(spec, route, method, code) {
    const from = name => sampleSchema(spec, { $ref: `#/components/schemas/${name}` });
    if (route.endsWith('/kyc/update')) return {
        kycId: UUID, status: 'pending', message: 'KYC updated successfully. Please wait for verification.',
        submittedAt: DATE, selfie: 'https://example.com/selfie.jpg'
    };
    if (route === '/web/beta-signups') return { email: 'farmer@example.com', type: 'investor', alreadyRegistered: code === '200' };
    if (route.endsWith('/investment-template')) return {
        category: { id: UUID, name: 'Cassava', description: 'Cassava farming' },
        investmentTemplate: from('Investment'), investmentTemplates: [from('Investment')],
        milestones: [from('InvestmentMilestone')]
    };
    if (route === '/web/farms' && method === 'post') return {
        ...farm, verificationStatus: 'pending', investmentProjects: [], investmentProject: null,
        selectedMilestone: null, totalFundingGoalAmount: 0
    };
    if (route === '/web/farms/{farmId}/investment-projects') return {
        ...project, milestoneStats: { ...project.milestoneStats, notRequested: 2, requestForFunding: 0 },
        milestones: project.milestones.map(item => ({ ...item, fundingStatus: 'not_requested',
            status: 'not_requested', fundingRequestedAt: null, fundingEvidence: [] }))
    };
    if (route === '/web/farms/{farmId}/documents') return {
        id: UUID, name: farm.name, location: farm.location, size: farm.size,
        verificationStatus: farm.verificationStatus,
        Documents: [{ id: MILESTONE_ID, documentType: 'document', fileName: 'farm-document.pdf',
            fileUrl: 'https://example.com/farm-document.pdf', fileSize: 2048, mimeType: 'application/pdf', createdAt: DATE }]
    };
    if (route.startsWith('/web/farms')) return method === 'delete' ? {} : farm;
    if (route === '/web/admin/user-farm-milestones/{milestoneId}/status') return {
        id: UUID, investmentProjectId: PROJECT_ID, investmentMilestoneId: MILESTONE_ID,
        status: 'processing_funding', isCompleted: false, completedAt: null,
        fundingEvidence: milestone.fundingEvidence
    };
    if (method === 'delete' && route.startsWith('/web/admin/investment')) return { id: UUID };
    if (route === '/web/admin/investments/{investmentId}/milestones'
        || route === '/web/admin/investment-milestones/{milestoneId}') return from('InvestmentMilestone');
    if (route === '/web/admin/user-investments') return { investments: [], pagination };
    if (route === '/web/admin/user-investment-milestones') return {
        milestones: [], pagination,
        summary: { pendingMilestones: { count: 0, trend }, totalDisbursed: { amount: 0, trend }, totalInEscrow: { amount: 0, trend } }
    };
    if (route.endsWith('/checklist')) return { ...reviewDetail, fundingStatus: 'processing_funding' };
    if (route.endsWith('/review')) return {
        ...reviewDetail, fundingStatus: 'completed', reviewStatus: 'approved', status: 'approved',
        isCompleted: true, completedAt: DATE
    };
    if (route.startsWith('/web/admin/user-investment-milestones/')) return reviewDetail;
    return undefined;
}

function addSwaggerExamples(spec) {
    for (const [route, pathItem] of Object.entries(spec.paths)) {
        for (const [method, operation] of Object.entries(pathItem)) {
            if (!operation.responses) continue;
            const parameters = [...(pathItem.parameters || []), ...(operation.parameters || [])];
            let examplePath = route;
            for (const input of parameters) {
                const parameter = resolve(spec, input);
                if (!hasExample(parameter)) parameter.example = sampleSchema(spec, parameter.schema, parameter.name);
                if (parameter.in === 'path') examplePath = examplePath.replace(`{${parameter.name}}`, encodeURIComponent(parameter.example));
            }
            for (const media of Object.values(operation.requestBody?.content || {})) {
                if (hasExample(media)) continue;
                media.example = route === '/web/payments/paystack/webhook'
                    ? { event: 'charge.success', data: { reference: 'smile_example_payment_001',
                        status: 'success', amount: 5000000, currency: 'NGN', paid_at: DATE } }
                    : sampleSchema(spec, media.schema);
            }
            // Bodyless operations still get a concrete request URL in Swagger UI.
            if (!operation.requestBody && !operation.description?.includes('Example request:')) {
                const query = parameters.filter(item => item.in === 'query' && (item.required || own(item.schema || {}, 'default')))
                    .map(item => `${item.name}=${encodeURIComponent(item.example)}`).join('&');
                operation.description = `${operation.description || ''}\n\nExample request:\n\n\`\`\`http\n${method.toUpperCase()} /v1${examplePath}${query ? `?${query}` : ''}${operation.security?.length ? '\nAuthorization: Bearer <access-token>' : ''}\n\`\`\``.trim();
            }
            for (const [code, response] of Object.entries(operation.responses)) {
                if (code === '204' || code === '304' || response.$ref) continue;
                const isError = Number(code) >= 400;
                if (!response.content) {
                    response.content = { 'application/json': { schema: {
                        $ref: `#/components/schemas/${isError ? 'Error' : 'Success'}`
                    } } };
                    const media = response.content['application/json'];
                    if (route === '/web/payments/paystack/webhook') {
                        media.schema = { type: 'object', properties: { received: { type: 'boolean' } } };
                        media.example = { received: !isError };
                    } else if (isError) {
                        media.example = { error: true, message: response.description, data: null };
                    } else if (route === '/web/investments/{investmentProjectId}/invest') {
                        media.schema = operation.responses['201'].content['application/json'].schema;
                    } else if (route === '/web/investments/payments/{transactionId}/verify') {
                        const paymentSchema = spec.paths['/web/investments/{investmentProjectId}/invest'].post.responses['201'].content['application/json'].schema;
                        const paymentSample = sampleSchema(spec, paymentSchema);
                        delete paymentSample.data.gateway;
                        media.example = { ...paymentSample, message: 'Investment payment verified successfully',
                            data: { ...paymentSample.data, credited: true, alreadySettled: false } };
                        media.example.data.payment.status = 'successful';
                    } else {
                        const data = missingSuccessData(spec, route, method, code);
                        if (data === undefined) throw new Error(`Missing Swagger success example: ${method} ${route} ${code}`);
                        media.example = { error: false, message: response.description, data };
                    }
                }
                for (const [type, media] of Object.entries(response.content)) {
                    if (hasExample(media)) continue;
                    if (type === 'text/csv') {
                        media.schema ||= { type: 'string' };
                        media.example = route.includes('beta-signups')
                            ? 'email,first_name,user_type,source,confirmation_email_sent_at,created_at\nfarmer@example.com,Ada,investor,landing_page,2026-09-08T10:00:00.000Z,2026-09-08T10:00:00.000Z\n'
                            : 'Milestone ID,User Full Name,User Email,Farm,Farm Location,Investment,Investment Project ID,Milestone,Amount Requested,Currency,Review Status,Funding Status,Requested At,Reviewed At,Maturity Date\n';
                    } else {
                        media.example = sampleSchema(spec, media.schema);
                        if (media.example && typeof media.example === 'object' && own(media.example, 'error')) {
                            media.example.error = isError;
                            if (media.example.message === 'Success') media.example.message = response.description;
                            if (isError && JSON.stringify(media.example.data) === '{}') media.example.data = null;
                        }
                    }
                }
            }
        }
    }
    return spec;
}

module.exports = { addSwaggerExamples, sampleSchema };
