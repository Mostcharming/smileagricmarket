'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('users', {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: DataTypes.UUIDV4,
                field: 'id'
            },
            full_name: {
                type: DataTypes.STRING,
                allowNull: true,
                field: 'full_name'
            },
            email: {
                type: DataTypes.STRING,
                allowNull: true,
                unique: true,
                field: 'email'
            },
            phone_number: {
                type: DataTypes.STRING,
                allowNull: true,
                unique: true,
                field: 'phone_number'
            },
            gender: {
                type: DataTypes.ENUM('male', 'female', 'other'),
                allowNull: true,
                field: 'gender'
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
        await queryInterface.addIndex('users', ['email'], {
            unique: true,
            name: 'users_email_unique'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('users');
    }
};
