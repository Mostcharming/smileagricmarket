'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('general_settings', {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: DataTypes.UUIDV4,
                field: 'id'
            },
            email_from: {
                type: DataTypes.STRING,
                allowNull: true,
                field: 'email_from'
            },
            sms_from: {
                type: DataTypes.STRING,
                allowNull: true,
                field: 'sms_from'
            },
            email_template: {
                type: DataTypes.TEXT,
                allowNull: true,
                field: 'email_template'
            },
            sms_body: {
                type: DataTypes.TEXT,
                allowNull: true,
                field: 'sms_body'
            },
            mail_config: {
                type: DataTypes.JSON,
                allowNull: true,
                field: 'mail_config'
            },
            sms_config: {
                type: DataTypes.JSON,
                allowNull: true,
                field: 'sms_config'
            },
            email_notification: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                field: 'email_notification'
            },
            sms_notification: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                field: 'sms_notification'
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
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('general_settings');
    }
};
