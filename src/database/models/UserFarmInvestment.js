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
        farmCategoryId: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'farm_category_id',
            references: {
                model: 'farm_categories',
                key: 'id'
            },
            onDelete: 'RESTRICT',
            comment: 'Farm category selected for this investment project'
        },
        investmentId: {
            type: DataTypes.UUID,
            allowNull: true,
            field: 'investment_id',
            references: {
                model: 'investments',
                key: 'id'
            },
            onDelete: 'RESTRICT',
            comment: 'Admin template resolved from the selected farm category'
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
        startDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            field: 'start_date',
            comment: 'Date this investment project was created'
        },
        endDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            field: 'end_date',
            comment: 'Start date plus the selected investment template duration'
        },
        investmentStatus: {
            type: DataTypes.ENUM('not_started', 'funding_started', 'active', 'completed'),
            allowNull: false,
            defaultValue: 'not_started',
            field: 'investment_status',
            comment: 'Current lifecycle status of this investment project'
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
                fields: ['user_farm_id'],
                name: 'user_farm_investments_user_farm_id_idx'
            },
            {
                fields: ['farm_category_id']
            },
            {
                fields: ['investment_id']
            },
            {
                fields: ['investment_status']
            },
            {
                fields: ['start_date']
            },
            {
                fields: ['end_date']
            },
            {
                fields: ['user_farm_id', 'is_active']
            }
        ]
    });

    return UserFarmInvestment;
};
