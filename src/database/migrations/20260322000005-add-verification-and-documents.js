'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Add verification_status to user_farms table
        await queryInterface.addColumn('user_farms', 'verification_status', {
            type: DataTypes.ENUM('pending', 'approved', 'rejected'),
            allowNull: false,
            defaultValue: 'pending',
            field: 'verification_status',
            comment: 'Farm verification status'
        });

        // Create farm_documents table
        await queryInterface.createTable('farm_documents', {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: DataTypes.UUIDV4,
                field: 'id'
            },
            user_farm_id: {
                type: DataTypes.UUID,
                allowNull: false,
                field: 'user_farm_id',
                references: {
                    model: 'user_farms',
                    key: 'id'
                },
                onDelete: 'CASCADE'
            },
            document_type: {
                type: DataTypes.ENUM('picture', 'document'),
                allowNull: false,
                field: 'document_type',
                comment: 'Type of document: picture or document'
            },
            file_name: {
                type: DataTypes.STRING,
                allowNull: false,
                field: 'file_name',
                comment: 'Original file name'
            },
            file_url: {
                type: DataTypes.STRING,
                allowNull: false,
                field: 'file_url',
                comment: 'URL to the uploaded file'
            },
            file_size: {
                type: DataTypes.INTEGER,
                allowNull: true,
                field: 'file_size',
                comment: 'File size in bytes'
            },
            mime_type: {
                type: DataTypes.STRING,
                allowNull: true,
                field: 'mime_type',
                comment: 'MIME type of the file'
            },
            created_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
                field: 'created_at'
            },
            updated_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
                field: 'updated_at'
            }
        });

        // Create indexes on farm_documents
        await queryInterface.addIndex('farm_documents', ['user_farm_id'], {
            name: 'farm_documents_user_farm_id_idx'
        });

        await queryInterface.addIndex('farm_documents', ['document_type'], {
            name: 'farm_documents_document_type_idx'
        });

        // Add index on verification_status
        await queryInterface.addIndex('user_farms', ['verification_status'], {
            name: 'user_farms_verification_status_idx'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('farm_documents');
        await queryInterface.removeColumn('user_farms', 'verification_status');
    }
};
