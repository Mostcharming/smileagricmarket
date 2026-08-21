'use strict';

const { DataTypes } = require('sequelize');

const REVIEW_STATUSES = [
    'pending',
    'approved',
    'rejected',
    'more_evidence_required'
];

module.exports = (sequelize) => sequelize.define('MilestoneReviewAudit', {
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
    adminId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'admin_id'
    },
    action: {
        type: DataTypes.ENUM(
            'approve',
            'reject',
            'request_more_evidence',
            'evidence_resubmitted',
            'checklist_updated'
        ),
        allowNull: false,
        field: 'action'
    },
    fromReviewStatus: {
        type: DataTypes.ENUM(...REVIEW_STATUSES),
        allowNull: false,
        field: 'from_review_status'
    },
    toReviewStatus: {
        type: DataTypes.ENUM(...REVIEW_STATUSES),
        allowNull: false,
        field: 'to_review_status'
    },
    internalNotes: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'internal_notes'
    },
    checklistSnapshot: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        field: 'checklist_snapshot'
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'created_at'
    }
}, {
    tableName: 'milestone_review_audits',
    timestamps: false,
    underscored: true,
    indexes: [
        { fields: ['user_farm_milestone_id'] },
        { fields: ['admin_id'] },
        { fields: ['created_at'] }
    ]
});
