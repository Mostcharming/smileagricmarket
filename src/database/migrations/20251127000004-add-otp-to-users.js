'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('users', 'otp', {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'otp'
        });

        await queryInterface.addColumn('users', 'otp_expiry', {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'otp_expiry'
        });

        await queryInterface.addColumn('users', 'is_phone_verified', {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            field: 'is_phone_verified'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('users', 'otp');
        await queryInterface.removeColumn('users', 'otp_expiry');
        await queryInterface.removeColumn('users', 'is_phone_verified');
    }
};
