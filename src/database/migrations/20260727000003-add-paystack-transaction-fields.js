'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('investment_payments', 'gateway_transaction_id', {
            type: Sequelize.STRING(30),
            allowNull: true,
            comment: 'Paystack unsigned 64-bit transaction ID stored as text to preserve precision'
        });

        await queryInterface.addColumn('investment_payments', 'access_code', {
            type: Sequelize.STRING(100),
            allowNull: true,
            comment: 'Paystack checkout access code returned during initialization'
        });

        await queryInterface.addIndex('investment_payments', ['gateway_transaction_id'], {
            name: 'investment_payments_gateway_transaction_id_unique',
            unique: true
        });
    },

    async down(queryInterface) {
        await queryInterface.removeIndex(
            'investment_payments',
            'investment_payments_gateway_transaction_id_unique'
        );
        await queryInterface.removeColumn('investment_payments', 'access_code');
        await queryInterface.removeColumn('investment_payments', 'gateway_transaction_id');
    }
};
