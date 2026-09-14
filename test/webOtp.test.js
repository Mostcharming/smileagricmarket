'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function setup() {
    const accounts = [];
    const rows = [];
    const notifications = [];
    const tokens = [];
    let code = 123450;
    const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
    const record = values => ({ ...values, async update(update) { Object.assign(this, update); } });
    const models = {
        User: {
            async findOne({ where }) { return accounts.find(row => matches(row, where)) || null; },
            async create(values) {
                const user = record({ id: `user-${accounts.length}`, ...values });
                accounts.push(user);
                return user;
            }
        },
        TempOtp: {
            async findOne({ where }) { return rows.find(row => matches(row, where)) || null; },
            async create(values) { const row = record(values); rows.push(row); return row; },
            async destroy({ where }) {
                let count = 0;
                for (let i = rows.length - 1; i >= 0; i--) {
                    if (matches(rows[i], where)) { rows.splice(i, 1); count++; }
                }
                return count;
            }
        },
        KYC: { async findOne() { return null; } }
    };
    const filename = path.resolve(__dirname, '../src/modules/web/auth/controller.js');
    const localRequire = createRequire(filename);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, console,
        require(name) {
            if (name === '../../../database') return { sequelize: {} };
            if (name === '../../../database/models') return () => models;
            if (name === '../../../utils/verificationCode') return () => String(++code);
            if (name === '../../../utils/notify') return async (...args) => { notifications.push(args); };
            if (name === '../../../middlewares/common/security') return { signToken(user) {
                tokens.push({ ...user });
                return `token-${tokens.length}`;
            } };
            return localRequire(name);
        }
    }, { filename });
    const res = {
        success: (data, message) => ({ status: 200, data, message }),
        fail: (message, status) => ({ status, message })
    };
    return { accounts, rows, notifications, tokens, models,
        call: (handler, body, user) => module.exports[handler]({ body, user }, res),
        lastOtp: () => notifications.at(-1)[3].otp
    };
}

for (const identity of [{ email: 'john@example.com' }, { phoneNumber: '08012345678' }]) {
    const email = Boolean(identity.email);
    test(`${email ? 'email' : 'phone'} signup completes request, resend, verify, profile and password`, async () => {
        const c = setup();
        assert.equal((await c.call('requestOtp', identity)).status, 200);
        const oldCode = c.lastOtp();
        assert.equal(c.notifications.at(-1)[2], email ? 'EMAIL_OTP_TEMPLATE' : 'SMS_OTP_TEMPLATE');
        assert.equal(c.notifications.at(-1)[4][0], email ? 'email' : 'sms');
        assert.equal(c.notifications.at(-1)[0][email ? 'email' : 'phoneNumber'], Object.values(identity)[0]);
        assert.equal((await c.call('resendOtp', identity)).status, 200);
        assert.equal(c.rows.length, 1);
        assert.equal((await c.call('verifyOtp', { ...identity, otp: oldCode })).status, 400);
        const otp = c.lastOtp();
        const verified = await c.call('verifyOtp', { ...identity, otp });
        assert.equal(verified.status, 200);
        assert.equal(verified.data.isNewUser, true);
        const signupUser = c.tokens.at(-1);
        assert.equal(signupUser.isSignupInProgress, true);
        assert.equal(signupUser[email ? 'email' : 'phoneNumber'], Object.values(identity)[0]);
        assert.equal((await c.call('verifyOtp', { ...identity, otp })).status, 404);
        assert.equal((await c.call('completeProfile', { fullName: 'John Doe' }, signupUser)).status, 200);
        const registered = await c.call('setPassword', {
            password: 'Password123!', passwordConfirmation: 'Password123!', fullName: 'John Doe'
        }, signupUser);
        assert.equal(registered.status, 200);
        assert.equal(c.accounts[0].isPhoneVerified, !email);
        assert.equal(c.accounts[0].phoneNumber, identity.phoneNumber || null);
        assert.equal(c.accounts[0].email, identity.email || null);
        assert.ok(await require('bcrypt').compare('Password123!', c.accounts[0].password));
        if (email) assert.equal(c.notifications.at(-1)[2], 'WELCOME_EMAIL_TEMPLATE');
        assert.equal((await c.call('requestOtp', identity)).status, 409);
    });
}

test('email login uses a separate challenge and does not verify or consume a phone OTP', async () => {
    const c = setup();
    const identity = { email: 'john@example.com' };
    const user = await c.models.User.create({ ...identity, phoneNumber: '08012345678', otp: '111222', isPhoneVerified: false });
    assert.equal((await c.call('resendOtp', identity)).status, 200);
    assert.equal((await c.call('verifyOtp', { ...identity, otp: user.otp })).status, 400);
    assert.equal((await c.call('verifyOtp', { phoneNumber: user.phoneNumber, otp: c.lastOtp() })).status, 400);
    const verified = await c.call('verifyOtp', { ...identity, otp: c.lastOtp() });
    assert.equal(verified.status, 200);
    assert.equal(verified.data.isNewUser, false);
    assert.equal(verified.data.userId, user.id);
    assert.equal(user.isPhoneVerified, false);
    assert.equal(user.otp, '111222');
    assert.equal((await c.call('verifyOtp', { ...identity, otp: c.lastOtp() })).status, 404);
    assert.equal((await c.call('resendOtp', { phoneNumber: user.phoneNumber })).status, 200);
    assert.equal((await c.call('verifyOtp', { phoneNumber: user.phoneNumber, otp: c.lastOtp() })).status, 200);
    assert.equal(user.isPhoneVerified, true);
    assert.equal(user.otp, null);
});

