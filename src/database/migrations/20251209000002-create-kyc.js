'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('kyc', {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: Sequelize.UUIDV4
            },
            user_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id'
                },
                onDelete: 'CASCADE'
            },
            identification_type: {
                type: Sequelize.ENUM(
                    'national_id',
                    'passport',
                    'driver_license',
                    'tin',
                    'voter_card'
                ),
                allowNull: false,
                comment: 'Type of identification used for KYC'
            },
            identification_number: {
                type: Sequelize.STRING,
                allowNull: false,
                comment: 'Identification number/ID number'
            },
            id_document_path: {
                type: Sequelize.STRING,
                allowNull: true,
                comment: 'Path to uploaded ID document image'
            },
            id_document_url: {
                type: Sequelize.STRING,
                allowNull: true,
                comment: 'URL to access the ID document image'
            },
            selfie_image_path: {
                type: Sequelize.STRING,
                allowNull: true,
                comment: 'Path to uploaded selfie image'
            },
            selfie_image_url: {
                type: Sequelize.STRING,
                allowNull: true,
                comment: 'URL to access the selfie image'
            },
            status: {
                type: Sequelize.ENUM('pending', 'approved', 'rejected'),
                allowNull: false,
                defaultValue: 'pending',
                comment: 'KYC verification status'
            },
            rejection_reason: {
                type: Sequelize.TEXT,
                allowNull: true,
                comment: 'Reason for KYC rejection if applicable'
            },
            verified_by: {
                type: Sequelize.UUID,
                allowNull: true,
                comment: 'Admin user ID who verified the KYC'
            },
            verified_at: {
                type: Sequelize.DATE,
                allowNull: true,
                comment: 'Timestamp when KYC was verified'
            },
            submitted_at: {
                type: Sequelize.DATE,
                allowNull: true,
                comment: 'Timestamp when KYC was submitted'
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW
            }
        });

        // Create indexes
        await queryInterface.addIndex('kyc', ['user_id']);
        await queryInterface.addIndex('kyc', ['status']);
        await queryInterface.addIndex('kyc', ['identification_number']);
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('kyc');
    }
};
