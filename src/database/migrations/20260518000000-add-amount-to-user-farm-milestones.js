'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('user_farm_milestones', 'amount', {
            type: Sequelize.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0.00,
            comment: 'Amount allocated to this milestone'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('user_farm_milestones', 'amount');
    }
};