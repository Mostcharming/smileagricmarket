'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function load(relativePath, stubs) {
    const filename = path.resolve(__dirname, relativePath);
    const module = { exports: {} };
    const localRequire = createRequire(filename);
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, console, Buffer,
        require: name => Object.hasOwn(stubs, name) ? stubs[name] : localRequire(name)
    }, { filename });
    return module.exports;
}

test('Paystack initialization, verification and webhook are paused even when credentials exist', async () => {
    let calls = 0;
    const paystack = load('../src/utils/paystack.js', {
        '../config': { paystack: { enabled: false, secretKey: 'fake-configured-key' } },
        axios: async () => { calls++; throw new Error('Paystack must not be contacted'); }
    });
    const disabled = error => error.code === 'paystack_disabled' && error.statusCode === 503;
    assert.throws(() => paystack.getPaystackConfig(), disabled);
    await assert.rejects(paystack.initializeTransaction({ amountInSubunit: 100, reference: 'test' }), disabled);
    await assert.rejects(paystack.verifyTransaction('test'), disabled);
    const controller = load('../src/modules/web/paystack/controller.js', {
        '../../../database': { sequelize: {} },
        '../../../database/models': () => ({ InvestmentPayment: { findOne: () => { calls++; } } }),
        '../../../utils/paystack': paystack,
        '../investments/paymentService': { settlePaystackPayment: () => { calls++; } }
    });
    const res = { status(code) { this.code = code; return this; }, json(body) { return { status: this.code, body }; } };
    const result = await controller.handlePaystackWebhook({}, res);
    assert.equal(result.status, 503);
    assert.equal(result.body.received, false);
    assert.equal(calls, 0);
    const investmentController = load('../src/modules/web/investments/controller.js', {
        '../../../database': { sequelize: {} },
        '../../../database/models': () => ({ InvestmentPayment: {
            findOne: async () => ({ id: 'saved-payment', gateway: 'paystack', status: 'successful' })
        } }),
        '../../../utils/paystack': paystack,
        './paymentService': { settlePaystackPayment: () => { calls++; } }
    });
    const verification = await investmentController.verifyInvestmentPayment({
        user: { id: 'investor' }, params: { transactionId: 'saved-payment' }
    }, { fail: (message, status) => ({ status, message }) });
    assert.equal(verification.status, 503);
    assert.equal(calls, 0);
});

test('disabled PayPetal checkout never falls back to Paystack', async () => {
    let paystackCalls = 0;
    const paypetal = require('../src/utils/paypetal');
    const controller = load('../src/modules/web/investments/controller.js', {
        '../../../database': { sequelize: {} },
        '../../../database/models': () => ({}),
        '../../../utils/paypetal': {
            settings: () => paypetal.settings({}),
            requireEnabled: () => { throw new paypetal.PaypetalError('PayPetal is not configured and enabled', { statusCode: 503 }); }
        },
        '../../../utils/paystack': {
            getPaystackConfig: () => { paystackCalls++; },
            initializeTransaction: () => { paystackCalls++; }
        },
        './paymentService': {}
    });
    const result = await controller.investInFarm({
        user: { id: 'investor' }, params: { investmentProjectId: 'project' },
        body: { amount: 100, idempotencyKey: 'retry-1' }, get: () => undefined
    }, { fail: (message, status) => ({ status, message }) });
    assert.equal(result.status, 503);
    assert.equal(paystackCalls, 0);
});

test('payment Swagger documents PayPetal transfer instructions and the Paystack pause', () => {
    const spec = require('../src/config/swagger');
    for (const prefix of ['/web', '/mobile']) {
        const checkout = spec.paths[prefix + '/investments/{investmentProjectId}/invest'].post;
        assert.match(checkout.description, /Paystack is temporarily disabled/);
        for (const code of ['200', '201']) {
            const gateway = checkout.responses[code].content['application/json'].example.data.gateway;
            assert.equal(gateway.provider, 'paypetal');
            assert.equal(gateway.method, 'bank_transfer');
            assert.ok(gateway.accountNumber);
            assert.equal(gateway.confirmation, 'admin_statement_reconciliation');
            assert.equal(gateway.authorizationUrl, undefined);
        }
    }
    const webhook = spec.paths['/web/payments/paystack/webhook'].post;
    assert.equal(webhook.deprecated, true);
    assert.equal(webhook.responses['503'].content['application/json'].example.received, false);
});

test('Paystack reactivation requires both provider selection and the explicit enable flag', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../src/config/index.js'), 'utf8');
    for (const env of [
        {}, { PAYMENTS_PROVIDER: 'paystack' }, { PAYSTACK_ENABLED: 'true' },
        { PAYMENTS_PROVIDER: 'paypetal', PAYSTACK_ENABLED: 'true' },
        { PAYMENTS_PROVIDER: 'paystack', PAYSTACK_ENABLED: 'false' },
        { PAYMENTS_PROVIDER: 'paystack', PAYSTACK_ENABLED: 'true' }
    ]) {
        const module = { exports: {} };
        vm.runInNewContext(source, { module, require, __dirname: path.resolve(__dirname, '../src/config'), process: { env } });
        assert.equal(module.exports.paystack.enabled,
            env.PAYMENTS_PROVIDER === 'paystack' && env.PAYSTACK_ENABLED === 'true');
    }
});
