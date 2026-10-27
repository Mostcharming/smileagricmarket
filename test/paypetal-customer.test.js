'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createClient, PaypetalError } = require('../src/utils/paypetal');
const { createCustomerRegistration } = require('../src/services/payments/customerRegistration');
const { createPaymentService } = require('../src/services/payments/service');

const identity = { fullname: 'Adaeze Okafor', email: 'adaeze@example.com', phoneNumber: '+2348012345678' };
const userInput = { fullName: identity.fullname, email: identity.email, phoneNumber: identity.phoneNumber };
const response = { status: true, statusCode: '00', message: 'Customer created', dataResponse: {
    customerId: 'cus_a1b2c3d4e5', ...identity, createdAt: '2024-07-15T13:00:00.000+00:00', extra: { retained: true }
} };

function fixture(provider = {}, config = { provider: 'paypetal', enabled: true }) {
    const tables = { User: [], PaymentProfile: [], PaymentJob: [], Wallet: [] };
    const wrap = data => Object.assign(data, { async update(values) { Object.assign(this, values); return this; } });
    const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
    const models = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, {
        async create(values) {
            const row = wrap({ id: randomUUID(), status: 'pending', attempts: 0, ...values });
            rows.push(row);
            return row;
        },
        async findByPk(id) { return rows.find(row => row.id === id); },
        async findOrCreate({ where, defaults }) {
            const found = rows.find(row => matches(row, where));
            return found ? [found, false] : [await this.create({ ...defaults, ...where }), true];
        },
        async findOne() { return rows.find(row => ['pending', 'retry'].includes(row.status)); },
        async update(values, { where }) {
            for (const row of rows.filter(row => matches(row, where))) await row.update(values);
        }
    }]));
    // Serialize transactions to model the profile/user row locks; restore state on rollback.
    let tail = Promise.resolve();
    const sequelize = { transaction(work) {
        const result = tail.then(async () => {
            const before = Object.fromEntries(Object.entries(tables).map(([name, rows]) =>
                [name, rows.map(row => ({ ...row }))]));
            try { return await work({ LOCK: { UPDATE: 'UPDATE' } }); }
            catch (error) {
                for (const [name, rows] of Object.entries(tables)) rows.splice(0, rows.length, ...before[name].map(wrap));
                throw error;
            }
        });
        tail = result.catch(() => {});
        return result;
    } };
    return { tables, models, sequelize,
        registration: createCustomerRegistration({ sequelize, models, getSettings: () => config }),
        service: createPaymentService({ sequelize, models, provider, getSettings: () => config }) };
}

test('customer client posts the supplied contract and returns the entire response envelope', async () => {
    const calls = [];
    const client = createClient({ getSettings: () => ({ baseUrl: 'https://sandbox.paypetalhq.xyz',
        secretKey: 'test-key', appId: 'test-app', timeoutMs: 100 }), transport: async request => {
        calls.push(request);
        return { status: 200, data: JSON.stringify(request.url.endsWith('/login')
            ? { status: true, dataResponse: { accessToken: 'test-token' } } : response) };
    } });
    assert.deepEqual(JSON.parse(JSON.stringify(await client.createCustomer(identity))), response);
    assert.equal(calls[1].url, 'https://sandbox.paypetalhq.xyz/api/v1/customer');
    assert.equal(calls[1].method, 'post');
    assert.deepEqual(calls[1].data, identity);
    assert.equal(calls[1].headers.Authorization, 'Bearer test-token');
    assert.equal(calls[1].headers.Accept, 'application/json');
});

test('registration atomically saves the user, customer identity and a unique durable job', async () => {
    const f = fixture();
    const user = await f.registration.registerUser({ ...userInput, email: ' Adaeze@Example.com ' });
    assert.equal(f.tables.PaymentProfile[0].userId, user.id);
    assert.deepEqual(f.tables.PaymentProfile[0].identity, identity);
    assert.equal(f.tables.PaymentJob[0].action, 'create_customer');
    await f.sequelize.transaction(t => f.registration.queueCustomer(user, t));
    assert.equal(f.tables.PaymentJob.length, 1);
});

