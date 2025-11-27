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
        }
    }, {
        tableName: 'users',
        timestamps: true,
        underscored: true
    });

    return User;
};
