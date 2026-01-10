'use strict';

const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const hashedPassword = await bcrypt.hash('Admin@123', 10);

        await queryInterface.bulkInsert('admins', [
            {
                id: uuidv4(),
                full_name: 'Super Admin',
                email: 'admin@smileagric.com',
                password: hashedPassword,
                role: 'super_admin',
                is_active: true,
                last_login_at: null,
                reset_token: null,
                reset_token_expiry: null,
                created_at: new Date(),
                updated_at: new Date()
            }
        ], {});
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.bulkDelete('admins', {
            email: 'admin@smileagric.com'
        }, {});
    }
};
