'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('farm_categories', {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: DataTypes.UUIDV4,
                field: 'id'
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
                field: 'name'
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
                field: 'description'
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

        // Create unique index on name
        await queryInterface.addIndex('farm_categories', ['name'], {
            unique: true,
            name: 'farm_categories_name_unique'
        });

        // Create index on is_active
        await queryInterface.addIndex('farm_categories', ['is_active'], {
            name: 'farm_categories_is_active_idx'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('farm_categories');
    }
};
