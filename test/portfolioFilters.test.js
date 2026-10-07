'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePortfolioFilters, matchesPortfolioFilters } = require('../src/utils/portfolioFilters');
const entry = {
    FarmInvestment: { startDate: '2026-01-01' },
    InvestmentTemplate: { durationValue: 8, durationUnit: 'months' },
    effectiveEndDate: new Date('2026-08-31T23:59:59.999Z')
};

test('portfolio duration and independent date bounds are inclusive and combine using AND', () => {
    assert.ok(matchesPortfolioFilters(entry, parsePortfolioFilters({})));
    for (const query of [{ duration: '8 months' }, { startDate: '2026-01-01' }, { endDate: '2026-08-31' },
        { duration: '8 months', startDate: '2026-01-01', endDate: '2026-08-31' }]) {
        assert.ok(matchesPortfolioFilters(entry, parsePortfolioFilters(query)));
    }
    for (const query of [{ duration: '6 months' }, { startDate: '2026-01-02' }, { endDate: '2026-08-30' }]) {
        assert.equal(matchesPortfolioFilters(entry, parsePortfolioFilters(query)), false);
    }
    assert.ok(matchesPortfolioFilters({ ...entry, agreement: { terms: { duration: { value: 1, unit: 'years' } } } },
        parsePortfolioFilters({ duration: '1 year' })));
    assert.equal(matchesPortfolioFilters({ ...entry, FarmInvestment: {}, InvestmentTemplate: {} },
        parsePortfolioFilters({ startDate: '2026-01-01' })), false);
});

test('portfolio filters reject invalid dates, inverted ranges, and malformed durations', () => {
    for (const query of [{ startDate: '2026-02-30' }, { endDate: 'not-a-date' },
        { startDate: '2026-12-31', endDate: '2026-01-01' }, { duration: '0 months' },
        { duration: '8' }, { duration: ['8 months'] }]) {
        assert.throws(() => parsePortfolioFilters(query));
    }
    assert.deepEqual(parsePortfolioFilters({ duration: '8 Months' }), { durationValue: 8, durationUnit: 'months' });
});
