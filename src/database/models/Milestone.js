'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Milestone = sequelize.define('Milestone', {
        id: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            field: 'id'
        },
        farmCategoryId: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'farm_category_id',
            references: {
                model: 'farm_categories',
                key: 'id'
            },
            onDelete: 'CASCADE',
            comment: 'Reference to farm category'
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'name',
            comment: 'Milestone name/description'
        },
        order: {
            type: DataTypes.INTEGER,
            allowNull: true,
            field: 'order',
            comment: 'Order/sequence of the milestone'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            field: 'is_active',
            comment: 'Whether the milestone is active'
        }
    }, {
        tableName: 'milestones',
        timestamps: true,
        underscored: true,
        indexes: [
            {
                fields: ['farm_category_id']
            },
            {
                fields: ['farm_category_id', 'order']
            }
        ]
    });

    return Milestone;
};
