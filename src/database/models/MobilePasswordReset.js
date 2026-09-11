'use strict';

const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('MobilePasswordReset', {
    userId: { type: DataTypes.UUID, primaryKey: true, allowNull: false, field: 'user_id' },
    otpHash: { type: DataTypes.STRING, allowNull: true, field: 'otp_hash' },
    otpExpiresAt: { type: DataTypes.DATE, allowNull: true, field: 'otp_expires_at' },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastSentAt: { type: DataTypes.DATE, allowNull: false, field: 'last_sent_at' },
    tokenHash: { type: DataTypes.STRING, allowNull: true, unique: true, field: 'token_hash' },
    tokenExpiresAt: { type: DataTypes.DATE, allowNull: true, field: 'token_expires_at' }
}, { tableName: 'mobile_password_resets', timestamps: true, underscored: true });
