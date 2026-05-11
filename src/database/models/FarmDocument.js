'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const FarmDocument = sequelize.define('FarmDocument', {
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
        documentType: {
            type: DataTypes.ENUM('picture', 'document'),
            allowNull: false,
            field: 'document_type',
            comment: 'Type of document: picture or document'
        },
        fileName: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'file_name',
            comment: 'Original file name'
        },
        fileUrl: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'file_url',
            comment: 'URL to the uploaded file'
        },
        fileSize: {
            type: DataTypes.INTEGER,
            allowNull: true,
            field: 'file_size',
            comment: 'File size in bytes'
        },
        mimeType: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'mime_type',
            comment: 'MIME type of the file'
        }
    }, {
        tableName: 'farm_documents',
        timestamps: true,
        underscored: true,
        indexes: [
            {
                fields: ['user_farm_id']
            },
            {
                fields: ['document_type']
            }
        ]
    });

    return FarmDocument;
};
