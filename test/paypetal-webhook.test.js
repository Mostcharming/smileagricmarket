'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac, createHash, randomUUID } = require('node:crypto');
const { Op } = require('sequelize');
const express = require('express');
const { createPaypetalWebhookRouter } = require('../src/modules/web/paypetal/route');
const { getWebhookConfig, authenticateWebhook, webhookSource } = require('../src/middlewares/common/paypetalWebhookSecurity');
const { createPaymentWebhooks, webhookIdentity } = require('../src/services/payments/webhooks');

const secret = 'test-only-webhook-secret-0123456789abcdef';
const signatureHeader = 'x-test-webhook-signature';
const environment = { PAYPETAL_ENABLED: 'true', PAYPETAL_WEBHOOK_AUTH_MODE: 'hmac_sha256',
    PAYPETAL_WEBHOOK_AUTH_HEADER: signatureHeader, PAYPETAL_WEBHOOK_SECRET: secret };
const sign = body => createHmac('sha256', secret).update(body).digest('hex');

async function httpFixture(t, options = {}) {
    const accepted = []; let storageCalls = 0;
    const service = { async consumeWebhookRateLimit() { storageCalls++; return { allowed: true }; },
        async receiveWebhook(event) { accepted.push(event); } };
    const app = express();
    app.use(['/v1/web/payments/paypetal/webhook', '/api/v1/web/payments/paypetal/webhook'], createPaypetalWebhookRouter({
        getConfig: () => getWebhookConfig(environment), getService: () => service, logger: { error() {} }, ...options
    }));
    // The dedicated receiver must work before normal parsing and user authentication.
    app.use(express.json()); app.use((req, res) => res.status(401).json({ loginRequired: true }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    async function send(body = JSON.stringify({ data: { reference: 'SMILE123' }, status: 'SUCCESS' }), headers = {}, method = 'POST', alias = false) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}${alias ? '/api' : ''}/v1/web/payments/paypetal/webhook`, {
            method, ...(method === 'GET' ? {} : { body }),
            headers: { 'content-type': 'application/json', [signatureHeader]: sign(body), ...headers }
        });
        return { status: response.status, data: await response.json(), headers: response.headers };
    }
    return { send, accepted, service, baseUrl: `http://127.0.0.1:${server.address().port}`, storageCalls: () => storageCalls };
}

test('webhook authentication fails closed without a separate secret and rejects unsigned schemes', () => {
    assert.throws(() => getWebhookConfig({ PAYPETAL_ENABLED: 'true', PAYPETAL_SECRET_KEY: secret }));
    assert.throws(() => getWebhookConfig({ ...environment, PAYPETAL_WEBHOOK_SECRET: 'short' }));
    assert.throws(() => getWebhookConfig({ ...environment, PAYPETAL_WEBHOOK_AUTH_MODE: 'unsigned' }));
    assert.throws(() => getWebhookConfig({ ...environment, NODE_ENV: 'production', PAYPETAL_WEBHOOK_REQUIRE_HTTPS: 'false' }));
});

test('the provisional default requires HMAC-SHA256 in X-Paypetal-Signature', async t => {
    const config = getWebhookConfig({ PAYPETAL_ENABLED: 'true', PAYPETAL_WEBHOOK_SECRET: secret });
    assert.equal(config.authMode, 'hmac_sha256'); assert.equal(config.authHeader, 'x-paypetal-signature');
    const f = await httpFixture(t, { getConfig: () => config });
    const body = require('node:fs').readFileSync(require.resolve('./fixtures/paypetal-webhook-provisional.json'), 'utf8');
    assert.equal((await f.send(body, { 'x-paypetal-signature': sign(body) })).status, 200);
    assert.equal(f.accepted[0].payload.event, 'payment.received');
    assert.equal((await f.send(body, { 'x-paypetal-signature': 'bad-signature' })).status, 401);
});

test('authentication uses the exact body bytes and supports explicit key rotation', () => {
    const body = Buffer.from('{"reference": "SMILE123"}');
    const config = getWebhookConfig({ ...environment, PAYPETAL_WEBHOOK_PREVIOUS_SECRET: 'another-test-secret-0123456789abcdef' });
    const request = signature => ({ headers: { [signatureHeader]: signature }, rawHeaders: [signatureHeader, signature] });
    assert.equal(authenticateWebhook(request(sign(body)), config, body), true);
    assert.equal(authenticateWebhook(request(sign(body)), config, Buffer.from('{"reference":"SMILE123"}')), false);
    const oldSignature = createHmac('sha256', config.secrets[1]).update(body).digest('hex');
    assert.equal(authenticateWebhook(request(oldSignature), config, body), true);
    const duplicate = request(sign(body)); duplicate.rawHeaders.push(signatureHeader, sign(body));
    assert.equal(authenticateWebhook(duplicate, config, body), false);
});

test('shared-header authentication is available only when explicitly selected', () => {
    const config = getWebhookConfig({ ...environment, PAYPETAL_WEBHOOK_AUTH_MODE: 'shared_secret' });
    const req = { headers: { [signatureHeader]: secret }, rawHeaders: [signatureHeader, secret] };
    assert.equal(authenticateWebhook(req, config, Buffer.from('{}')), true);
    req.headers[signatureHeader] = 'wrong';
    assert.equal(authenticateWebhook(req, config, Buffer.from('{}')), false);
});

test('forwarded addresses and HTTPS claims are trusted only from configured proxy networks', () => {
    const req = { socket: { remoteAddress: '::ffff:127.0.0.1' }, headers: {
        'x-forwarded-for': '192.0.2.99, 203.0.113.5, 10.0.0.2', 'x-forwarded-proto': 'https' } };
    assert.deepEqual(webhookSource(req, getWebhookConfig(environment)), { ip: '127.0.0.1', secure: false });
    const config = getWebhookConfig({ ...environment, PAYPETAL_WEBHOOK_TRUSTED_PROXIES: '127.0.0.1,10.0.0.0/8' });
    assert.deepEqual(webhookSource(req, config), { ip: '203.0.113.5', secure: true });
    req.headers['x-forwarded-for'] = 'invalid-address';
    assert.equal(webhookSource(req, config).ip, null);
});

test('a valid notification commits a durable job before acknowledgement on both URL aliases', async t => {
    const f = await httpFixture(t);
    for (const alias of [false, true]) {
        const result = await f.send(undefined, {}, 'POST', alias);
        assert.equal(result.status, 200); assert.deepEqual(result.data, { received: true });
    }
    assert.equal(f.accepted.length, 2); assert.equal(f.accepted[0].bodyHash, f.accepted[1].bodyHash);
    assert.equal(f.accepted[0].payload.status, 'SUCCESS');
    assert.match(f.accepted[0].bodyHash, /^[a-f0-9]{64}$/);
});

test('invalid signatures and modified bodies cannot reach storage', async t => {
    const f = await httpFixture(t);
    for (const signature of ['', 'wrong', 'f'.repeat(64)]) {
        const result = await f.send(undefined, { [signatureHeader]: signature });
        assert.equal(result.status, 401); assert.deepEqual(result.data, { received: false });
    }
    const result = await f.send('{"reference":"another"}', { [signatureHeader]: sign('{"reference":"original"}') });
    assert.equal(result.status, 401); assert.equal(f.storageCalls(), 0);
});

test('missing configuration returns 503 and unsigned processing cannot be enabled accidentally', async t => {
    const f = await httpFixture(t, { getConfig: () => getWebhookConfig({}) });
    const result = await f.send(); assert.equal(result.status, 503); assert.equal(f.storageCalls(), 0);
});

test('malformed, oversized, compressed and unsupported requests are rejected before storage', async t => {
    const f = await httpFixture(t);
    assert.equal((await f.send('{invalid-json')).status, 400);
    assert.equal((await f.send('[]')).status, 400);
    assert.equal((await f.send('{"status":"SUCCESS"}')).status, 400);
    assert.equal((await f.send('{"reference":"SMILE123"}', { 'content-type': 'text/plain' })).status, 415);
    assert.equal((await f.send('{"reference":"SMILE123"}', { 'content-encoding': 'gzip' })).status, 415);
    assert.equal((await f.send(JSON.stringify({ reference: 'SMILE123', metadata: 'a'.repeat(17000) }))).status, 413);
    const wrongMethod = await f.send(undefined, {}, 'GET');
    assert.equal(wrongMethod.status, 405); assert.equal(wrongMethod.headers.get('allow'), 'POST');
    assert.equal(f.storageCalls(), 0);
});

test('local abuse limits also apply to bad signatures and cannot be bypassed with forwarded IPs', async t => {
    const f = await httpFixture(t, { transportIpLimit: 1 });
    assert.equal((await f.send(undefined, { [signatureHeader]: 'bad', 'x-forwarded-for': '192.0.2.1' })).status, 401);
    const result = await f.send(undefined, { 'x-forwarded-for': '192.0.2.2' });
    assert.equal(result.status, 429); assert.ok(Number(result.headers.get('retry-after')) > 0);
    assert.equal(f.storageCalls(), 0);
});

test('a distributed rate-limit rejection responds with Retry-After and does not queue work', async t => {
    const f = await httpFixture(t); f.service.consumeWebhookRateLimit = async () => ({ allowed: false, retryAfter: 30 });
    const result = await f.send(); assert.equal(result.status, 429); assert.equal(result.headers.get('retry-after'), '30');
    assert.equal(f.accepted.length, 0);
});

test('an unavailable database is not acknowledged as successful delivery', async t => {
    const f = await httpFixture(t); f.service.receiveWebhook = async () => { throw Error('database unavailable'); };
    const result = await f.send(); assert.equal(result.status, 503); assert.deepEqual(result.data, { received: false });
});

test('HTTPS and optional source allowlists are enforced without trusting spoofed headers', async t => {
    const secure = await httpFixture(t, { getConfig: () => getWebhookConfig({ ...environment, NODE_ENV: 'production' }) });
    assert.equal((await secure.send(undefined, { 'x-forwarded-proto': 'https' })).status, 400);
    const restricted = await httpFixture(t, { getConfig: () => getWebhookConfig({ ...environment, PAYPETAL_WEBHOOK_ALLOWED_IPS: '203.0.113.0/24' }) });
    assert.equal((await restricted.send(undefined, { 'x-forwarded-for': '203.0.113.1' })).status, 403);
});

test('a slow incomplete request body is closed at the webhook deadline', async t => {
    const f = await httpFixture(t, { bodyTimeoutMs: 80 });
    const status = await new Promise((resolve, reject) => {
        const req = require('node:http').request(f.baseUrl + '/v1/web/payments/paypetal/webhook', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '1000' }
        }, response => { response.resume(); response.once('end', () => resolve(response.statusCode)); });
        req.on('error', reject); req.write('{"reference":');
    });
    assert.equal(status, 408); assert.equal(f.storageCalls(), 0);
});

