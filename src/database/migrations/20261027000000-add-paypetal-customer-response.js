'use strict';

module.exports = {
    async up(q, S) {
        await q.sequelize.transaction(async transaction => {
            // The original payment migration shares the current table definitions.
            const columns = await q.describeTable('payment_profiles', { transaction });
            for (const [name, type] of Object.entries({
                customer_response: S.JSONB, customer_data: S.JSONB, customer_last_error: S.STRING
            })) {
                if (!columns[name]) await q.addColumn('payment_profiles', name,
                    { type, allowNull: true }, { transaction });
            }
        });
    },
    async down(q) {
        await q.sequelize.transaction(async transaction => {
            for (const name of ['customer_last_error', 'customer_data', 'customer_response']) {
                await q.removeColumn('payment_profiles', name, { transaction });
            }
        });
    }
};
