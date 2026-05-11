'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('user_farms', 'rejection_note', {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: 'Reason for farm rejection'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('user_farms', 'rejection_note');
    }
};
