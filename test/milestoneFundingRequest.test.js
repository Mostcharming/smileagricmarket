'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

// Load the real controller with isolated models, without starting the database.
function setup() {
    const milestones = [
        ['first', 'project-a', 'template-first'],
        ['second', 'project-a', 'template-second'],
        ['other-project', 'project-b', 'template-second']
    ].map(([id, userFarmInvestmentId, investmentMilestoneId]) => ({
        id, userFarmInvestmentId, investmentMilestoneId,
        fundingStatus: 'not_requested', reviewStatus: 'pending',
        fundingRequestedAt: null, isCompleted: false,
        async update(values) { Object.assign(this, values); }
    }));
    const evidence = [];
    const projects = ['project-a', 'project-b'].map(id => ({ id, investmentId: 'template' }));
    const farm = () => ({
        id: 'farm', SelectedMilestones: milestones,
        InvestmentProjects: projects.map(project => ({
            ...project,
            ProjectMilestones: milestones.filter(item => item.userFarmInvestmentId === project.id)
        }))
    });
    let cleaned = false;
    const models = {
        FarmCategory: { findOne: async () => ({ id: 'category' }) },
        Investment: { findOne: async () => ({
            id: 'template', fundingMinGoal: 1000, fundingMaxGoal: 1000000,
            currency: 'NGN', durationValue: 12, durationUnit: 'months',
            Milestones: [
                { id: 'template-first', name: 'Preparation', fundReleasePercentage: 40, order: 1 },
                { id: 'template-second', name: 'Planting', fundReleasePercentage: 60, order: 2 }
            ]
        }) },
        UserFarm: {
            findOne: async ({ where }) => where.userId === 'owner' ? { id: 'farm' } : null,
            findByPk: async () => farm()
        },
        UserFarmInvestment: {
            create: async values => {
                const project = { id: 'new-project', ...values };
                projects.push(project);
                return project;
            },
            findAll: async ({ where }) => projects.filter(project => !where.id || project.id === where.id)
        },
        UserFarmMilestone: {
            bulkCreate: async values => milestones.push(...values.map((value, index) => ({
                id: `new-${index}`, ...value
            }))),
            findOne: async ({ where }) => milestones.find(item =>
                item.userFarmInvestmentId === where.userFarmInvestmentId
                && item.investmentMilestoneId === where.investmentMilestoneId)
        },
        MilestoneFundingEvidence: { bulkCreate: async items => evidence.push(...items) },
        MilestoneReviewAudit: { create: async () => {} }
    };
    const filename = path.resolve(__dirname, '../src/modules/web/farms/controller.js');
    const localRequire = createRequire(filename);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, console,
        require: name => {
            if (name === '../../../database') return { sequelize: {
                transaction: async callback => callback ? callback({}) : { commit: async () => {}, rollback: async () => {} }
            } };
            if (name === '../../../database/models') return () => models;
            if (name === 'sequelize') return { Op: {} };
            if (name.endsWith('/uploadMilestoneFundingEvidence')) return {
                cleanupMilestoneFundingEvidenceFiles: () => { cleaned = true; }
            };
            return localRequire(name);
        }
    }, { filename });
    const req = {
        user: { id: 'owner' }, params: { farmId: 'farm' },
        body: { investmentProjectId: 'project-a', selectedMilestoneId: 'template-second' },
        milestoneFundingEvidence: [{ evidenceType: 'file', fileName: 'evidence.pdf' }]
    };
    const res = {
        success: (data, message, status = 200) => ({ status, data, message }),
        fail: (message, status) => ({ status, message })
    };
    return { milestones, evidence, req, res, controller: module.exports, cleaned: () => cleaned };
}

test('new investment projects initialize every milestone as not requested', async () => {
    const { controller, req, res, milestones } = setup();
    req.body = { farmCategoryId: 'category', fundingGoalAmount: 100000 };
    const result = await controller.createInvestmentProject(req, res);
    assert.equal(result.status, 201);
    const created = milestones.filter(item => item.userFarmInvestmentId === 'new-project');
    assert.equal(created.length, 2);
    assert.deepEqual(created.map(item => item.fundingStatus), ['not_requested', 'not_requested']);
    assert.deepEqual(created.map(item => item.amount), [40000, 60000]);
    assert.equal(result.data.milestoneStats.requestForFunding, 0);
    assert.equal(result.data.milestoneStats.notRequested, 2);
});

test('requesting the second milestone changes only that project milestone and returns it as selected', async () => {
    const { controller, req, res, milestones, evidence } = setup();
    const result = await controller.addMilestonesToFarm(req, res);
    assert.equal(result.status, 200);
    assert.deepEqual(milestones.map(item => item.fundingStatus), [
        'not_requested', 'request_for_funding', 'not_requested'
    ]);
    assert.ok(milestones[1].fundingRequestedAt);
    assert.equal(milestones[0].fundingRequestedAt, null);
    assert.equal(milestones[2].fundingRequestedAt, null);
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].userFarmMilestoneId, 'second');
    assert.equal(result.data.selectedMilestone.selectionId, 'second');
    assert.equal(result.data.selectedMilestone.status, 'request_for_funding');
    assert.equal(result.data.selectedMilestone.reviewStatus, 'pending');
    assert.equal(result.data.investmentProjects[0].milestoneStats.requestForFunding, 1);
    assert.equal(result.data.investmentProjects[0].milestoneStats.notRequested, 1);
    assert.equal(result.data.investmentProjects[1].milestoneStats.requestForFunding, 0);
});

for (const scenario of ['missing evidence', 'wrong owner', 'wrong milestone', 'ambiguous project', 'completed', 'processing_funding', 'rejected']) {
    test(`rejects ${scenario} without changing sibling milestones or saving evidence`, async () => {
        const context = setup();
        const { controller, req, res, milestones, evidence } = context;
        if (scenario === 'missing evidence') req.milestoneFundingEvidence = [];
        if (scenario === 'wrong owner') req.user.id = 'stranger';
        if (scenario === 'wrong milestone') req.body.selectedMilestoneId = 'unknown';
        if (scenario === 'ambiguous project') delete req.body.investmentProjectId;
        if (scenario === 'rejected') milestones[1].reviewStatus = 'rejected';
        if (['completed', 'processing_funding'].includes(scenario)) milestones[1].fundingStatus = scenario;
        const before = milestones.map(item => item.fundingStatus);
        const result = await controller.addMilestonesToFarm(req, res);
        assert.ok(result.status >= 400);
        assert.deepEqual(milestones.map(item => item.fundingStatus), before);
        assert.equal(evidence.length, 0);
        assert.equal(context.cleaned(), true);
    });
}
