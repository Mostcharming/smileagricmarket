'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('investments', 'risk_level', {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'medium',
            field: 'risk_level',
            comment: 'Investment risk level: low, medium, or high'
        });

        await queryInterface.addIndex('investments', ['risk_level'], {
            name: 'investments_risk_level_idx'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeIndex('investments', 'investments_risk_level_idx');
        await queryInterface.removeColumn('investments', 'risk_level');
    }
};
