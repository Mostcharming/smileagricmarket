'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function setup() {
    const accounts = [1, 2].map(id => ({
        id: `user-${id}`, phoneNumber: `0801234567${id}`, email: `user${id}@example.com`,
        password: 'old-password-hash', otp: 'signup-otp', resetToken: 'web-link-token',
        resetTokenExpiry: new Date(Date.now() + 3600000),
        async update(values, options) {
            assert.ok(options.transaction);
            Object.assign(this, values);
        }
    }));
    const rows = new Map();
    const notifications = [];
    let queue = Promise.resolve();
    const sequelize = {
        // Emulate account row locking so competing controller calls see committed state.
        transaction(callback) {
            const result = queue.then(() => callback({ LOCK: { UPDATE: 'UPDATE' } }));
            queue = result.catch(() => {});
            return result;
        }
    };
    const models = {
        User: { async findOne({ where, transaction, lock }) {
            assert.ok(transaction);
            assert.equal(lock, 'UPDATE');
            return accounts.find(user => Object.entries(where).every(([key, value]) => user[key] === value)) || null;
        } },
        MobilePasswordReset: {
            async findByPk(id) { return rows.get(id) || null; },
            async findOne({ where }) { return [...rows.values()].find(row => row.tokenHash === where.tokenHash) || null; },
            async create(values, options) {
                assert.ok(options.transaction);
                const row = { ...values, async update(update, opts) {
                    assert.ok(opts.transaction);
                    Object.assign(this, update);
                } };
                rows.set(row.userId, row);
                return row;
            }
        },
        KYC: { findOne: async () => ({ status: 'approved' }) }
    };
    const filename = path.resolve(__dirname, '../src/modules/mobile/auth/controller.js');
    const localRequire = createRequire(filename);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, console,
        require: name => {
            if (name === '../../../database') return { sequelize };
            if (name === '../../../database/models') return () => models;
            if (name === '../../../utils/notify') return async (...args) => { notifications.push(args); };
            if (name === '../../../middlewares/common/security') return { signToken: user => `login-${user.id}` };
            return localRequire(name);
        }
    }, { filename });
    const res = {
        success: (data, message) => ({ status: 200, data, message }),
        fail: (message, status) => ({ status, message })
    };
    const call = (handler, body) => module.exports[handler]({ body }, res);
    const identity = { phoneNumber: accounts[0].phoneNumber };
    const row = () => rows.get(accounts[0].id);
    const lastOtp = () => notifications.filter(n => n[2] === 'MOBILE_PASSWORD_RESET_OTP_TEMPLATE').at(-1)[3].otp;
    const request = () => call('forgot', identity);
    const verify = (otp = lastOtp()) => call('verifyResetToken', { ...identity, otp });
    const reset = resetToken => call('reset', { resetToken, password: 'NewPassword123!', passwordConfirmation: 'NewPassword123!' });
    return { accounts, rows, notifications, call, identity, row, lastOtp, request, verify, reset };
}

test('mobile request -> verify -> reset sends an OTP, hashes secrets and preserves web/signup state', async () => {
    const c = setup();
    assert.equal((await c.request()).status, 200);
    const otp = c.lastOtp();
    assert.match(otp, /^\d{6}$/);
    assert.notEqual(c.row().otpHash, otp);
    assert.ok(await bcrypt.compare(otp, c.row().otpHash));
    assert.ok(c.row().otpExpiresAt.getTime() > Date.now() + 590000);
    assert.deepEqual(Array.from(c.notifications[0][4]), ['email', 'sms']);
    assert.equal(c.notifications[0][3].expiryTime, '10 minutes');
    assert.equal(c.notifications[0][3].resetLink, undefined);
    const verified = await c.verify();
    assert.equal(verified.status, 200);
    assert.match(verified.data.resetToken, /^[a-f0-9]{64}$/);
    assert.notEqual(c.row().tokenHash, verified.data.resetToken);
    assert.equal(verified.data.expiresIn, 600);
    assert.equal(c.row().otpHash, null);
    const result = await c.reset(verified.data.resetToken);
    assert.equal(result.status, 200);
    assert.equal(result.data.token, 'login-user-1');
    assert.equal(result.data.user.kycVerified, true);
    assert.ok(await bcrypt.compare('NewPassword123!', c.accounts[0].password));
    assert.equal(c.row().tokenHash, null);
    assert.equal(c.accounts[0].resetToken, 'web-link-token');
    assert.equal(c.accounts[0].otp, 'signup-otp');
    assert.equal(c.notifications.at(-1)[2], 'PASSWORD_RESET_SUCCESS_TEMPLATE');
    assert.equal((await c.reset(verified.data.resetToken)).status, 400);
    assert.equal((await c.verify(otp)).status, 400);
});

