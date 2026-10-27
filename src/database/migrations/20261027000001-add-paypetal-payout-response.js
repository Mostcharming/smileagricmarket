'use strict';

module.exports = {
    async up(q, S) {
        await q.sequelize.transaction(async transaction => {
            const columns = await q.describeTable('payment_profiles', { transaction });
            for (const [name, type] of Object.entries({
                payout_response: S.JSONB, payout_data: S.JSONB, payout_attempted_at: S.DATE
            })) {
                if (!columns[name]) await q.addColumn('payment_profiles', name,
                    { type, allowNull: true }, { transaction });
            }
        });
    },
    async down(q) {
        await q.sequelize.transaction(async transaction => {
            for (const name of ['payout_attempted_at', 'payout_data', 'payout_response']) {
                await q.removeColumn('payment_profiles', name, { transaction });
            }
        });
    }
};
