'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Investment = sequelize.define('Investment', {
        id: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            field: 'id'
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
            comment: 'Reference to farm category'
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'name',
            comment: 'Investment name'
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
            field: 'description',
            comment: 'Investment description'
        },
        roiPercentage: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            field: 'roi_percentage',
            comment: 'Expected return on investment percentage'
        },
        durationValue: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'duration_value',
            comment: 'Investment duration number'
        },
        durationUnit: {
            type: DataTypes.STRING(10),
            allowNull: false,
            field: 'duration_unit',
            validate: {
                isIn: [['weeks', 'months', 'years']]
            },
            comment: 'Investment duration unit'
        },
        fundingMinGoal: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            field: 'funding_min_goal',
            comment: 'Minimum total funding goal'
        },
        fundingMaxGoal: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            field: 'funding_max_goal',
            comment: 'Maximum total funding goal'
        },
        investmentMinGoal: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            field: 'investment_min_goal',
            comment: 'Minimum amount an investor can invest'
        },
        investmentMaxGoal: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            field: 'investment_max_goal',
            comment: 'Maximum amount an investor can invest'
        },
        currency: {
            type: DataTypes.STRING(3),
            allowNull: false,
            defaultValue: 'NGN',
            field: 'currency',
            comment: 'Currency code for money fields'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            field: 'is_active',
            comment: 'Whether the investment is active'
        }
    }, {
        tableName: 'investments',
        timestamps: true,
        underscored: true,
        indexes: [
            {
                fields: ['farm_category_id']
            },
            {
                fields: ['is_active']
            },
            {
                fields: ['name']
            }
        ]
    });

    return Investment;
};
