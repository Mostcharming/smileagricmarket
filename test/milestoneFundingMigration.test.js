'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../src/database/migrations/20260908000000-add-unrequested-milestone-funding-status');

test('commits the new enum before changing defaults and backfills only untouched milestones', async () => {
    const queries = [];
    const transaction = {};
    let enumCommitted = false;
    const queryInterface = { sequelize: {
        query: async (sql, options) => {
            queries.push(sql);
            if (sql.includes('ADD VALUE')) {
                assert.equal(options?.transaction, undefined);
                enumCommitted = true;
            } else {
                assert.ok(enumCommitted);
                assert.equal(options.transaction, transaction);
            }
        },
        transaction: async callback => {
            assert.ok(enumCommitted);
            await callback(transaction);
        }
    } };
    await migration.up(queryInterface);
    assert.match(queries[1], /SET DEFAULT 'not_requested'/);
    const backfill = queries[2];
    assert.match(backfill, /"funding_status" = 'request_for_funding'/);
    assert.match(backfill, /"funding_requested_at" IS NULL/);
    assert.match(backfill, /"review_status" = 'pending'/);
    assert.match(backfill, /"reviewed_by" IS NULL/);
    assert.match(backfill, /"reviewed_at" IS NULL/);
    assert.match(backfill, /"is_completed" = FALSE/);
    for (const table of ['milestone_funding_evidence', 'milestone_review_audits', 'milestone_verification_checklists']) {
        assert.ok(backfill.includes(`FROM "${table}"`));
    }
    assert.equal((backfill.match(/NOT EXISTS/g) || []).length, 3);
});
