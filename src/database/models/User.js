'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const User = sequelize.define('User', {
        id: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            field: 'id'
        },
        fullName: {
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
        phoneNumber: {
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
        otp: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'otp'
        },
        otpExpiry: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'otp_expiry'
        },
        isPhoneVerified: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            field: 'is_phone_verified'
        },
        password: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'password'
        },
        resetToken: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'reset_token'
        },
        resetTokenExpiry: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'reset_token_expiry'
        },
        bio: {
            type: DataTypes.TEXT,
            allowNull: true,
            field: 'bio',
            comment: 'User biography or profile description'
        },
        profileImagePath: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'profile_image_path',
            comment: 'Path to uploaded profile image'
        },
        profileImageUrl: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'profile_image_url',
            comment: 'URL to access the profile image'
        }
    }, {
        tableName: 'users',
        timestamps: true,
        underscored: true
    });

    return User;
};
