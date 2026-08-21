'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');

test('registers milestone review, checklist, audit, and reviewer associations', async () => {
    const sequelize = new Sequelize('postgres://test:test@localhost:5432/test', {
        logging: false
    });
    const models = require('../src/database/models')(sequelize);
    const milestoneAttributes = models.UserFarmMilestone.getAttributes();

    assert.equal(milestoneAttributes.reviewStatus.field, 'review_status');
    assert.equal(milestoneAttributes.reviewStatus.defaultValue, 'pending');
    assert.equal(milestoneAttributes.fundingRequestedAt.field, 'funding_requested_at');
    assert.equal(milestoneAttributes.reviewedBy.field, 'reviewed_by');
    assert.equal(milestoneAttributes.reviewedAt.field, 'reviewed_at');
    assert.equal(
        models.UserFarmMilestone.associations.VerificationChecklist.target,
        models.MilestoneVerificationChecklist
    );
    assert.equal(
        models.UserFarmMilestone.associations.ReviewAuditTrail.target,
        models.MilestoneReviewAudit
    );
    assert.equal(
        models.UserFarmMilestone.associations.Reviewer.target,
        models.Admin
    );
    assert.equal(
        models.UserFarmMilestone.associations.InvestmentProject.target,
        models.UserFarmInvestment
    );

    await sequelize.close();
});

test('creates milestone review storage in one migration transaction', async () => {
    const migration = require(
        '../src/database/migrations/20260821000001-create-milestone-review-workflow'
    );
    const transaction = { id: 'review-migration' };
    const addedColumns = [];
    const createdTables = [];
    const addedIndexes = [];
    let transactionCount = 0;
    const queryInterface = {
        sequelize: {
            transaction: async callback => {
                transactionCount += 1;
                return callback(transaction);
            },
            query: async (sql, options) => {
                assert.equal(options.transaction, transaction);
                assert.equal(typeof sql, 'string');
            }
        },
        addColumn: async (table, column, definition, options) => {
            assert.equal(options.transaction, transaction);
            assert.ok(definition.type);
            addedColumns.push(`${table}.${column}`);
        },
        createTable: async (table, definition, options) => {
            assert.equal(options.transaction, transaction);
            assert.ok(definition.id);
            createdTables.push(table);
        },
        addIndex: async (table, fields, options) => {
            assert.equal(options.transaction, transaction);
            assert.ok(Array.isArray(fields));
            addedIndexes.push(`${table}.${options.name}`);
        }
    };

    await migration.up(queryInterface, Sequelize);

    assert.equal(transactionCount, 1);
    assert.deepEqual(addedColumns, [
        'user_farm_milestones.review_status',
        'user_farm_milestones.funding_requested_at',
        'user_farm_milestones.reviewed_by',
        'user_farm_milestones.reviewed_at'
    ]);
    assert.deepEqual(createdTables, [
        'milestone_verification_checklists',
        'milestone_review_audits'
    ]);
    assert.ok(addedIndexes.includes(
        'user_farm_milestones.user_farm_milestones_review_status_idx'
    ));
    assert.ok(addedIndexes.includes(
        'milestone_review_audits.milestone_review_audits_created_at_idx'
    ));
});
