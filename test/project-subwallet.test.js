'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createClient, PaypetalError } = require('../src/utils/paypetal');
const { createPaymentService } = require('../src/services/payments/service');
const { createProjectReference, projectWalletName } = require('../src/services/payments/projectWalletIdentity');

function fixture(overrides = {}, newProjectReference = createProjectReference) {
    const tables = { UserFarm: [], UserFarmInvestment: [], UserFarmMilestone: [], ProjectEscrow: [], PaymentJob: [] };
    const wrap = row => Object.assign(row, { async update(values) { Object.assign(this, values); return this; },
        async reload() { return this; } });
    const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
    const models = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, {
        async create(values) {
            if (name === 'ProjectEscrow') for (const [field, column] of [
                ['reference', 'reference'], ['walletName', 'wallet_name'], ['userFarmInvestmentId', 'user_farm_investment_id']
            ]) if (rows.some(row => row[field] === values[field])) {
                const error = new Error('unique constraint');
                error.name = 'SequelizeUniqueConstraintError'; error.fields = { [column]: values[field] }; throw error;
            }
            const row = wrap({ id: randomUUID(), status: name === 'ProjectEscrow' ? 'awaiting_wallet' : 'pending', attempts: 0, ...values });
            rows.push(row); return row;
        },
        async findByPk(id) { return rows.find(row => row.id === id); },
        async findOne({ where }) { return rows.find(row => name === 'PaymentJob'
            ? ['pending', 'retry'].includes(row.status) : matches(row, where)); },
        async findAll({ where }) { return rows.filter(row => matches(row, where)); },
        async findOrCreate({ where, defaults }) {
            const row = rows.find(row => matches(row, where));
            return row ? [row, false] : [await this.create({ ...defaults, ...where }), true];
        },
        async update(values, { where }) { for (const row of rows.filter(row => matches(row, where))) await row.update(values); }
    }]));
    const sequelize = { async transaction(options, callback) {
        const work = typeof options === 'function' ? options : callback;
        const before = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.map(row => ({ ...row }))]));
        const hooks = [];
        const tx = { LOCK: { UPDATE: 'UPDATE' }, afterCommit(fn) { hooks.push(fn); } };
        let result;
        try { result = await work(tx); }
        catch (error) {
            for (const [name, rows] of Object.entries(tables)) rows.splice(0, rows.length, ...before[name].map(wrap));
            throw error;
        }
        for (const hook of hooks) await hook();
        return result;
    } };
    const requests = [];
    const remote = [];
    let lastResponse;
    const provider = { async createSubwallet(data) {
        requests.push(data);
        const wallet = { id: randomUUID(), accountBalance: 0, currency: data.currency, name: data.name,
            bankName: '9Payment (9PSB)', accountNumber: '5031681901', accountName: 'PAYPETAL-' + data.name };
        remote.push(wallet);
        lastResponse = { status: 'success', responseCode: '00', message: 'Subwallet created',
            responseData: { data: wallet, status: true, statusCode: '00' } };
        return lastResponse;
    }, async subwallets() { return remote; }, ...overrides };
    const service = createPaymentService({ sequelize, models, provider, getSettings: () => ({}), newProjectReference });
    const ownerId = randomUUID();
    async function project(values = {}) {
        let farm = tables.UserFarm[0];
        if (!farm) farm = await models.UserFarm.create({ userId: ownerId, name: 'Green Acres' });
        const row = await models.UserFarmInvestment.create({ userFarmId: farm.id, currency: 'NGN', expectedInvestment: '1000.00', ...values });
        await models.UserFarmMilestone.create({ userFarmInvestmentId: row.id, name: 'Planting', fundReleasePercentage: '100', order: 0 });
        return row;
    }
    return { tables, models, sequelize, service, project, ownerId, requests, remote, response: () => lastResponse };
}

