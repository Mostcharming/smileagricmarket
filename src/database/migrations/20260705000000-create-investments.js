'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('investments', {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: DataTypes.UUIDV4,
                field: 'id'
            },
            farm_category_id: {
                type: DataTypes.UUID,
                allowNull: false,
                field: 'farm_category_id',
                references: {
                    model: 'farm_categories',
                    key: 'id'
                },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE'
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false,
                field: 'name'
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
                field: 'description'
            },
            roi_percentage: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: false,
                field: 'roi_percentage',
                comment: 'Expected return on investment percentage'
            },
            duration_value: {
                type: DataTypes.INTEGER,
                allowNull: false,
                field: 'duration_value',
                comment: 'Investment duration number'
            },
            duration_unit: {
                type: DataTypes.STRING(10),
                allowNull: false,
                field: 'duration_unit',
                comment: 'Investment duration unit: weeks, months, or years'
            },
            funding_min_goal: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
                field: 'funding_min_goal',
                comment: 'Minimum total funding goal'
            },
            funding_max_goal: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
                field: 'funding_max_goal',
                comment: 'Maximum total funding goal'
            },
            investment_min_goal: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
                field: 'investment_min_goal',
                comment: 'Minimum amount an investor can invest'
            },
            investment_max_goal: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
                field: 'investment_max_goal',
                comment: 'Maximum amount an investor can invest'
            },
            currency: {
                type: DataTypes.STRING(3),
                allowNull: false,
                defaultValue: 'NGN',
                field: 'currency'
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

        await queryInterface.addIndex('investments', ['farm_category_id'], {
            name: 'investments_farm_category_id_idx'
        });

        await queryInterface.addIndex('investments', ['is_active'], {
            name: 'investments_is_active_idx'
        });

        await queryInterface.addIndex('investments', ['name'], {
            name: 'investments_name_idx'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('investments');
    }
};
