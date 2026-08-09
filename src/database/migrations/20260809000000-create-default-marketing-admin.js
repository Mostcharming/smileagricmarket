'use strict';

const bcrypt = require('bcrypt');
const { QueryTypes } = require('sequelize');

const MARKETING_ADMIN_ID = 'ca965911-5433-4c91-8729-ddf6e88bf9fc';
const MARKETING_ADMIN_EMAIL = 'marketing@smileagric.com';
const MARKETING_ADMIN_PASSWORD = 'Marketing@123';

module.exports = {
    up: async (queryInterface) => {
        const existingAdmins = await queryInterface.sequelize.query(
            'SELECT "id" FROM "admins" WHERE LOWER("email") = :email LIMIT 1',
            {
                replacements: { email: MARKETING_ADMIN_EMAIL },
                type: QueryTypes.SELECT
            }
        );

        if (existingAdmins.length > 0) {
            return;
        }

        const hashedPassword = await bcrypt.hash(MARKETING_ADMIN_PASSWORD, 10);

        await queryInterface.bulkInsert('admins', [
            {
                id: MARKETING_ADMIN_ID,
                full_name: 'Marketing Admin',
                email: MARKETING_ADMIN_EMAIL,
                password: hashedPassword,
                role: 'marketing_admin',
                is_active: true,
                last_login_at: null,
                reset_token: null,
                reset_token_expiry: null,
                created_at: new Date(),
                updated_at: new Date()
            }
        ], {});
    },

    down: async (queryInterface) => {
        await queryInterface.bulkDelete('admins', {
            id: MARKETING_ADMIN_ID
        }, {});
    }
};
