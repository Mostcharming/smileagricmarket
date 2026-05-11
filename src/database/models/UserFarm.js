'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const UserFarm = sequelize.define('UserFarm', {
        id: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            field: 'id'
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'user_id'
        },
        farmCategoryId: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'farm_category_id'
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'name',
            comment: 'Farm name'
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
            field: 'description',
            comment: 'Farm description'
        },
        location: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'location',
            comment: 'Farm location'
        },
        size: {
            type: DataTypes.FLOAT,
            allowNull: true,
            field: 'size',
            comment: 'Size of the farm (in hectares or other unit)'
        },
        investmentAmount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: true,
            field: 'investment_amount',
            comment: 'Initial investment amount for the farm'
        },
        currency: {
            type: DataTypes.STRING(3),
            allowNull: false,
            defaultValue: 'USD',
            field: 'currency',
            comment: 'Currency code for investment amount (e.g., USD, EUR, GBP)'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            field: 'is_active',
            comment: 'Whether the farm is active'
        },
        verificationStatus: {
            type: DataTypes.ENUM('pending', 'approved', 'rejected'),
            allowNull: false,
            defaultValue: 'pending',
            field: 'verification_status',
            comment: 'Farm verification status'
        },
        rejectionNote: {
            type: DataTypes.TEXT,
            allowNull: true,
            field: 'rejection_note',
            comment: 'Reason for farm rejection'
        }
    }, {
        tableName: 'user_farms',
        timestamps: true,
        underscored: true,
        indexes: [
            {
                fields: ['user_id']
            },
            {
                fields: ['farm_category_id']
            },
            {
                fields: ['user_id', 'is_active']
            },
            {
                fields: ['verification_status']
            }
        ]
    });

    return UserFarm;
};
