'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        // Get the enum type for identification_type
        await queryInterface.sequelize.query(
            `ALTER TYPE "enum_kyc_identification_type" ADD VALUE 'nin_slip'`
        ).catch(() => {
            // If it fails, it might already exist
        });

        await queryInterface.sequelize.query(
            `ALTER TYPE "enum_kyc_identification_type" ADD VALUE 'residential_permit'`
        ).catch(() => {
            // If it fails, it might already exist
        });
    },

    async down(queryInterface, Sequelize) {
        // Note: PostgreSQL doesn't allow removing enum values directly
        // This is a limitation of PostgreSQL enums
        // If you need to rollback, you would need to recreate the enum type
        console.warn('Rollback of enum values is not supported in PostgreSQL');
    }
};
