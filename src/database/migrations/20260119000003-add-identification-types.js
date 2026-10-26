'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.query(
            `ALTER TYPE "enum_kyc_identification_type" ADD VALUE 'nin_slip'`
        ).catch(() => {
        });

        await queryInterface.sequelize.query(
            `ALTER TYPE "enum_kyc_identification_type" ADD VALUE 'residential_permit'`
        ).catch(() => {
        });
    },

    async down(queryInterface, Sequelize) {
        console.warn('Rollback of enum values is not supported in PostgreSQL');
    }
};