test('project references are ten alphanumeric characters containing letters and numbers', () => {
    const values = new Set();
    for (let i = 0; i < 300; i++) {
        const reference = createProjectReference();
        assert.match(reference, /^[A-Z0-9]{10}$/); assert.match(reference, /[A-Z]/); assert.match(reference, /\d/);
        values.add(reference);
    }
    assert.equal(values.size, 300);
});

test('project wallet names remove whitespace while retaining the UUID suffix', () => {
    assert.equal(projectWalletName('  Green\tAcres\nFarm  ', 'abcdef01-1111-4111-8111-111111111111'), 'GreenAcresFarm-abcdef');
    assert.throws(() => projectWalletName(' \t\n', 'abcdef01-1111-4111-8111-111111111111'), /farm name/);
});

test('subwallet creation uses the exact provider contract and retains the full nested response', async () => {
    const payload = { name: 'GreenAcres-abcdef', currency: 'NGN', reference: 'ABCD123456' };
    const response = { status: 'success', responseCode: '00', message: 'Subwallet created', responseData: {
        data: { id: randomUUID(), accountBalance: 0, currency: 'NGN', name: payload.name }, status: true, statusCode: '00'
    } };
    const calls = [];
    const client = createClient({ getSettings: () => ({ baseUrl: 'https://sandbox.paypetalhq.xyz', secretKey: 'test', appId: 'test' }),
        transport: async options => { calls.push(options); return { status: 200,
            data: JSON.stringify(options.url.endsWith('/login') ? { status: true, dataResponse: { accessToken: 'test-token' } } : response) }; } });
    assert.deepEqual(JSON.parse(JSON.stringify(await client.createSubwallet(payload))), response);
    assert.deepEqual(calls[1].data, payload);
    assert.equal(calls[1].url, 'https://sandbox.paypetalhq.xyz/api/v1/account/subwallet/create');
});

test('project creation Swagger includes the saved subwallet identity and payment account', () => {
    const spec = require('../src/config/swagger');
    const media = spec.paths['/web/farms/{farmId}/investment-projects'].post.responses['201'].content['application/json'];
    assert.match(media.example.data.paymentAccount.reference, /^[A-Za-z0-9]{10}$/);
    assert.equal(media.example.data.paymentAccount.currency, 'NGN');
    assert.equal(spec.components.schemas.ProjectSubwalletAccount.properties.reference.maxLength, 10);
});

test('project creation reserves the reference before calling PayPetal after commit and saves all response fields', async () => {
    const f = fixture();
    const project = await f.project({ id: 'abcdef01-1111-4111-8111-111111111111' });
    let escrow;
    await f.sequelize.transaction(async transaction => {
        escrow = await f.service.ensureProject(project, f.ownerId, transaction);
        assert.match(escrow.reference, /^[A-Z0-9]{10}$/);
        assert.equal(escrow.walletName, 'GreenAcres-abcdef');
        assert.equal(f.requests.length, 0);
        assert.equal(f.tables.PaymentJob[0].status, 'running');
    });
    assert.deepEqual(f.requests, [{ name: escrow.walletName, currency: 'NGN', reference: escrow.reference }]);
    assert.deepEqual(escrow.subwalletResponse, f.response());
    assert.deepEqual(escrow.subwalletData, f.response().responseData.data);
    assert.equal(escrow.subwalletData.accountBalance, 0);
    assert.equal(escrow.providerWalletId, f.remote[0].id);
    assert.equal(escrow.status, 'collecting');
    assert.equal(f.tables.PaymentJob[0].status, 'completed');
    await f.service.ensureProject(project, f.ownerId);
    await f.service.provisionProject(escrow.id);
    assert.equal(f.requests.length, 1);
});

test('a rolled-back project transaction never creates a provider subwallet', async () => {
    const f = fixture(); const project = await f.project();
    await assert.rejects(f.sequelize.transaction(async transaction => {
        await f.service.ensureProject(project, f.ownerId, transaction); throw new Error('rollback');
    }), /rollback/);
    assert.equal(f.requests.length, 0); assert.equal(f.tables.ProjectEscrow.length, 0); assert.equal(f.tables.PaymentJob.length, 0);
});