test('unknown accounts and resend cooldown have the same response; resend invalidates prior credentials', async () => {
    const c = setup();
    const response = await c.request();
    assert.deepEqual(await c.call('forgot', { email: 'unknown@example.com' }), response);
    assert.deepEqual(await c.request(), response);
    assert.equal(c.notifications.length, 1);
    const oldHash = c.row().otpHash;
    c.row().lastSentAt = new Date(Date.now() - 61000);
    await c.call('resendResetToken', c.identity);
    assert.equal(c.notifications.length, 2);
    assert.notEqual(c.row().otpHash, oldHash);
    const verified = await c.verify();
    c.row().lastSentAt = new Date(Date.now() - 61000);
    await c.call('resendResetToken', c.identity);
    assert.equal((await c.reset(verified.data.resetToken)).status, 400);
    assert.equal(c.row().tokenHash, null);
    assert.equal(c.row().attempts, 0);
});

test('OTP attempts are bounded and cannot be used for another account', async () => {
    const c = setup();
    await c.request();
    assert.equal((await c.call('verifyResetToken', { email: c.accounts[1].email, otp: c.lastOtp() })).status, 400);
    const wrong = c.lastOtp() === '777666' ? '000000' : '777666';
    for (let attempt = 0; attempt < 5; attempt++) assert.equal((await c.verify(wrong)).status, 400);
    assert.equal(c.row().attempts, 5);
    assert.equal((await c.verify()).status, 400);
    assert.equal(c.accounts[0].password, 'old-password-hash');
});

test('expired and missing OTP or reset-token expiry is rejected', async () => {
    const c = setup();
    await c.request();
    c.row().otpExpiresAt = new Date(Date.now() - 1);
    assert.equal((await c.verify()).status, 400);
    c.row().otpExpiresAt = null;
    assert.equal((await c.verify()).status, 400);
    c.row().otpExpiresAt = new Date(Date.now() + 600000);
    const verified = await c.verify();
    c.row().tokenExpiresAt = new Date(Date.now() - 1);
    assert.equal((await c.reset(verified.data.resetToken)).status, 400);
    c.row().tokenExpiresAt = null;
    assert.equal((await c.reset(verified.data.resetToken)).status, 400);
});

