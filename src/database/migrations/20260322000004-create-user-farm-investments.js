'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('user_farm_investments', {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: DataTypes.UUIDV4,
                field: 'id'
            },
            user_farm_id: {
                type: DataTypes.UUID,
                allowNull: false,
                field: 'user_farm_id',
                references: {
                    model: 'user_farms',
                    key: 'id'
                },
                onDelete: 'CASCADE'
            },
            expected_investment: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: true,
                field: 'expected_investment',
                comment: 'Expected investment amount'
            },
            investment_received: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0.00,
                field: 'investment_received',
                comment: 'Total investment received so far'
            },
            investment_pending: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0.00,
                field: 'investment_pending',
                comment: 'Pending investment amount'
            },
            currency: {
                type: DataTypes.STRING(3),
                allowNull: false,
                defaultValue: 'USD',
                field: 'currency',
                comment: 'Currency code (e.g., USD, EUR, NGN)'
            },
            investment_status: {
                type: DataTypes.ENUM('pending', 'partial', 'completed', 'cancelled'),
                allowNull: false,
                defaultValue: 'pending',
                field: 'investment_status',
                comment: 'Current status of investment'
            },
            notes: {
                type: DataTypes.TEXT,
                allowNull: true,
                field: 'notes',
                comment: 'Additional notes about the investment'
            },
            is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
                field: 'is_active'
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

        // Create index on user_farm_id
        await queryInterface.addIndex('user_farm_investments', ['user_farm_id'], {
            name: 'user_farm_investments_user_farm_id_idx'
        });

        // Create index on investment_status
        await queryInterface.addIndex('user_farm_investments', ['investment_status'], {
            name: 'user_farm_investments_investment_status_idx'
        });

        // Create composite index on user_farm_id and is_active
        await queryInterface.addIndex('user_farm_investments', ['user_farm_id', 'is_active'], {
            name: 'user_farm_investments_user_farm_id_is_active_idx'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('user_farm_investments');
    }
};
