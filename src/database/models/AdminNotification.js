'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const AdminNotification = sequelize.define('AdminNotification', {
        id: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            field: 'id'
        },
        adminId: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'admin_id'
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
        isRead: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            field: 'is_read'
        },
        readAt: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'read_at'
        },
        actionUrl: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'action_url'
        }
    }, {
        tableName: 'admin_notifications',
        timestamps: true,
        underscored: true
    });

    return AdminNotification;
};