test('a failed queue insert rolls back signup instead of leaving an untracked customer', async () => {
    const f = fixture();
    f.models.PaymentJob.findOrCreate = async () => { throw new Error('storage unavailable'); };
    await assert.rejects(f.registration.registerUser(userInput), /storage unavailable/);
    assert.equal(f.tables.User.length, 0);
    assert.equal(f.tables.PaymentProfile.length, 0);
});

test('signup without a full name waits for a profile update before queuing customer creation', async () => {
    const f = fixture();
    const user = await f.registration.registerUser({ email: identity.email });
    assert.equal(f.tables.PaymentJob.length, 0);
    await f.registration.updateUser(user.id, userInput);
    assert.equal(f.tables.PaymentJob.length, 1);
    assert.deepEqual(f.tables.PaymentProfile[0].identity, identity);
});

test('email-only, phone-only and name-only customers omit absent optional fields', async () => {
    for (const input of [{ fullName: identity.fullname, email: identity.email },
        { fullName: identity.fullname, phoneNumber: identity.phoneNumber }, { fullName: identity.fullname }]) {
        let sent;
        const f = fixture({ async createCustomer(data) { sent = data; return response; } });
        await f.registration.registerUser(input);
        assert.equal(f.tables.PaymentJob.length, 1);
        await f.service.runNextJob();
        assert.equal(sent.fullname, identity.fullname);
        assert.equal(Object.hasOwn(sent, 'email'), Boolean(input.email));
        assert.equal(Object.hasOwn(sent, 'phoneNumber'), Boolean(input.phoneNumber));
        assert.equal(f.tables.PaymentProfile[0].customerId, response.dataResponse.customerId);
    }
});

test('phone-only signup can reconcile a timed-out customer without an email', async () => {
    const f = fixture({ async customers() { return [{ ...response.dataResponse, email: null }]; } });
    await f.registration.registerUser({ fullName: identity.fullname, phoneNumber: identity.phoneNumber });
    const profile = f.tables.PaymentProfile[0];
    profile.creationAttemptedAt = new Date();
    await f.service.ensureCustomer(profile.id);
    assert.equal(profile.customerId, response.dataResponse.customerId);
});

test('disabled PayPetal and other providers preserve signup without customer jobs', async () => {
    for (const config of [{ provider: 'paypetal', enabled: false }, { provider: 'paystack', enabled: true }]) {
        const f = fixture({}, config);
        await f.registration.registerUser(userInput);
        assert.equal(f.tables.User.length, 1);
        assert.equal(f.tables.PaymentProfile.length, 0);
    }
});

test('worker creates the customer at signup and stores the ID, full envelope and all data', async () => {
    let calls = 0;
    const f = fixture({ async createCustomer(data) { calls++; assert.deepEqual(data, identity); return response; } });
    await f.registration.registerUser(userInput);
    assert.equal(await f.service.runNextJob(), true);
    const profile = f.tables.PaymentProfile[0];
    assert.equal(profile.customerId, response.dataResponse.customerId);
    assert.deepEqual(profile.customerResponse, response);
    assert.deepEqual(profile.customerData, response.dataResponse);
    assert.equal(f.tables.PaymentJob[0].status, 'completed');
    await f.service.ensureCustomer(profile.id);
    assert.equal(calls, 1);
    assert.equal(profile.status, 'pending'); // Creating a customer does not verify a bank account.
});

