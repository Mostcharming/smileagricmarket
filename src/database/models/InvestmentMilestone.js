'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const InvestmentMilestone = sequelize.define('InvestmentMilestone', {
        id: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            field: 'id'
        },
        investmentId: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'investment_id',
            references: {
                model: 'investments',
                key: 'id'
            },
            onDelete: 'CASCADE',
            comment: 'Reference to investment'
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'name',
            comment: 'Milestone name'
        },
        fundReleasePercentage: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
            field: 'fund_release_percentage',
            comment: 'Percentage of funds released at this milestone'
        },
        order: {
            type: DataTypes.INTEGER,
            allowNull: true,
            field: 'order',
            comment: 'Order/sequence of the milestone'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            field: 'is_active',
            comment: 'Whether the milestone is active'
        }
    }, {
        tableName: 'investment_milestones',
        timestamps: true,
        underscored: true,
        indexes: [
            {
                fields: ['investment_id']
            },
            {
                fields: ['investment_id', 'order']
            }
        ]
    });

    return InvestmentMilestone;
};
