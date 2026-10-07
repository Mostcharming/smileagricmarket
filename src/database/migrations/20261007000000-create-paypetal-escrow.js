'use strict';

const tables = require('../paymentTables');
const snake = value => value.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

module.exports = {
    async up(q, S) {
        await q.sequelize.transaction(async transaction => {
            for (const definition of Object.values(tables(S))) {
                await q.createTable(definition.table, {
                    ...Object.fromEntries(Object.entries(definition.fields).map(([field, options]) => [snake(field), options])),
                    created_at: { type: S.DATE, allowNull: false }, updated_at: { type: S.DATE, allowNull: false }
                }, { transaction });
                for (const index of definition.indexes) await q.addIndex(definition.table, index.fields, { ...index, transaction });
            }
            await q.sequelize.query(`
                ALTER TABLE user_farm_milestones DROP CONSTRAINT user_farm_milestone_review_completion_check;
                ALTER TABLE user_farm_milestones ADD CONSTRAINT user_farm_milestone_review_completion_check CHECK (
                    (funding_status = 'completed' AND review_status = 'approved' AND is_completed = TRUE)
                    OR (funding_status <> 'completed' AND is_completed = FALSE
                        AND (review_status <> 'approved' OR funding_status = 'processing_funding'))
                );
                ALTER TABLE project_escrows ADD CONSTRAINT project_escrows_amount_check CHECK
                    (target_amount > 0 AND confirmed_amount >= 0 AND confirmed_amount <= target_amount
                     AND released_amount >= 0 AND released_amount <= confirmed_amount);
                ALTER TABLE payment_deposits ADD CONSTRAINT payment_deposits_amount_check CHECK (amount > 0);
                ALTER TABLE escrow_releases ADD CONSTRAINT escrow_releases_amount_check CHECK (amount > 0);
                ALTER TABLE investor_payouts ADD CONSTRAINT investor_payouts_amount_check CHECK (amount >= 0 AND roi >= 0 AND principal > 0);
            `, { transaction });
        });
    },
    async down(q) {
        await q.sequelize.transaction(async transaction => {
            const [rows] = await q.sequelize.query(`SELECT
                (SELECT COUNT(*) FROM payment_deposits) + (SELECT COUNT(*) FROM investor_payouts)
                + (SELECT COUNT(*) FROM project_escrows WHERE provider_wallet_id IS NOT NULL OR creation_attempted_at IS NOT NULL)
                AS count`, { transaction });
            if (Number(rows[0].count) > 0) throw new Error('Cannot remove escrow storage containing financial records or provider instructions');
            await q.sequelize.query(`
                ALTER TABLE user_farm_milestones DROP CONSTRAINT user_farm_milestone_review_completion_check;
                ALTER TABLE user_farm_milestones ADD CONSTRAINT user_farm_milestone_review_completion_check CHECK (
                    (review_status = 'approved' AND funding_status = 'completed' AND is_completed = TRUE)
                    OR (review_status <> 'approved' AND funding_status <> 'completed' AND is_completed = FALSE)
                );
            `, { transaction });
            for (const definition of Object.values(tables(require('sequelize').DataTypes)).reverse()) {
                await q.dropTable(definition.table, { transaction });
            }
        });
    }
};
