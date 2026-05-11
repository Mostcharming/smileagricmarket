'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('users', 'reset_token', {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'reset_token'
        });

        await queryInterface.addColumn('users', 'reset_token_expiry', {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'reset_token_expiry'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('users', 'reset_token');
        await queryInterface.removeColumn('users', 'reset_token_expiry');
    }
};