test('concurrent verification and reset each succeed only once', async () => {
    const c = setup();
    await Promise.all([c.request(), c.request()]);
    assert.equal(c.notifications.length, 1);
    const results = await Promise.all([c.verify(), c.verify()]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
    const token = results.find(r => r.status === 200).data.resetToken;
    const resets = await Promise.all([c.reset(token), c.reset(token)]);
    assert.deepEqual(resets.map(r => r.status).sort(), [200, 400]);
});

test('recovery supports email-only and phone-only accounts', async () => {
    for (const channel of ['email', 'sms']) {
        const c = setup();
        const identity = channel === 'email' ? { email: c.accounts[0].email } : c.identity;
        if (channel === 'email') c.accounts[0].phoneNumber = null;
        else c.accounts[0].email = null;
        await c.call('forgot', identity);
        assert.deepEqual(Array.from(c.notifications[0][4]), [channel]);
        const verified = await c.call('verifyResetToken', { ...identity, otp: c.lastOtp() });
        assert.equal(verified.status, 200);
        assert.equal((await c.reset(verified.data.resetToken)).status, 200);
    }
});

test('invalid inputs and unverified credentials cannot update a password', async () => {
    const c = setup();
    for (const body of [undefined, null, {}, { phoneNumber: {} }, { email: [] }, { email: ' ' }]) {
        assert.equal((await c.call('forgot', body)).status, 400);
    }
    await c.request();
    for (const otp of [123456, '12345', '1234567', {}, null, 'abcdef']) {
        assert.equal((await c.verify(otp)).status, 400);
    }
    assert.equal((await c.reset(c.lastOtp())).status, 400);
    assert.equal((await c.reset('web-link-token')).status, 400);
    assert.equal((await c.reset('a'.repeat(64))).status, 400);
    const verified = await c.verify();
    for (const [password, passwordConfirmation] of [['short', 'short'], ['NewPassword123!', 'different'], [{}, {}]]) {
        assert.equal((await c.call('reset', { resetToken: verified.data.resetToken, password, passwordConfirmation })).status, 400);
    }
    assert.equal(c.accounts[0].password, 'old-password-hash');
    assert.equal((await c.reset(verified.data.resetToken)).status, 200);
});

test('Swagger documents OTP flow and legacy aliases while web recovery stays link-based', () => {
    const spec = require('../src/config/swagger');
    const get = route => spec.paths[`/mobile/auth/${route}`].post;
    const schema = route => get(route).requestBody.content['application/json'].schema;
    assert.match(get('forgot-password').description, /six-digit/);
    assert.deepEqual(schema('verify-reset-otp').required, ['otp']);
    assert.equal(schema('verify-reset-otp').properties.resetToken, undefined);
    assert.equal(schema('verify-reset-otp').properties.otp.pattern, '^\\d{6}$');
    for (const route of ['forgot-password', 'resend-reset-otp', 'resend-reset-token', 'verify-reset-otp', 'verify-reset-token']) {
        const examples = get(route).requestBody.content['application/json'].examples;
        assert.ok(examples.phone.value.phoneNumber);
        assert.ok(examples.email.value.email);
        if (route.startsWith('verify-')) {
            assert.equal(examples.phone.value.otp, '012345');
            assert.equal(examples.email.value.otp, '012345');
        }
    }
    assert.equal(get('verify-reset-token').deprecated, true);
    assert.equal(get('resend-reset-token').deprecated, true);
    assert.ok(get('resend-reset-otp'));
    assert.deepEqual(schema('reset-password').required, ['resetToken', 'password', 'passwordConfirmation']);
    assert.match(spec.paths['/web/auth/forgot-password'].post.description, /link/);
});

test('OTP email and SMS templates contain the code and no reset link', async () => {
    const templates = require('../src/utils/notificationTemplates.json');
    const template = templates.MOBILE_PASSWORD_RESET_OTP_TEMPLATE;
    const { renderEmailTemplate } = require('../src/utils/emailTemplateRenderer');
    const NotifyProcess = require('../src/utils/components/notify/subComponents/NotifyProcess');
    const notification = new NotifyProcess();
    notification.templateName = 'MOBILE_PASSWORD_RESET_OTP_TEMPLATE';
    notification.body = 'emailBody';
    notification.notifyConfig = 'email';
    notification.shortCodes = { otp: '012345', expiryTime: '10 minutes' };
    const body = await notification.getMessage();
    const html = renderEmailTemplate('MOBILE_PASSWORD_RESET_OTP_TEMPLATE', {
        subject: template.emailSubject, fallbackBody: body
    });
    assert.match(html, /012345/);
    assert.match(html, /10 minutes/);
    assert.doesNotMatch(html, /reset-password\//);
    assert.match(template.smsBody, /\{otp\}/);
    assert.doesNotMatch(template.smsBody, /resetLink/);
    assert.match(templates.PASSWORD_RESET_TEMPLATE.smsBody, /\{resetLink\}/);
});

test('leading-zero OTPs verify without numeric conversion', async () => {
    const c = setup();
    await c.request();
    c.row().otpHash = await bcrypt.hash('012345', 10);
    assert.equal((await c.verify('012345')).status, 200);
});

test('mobile recovery migration matches model storage and rolls back only its own table', async () => {
    const Sequelize = require('sequelize');
    const sequelize = new Sequelize('postgres://localhost/test', { logging: false });
    const model = require('../src/database/models/MobilePasswordReset')(sequelize);
    const migration = require('../src/database/migrations/20260911000000-create-mobile-password-resets');
    let columns;
    await migration.up({ createTable: async (table, fields) => {
        assert.equal(table, model.tableName);
        columns = fields;
    } }, Sequelize);
    assert.deepEqual(Object.keys(columns).sort(), Object.values(model.rawAttributes).map(attribute => attribute.field).sort());
    assert.deepEqual(columns.user_id.references, { model: 'users', key: 'id' });
    assert.equal(columns.user_id.primaryKey, true);
    assert.equal(columns.user_id.onDelete, 'CASCADE');
    assert.equal(columns.token_hash.unique, true);
    await migration.down({ dropTable: async table => assert.equal(table, 'mobile_password_resets') });
    await sequelize.close();
});
