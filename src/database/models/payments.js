'use strict';

const { DataTypes } = require('sequelize');
const definitions = require('../paymentTables')(DataTypes);
const snake = value => value.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

module.exports = sequelize => Object.fromEntries(Object.entries(definitions).map(([name, definition]) => [name,
    sequelize.define(name, Object.fromEntries(Object.entries(definition.fields).map(([field, options]) => [field, { ...options, field: snake(field) }])), {
        tableName: definition.table, timestamps: true, underscored: true, indexes: definition.indexes
    })
]));
