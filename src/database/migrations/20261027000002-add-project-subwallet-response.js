'use strict';

module.exports = {
    async up(q, S) {
        await q.sequelize.transaction(async transaction => {
            const columns = await q.describeTable('project_escrows', { transaction });
            for (const name of ['subwallet_response', 'subwallet_data']) {
                if (!columns[name]) await q.addColumn('project_escrows', name,
                    { type: S.JSONB, allowNull: true }, { transaction });
            }
        });
    },
    async down(q) {
        await q.sequelize.transaction(async transaction => {
            for (const name of ['subwallet_data', 'subwallet_response']) {
                await q.removeColumn('project_escrows', name, { transaction });
            }
        });
    }
};
