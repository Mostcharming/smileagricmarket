'use strict';

module.exports = {
    async up(q, S) {
        await q.sequelize.transaction(async transaction => {
            const payments = await q.describeTable('investment_payments', { transaction });
            if (!payments.initiation_attempted_at) await q.addColumn('investment_payments', 'initiation_attempted_at',
                { type: S.DATE, allowNull: true }, { transaction });
            await q.changeColumn('investment_payments', 'gateway_transaction_id',
                { type: S.STRING(100), allowNull: true }, { transaction });
            const deposits = await q.describeTable('payment_deposits', { transaction });
            if (!deposits.verification_source) await q.addColumn('payment_deposits', 'verification_source',
                { type: S.STRING, allowNull: false, defaultValue: 'manual' }, { transaction });
            await q.sequelize.query('ALTER TABLE payment_deposits ALTER COLUMN reviewed_by DROP NOT NULL', { transaction });
        });
    },
    async down(q) {
        await q.sequelize.transaction(async transaction => {
            // Automated confirmations have no reviewing admin; preserve their nullable audit history.
            await q.removeColumn('payment_deposits', 'verification_source', { transaction });
            await q.removeColumn('investment_payments', 'initiation_attempted_at', { transaction });
        });
    }
};
