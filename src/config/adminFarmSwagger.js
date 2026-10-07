'use strict';

function addAdminFarmSwagger(spec) {
    const operation = spec.paths['/web/admin/user-farms/{farmId}'].get;
    operation.description = 'Retrieve a single farm with its owner, overview, investment projects, milestones, farm documents, and photo/PDF evidence submitted with funding requests. '
        + 'Includes completed and active project counts, total funds raised, and funding-goal-weighted milestone completion. '
        + 'Active projects are enabled projects with an effective active status. Completed status follows the existing lifecycle and end-date rules. '
        + 'The address is an alias of location; categories belong to investment projects. '
        + 'Existing fields and nested arrays are retained; summary and display fields are additive. '
        + 'The owner totalFundsReceived covers all of the owner’s farms, while totalFundsRaised covers only this farm.';
    const object = properties => ({ type: 'object', properties });
    const string = { type: 'string' };
    const uuid = { type: 'string', format: 'uuid' };
    const money = { type: 'number', minimum: 0 };
    const decimal = { type: 'string', description: 'Existing PostgreSQL DECIMAL value serialized as a string' };
    const date = { type: 'string', format: 'date', nullable: true };
    const timestamp = { type: 'string', format: 'date-time', nullable: true };
    const ref = name => ({ $ref: `#/components/schemas/${name}` });
    const array = items => ({ type: 'array', items });
    const category = object({ id: uuid, name: string, description: { ...string, nullable: true } });
    const document = object({ id: uuid, documentType: { type: 'string', enum: ['picture', 'document'] },
        fileName: string, fileUrl: { type: 'string', format: 'uri' }, fileSize: { type: 'integer', nullable: true },
        mimeType: { ...string, nullable: true }, createdAt: timestamp });
    const evidence = object({ ...document.properties, evidenceType: { type: 'string', enum: ['photo', 'file'] } });
    delete evidence.properties.documentType;
    const milestone = object({ id: uuid, userFarmInvestmentId: { ...uuid, nullable: true },
        milestoneId: { ...uuid, nullable: true }, investmentMilestoneId: { ...uuid, nullable: true }, name: string,
        fundReleasePercentage: decimal, order: { type: 'integer' }, amount: decimal,
        fundingStatus: { type: 'string', enum: ['not_requested', 'request_for_funding', 'processing_funding', 'completed'] },
        reviewStatus: { type: 'string', enum: ['pending', 'approved', 'rejected', 'more_evidence_required'] },
        fundingRequestedAt: timestamp, isCompleted: { type: 'boolean' }, completedAt: timestamp,
        Milestone: { type: 'object', nullable: true }, InvestmentMilestone: { type: 'object', nullable: true },
        FundingEvidence: array(ref('AdminFarmFundingEvidence')) });
    Object.assign(spec.components.schemas, {
        AdminFarmDocument: document,
        AdminFarmFundingEvidence: evidence,
        AdminFarmMilestone: milestone
    });
    const media = operation.responses['200'].content['application/json'];
    const data = media.schema.properties.data;
    delete data.properties.Category;
    delete data.properties.Investment;
    const owner = data.properties.user;
    Object.assign(data.properties, {
        userId: uuid, location: { ...string, nullable: true }, size: { type: 'number', nullable: true },
        isActive: { type: 'boolean' }, verificationStatus: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
        rejectionNote: { ...string, nullable: true }, createdAt: timestamp, updatedAt: timestamp,
        User: object(Object.fromEntries(Object.entries(owner.properties)
            .filter(([name]) => !['verifiedFarmsCount', 'totalFundsReceived'].includes(name)))),
        Documents: array(ref('AdminFarmDocument')), SelectedMilestones: array(ref('AdminFarmMilestone'))
    });
    Object.assign(data.properties.farmOverview.properties, {
        categories: array(category), photos: array(ref('AdminFarmDocument')), documents: array(ref('AdminFarmDocument'))
    });
    Object.assign(data.properties.InvestmentProjects.items.properties, {
        farmCategoryId: uuid, investmentId: uuid, expectedInvestment: decimal,
        investmentReceived: decimal, investmentPending: decimal, currency: { ...string, example: 'NGN' },
        notes: { ...string, nullable: true }, isActive: { type: 'boolean' }, startDate: date, endDate: date,
        Category: category, InvestmentTemplate: object({ id: uuid, name: string, roiPercentage: decimal,
            fundingMinGoal: decimal, fundingMaxGoal: decimal, currency: string }),
        ProjectMilestones: array(ref('AdminFarmMilestone'))
    });
    const farmId = '11111111-1111-4111-8111-111111111111';
    const ownerId = '22222222-2222-4222-8222-222222222222';
    const projectId = '33333333-3333-4333-8333-333333333333';
    const categoryExample = { id: '44444444-4444-4444-8444-444444444444', name: 'Cassava', description: 'Cassava farming' };
    const file = (documentType, fileName, mimeType) => ({ id: '55555555-5555-4555-8555-555555555555',
        documentType, fileName, fileUrl: `http://localhost:5011/api/v1/uploads/${fileName}`, fileSize: 204800,
        mimeType, createdAt: '2026-01-01T10:00:00.000Z' });
    const documents = [file('picture', 'farm.jpg', 'image/jpeg'), file('document', 'farm-title.pdf', 'application/pdf')];
    const fundingEvidence = [file('picture', 'planting.jpg', 'image/jpeg'), file('document', 'receipts.pdf', 'application/pdf')]
        .map(({ documentType, ...item }) => ({ ...item, evidenceType: documentType === 'picture' ? 'photo' : 'file' }));
    const milestones = [
        { id: '66666666-6666-4666-8666-666666666666', userFarmInvestmentId: projectId, name: 'Preparation',
            investmentMilestoneId: '77777777-7777-4777-8777-777777777777', fundReleasePercentage: '40.00', order: 1,
            amount: '400000.00', fundingStatus: 'completed', reviewStatus: 'approved',
            fundingRequestedAt: '2026-01-05T10:00:00.000Z', isCompleted: true,
            completedAt: '2026-01-10T10:00:00.000Z', FundingEvidence: fundingEvidence },
        { id: '88888888-8888-4888-8888-888888888888', userFarmInvestmentId: projectId, name: 'Harvest',
            investmentMilestoneId: '99999999-9999-4999-8999-999999999999', fundReleasePercentage: '60.00', order: 2,
            amount: '600000.00', fundingStatus: 'not_requested', reviewStatus: 'pending',
            fundingRequestedAt: null, isCompleted: false, completedAt: null, FundingEvidence: [] }
    ];
    const user = { id: ownerId, fullName: 'Ada Okafor', email: 'ada@example.com', phoneNumber: '+2348012345678',
        createdAt: '2025-12-01T10:00:00.000Z' };
    media.example = { error: false, message: 'Farm details retrieved successfully', data: {
        id: farmId, userId: ownerId, name: 'Green Acres Farm', location: 'Epe, Lagos', size: 12,
        isActive: true, verificationStatus: 'approved', rejectionNote: null,
        createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-10T10:00:00.000Z',
        User: user, user: { ...user, verifiedFarmsCount: 2, totalFundsReceived: '1500000.00' },
        totalProjectsCount: 1, completedProjectsCount: 0, activeProjectsCount: 1,
        totalFundingGoalAmount: 1000000, totalFundsRaised: 1000000, completionPercentage: 40,
        farmOverview: { id: farmId, name: 'Green Acres Farm', location: 'Epe, Lagos', address: 'Epe, Lagos', size: 12,
            categories: [categoryExample], photos: [documents[0]], documents: [documents[1]] },
        InvestmentProjects: [{ id: projectId, farmCategoryId: categoryExample.id,
            investmentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Cassava Growth Project',
            expectedInvestment: '1000000.00', investmentReceived: '1000000.00', investmentPending: '0.00',
            investmentStatus: 'active', status: 'active', startDate: '2026-01-01', endDate: '2026-12-31',
            currency: 'NGN', notes: null, isActive: true, investorCount: 8,
            fundingGoalAmount: 1000000, amountRaised: 1000000, completionPercentage: 40,
            Category: categoryExample, InvestmentTemplate: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                name: 'Cassava Growth Project', roiPercentage: '20.00', fundingMinGoal: '100000.00',
                fundingMaxGoal: '1000000.00', currency: 'NGN' }, ProjectMilestones: milestones }],
        SelectedMilestones: milestones, Documents: documents
    } };
    return spec;
}

module.exports = { addAdminFarmSwagger };
