'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const KYC = sequelize.define('KYC', {
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
            field: 'user_id',
            references: {
                model: 'users',
                key: 'id'
            },
            onDelete: 'CASCADE'
        },
        identificationType: {
            type: DataTypes.ENUM(
                'national_id',
                'passport',
                'driver_license',
                'tin',
                'voter_card',
                'nin_slip',
                'residential_permit'
            ),
            allowNull: false,
            field: 'identification_type',
            comment: 'Type of identification used for KYC'
        },
        identificationNumber: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'identification_number',
            comment: 'Identification number/ID number'
        },
        idDocumentPath: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'id_document_path',
            comment: 'Path to uploaded ID document image'
        },
        idDocumentUrl: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'id_document_url',
            comment: 'URL to access the ID document image'
        },
        selfieImagePath: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'selfie_image_path',
            comment: 'Path to uploaded selfie image'
        },
        selfieImageUrl: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'selfie_image_url',
            comment: 'URL to access the selfie image'
        },
        status: {
            type: DataTypes.ENUM('pending', 'approved', 'rejected'),
            allowNull: false,
            defaultValue: 'pending',
            field: 'status',
            comment: 'KYC verification status'
        },
        rejectionReason: {
            type: DataTypes.TEXT,
            allowNull: true,
            field: 'rejection_reason',
            comment: 'Reason for KYC rejection if applicable'
        },
        verifiedBy: {
            type: DataTypes.UUID,
            allowNull: true,
            field: 'verified_by',
            comment: 'Admin user ID who verified the KYC'
        },
        verifiedAt: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'verified_at',
            comment: 'Timestamp when KYC was verified'
        },
        submittedAt: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'submitted_at',
            comment: 'Timestamp when KYC was submitted'
        }
    }, {
        tableName: 'kyc',
        timestamps: true,
        underscored: true,
        indexes: [
            {
                fields: ['user_id']
            },
            {
                fields: ['status']
            },
            {
                fields: ['identification_number']
            }
        ]
    });

    return KYC;
};
