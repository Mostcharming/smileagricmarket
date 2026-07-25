'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('beta_signups', {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: DataTypes.UUIDV4,
                field: 'id'
            },
            email: {
                type: DataTypes.STRING(254),
                allowNull: false,
                field: 'email'
            },
            first_name: {
                type: DataTypes.STRING(100),
                allowNull: true,
                field: 'first_name'
            },
            source: {
                type: DataTypes.STRING(50),
                allowNull: false,
                defaultValue: 'landing_page',
                field: 'source'
            },
            confirmation_email_sent_at: {
                type: DataTypes.DATE,
                allowNull: true,
                field: 'confirmation_email_sent_at'
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

        await queryInterface.addIndex('beta_signups', ['email'], {
            name: 'beta_signups_email_unique_idx',
            unique: true
        });

        await queryInterface.addIndex('beta_signups', ['created_at'], {
            name: 'beta_signups_created_at_idx'
        });
    },

    down: async (queryInterface) => {
        await queryInterface.dropTable('beta_signups');
    }
};
