'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('notification_templates', {
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                allowNull: false,
                primaryKey: true,
                field: 'id'
            },
            act: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
                field: 'act'
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false,
                field: 'name'
            },
            subj: {
                type: DataTypes.TEXT,
                allowNull: true,
                field: 'subj'
            },
            email_body: {
                type: DataTypes.TEXT,
                allowNull: true,
                field: 'email_body'
            },
            sms_body: {
                type: DataTypes.TEXT,
                allowNull: true,
                field: 'sms_body'
            },
            email_status: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                field: 'email_status'
            },
            sms_status: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                field: 'sms_status'
            },
            shortcodes: {
                type: DataTypes.JSON,
                allowNull: true,
                field: 'shortcodes'
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

        // Create unique index on act field
        await queryInterface.addIndex('notification_templates', ['act'], {
            unique: true,
            name: 'notification_templates_act_unique'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('notification_templates');
    }
};
