'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('admins', {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: DataTypes.UUIDV4,
                field: 'id'
            },
            full_name: {
                type: DataTypes.STRING,
                allowNull: false,
                field: 'full_name'
            },
            email: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
                field: 'email'
            },
            password: {
                type: DataTypes.STRING,
                allowNull: false,
                field: 'password'
            },
            role: {
                type: DataTypes.ENUM('super_admin', 'admin', 'moderator'),
                allowNull: false,
                defaultValue: 'admin',
                field: 'role'
            },
            is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
                field: 'is_active'
            },
            last_login_at: {
                type: DataTypes.DATE,
                allowNull: true,
                field: 'last_login_at'
            },
            reset_token: {
                type: DataTypes.STRING,
                allowNull: true,
                field: 'reset_token'
            },
            reset_token_expiry: {
                type: DataTypes.DATE,
                allowNull: true,
                field: 'reset_token_expiry'
            },
            created_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
                field: 'created_at'
            },
            updated_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
                field: 'updated_at'
            }
        });

        // Create unique index on email
        await queryInterface.addIndex('admins', ['email'], {
            unique: true,
            name: 'admins_email_unique'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('admins');
    }
};
