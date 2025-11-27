'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const NotificationTemplate = sequelize.define('NotificationTemplate', {
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
        emailBody: {
            type: DataTypes.TEXT,
            allowNull: true,
            field: 'email_body'
        },
        smsBody: {
            type: DataTypes.TEXT,
            allowNull: true,
            field: 'sms_body'
        },
        emailStatus: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            field: 'email_status'
        },
        smsStatus: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            field: 'sms_status'
        },
        shortcodes: {
            type: DataTypes.JSON,
            allowNull: true,
            field: 'shortcodes'
        }
    }, {
        tableName: 'notification_templates',
        timestamps: true,
        underscored: true,
        indexes: [
            {
                unique: true,
                fields: ['act']
            }
        ]
    });

    return NotificationTemplate;
};
