'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { investmentTemplateStats } = require('../src/utils/investmentTemplateStats');
const today = new Date('2026-10-08T12:00:00Z');

test('template totals aggregate received funds across projects and prioritize active lifecycle', () => {
    const projects = [
        { investmentReceived: '100.10', investmentStatus: 'completed' },
        { investmentReceived: '200.20', investmentPending: '900.00', investmentStatus: 'active' },
        { investmentReceived: '10.05', investmentStatus: 'funding_started' }
    ];
    assert.deepEqual(investmentTemplateStats(projects, today), { status: 'active', amountInvestedSoFar: 310.35 });
});

test('template lifecycle handles empty, unfunded, funding, and completed projects using existing date rules', () => {
    assert.deepEqual(investmentTemplateStats([], today), { status: 'not_started', amountInvestedSoFar: 0 });
    assert.equal(investmentTemplateStats([{ investmentReceived: '0.00' }], today).status, 'not_started');
    assert.equal(investmentTemplateStats([{ investmentReceived: '10.00', expectedInvestment: '100.00' }], today).status, 'funding_started');
    assert.equal(investmentTemplateStats([{ investmentReceived: '100.00', expectedInvestment: '100.00' }], today).status, 'active');
    assert.equal(investmentTemplateStats([
        { investmentStatus: 'completed' }, { investmentStatus: 'active', endDate: '2026-01-01' }
    ], today).status, 'completed');
    assert.equal(investmentTemplateStats([{ investmentStatus: 'completed' }, { investmentStatus: 'not_started' }], today).status, 'not_started');
});
