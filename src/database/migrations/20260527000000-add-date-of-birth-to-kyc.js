'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('kyc', 'date_of_birth', {
            type: Sequelize.DATE,
            allowNull: true,
            comment: 'User\'s date of birth'
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('kyc', 'date_of_birth');
    }
};