test('timeout recovery finds the created customer without issuing another POST', async () => {
    let calls = 0;
    const f = fixture({
        async createCustomer() { calls++; throw new PaypetalError('timeout', { uncertain: true }); },
        async customers() { return [response.dataResponse]; }
    });
    await f.registration.registerUser(userInput);
    const profile = f.tables.PaymentProfile[0];
    await f.service.runNextJob();
    assert.equal(f.tables.PaymentJob[0].status, 'retry');
    assert.ok(profile.creationAttemptedAt);
    await f.service.runNextJob();
    assert.equal(calls, 1);
    assert.equal(profile.customerId, response.dataResponse.customerId);
    assert.deepEqual(profile.customerData, response.dataResponse);
    assert.equal(f.tables.PaymentJob[0].status, 'completed');
});

test('payout account synchronization reuses the customer created after signup', async () => {
    let customerCalls = 0;
    const account = { customerId: response.dataResponse.customerId, bankCode: '123',
        accountNumber: '0123456789', accountName: identity.fullname };
    const f = fixture({ async createCustomer() { customerCalls++; return response; },
        async validateAccount() { return account; }, async payoutAccounts() { return [account]; } });
    await f.registration.registerUser(userInput);
    await f.service.runNextJob();
    const profile = f.tables.PaymentProfile[0];
    await profile.update({ bankCode: account.bankCode, accountNumber: account.accountNumber, accountName: account.accountName });
    await f.service.syncAccount(profile.id);
    assert.equal(customerCalls, 1);
    assert.equal(profile.status, 'verified');
    assert.deepEqual(profile.customerResponse, response);
});

test('an unknown customer outcome blocks duplicate creation when reconciliation finds nothing', async () => {
    let calls = 0;
    const f = fixture({ async createCustomer() { calls++; throw new PaypetalError('timeout', { uncertain: true }); },
        async customers() { return []; } });
    await f.registration.registerUser(userInput);
    await f.service.runNextJob();
    await f.service.runNextJob();
    assert.equal(calls, 1);
    assert.equal(f.tables.PaymentJob[0].status, 'blocked');
    assert.match(f.tables.PaymentProfile[0].customerLastError, /outcome is unknown/);
});

test('a provider rejection permits a later safe retry', async () => {
    let calls = 0;
    const f = fixture({ async createCustomer() {
        if (++calls === 1) throw new PaypetalError('rejected', { uncertain: false });
        return response;
    } });
    await f.registration.registerUser(userInput);
    await f.service.runNextJob();
    assert.equal(f.tables.PaymentProfile[0].creationAttemptedAt, null);
    await f.service.runNextJob();
    assert.equal(calls, 2);
    assert.equal(f.tables.PaymentProfile[0].customerId, response.dataResponse.customerId);
});

test('a malformed success response is retained and blocks subsequent customer POSTs', async () => {
    const malformed = { ...response, dataResponse: { ...identity } };
    const f = fixture({ async createCustomer() { return malformed; } });
    await f.registration.registerUser(userInput);
    await f.service.runNextJob();
    assert.deepEqual(f.tables.PaymentProfile[0].customerResponse, malformed);
    assert.equal(f.tables.PaymentJob[0].status, 'blocked');
    assert.ok(f.tables.PaymentProfile[0].creationAttemptedAt);
});

test('reconciliation refuses another customer with mismatched identity', async () => {
    const f = fixture({ async customers() { return [{ ...response.dataResponse, phoneNumber: 'different' }]; } });
    await f.registration.registerUser(userInput);
    const profile = f.tables.PaymentProfile[0];
    profile.creationAttemptedAt = new Date();
    await assert.rejects(f.service.ensureCustomer(profile.id), /does not match/);
    assert.equal(profile.customerId, undefined);
});

test('concurrent customer provisioning issues only one POST', async () => {
    let calls = 0;
    let finish;
    const waiting = new Promise(resolve => { finish = resolve; });
    const f = fixture({ async createCustomer() { calls++; await waiting; return response; }, async customers() { return []; } });
    await f.registration.registerUser(userInput);
    const id = f.tables.PaymentProfile[0].id;
    const first = f.service.ensureCustomer(id);
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(f.service.ensureCustomer(id), /outcome is unknown/);
    finish();
    await first;
    assert.equal(calls, 1);
});
