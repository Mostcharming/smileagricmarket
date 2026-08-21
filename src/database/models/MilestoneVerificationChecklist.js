'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => sequelize.define('MilestoneVerificationChecklist', {
    id: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
        field: 'id'
    },
    userFarmMilestoneId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_farm_milestone_id'
    },
    name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        field: 'name'
    },
    status: {
        type: DataTypes.ENUM('verified', 'needs_clarification', 'rejected'),
        allowNull: false,
        field: 'status'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'notes'
    },
    reviewedBy: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'reviewed_by'
    },
    reviewedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'reviewed_at'
    }
}, {
    tableName: 'milestone_verification_checklists',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['user_farm_milestone_id'] },
        { fields: ['status'] }
    ]
});
