'use strict';

function parsePortfolioFilters(query) {
    const filters = {};
    if (query.duration !== undefined && query.duration !== '') {
        const match = typeof query.duration === 'string'
            && query.duration.trim().toLowerCase().match(/^([1-9]\d*)\s*(weeks?|months?|years?)$/);
        if (!match || !Number.isSafeInteger(Number(match[1]))) {
            throw new Error('duration must be a positive term such as "8 months", "4 weeks", or "1 year"');
        }
        filters.durationValue = Number(match[1]);
        filters.durationUnit = match[2].replace(/s$/, '') + 's';
    }
    for (const name of ['startDate', 'endDate']) {
        const value = query[name];
        if (value === undefined || value === '') continue;
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            throw new Error(`${name} must use YYYY-MM-DD format`);
        }
        const date = new Date(`${value}T00:00:00.000Z`);
        if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
            throw new Error(`${name} must be a valid calendar date`);
        }
        filters[name] = value;
    }
    if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
        throw new Error('endDate must be on or after startDate');
    }
    return filters;
}

function matchesPortfolioFilters(entry, filters) {
    const project = entry.FarmInvestment || {};
    const template = entry.InvestmentTemplate || {};
    const duration = entry.agreement?.terms?.duration;
    const value = duration?.value ?? template.durationValue;
    const unit = duration?.unit ?? template.durationUnit;
    if (filters.durationValue && (Number(value) !== filters.durationValue || unit !== filters.durationUnit)) return false;
    const startDate = String(project.startDate || template.startDate || '').slice(0, 10);
    const endDate = entry.effectiveEndDate?.toISOString().slice(0, 10) || '';
    if (filters.startDate && (!startDate || startDate < filters.startDate)) return false;
    if (filters.endDate && (!endDate || endDate > filters.endDate)) return false;
    return true;
}

module.exports = { parsePortfolioFilters, matchesPortfolioFilters };
