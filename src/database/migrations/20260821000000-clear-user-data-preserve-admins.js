'use strict';

// Delete dependants before their parent records so this migration remains safe
// even where a foreign key uses RESTRICT rather than CASCADE.
const USER_DATA_TABLES_IN_DELETE_ORDER = [
    'milestone_funding_evidence',
    'investment_payments',
    'user_farm_milestones',
    'farm_documents',
    'user_farm_investments',
    'user_farms',
    'wallets',
    'kyc',
    'user_notifications',
    'notification_logs',
    'temp_otps',
    'beta_signups',
    'admin_notifications',
    'users'
];

module.exports = {
    async up(queryInterface) {
        await queryInterface.sequelize.transaction(async transaction => {
            for (const tableName of USER_DATA_TABLES_IN_DELETE_ORDER) {
                await queryInterface.bulkDelete(tableName, null, { transaction });
            }
        });
    },

    async down() {
        throw new Error(
            'This migration permanently deletes user data and cannot be reversed.'
        );
    }
};
