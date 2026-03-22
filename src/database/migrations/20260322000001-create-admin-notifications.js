'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('admin_notifications', {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: DataTypes.UUIDV4,
                field: 'id'
            },
            admin_id: {
                type: DataTypes.UUID,
                allowNull: false,
                field: 'admin_id',
                references: {
                    model: 'admins',
                    key: 'id'
                },
                onDelete: 'CASCADE'
            },
            title: {
                type: DataTypes.STRING,
                allowNull: false,
                field: 'title'
            },
            message: {
                type: DataTypes.TEXT,
                allowNull: false,
                field: 'message'
            },
            type: {
                type: DataTypes.ENUM('info', 'warning', 'error', 'success'),
                allowNull: false,
                defaultValue: 'info',
                field: 'type'
            },
            is_read: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                field: 'is_read'
            },
            read_at: {
                type: DataTypes.DATE,
                allowNull: true,
                field: 'read_at'
            },
            action_url: {
                type: DataTypes.STRING,
                allowNull: true,
                field: 'action_url'
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

        // Create index on admin_id
        await queryInterface.addIndex('admin_notifications', ['admin_id'], {
            name: 'admin_notifications_admin_id_idx'
        });

        // Create composite index on admin_id and is_read
        await queryInterface.addIndex('admin_notifications', ['admin_id', 'is_read'], {
            name: 'admin_notifications_admin_id_is_read_idx'
        });

        // Create index on created_at for sorting
        await queryInterface.addIndex('admin_notifications', ['created_at'], {
            name: 'admin_notifications_created_at_idx'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('admin_notifications');
    }
};
