'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('temp_otps', {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: DataTypes.UUIDV4,
                field: 'id'
            },
            phone_number: {
                type: DataTypes.STRING,
                allowNull: false,
                field: 'phone_number'
            },
            otp: {
                type: DataTypes.STRING,
                allowNull: false,
                field: 'otp'
            },
            otp_expiry: {
                type: DataTypes.DATE,
                allowNull: false,
                field: 'otp_expiry'
            },
            created_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
                field: 'created_at'
            },
            updated_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
                field: 'updated_at'
            }
        });

        // Create index on phone_number for faster lookups
        await queryInterface.addIndex('temp_otps', ['phone_number']);
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('temp_otps');
    }
};
