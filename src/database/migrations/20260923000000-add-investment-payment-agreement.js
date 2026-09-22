'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('investment_payments', 'agreement', {
            type: Sequelize.JSONB,
            allowNull: true,
            comment: 'Immutable mobile investment terms and acknowledgements captured before checkout'
        });
    },
    async down(queryInterface) {
        await queryInterface.removeColumn('investment_payments', 'agreement');
    }
};
