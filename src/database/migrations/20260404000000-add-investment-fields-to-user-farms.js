'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('user_farms', 'investment_amount', {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: true,
            field: 'investment_amount',
            comment: 'Initial investment amount for the farm'
        });

        await queryInterface.addColumn('user_farms', 'currency', {
            type: DataTypes.STRING(3),
            allowNull: false,
            defaultValue: 'USD',
            field: 'currency',
            comment: 'Currency code for investment amount (e.g., USD, EUR, GBP)'
        });

        // Create index on currency if needed for filtering
        await queryInterface.addIndex('user_farms', ['currency'], {
            name: 'user_farms_currency_idx'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeIndex('user_farms', 'user_farms_currency_idx');
        await queryInterface.removeColumn('user_farms', 'currency');
        await queryInterface.removeColumn('user_farms', 'investment_amount');
    }
};
