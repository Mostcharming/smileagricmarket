'use strict';

module.exports = {
    async up(q) {
        await q.sequelize.transaction(async transaction => {
            // Keep the audit and constraint installation consistent while blocking concurrent writes.
            await q.sequelize.query('LOCK TABLE farm_categories IN SHARE ROW EXCLUSIVE MODE', { transaction });
            const [duplicates] = await q.sequelize.query(`
                SELECT lower(btrim(name)) AS name, array_agg(id ORDER BY id) AS ids
                FROM farm_categories GROUP BY lower(btrim(name)) HAVING count(*) > 1`, { transaction });
            if (duplicates.length) {
                throw new Error('Duplicate farm category names must be resolved before applying this migration: '
                    + JSON.stringify(duplicates));
            }
            await q.sequelize.query(`CREATE UNIQUE INDEX farm_categories_normalized_name_unique
                ON farm_categories (lower(btrim(name)))`, { transaction });
        });
    },
    async down(q) {
        await q.removeIndex('farm_categories', 'farm_categories_normalized_name_unique');
    }
};
