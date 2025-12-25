'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.changeColumn('temp_otps', 'otp_expiry', {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'otp_expiry'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.changeColumn('temp_otps', 'otp_expiry', {
            type: DataTypes.DATE,
            allowNull: false,
            field: 'otp_expiry'
        });
    }
};
