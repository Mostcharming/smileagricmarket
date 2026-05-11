'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('notification_logs', {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: DataTypes.UUIDV4,
                field: 'id'
            },
            user_id: {
                type: DataTypes.UUID,
                allowNull: false,
                field: 'user_id'
            },
            user_type: {
                type: DataTypes.STRING,
                allowNull: false,
                field: 'user_type'
            },
            sent_to: {
                type: DataTypes.STRING,
                allowNull: false,
                field: 'sent_to'
            },
            subject: {
                type: DataTypes.STRING,
                allowNull: true,
                field: 'subject'
            },
            message: {
                type: DataTypes.TEXT,
                allowNull: true,
                field: 'message'
            },
            notification_type: {
                type: DataTypes.STRING,
                allowNull: false,
                field: 'notification_type'
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
        await queryInterface.dropTable('notification_logs');
    }
};
