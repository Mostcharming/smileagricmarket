'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createClient, PaypetalError } = require('../src/utils/paypetal');
const { createInvestmentCheckout } = require('../src/services/payments/investmentCheckout');

function fixture(overrides = {}) {
    const tables = { InvestmentPayment: [], PaymentDeposit: [], UserFarmInvestment: [], ProjectEscrow: [] };
    const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
    const wrap = values => Object.assign(values, { async update(changes) { Object.assign(this, changes); return this; },
        get() { return this; } });
    const models = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, {
        async findOne({ where }) { return rows.find(row => matches(row, where)); },
        async findByPk(id) { return rows.find(row => row.id === id); },
        async sum(field, { where }) { return rows.filter(row => matches(row, where)).reduce((total, row) => total + Number(row[field]), 0); },
        async count({ where }) { return rows.filter(row => matches(row, where)).length; },
        async create(values) { const row = wrap({ id: randomUUID(), ...values }); rows.push(row); return row; }
    }]));
    // Serialize transactions like row locks and restore rows on rollback.
    let tail = Promise.resolve();
    const sequelize = { transaction(work) {
        const next = tail.then(async () => {
            const snapshots = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.map(row => ({ ...row }))]));
            try { return await work({ LOCK: { UPDATE: 'UPDATE' } }); }
            catch (error) {
                for (const [name, snapshotsRows] of Object.entries(snapshots)) {
                    const rows = tables[name];
                    rows.splice(snapshotsRows.length);
                    snapshotsRows.forEach((saved, i) => { if (rows[i]) { for (const key of Object.keys(rows[i])) delete rows[i][key]; Object.assign(rows[i], saved); }
                        else rows.push(wrap(saved)); });
                }
                throw error;
            }
        });
        tail = next.catch(() => {});
        return next;
    } };
    const investorId = randomUUID();
    const project = wrap({ id: randomUUID(), expectedInvestment: '1000000.00', investmentReceived: '0.00', investmentPending: '1000000.00',
        currency: 'NGN', isActive: true, endDate: '2027-10-27', investmentStatus: 'not_started' });
    tables.UserFarmInvestment.push(project);
    const escrow = wrap({ id: randomUUID(), userFarmInvestmentId: project.id, targetAmount: '1000000.00',
        confirmedAmount: '0.00', currency: 'NGN', status: 'collecting' });
    tables.ProjectEscrow.push(escrow);
    const remote = new Map(); const posts = []; const gets = []; const payouts = []; const jobs = [];
    const provider = { async initiatePayment(data) {
        posts.push(data);
        const transaction = { transactionId: randomUUID(), reference: data.reference, amount: Number(data.amount), currency: data.currency,
            fee: 50, totalAmount: Number(data.amount) + 50, status: 'PENDING', metadata: null };
        remote.set(data.reference, transaction); remote.set(transaction.transactionId, transaction);
        return { status: true, statusCode: '00', message: 'successful', dataResponse: {
            data: transaction, paymentUrl: `https://sandbox.paypetalhq.xyz/pay?pid=${data.reference}` } };
    }, async transaction(id) { gets.push(id); return { status: true, statusCode: '00', dataResponse: { ...remote.get(id) } }; }, ...overrides };
    const settings = { paymentRedirectUrl: 'https://smileagrimarket.com/investments/payment/success', responseUnit: 'major' };
    const callbacks = { async scheduleMaturity(payment) { payouts.push(payment.id); }, async enqueue(...args) { jobs.push(args); } };
    const service = createInvestmentCheckout({ sequelize, models, provider, getSettings: () => settings,
        scheduleMaturity: (...args) => callbacks.scheduleMaturity(...args), enqueue: (...args) => callbacks.enqueue(...args) });
    async function payment(values = {}) { return models.InvestmentPayment.create({ investorId, userFarmInvestmentId: project.id,
        reference: 'SMILE' + randomUUID().replace(/-/g, '').slice(0, 24), amount: '250000.00', currency: 'NGN', gateway: 'paypetal',
        status: 'pending', gatewayResponse: {}, agreement: { terms: { farmName: 'Test Farm' } }, ...values }); }
    async function start(values) { const row = await payment(values); await service.initiateInvestment(row.id, investorId); return row; }
    function success(row) { remote.get(row.reference).status = 'SUCCESS'; }
    return { service, tables, models, investorId, project, escrow, posts, gets, remote, callbacks, settings, payouts, jobs, payment, start, success };
}

