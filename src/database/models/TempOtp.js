'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const TempOtp = sequelize.define('TempOtp', {
        id: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            field: 'id'
        },
        phoneNumber: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'phone_number'
        },
        otp: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'otp'
        },
        otpExpiry: {
            type: DataTypes.DATE,
            allowNull: false,
            field: 'otp_expiry'
        }
    }, {
        tableName: 'temp_otps',
        timestamps: true,
        underscored: true
    });

    return TempOtp;
};
