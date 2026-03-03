'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const FarmCategory = sequelize.define('FarmCategory', {
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
            field: 'name',
            comment: 'Farm category name'
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
            field: 'description',
            comment: 'Optional description for the category'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            field: 'is_active',
            comment: 'Whether the category is active'
        }
    }, {
        tableName: 'farm_categories',
        timestamps: true,
        underscored: true,
        indexes: [
            {
                fields: ['name'],
                unique: true
            },
            {
                fields: ['is_active']
            }
        ]
    });

    return FarmCategory;
};