test('PayPetal payment client preserves the complete initiate and transaction envelopes', async () => {
    const calls = [];
    const envelope = { status: true, statusCode: '00', dataResponse: { data: { transactionId: 'provider-id' }, paymentUrl: 'https://example.com/pay' } };
    const client = createClient({ getSettings: () => ({ baseUrl: 'https://sandbox.paypetalhq.xyz', appId: 'test', secretKey: 'test' }),
        transport: async options => { calls.push(options); return { status: 200, data: JSON.stringify(options.url.endsWith('/login')
            ? { status: true, dataResponse: { accessToken: 'test-token' } } : envelope) }; } });
    const body = { amount: '250000.00', currency: 'NGN', reference: 'SMILE123', description: 'Investment', redirectUrl: 'https://example.com/success' };
    assert.deepEqual(JSON.parse(JSON.stringify(await client.initiatePayment(body))), envelope);
    assert.deepEqual(calls[1].data, body);
    assert.equal(calls[1].url, 'https://sandbox.paypetalhq.xyz/api/v1/pay/initiate');
    assert.deepEqual(JSON.parse(JSON.stringify(await client.transaction('id/123'))), envelope);
    assert.equal(calls[2].url, 'https://sandbox.paypetalhq.xyz/api/v1/transaction/id%2F123');
});

test('checkout saves the full response and returns the provider URL and fee separately from principal', async () => {
    const f = fixture(); const row = await f.start();
    assert.deepEqual(Object.keys(f.posts[0]).sort(), ['amount', 'currency', 'description', 'redirectUrl', 'reference']);
    assert.equal(f.posts[0].amount, '250000.00');
    assert.ok(row.initiationAttemptedAt);
    assert.equal(row.gatewayResponse.initialization.dataResponse.data.metadata, null);
    assert.equal(row.gatewayResponse.instructions.totalAmount, 250050);
    assert.equal(row.gatewayResponse.instructions.amount, '250000.00');
    assert.equal(row.authorizationUrl, row.gatewayResponse.initialization.dataResponse.paymentUrl);
    assert.equal(row.gatewayTransactionId, f.remote.get(row.reference).transactionId);
    const replay = await f.service.initiateInvestment(row.id, f.investorId);
    assert.equal(replay.paymentUrl, row.authorizationUrl);
    assert.equal(f.posts.length, 1);
});

test('concurrent checkout requests cannot initiate the same payment twice', async () => {
    const f = fixture(); const row = await f.payment();
    await Promise.allSettled([f.service.initiateInvestment(row.id, f.investorId), f.service.initiateInvestment(row.id, f.investorId)]);
    assert.equal(f.posts.length, 1);
});

test('a known initiation rejection permits retry, while a timeout blocks a duplicate POST', async () => {
    for (const uncertain of [false, true]) {
        let calls = 0;
        const f = fixture({ async initiatePayment() { calls++; throw new PaypetalError('rejected', { uncertain }); } });
        const row = await f.payment();
        await assert.rejects(f.service.initiateInvestment(row.id, f.investorId), /rejected/);
        await assert.rejects(f.service.initiateInvestment(row.id, f.investorId), uncertain ? /outcome is unknown/ : /rejected/);
        assert.equal(calls, uncertain ? 1 : 2);
    }
});

test('a malformed success is retained and never triggers another initiation POST', async () => {
    let calls = 0;
    const body = { status: true, dataResponse: { data: { transactionId: 'bad' } } };
    const f = fixture({ async initiatePayment() { calls++; return body; } }); const row = await f.payment();
    await assert.rejects(f.service.initiateInvestment(row.id, f.investorId));
    assert.deepEqual(row.gatewayResponse.initialization, body);
    await assert.rejects(f.service.initiateInvestment(row.id, f.investorId));
    assert.equal(calls, 1);
});

test('a pending provider payment stays pending and is never credited', async () => {
    const f = fixture(); const row = await f.start();
    const result = await f.service.confirmInvestment(row.id, f.investorId);
    assert.equal(result.credited, false); assert.equal(row.status, 'pending');
    assert.equal(f.gets[0], row.gatewayTransactionId);
    assert.equal(result.investorInvestment.amount, 0);
    assert.equal(f.tables.PaymentDeposit.length, 0); assert.equal(f.project.investmentReceived, '0.00');
    assert.ok(row.gatewayResponse.verification); assert.ok(row.gatewayResponse.initialization);
});

test('SUCCESS credits principal once, saves automated deposit evidence and schedules its maturity payout', async () => {
    const f = fixture(); const row = await f.start(); f.success(row);
    const result = await f.service.confirmInvestment(row.id, f.investorId);
    assert.equal(result.credited, true); assert.equal(row.status, 'successful');
    assert.equal(f.project.investmentReceived, '250000.00'); assert.equal(f.escrow.confirmedAmount, '250000.00');
    assert.equal(f.tables.PaymentDeposit[0].verificationSource, 'paypetal_transaction');
    assert.equal(f.tables.PaymentDeposit[0].reviewedBy, null);
    assert.deepEqual(f.payouts, [row.id]);
    assert.deepEqual(result.investorInvestment, { amount: 250000, currency: 'NGN', paymentCount: 1 });
    const again = await f.service.confirmInvestment(row.id, f.investorId);
    assert.equal(again.credited, false); assert.equal(again.alreadySettled, true);
    assert.equal(f.tables.PaymentDeposit.length, 1); assert.equal(f.payouts.length, 1);
});

