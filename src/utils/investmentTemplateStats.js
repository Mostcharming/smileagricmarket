'use strict';

const { resolveInvestmentProjectStatus } = require('./investmentProject');

function investmentTemplateStats(projects = [], today = new Date()) {
    const statuses = projects.map(project => resolveInvestmentProjectStatus(project, today));
    const status = statuses.length > 0 && statuses.every(value => value === 'completed') ? 'completed'
        : statuses.includes('active') ? 'active'
        : statuses.includes('funding_started') ? 'funding_started'
        : 'not_started';
    return {
        status,
        amountInvestedSoFar: Number(projects.reduce((sum, project) =>
            sum + Number(project.investmentReceived || 0), 0).toFixed(2))
    };
}

module.exports = { investmentTemplateStats };
