'use strict';

const { resolveInvestmentProjectStatus } = require('./investmentProject');
const round = value => Number(value.toFixed(2));

function addAdminFarmDetails(farm, payments = [], today = new Date()) {
    const investorsByProject = new Map();
    for (const payment of payments) {
        if (!payment.investorId) continue;
        if (!investorsByProject.has(payment.userFarmInvestmentId)) {
            investorsByProject.set(payment.userFarmInvestmentId, new Set());
        }
        investorsByProject.get(payment.userFarmInvestmentId).add(payment.investorId);
    }
    const projects = (farm.InvestmentProjects || []).map(project => {
        const milestones = project.ProjectMilestones || [];
        const completion = milestones.reduce((sum, milestone) =>
            sum + (milestone.fundingStatus === 'completed'
                ? Number(milestone.fundReleasePercentage || 0) : 0), 0);
        return {
            ...project,
            name: project.InvestmentTemplate?.name || null,
            status: resolveInvestmentProjectStatus(project, today),
            investorCount: investorsByProject.get(project.id)?.size || 0,
            fundingGoalAmount: Number(project.expectedInvestment || 0),
            amountRaised: Number(project.investmentReceived || 0),
            completionPercentage: round(Math.min(100, Math.max(0, completion)))
        };
    });
    const totalFundingGoalAmount = round(projects.reduce((sum, project) => sum + project.fundingGoalAmount, 0));
    const categories = [...new Map(projects.filter(project => project.Category)
        .map(project => [project.Category.id, project.Category])).values()];
    return {
        ...farm,
        InvestmentProjects: projects,
        totalProjectsCount: projects.length,
        completedProjectsCount: projects.filter(project => project.status === 'completed').length,
        activeProjectsCount: projects.filter(project => project.isActive !== false && project.status === 'active').length,
        totalFundingGoalAmount,
        totalFundsRaised: round(projects.reduce((sum, project) => sum + project.amountRaised, 0)),
        // Same funding-goal-weighted milestone progress as the web farm view.
        completionPercentage: totalFundingGoalAmount > 0
            ? round(projects.reduce((sum, project) => sum + project.fundingGoalAmount * project.completionPercentage, 0)
                / totalFundingGoalAmount) : 0,
        farmOverview: {
            id: farm.id,
            name: farm.name,
            location: farm.location,
            address: farm.location,
            size: farm.size,
            categories,
            photos: (farm.Documents || []).filter(document => document.documentType === 'picture'),
            documents: (farm.Documents || []).filter(document => document.documentType === 'document')
        }
    };
}

module.exports = { addAdminFarmDetails };