test('webhook identities reject conflicts, arbitrary objects and malformed references', () => {
    assert.deepEqual(webhookIdentity({ dataResponse: { data: { reference: 'SMILE123', transactionId: 'provider-id' } } }),
        { reference: 'SMILE123', transactionId: 'provider-id' });
    for (const invalid of [{ reference: 'a', data: { reference: 'b' } }, { reference: {} }, { transactionId: 123 }, { reference: '../another' }]) {
        assert.throws(() => webhookIdentity(invalid));
    }
});

function queueFixture() {
    const payment = { id: randomUUID(), investorId: randomUUID(), reference: 'SMILE123', gatewayTransactionId: 'provider-id',
        gateway: 'paypetal', status: 'pending', initiationAttemptedAt: new Date() };
    const receipts = []; const jobs = []; const calls = [];
    const wrap = row => Object.assign(row, { async update(values) { Object.assign(this, values); return this; } });
    const table = rows => ({ async findOrCreate({ where, defaults }) {
        const found = rows.find(row => Object.entries(where).every(([key, value]) => row[key] === value));
        if (found) return [found, false];
        const row = wrap({ id: randomUUID(), status: 'pending', attempts: 0, ...where, ...defaults }); rows.push(row); return [row, true];
    }, async update(values) { for (const row of rows) await row.update(values); } });
    let tail = Promise.resolve();
    const sequelize = { transaction(work) { const next = tail.then(() => work({ LOCK: { UPDATE: 'UPDATE' } })); tail = next.catch(() => {}); return next; } };
    const service = createPaymentWebhooks({ sequelize, models: { PaymentWebhook: table(receipts), PaymentJob: table(jobs),
        InvestmentPayment: { async findByPk() { return payment; }, async findOne({ where }) {
            return where[Op.or].some(condition => Object.entries(condition).every(([key, value]) => payment[key] === value)) ? payment : null;
        } } }, confirmInvestment: async (...args) => { calls.push(args); return { payment }; } });
    const event = { payload: { reference: 'SMILE123', transactionId: 'provider-id', status: 'SUCCESS', amount: 999999 },
        bodyHash: createHash('sha256').update('test-body').digest('hex') };
    return { service, payment, receipts, jobs, calls, event };
}

