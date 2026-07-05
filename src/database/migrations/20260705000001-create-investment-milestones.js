'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('investment_milestones', {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: DataTypes.UUIDV4,
                field: 'id'
            },
            investment_id: {
                type: DataTypes.UUID,
                allowNull: false,
                field: 'investment_id',
                references: {
                    model: 'investments',
                    key: 'id'
                },
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false,
                field: 'name'
            },
            fund_release_percentage: {
                type: DataTypes.DECIMAL(5, 2),
                allowNull: false,
                field: 'fund_release_percentage',
                comment: 'Percentage of funds released at this milestone'
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

        await queryInterface.addIndex('investment_milestones', ['investment_id'], {
            name: 'investment_milestones_investment_id_idx'
        });

        await queryInterface.addIndex('investment_milestones', ['investment_id', 'order'], {
            name: 'investment_milestones_investment_id_order_idx'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('investment_milestones');
    }
};
