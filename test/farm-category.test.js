'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize, UniqueConstraintError } = require('sequelize');

// Exercise the controller without opening database connections.
const sequelize = new Sequelize({ dialect: 'postgres', logging: false });
const dbPath = require.resolve('../src/database');
const modelPath = require.resolve('../src/database/models');
const originalDatabase = require.cache[dbPath];
const originalModels = require.cache[modelPath];
const farmCategory = {};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sequelize } };
require.cache[modelPath] = { id: modelPath, filename: modelPath, loaded: true, exports: () => ({ FarmCategory: farmCategory }) };
const { createFarmCategory, updateFarmCategory } = require('../src/modules/web/admin/farmCategoryController');
if (originalDatabase) require.cache[dbPath] = originalDatabase; else delete require.cache[dbPath];
if (originalModels) require.cache[modelPath] = originalModels; else delete require.cache[modelPath];

function response() {
    return { fail(message, status) { return { error: true, message, status }; },
        success(data, message) { return { error: false, data, message }; } };
}

test('category creation rejects invalid names without attempting a database write', async () => {
    let writes = 0;
    farmCategory.create = async () => { writes++; };
    for (const name of [undefined, null, '', '  ', 123, {}, 'a'.repeat(256)]) {
        const result = await createFarmCategory({ body: { name } }, response());
        assert.equal(result.status, 400);
    }
    assert.equal(writes, 0);
});

test('category creation compares normalized names and returns 409 for an existing category', async () => {
    let writes = 0;
    farmCategory.findOne = async options => {
        const sql = sequelize.getQueryInterface().queryGenerator.getWhereConditions(options.where);
        assert.equal(sql, 'lower(btrim("name")) = lower(\'cAsSaVa\')');
        return { id: 'existing', name: 'Cassava', isActive: false };
    };
    farmCategory.create = async () => { writes++; };
    const result = await createFarmCategory({ body: { name: ' cAsSaVa ' } }, response());
    assert.equal(result.status, 409); assert.equal(writes, 0);
});

test('a new category keeps its display case and trims surrounding whitespace', async () => {
    farmCategory.findOne = async () => null;
    farmCategory.create = async values => ({ id: 'new', isActive: true, ...values });
    const result = await createFarmCategory({ body: { name: '  Cash Crops  ', description: ' Farming ' } }, response());
    assert.equal(result.error, false); assert.equal(result.data.name, 'Cash Crops'); assert.equal(result.data.description, 'Farming');
});

test('a concurrent create caught by the database is returned as 409 rather than 500', async () => {
    farmCategory.findOne = async () => null;
    farmCategory.create = async () => { throw new UniqueConstraintError({ message: 'duplicate name' }); };
    const result = await createFarmCategory({ body: { name: 'Cassava' } }, response());
    assert.equal(result.status, 409);
});

test('updating the same category permits its own name and excludes its ID from duplicate checks', async () => {
    const own = { id: 'current-id', name: 'Cassava', async update(values) { Object.assign(this, values); } };
    farmCategory.findByPk = async () => own;
    farmCategory.findOne = async options => {
        const sql = sequelize.getQueryInterface().queryGenerator.getWhereConditions(options.where);
        assert.match(sql, /lower\(btrim\("name"\)\) = lower\('CASSAVA'\)/);
        assert.match(sql, /"id" != 'current-id'/);
        return null;
    };
    const result = await updateFarmCategory({ params: { categoryId: own.id }, body: { name: ' CASSAVA ' } }, response());
    assert.equal(result.error, false); assert.equal(own.name, 'CASSAVA');
});

test('a rename cannot take the name of a different category', async () => {
    let writes = 0;
    farmCategory.findByPk = async () => ({ id: 'current', name: 'Maize', async update() { writes++; } });
    farmCategory.findOne = async () => ({ id: 'other', name: 'Cassava' });
    const result = await updateFarmCategory({ params: { categoryId: 'current' }, body: { name: ' cassava ' } }, response());
    assert.equal(result.status, 409); assert.equal(writes, 0);
});

test('a concurrent rename caught by the database is returned as 409', async () => {
    farmCategory.findByPk = async () => ({ id: 'current', name: 'Maize', async update() {
        throw new UniqueConstraintError({ message: 'duplicate name' });
    } });
    farmCategory.findOne = async () => null;
    const result = await updateFarmCategory({ params: { categoryId: 'current' }, body: { name: 'Cassava' } }, response());
    assert.equal(result.status, 409);
});