test('duplicate and concurrent notifications coalesce into one receipt and one verification job', async () => {
    const f = queueFixture();
    await Promise.all([f.service.receiveWebhook(f.event), f.service.receiveWebhook(f.event)]);
    assert.equal(f.receipts.length, 1); assert.equal(f.jobs.length, 1); assert.equal(f.calls.length, 0);
    assert.equal(f.jobs[0].action, 'confirm_investment'); assert.equal(f.jobs[0].entityId, f.payment.id);
});

test('worker checks the saved owner and transaction, ignoring a claimed SUCCESS and inflated amount', async () => {
    const f = queueFixture(); await f.service.receiveWebhook(f.event);
    assert.equal(await f.service.processInvestmentWebhook(f.payment.id, 1), false);
    assert.deepEqual(f.calls[0], [f.payment.id, f.payment.investorId]);
    assert.equal(f.payment.status, 'pending'); assert.equal(f.receipts[0].status, 'awaiting_payment');
    assert.equal(await f.service.processInvestmentWebhook(f.payment.id, 10), true);
    f.payment.status = 'successful';
    assert.equal(await f.service.processInvestmentWebhook(f.payment.id, 11), true);
    assert.equal(f.receipts[0].status, 'processed');
});

test('unknown, mismatched and legacy notifications do not create receipts or payment jobs', async () => {
    const f = queueFixture();
    for (const payload of [{ reference: 'unknown' }, { reference: 'SMILE123', transactionId: 'other-id' },
        { reference: 'wrong-reference', transactionId: 'provider-id' }]) await f.service.receiveWebhook({ ...f.event, payload });
    f.payment.initiationAttemptedAt = null;
    await f.service.receiveWebhook(f.event);
    assert.equal(f.receipts.length, 0); assert.equal(f.jobs.length, 0);
});

