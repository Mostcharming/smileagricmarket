'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('user_farm_milestones', {
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
            milestone_id: {
                type: DataTypes.UUID,
                allowNull: false,
                field: 'milestone_id',
                references: {
                    model: 'milestones',
                    key: 'id'
                },
                onDelete: 'CASCADE'
            },
            is_completed: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                field: 'is_completed'
            },
            completed_at: {
                type: DataTypes.DATE,
                allowNull: true,
                field: 'completed_at'
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
        await queryInterface.addIndex('user_farm_milestones', ['user_farm_id'], {
            name: 'user_farm_milestones_user_farm_id_idx'
        });

        // Create index on milestone_id
        await queryInterface.addIndex('user_farm_milestones', ['milestone_id'], {
            name: 'user_farm_milestones_milestone_id_idx'
        });

        // Create composite unique index to prevent duplicate assignments
        await queryInterface.addIndex('user_farm_milestones', ['user_farm_id', 'milestone_id'], {
            name: 'user_farm_milestones_unique_idx',
            unique: true
        });

        // Create index on is_completed for queries
        await queryInterface.addIndex('user_farm_milestones', ['is_completed'], {
            name: 'user_farm_milestones_is_completed_idx'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('user_farm_milestones');
    }
};
