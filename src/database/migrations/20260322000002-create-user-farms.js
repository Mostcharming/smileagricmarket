'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('user_farms', {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: DataTypes.UUIDV4,
                field: 'id'
            },
            user_id: {
                type: DataTypes.UUID,
                allowNull: false,
                field: 'user_id',
                references: {
                    model: 'users',
                    key: 'id'
                },
                onDelete: 'CASCADE'
            },
            farm_category_id: {
                type: DataTypes.UUID,
                allowNull: false,
                field: 'farm_category_id',
                references: {
                    model: 'farm_categories',
                    key: 'id'
                },
                onDelete: 'RESTRICT'
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
            location: {
                type: DataTypes.STRING,
                allowNull: true,
                field: 'location'
            },
            size: {
                type: DataTypes.FLOAT,
                allowNull: true,
                field: 'size',
                comment: 'Size of the farm (in hectares or other unit)'
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

        // Create index on user_id
        await queryInterface.addIndex('user_farms', ['user_id'], {
            name: 'user_farms_user_id_idx'
        });

        // Create index on farm_category_id
        await queryInterface.addIndex('user_farms', ['farm_category_id'], {
            name: 'user_farms_farm_category_id_idx'
        });

        // Create composite index on user_id and is_active
        await queryInterface.addIndex('user_farms', ['user_id', 'is_active'], {
            name: 'user_farms_user_id_is_active_idx'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('user_farms');
    }
};