test('settled replays cannot queue another verification, and active leases are preserved', async () => {
    const f = queueFixture(); await f.service.receiveWebhook(f.event);
    Object.assign(f.jobs[0], { status: 'running', leaseToken: 'active-lease' });
    await f.service.receiveWebhook(f.event); assert.equal(f.jobs[0].leaseToken, 'active-lease');
    f.payment.status = 'successful'; await f.service.receiveWebhook(f.event);
    assert.equal(f.receipts[0].status, 'processed'); assert.equal(f.jobs.length, 1);
});

test('new notifications respect cooldowns and cannot unblock financial identity conflicts', async () => {
    const f = queueFixture(); await f.service.receiveWebhook(f.event);
    const availableAt = new Date(Date.now() + 60000);
    Object.assign(f.jobs[0], { status: 'completed', attempts: 10, availableAt });
    await f.service.receiveWebhook(f.event);
    assert.equal(f.jobs[0].status, 'pending'); assert.equal(f.jobs[0].availableAt.getTime(), availableAt.getTime());
    Object.assign(f.jobs[0], { status: 'blocked', lastError: 'PayPetal transaction identity does not match the investment' });
    await f.service.receiveWebhook(f.event);
    assert.equal(f.jobs[0].status, 'blocked');
});

test('webhook Swagger uses webhook authentication and documents its configuration gate and rate limit', () => {
    const spec = require('../src/config/swagger');
    const hook = spec.paths['/web/payments/paypetal/webhook'].post;
    assert.deepEqual(hook.security, [{ PaypetalWebhookAuth: [] }]);
    assert.equal(spec.components.securitySchemes.PaypetalWebhookAuth.type, 'apiKey');
    assert.ok(hook.responses['429'].headers['Retry-After']);
    assert.match(hook.responses['503'].description, /unconfigured/);
});
