'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const MilestoneFundingEvidence = sequelize.define('MilestoneFundingEvidence', {
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
            field: 'user_farm_milestone_id',
            references: {
                model: 'user_farm_milestones',
                key: 'id'
            },
            onDelete: 'CASCADE',
            comment: 'Funding request milestone to which this prior-milestone evidence belongs'
        },
        evidenceType: {
            type: DataTypes.ENUM('photo', 'file'),
            allowNull: false,
            field: 'evidence_type'
        },
        fileName: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'file_name'
        },
        fileUrl: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'file_url'
        },
        fileSize: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'file_size'
        },
        mimeType: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'mime_type'
        }
    }, {
        tableName: 'milestone_funding_evidence',
        timestamps: true,
        underscored: true,
        indexes: [
            {
                fields: ['user_farm_milestone_id']
            },
            {
                fields: ['evidence_type']
            }
        ]
    });

    return MilestoneFundingEvidence;
};
