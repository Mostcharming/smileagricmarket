'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Admin = sequelize.define('Admin', {
        id: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            field: 'id'
        },
        fullName: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'full_name'
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            field: 'email'
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'password'
        },
        role: {
            type: DataTypes.ENUM('super_admin', 'admin', 'moderator'),
            allowNull: false,
            defaultValue: 'admin',
            field: 'role',
            comment: 'Admin role/permission level'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            field: 'is_active',
            comment: 'Whether the admin account is active'
        },
        lastLoginAt: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'last_login_at'
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
        }
    }, {
        tableName: 'admins',
        timestamps: true,
        underscored: true
    });

    return Admin;
};
