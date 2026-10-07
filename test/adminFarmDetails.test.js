'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { addAdminFarmDetails } = require('../src/utils/adminFarmDetails');

test('admin farm details retain existing nested data and aggregate projects without double-counting investors', () => {
    const farm = {
        id: 'farm', name: 'Farm', location: 'Lagos', size: 12,
        User: { id: 'owner', fullName: 'Owner' },
        Documents: [{ documentType: 'picture', fileUrl: '/photo.jpg' }, { documentType: 'document', fileUrl: '/title.pdf' }],
        SelectedMilestones: [{ id: 'legacy' }],
        InvestmentProjects: [
            { id: 'one', expectedInvestment: '100.00', investmentReceived: '80.50', investmentStatus: 'completed',
                Category: { id: 'cat', name: 'Cassava' }, InvestmentTemplate: { name: 'Cassava Investment' },
                ProjectMilestones: [{ fundingStatus: 'completed', fundReleasePercentage: 100,
                    FundingEvidence: [{ fileUrl: '/evidence.pdf', mimeType: 'application/pdf' }] }] },
            { id: 'two', expectedInvestment: '300.00', investmentReceived: '300.00', investmentStatus: 'active', isActive: true,
                ProjectMilestones: [{ fundingStatus: 'completed', fundReleasePercentage: 40 },
                    { fundingStatus: 'processing_funding', fundReleasePercentage: 60 }] },
            { id: 'three', expectedInvestment: '0', investmentReceived: '0', investmentStatus: 'not_started', ProjectMilestones: [] }
        ]
    };
    const original = structuredClone(farm);
    const result = addAdminFarmDetails(farm, [
        { userFarmInvestmentId: 'one', investorId: 'a' },
        { userFarmInvestmentId: 'one', investorId: 'a' },
        { userFarmInvestmentId: 'one', investorId: 'b' },
        { userFarmInvestmentId: 'two', investorId: 'a' }
    ], new Date('2026-10-07T12:00:00Z'));
    assert.equal(result.totalProjectsCount, 3);
    assert.equal(result.completedProjectsCount, 1);
    assert.equal(result.activeProjectsCount, 1);
    assert.equal(result.totalFundsRaised, 380.5);
    assert.equal(result.totalFundingGoalAmount, 400);
    assert.equal(result.completionPercentage, 55);
    assert.equal(result.InvestmentProjects[0].investorCount, 2);
    assert.equal(result.InvestmentProjects[1].completionPercentage, 40);
    assert.equal(result.InvestmentProjects[0].name, 'Cassava Investment');
    for (const key of ['User', 'Documents', 'SelectedMilestones']) assert.deepEqual(result[key], farm[key]);
    farm.InvestmentProjects.forEach((project, index) => {
        for (const [key, value] of Object.entries(project)) assert.deepEqual(result.InvestmentProjects[index][key], value);
    });
    assert.equal(result.farmOverview.photos.length, 1);
    assert.equal(result.farmOverview.documents.length, 1);
    assert.equal(result.farmOverview.address, 'Lagos');
    assert.deepEqual(farm, original);
});

test('empty farms and disabled projects return finite metrics and preserve stored status', () => {
    const empty = addAdminFarmDetails({ id: 'empty' });
    assert.equal(empty.completionPercentage, 0);
    assert.equal(empty.totalFundsRaised, 0);
    assert.equal(empty.activeProjectsCount, 0);
    const result = addAdminFarmDetails({ InvestmentProjects: [
        { id: 'disabled', isActive: false, investmentStatus: 'active' },
        { id: 'ended', investmentStatus: 'active', endDate: '2026-01-01' }
    ] }, [], new Date('2026-10-07T12:00:00Z'));
    assert.equal(result.activeProjectsCount, 0);
    assert.equal(result.completedProjectsCount, 1);
    assert.equal(result.InvestmentProjects[1].investmentStatus, 'active');
    assert.equal(result.InvestmentProjects[1].status, 'completed');
});
