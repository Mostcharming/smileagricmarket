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
        milestoneId: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'milestone_id'
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
                fields: ['user_farm_id', 'milestone_id'],
                unique: true
            },
            {
                fields: ['is_completed']
            }
        ]
    });

    return UserFarmMilestone;
};
