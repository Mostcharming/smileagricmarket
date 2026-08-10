'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const UserFarmMilestone = sequelize.define('UserFarmMilestone', {
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
            field: 'user_farm_id'
        },
        userFarmInvestmentId: {
            type: DataTypes.UUID,
            allowNull: true,
            field: 'user_farm_investment_id',
            references: {
                model: 'user_farm_investments',
                key: 'id'
            },
            onDelete: 'CASCADE',
            comment: 'Investment project that owns this template milestone'
        },
        milestoneId: {
            type: DataTypes.UUID,
            allowNull: true,
            field: 'milestone_id'
        },
        investmentMilestoneId: {
            type: DataTypes.UUID,
            allowNull: true,
            field: 'investment_milestone_id',
            references: {
                model: 'investment_milestones',
                key: 'id'
            },
            onDelete: 'RESTRICT',
            comment: 'Investment-template milestone forked into this project'
        },
        name: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'name',
            comment: 'Snapshot of the template milestone name'
        },
        fundReleasePercentage: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: true,
            field: 'fund_release_percentage',
            validate: {
                min: 0,
                max: 100
            },
            comment: 'Snapshot of the template milestone funding percentage'
        },
        order: {
            type: DataTypes.INTEGER,
            allowNull: true,
            field: 'order',
            comment: 'Snapshot of the template milestone order'
        },
        fundingStatus: {
            type: DataTypes.ENUM(
                'request_for_funding',
                'processing_funding',
                'completed'
            ),
            allowNull: false,
            defaultValue: 'request_for_funding',
            field: 'funding_status',
            comment: 'Funding workflow status for this project milestone'
        },
        isCompleted: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            field: 'is_completed',
            comment: 'Whether the milestone is completed for this farm'
        },
        completedAt: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'completed_at',
            comment: 'Date when the milestone was completed'
        },
        amount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0.00,
            field: 'amount',
            comment: 'Amount allocated to this milestone'
        }
    }, {
        tableName: 'user_farm_milestones',
        timestamps: true,
        underscored: true,
        indexes: [
            {
                fields: ['user_farm_id']
            },
            {
                fields: ['milestone_id']
            },
            {
                fields: ['investment_milestone_id']
            },
            {
                fields: ['user_farm_investment_id']
            },
            {
                fields: ['user_farm_id', 'milestone_id'],
                unique: true
            },
            {
                fields: ['user_farm_investment_id', 'investment_milestone_id'],
                unique: true
            },
            {
                fields: ['is_completed']
            },
            {
                fields: ['funding_status']
            }
        ],
        validate: {
            exactlyOneMilestoneSource() {
                const hasLegacyMilestone = !!this.milestoneId;
                const hasInvestmentMilestone = !!this.investmentMilestoneId;

                if (hasLegacyMilestone === hasInvestmentMilestone) {
                    throw new Error('Exactly one milestone source is required');
                }

                if (hasInvestmentMilestone !== !!this.userFarmInvestmentId) {
                    throw new Error('Investment-template milestones must belong to an investment project');
                }

                if (
                    hasInvestmentMilestone
                    && (!this.name || this.fundReleasePercentage === null
                        || this.fundReleasePercentage === undefined)
                ) {
                    throw new Error('Project milestones require a name and funding percentage snapshot');
                }

                if ((this.fundingStatus === 'completed') !== !!this.isCompleted) {
                    throw new Error('Completed milestone status must match isCompleted');
                }
            }
        }
    });

    return UserFarmMilestone;
};