test('simultaneous confirmations credit a successful payment once', async () => {
    const f = fixture(); const row = await f.start(); f.success(row);
    const results = await Promise.all([f.service.confirmInvestment(row.id, f.investorId), f.service.confirmInvestment(row.id, f.investorId)]);
    assert.equal(results.filter(result => result.credited).length, 1);
    assert.equal(f.tables.PaymentDeposit.length, 1); assert.equal(f.project.investmentReceived, '250000.00');
});

test('a second payment tops up the same investor project total and preserves each payment', async () => {
    const f = fixture(); const initial = await f.start(); f.success(initial);
    await f.service.confirmInvestment(initial.id, f.investorId);
    const topUp = await f.start({ amount: '100000.00' }); f.success(topUp);
    const result = await f.service.confirmInvestment(topUp.id, f.investorId);
    assert.deepEqual(result.investorInvestment, { amount: 350000, currency: 'NGN', paymentCount: 2 });
    assert.equal(f.project.investmentReceived, '350000.00'); assert.equal(f.escrow.confirmedAmount, '350000.00');
    assert.equal(f.tables.InvestmentPayment.length, 2); assert.equal(f.tables.PaymentDeposit.length, 2);
    assert.deepEqual(f.payouts, [initial.id, topUp.id]);
    await f.service.confirmInvestment(initial.id, f.investorId);
    assert.equal(f.project.investmentReceived, '350000.00');
});

test('foreign-owned payments are hidden and never queried with PayPetal', async () => {
    const f = fixture(); const row = await f.start();
    await assert.rejects(f.service.confirmInvestment(row.id, randomUUID()), { statusCode: 404 });
    await assert.rejects(f.service.initiateInvestment(row.id, randomUUID()), { statusCode: 404 });
    assert.equal(f.gets.length, 0);
});

test('a timed-out initiation can be confirmed by its saved reference without another initiation', async () => {
    const f = fixture({ async initiatePayment() { throw new PaypetalError('timeout', { uncertain: true }); } });
    const row = await f.payment();
    await assert.rejects(f.service.initiateInvestment(row.id, f.investorId));
    f.remote.set(row.reference, { transactionId: randomUUID(), reference: row.reference, amount: 250000, currency: 'NGN', status: 'SUCCESS' });
    const result = await f.service.confirmInvestment(row.id, f.investorId);
    assert.equal(f.gets[0], row.reference); assert.equal(result.credited, true);
});

test('provider identity and amount mismatches are recorded without crediting the investor', async () => {
    for (const changes of [{ reference: 'another-payment' }, { transactionId: 'another-id' }, { amount: 250050 }, { currency: 'USD' }]) {
        const f = fixture(); const row = await f.start(); f.success(row); Object.assign(f.remote.get(row.reference), changes);
        await assert.rejects(f.service.confirmInvestment(row.id, f.investorId), /does not match/);
        assert.ok(row.gatewayResponse.verificationError); assert.ok(row.gatewayResponse.verification);
        assert.equal(row.status, 'pending'); assert.equal(f.project.investmentReceived, '0.00');
        assert.equal(f.tables.PaymentDeposit.length, 0);
    }
});

test('failed and cancelled provider payments do not count as investments', async () => {
    for (const status of ['FAILED', 'CANCELLED']) {
        const f = fixture(); const row = await f.start(); f.remote.get(row.reference).status = status;
        const result = await f.service.confirmInvestment(row.id, f.investorId);
        assert.equal(result.credited, false); assert.equal(result.investorInvestment.amount, 0);
        assert.equal(f.tables.PaymentDeposit.length, 0); assert.equal(row.status, status.toLowerCase());
    }
});

test('crediting cannot overfund the project and maturity failures roll back the entire settlement', async () => {
    for (const failMaturity of [false, true]) {
        const f = fixture(); const row = await f.start(); f.success(row);
        if (failMaturity) f.callbacks.scheduleMaturity = async () => { throw Error('maturity persistence failed'); };
        else f.escrow.targetAmount = '100000.00';
        await assert.rejects(f.service.confirmInvestment(row.id, f.investorId));
        assert.equal(row.status, 'pending'); assert.equal(f.tables.PaymentDeposit.length, 0);
        assert.equal(f.project.investmentReceived, '0.00'); assert.equal(f.escrow.confirmedAmount, '0.00');
    }
});

test('web and mobile Swagger expose checkout, confirmation and top-ups without verify routes', () => {
    const spec = require('../src/config/swagger');
    for (const platform of ['web', 'mobile']) {
        const prefix = `/${platform}/investments`;
        assert.equal(spec.paths[prefix + '/payments/{transactionId}/verify'], undefined);
        const invest = spec.paths[prefix + '/{investmentProjectId}/invest'].post;
        assert.ok(invest.requestBody.content['application/json'].schema.required.includes('agreementAcceptance'));
        assert.ok(invest.responses['201'].content['application/json'].schema.properties.data.properties.gateway.properties.paymentUrl);
        assert.ok(spec.paths[prefix + '/payments/{transactionId}/confirm-payment'].post);
        assert.ok(spec.paths[prefix + '/projects/{investmentProjectId}/agreement'].get);
        assert.ok(spec.paths[prefix + '/payments/{transactionId}'].get);
    }
});