test('email codes expire, reject the SMS override and are consumed once under concurrent verification', async () => {
    const c = setup();
    const identity = { email: 'john@example.com' };
    await c.call('requestOtp', identity);
    assert.equal((await c.call('verifyOtp', { ...identity, otp: '777666' })).status, 400);
    c.rows[0].otpExpiry = new Date(Date.now() - 1000);
    assert.equal((await c.call('verifyOtp', { ...identity, otp: c.lastOtp() })).status, 400);
    await c.call('resendOtp', identity);
    const results = await Promise.all([1, 2].map(() => c.call('verifyOtp', { ...identity, otp: c.lastOtp() })));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 404]);
});

test('identifier validation, normalization and phone precedence', async () => {
    const c = setup();
    for (const handler of ['requestOtp', 'resendOtp', 'verifyOtp']) {
        for (const body of [undefined, null, {}, { phoneNumber: {} }, { email: [] }, { email: ' ' }, { email: 'invalid' }]) {
            assert.equal((await c.call(handler, body)).status, 400);
        }
    }
    assert.equal(c.rows.length, 0);
    await c.call('requestOtp', { email: ' John@Example.COM ' });
    assert.equal(c.rows[0].email, 'john@example.com');
    assert.equal((await c.call('verifyOtp', { email: ' JOHN@example.com ', otp: c.lastOtp() })).status, 200);
    await c.call('requestOtp', { email: 'john@example.com', phoneNumber: '08012345678' });
    assert.equal(c.notifications.at(-1)[4][0], 'sms');
    assert.equal(c.rows[0].email, undefined);
    for (const otp of [null, 123456, {}, '123', 'abcdef']) {
        assert.equal((await c.call('verifyOtp', { email: 'john@example.com', otp })).status, 400);
    }
});

test('email signup cannot replace the verified email through profile or password bodies', async () => {
    const c = setup();
    const user = { email: 'verified@example.com', isSignupInProgress: true };
    for (const handler of ['completeProfile', 'setPassword']) {
        const body = { email: 'other@example.com', password: 'Password123!', passwordConfirmation: 'Password123!' };
        assert.equal((await c.call(handler, body, user)).status, 400);
        assert.equal((await c.call(handler, body)).status, 401);
    }
    assert.equal(c.accounts.length, 0);
});

test('Swagger exposes both identifiers, request examples and signup requirements', () => {
    const spec = require('../src/config/swagger');
    for (const endpoint of ['request-otp', 'resend-otp', 'verify-otp']) {
        const operation = spec.paths[`/web/auth/${endpoint}`].post;
        const media = operation.requestBody.content['application/json'];
        assert.equal(media.schema.properties.email.format, 'email');
        assert.deepEqual(media.schema.anyOf, [{ required: ['phoneNumber'] }, { required: ['email'] }]);
        assert.ok(media.examples.email.value.email);
        assert.ok(media.examples.phone.value.phoneNumber);
        if (endpoint === 'verify-otp') {
            assert.deepEqual(media.schema.required, ['otp']);
            assert.ok(media.examples.email.value.otp);
        }
    }
    assert.ok(spec.paths['/web/auth/request-otp'].post.responses['409']);
    assert.match(spec.paths['/web/auth/set-password'].post.description, /no phone number is required/);
});

test('OTP email renders the code, expiry and escaped dynamic content in the branded template', async () => {
    const Email = require('../src/utils/components/notify/subComponents/Email');
    const { renderEmailTemplate } = require('../src/utils/emailTemplateRenderer');
    const email = new Email({}, { email: 'john@example.com', fullName: '<John>' });
    email.templateName = 'EMAIL_OTP_TEMPLATE';
    email.shortCodes = { otp: '123456', expiryTime: '10 minutes' };
    const fallbackBody = await email.getMessage();
    assert.match(fallbackBody, /123456/);
    assert.match(email.subject, /Verification Code/);
    const html = renderEmailTemplate(email.templateName, {
        user: email.user, shortCodes: email.shortCodes, subject: email.subject, fallbackBody
    });
    assert.match(html, /123456/);
    assert.match(html, /10 minutes/);
    assert.match(html, /&lt;John&gt;/);
    assert.doesNotMatch(html, /\{\{[^}]+\}\}/);
    assert.match(renderEmailTemplate(email.templateName, { shortCodes: { otp: '<script>' } }), /&lt;script&gt;/);
});
