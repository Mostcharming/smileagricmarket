'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const UserFarmInvestment = sequelize.define('UserFarmInvestment', {
        id: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            field: 'id'
        },
        userFarmId: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'user_farm_id',
            comment: 'Reference to user farm'
        },
        expectedInvestment: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: true,
            field: 'expected_investment',
            comment: 'Expected investment amount'
        },
        investmentReceived: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0.00,
            field: 'investment_received',
            comment: 'Total investment received so far'
        },
        investmentPending: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0.00,
            field: 'investment_pending',
            comment: 'Pending investment amount'
        },
        currency: {
            type: DataTypes.STRING(3),
            allowNull: false,
            defaultValue: 'USD',
            field: 'currency',
            comment: 'Currency code (e.g., USD, EUR, NGN)'
        },
        investmentStatus: {
            type: DataTypes.ENUM('pending', 'partial', 'completed', 'cancelled'),
            allowNull: false,
            defaultValue: 'pending',
            field: 'investment_status',
            comment: 'Current status of investment'
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true,
            field: 'notes',
            comment: 'Additional notes about the investment'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            field: 'is_active',
            comment: 'Whether the investment record is active'
        }
    }, {
        tableName: 'user_farm_investments',
        timestamps: true,
        underscored: true,
        indexes: [
            {
                fields: ['user_farm_id']
            },
            {
                fields: ['investment_status']
            },
            {
                fields: ['user_farm_id', 'is_active']
            }
        ]
    });

    return UserFarmInvestment;
};
