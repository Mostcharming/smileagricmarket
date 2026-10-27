'use strict';

const definitions = require('../paymentTables');
const snake = value => value.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

module.exports = {
    async up(q, S) {
        await q.sequelize.transaction(async transaction => {
            const existing = await q.showAllTables({ transaction });
            for (const name of ['PaymentWebhook', 'PaymentWebhookRateLimit']) {
                const definition = definitions(S)[name];
                if (existing.includes(definition.table)) continue;
                await q.createTable(definition.table, {
                    ...Object.fromEntries(Object.entries(definition.fields).map(([field, options]) => [snake(field), options])),
                    created_at: { type: S.DATE, allowNull: false }, updated_at: { type: S.DATE, allowNull: false }
                }, { transaction });
                for (const index of definition.indexes) await q.addIndex(definition.table, index.fields, { ...index, transaction });
            }
        });
    },
    async down(q) {
        await q.sequelize.transaction(async transaction => {
            await q.dropTable('payment_webhook_rate_limits', { transaction });
            await q.dropTable('payment_webhooks', { transaction });
        });
    }
};
