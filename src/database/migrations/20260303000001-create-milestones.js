'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('milestones', {
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
                onDelete: 'CASCADE'
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false,
                field: 'name'
            },
            order: {
                type: DataTypes.INTEGER,
                allowNull: true,
                field: 'order'
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

        // Create index on farm_category_id
        await queryInterface.addIndex('milestones', ['farm_category_id'], {
            name: 'milestones_farm_category_id_idx'
        });

        // Create composite index on farm_category_id and order
        await queryInterface.addIndex('milestones', ['farm_category_id', 'order'], {
            name: 'milestones_farm_category_id_order_idx'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('milestones');
    }
};
