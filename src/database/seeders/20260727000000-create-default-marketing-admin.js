'use strict';

const bcrypt = require('bcrypt');
const { randomUUID } = require('node:crypto');

function marketingAdminEmail() {
    return (process.env.MARKETING_ADMIN_EMAIL || 'marketing@smileagric.com')
        .trim()
        .toLowerCase();
}

module.exports = {
    up: async (queryInterface) => {
        const password = process.env.MARKETING_ADMIN_PASSWORD || 'Marketing@123';
        const hashedPassword = await bcrypt.hash(password, 10);

        await queryInterface.bulkInsert('admins', [
            {
                id: randomUUID(),
                full_name: process.env.MARKETING_ADMIN_FULL_NAME || 'Marketing Admin',
                email: marketingAdminEmail(),
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
            email: marketingAdminEmail(),
            role: 'marketing_admin'
        }, {});
    }
};