test('projects on the same farm with colliding UUID prefixes receive different wallet names', async () => {
    const f = fixture();
    const first = await f.project({ id: 'abcdef01-1111-4111-8111-111111111111' });
    const second = await f.project({ id: 'abcdef02-2222-4222-8222-222222222222' });
    const a = await f.service.ensureProject(first, f.ownerId);
    const b = await f.service.ensureProject(second, f.ownerId);
    assert.equal(a.walletName, 'GreenAcres-abcdef'); assert.equal(b.walletName, 'GreenAcres-abcdef02');
    assert.notEqual(a.reference, b.reference); assert.notEqual(a.providerWalletId, b.providerWalletId);
});

test('database reference collisions generate a fresh code while preserving the parent transaction', async () => {
    const refs = ['ABCD123456', 'ABCD123456', 'EFGH123456'];
    const f = fixture({}, () => refs.shift());
    const first = await f.service.ensureProject(await f.project(), f.ownerId);
    const second = await f.service.ensureProject(await f.project(), f.ownerId);
    assert.equal(first.reference, 'ABCD123456'); assert.equal(second.reference, 'EFGH123456'); assert.equal(f.requests.length, 2);
});

test('NGN is enforced without relabelling a foreign-currency investment', async () => {
    const f = fixture(); const project = await f.project({ currency: 'USD' });
    await assert.rejects(f.service.ensureProject(project, f.ownerId), /NGN investment project/);
    assert.equal(project.currency, 'USD'); assert.equal(f.requests.length, 0);
});

test('subwallet pagination unwraps the provider data.content envelope and checks all pages', async () => {
    const calls = [];
    const client = createClient({ getSettings: () => ({ baseUrl: 'https://sandbox.paypetalhq.xyz', secretKey: 'test', appId: 'test' }),
        transport: async options => {
            calls.push(options.url);
            const body = options.url.endsWith('/login') ? { status: true, dataResponse: { accessToken: 'test-token' } }
                : { status: 'success', responseData: { data: { content: [{ id: options.url.includes('page=1') ? 'second' : 'first' }],
                    pageNumber: options.url.includes('page=1') ? 1 : 0, totalPages: 2 }, status: true, statusCode: '00' } };
            return { status: 200, data: JSON.stringify(body) };
        } });
    assert.deepEqual(JSON.parse(JSON.stringify(await client.subwallets())), [{ id: 'first' }, { id: 'second' }]);
    assert.match(calls[2], /page=1/);
});

test('an uncertain creation is reconciled by the saved name without a second POST', async () => {
    let calls = 0; let saved;
    const f = fixture({ async createSubwallet(data) {
        calls++; saved = { id: randomUUID(), name: data.name, currency: 'NGN', bankName: 'Test Bank', accountNumber: '5031681901', accountName: 'PAYPETAL-TEST' };
        throw new PaypetalError('timeout', { uncertain: true });
    }, async subwallets() { return [saved]; } });
    const escrow = await f.service.ensureProject(await f.project(), f.ownerId);
    assert.equal(escrow.status, 'awaiting_wallet'); assert.equal(f.tables.PaymentJob[0].status, 'retry');
    await f.service.runNextJob();
    assert.equal(calls, 1); assert.equal(escrow.providerWalletId, saved.id); assert.equal(escrow.status, 'collecting');
});

test('an unknown creation outcome blocks a duplicate POST when no wallet is found', async () => {
    let calls = 0;
    const f = fixture({ async createSubwallet() { calls++; throw new PaypetalError('timeout', { uncertain: true }); } });
    await f.service.ensureProject(await f.project(), f.ownerId);
    await f.service.runNextJob();
    assert.equal(calls, 1); assert.equal(f.tables.PaymentJob[0].status, 'blocked');
});
