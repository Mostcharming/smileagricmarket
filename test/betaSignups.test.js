'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { Op } = require('sequelize');

function loadController(relativePath, models, notify = async () => ({ sent: true })) {
    const filename = path.resolve(__dirname, relativePath);
    const localRequire = createRequire(filename);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, console,
        require(name) {
            if (name === '../../../database') return { sequelize: {} };
            if (name === '../../../database/models') return () => models;
            if (name === '../../../utils/notify') return notify;
            return localRequire(name);
        }
    }, { filename });
    return module.exports;
}

function response() {
    return {
        headers: {},
        success(data, message, status = 200) { return { status, data, message }; },
        fail(message, status) { return { status, message }; },
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        send(body) { return { status: this.statusCode, body, headers: this.headers }; }
    };
}

const investor = {
    name: 'Ada Okafor', location: 'Lagos, Nigeria', phoneNumber: '+2348012345678',
    email: 'ada@example.com', type: 'investor', investmentTimeline: 'Within 3 months'
};
const farmer = {
    ...investor, type: 'farmer', produce: 'Cassava, maize and tomatoes', investmentTimeline: undefined
};

function setup(notifyResult = { sent: true }) {
    const rows = [];
    const notifications = [];
    const models = { BetaSignup: {
        async findOrCreate({ where, defaults }) {
            const existing = rows.find(row => row.email === where.email);
            if (existing) return [existing, false];
            const row = { id: 'signup-1', ...defaults, async update(values) { Object.assign(this, values); } };
            rows.push(row);
            return [row, true];
        }
    } };
    const controller = loadController('../src/modules/web/betaSignups/controller.js', models, async (...args) => {
        notifications.push(args);
        return notifyResult;
    });
    return { rows, notifications, call: body => controller.createBetaSignup({ body }, response()) };
}

test('investor and farmer signups save contact details and only the relevant answer', async () => {
    for (const body of [investor, farmer]) {
        const c = setup();
        const result = await c.call({ ...body, name: ' Ada   Okafor ', email: ' ADA@Example.COM ' });
        assert.equal(result.status, 201);
        const saved = c.rows[0];
        assert.equal(saved.name, 'Ada Okafor');
        assert.equal(saved.firstName, 'Ada');
        assert.equal(saved.email, 'ada@example.com');
        assert.equal(saved.location, body.location);
        assert.equal(saved.phoneNumber, body.phoneNumber);
        assert.equal(saved.userType, body.type === 'farmer' ? 'farm_owner' : 'investor');
        assert.equal(saved.produce, body.type === 'farmer' ? body.produce : null);
        assert.equal(saved.investmentTimeline, body.type === 'investor' ? body.investmentTimeline : null);
        assert.equal(c.notifications[0][0].fullName, 'Ada Okafor');
        assert.ok(saved.confirmationEmailSentAt);
        assert.equal(result.data.alreadyRegistered, false);
    }
    const c = setup();
    assert.equal((await c.call({ ...farmer, type: 'farm_owner' })).status, 201);
});

test('missing, malformed and oversized required fields fail before saving or sending email', async () => {
    const c = setup();
    for (const base of [investor, farmer]) {
        const answer = base.type === 'investor' ? 'investmentTimeline' : 'produce';
        for (const key of ['name', 'location', 'phoneNumber', 'email', 'type', answer]) {
            for (const value of [undefined, null, '   ', {}, []]) {
                assert.equal((await c.call({ ...base, [key]: value })).status, 400, `${key}: ${value}`);
            }
        }
    }
    for (const [key, value] of [
        ['name', 'a'.repeat(201)], ['location', 'a'.repeat(255)],
        ['phoneNumber', 'call 08012345678'], ['phoneNumber', '123'],
        ['phoneNumber', '1'.repeat(16)], ['phoneNumber', 8012345678],
        ['email', 'invalid'], ['type', 'buyer'], ['investmentTimeline', 'a'.repeat(255)]
    ]) {
        assert.equal((await c.call({ ...investor, [key]: value })).status, 400, key);
    }
    assert.equal((await c.call({ ...farmer, produce: 'a'.repeat(1001) })).status, 400);
    assert.equal(c.rows.length, 0);
    assert.equal(c.notifications.length, 0);
});

test('aliases work and unrelated answers are discarded', async () => {
    const c = setup();
    const { name, phoneNumber, ...body } = investor;
    assert.equal((await c.call({ ...body, fullName: name, phone: phoneNumber, produce: 'Ignored' })).status, 201);
    assert.equal(c.rows[0].name, name);
    assert.equal(c.rows[0].phoneNumber, phoneNumber);
    assert.equal(c.rows[0].produce, null);
});

test('repeat submissions preserve saved details and avoid duplicate confirmation emails', async () => {
    const c = setup();
    await c.call(investor);
    const result = await c.call({ ...investor, name: 'Different name', investmentTimeline: 'Tomorrow' });
    assert.equal(result.status, 200);
    assert.equal(result.data.alreadyRegistered, true);
    assert.equal(c.rows.length, 1);
    assert.equal(c.rows[0].name, investor.name);
    assert.equal(c.rows[0].investmentTimeline, investor.investmentTimeline);
    assert.equal(c.notifications.length, 1);
});

test('email delivery failure does not lose a signup and a repeat can retry the email', async () => {
    const c = setup({ sent: false });
    assert.equal((await c.call(farmer)).status, 201);
    assert.equal(c.rows[0].confirmationEmailSentAt, undefined);
    assert.equal((await c.call(farmer)).status, 200);
    assert.equal(c.rows.length, 1);
    assert.equal(c.notifications.length, 2);
});

test('marketing list, search and CSV include the expanded details and retain CSV escaping', async () => {
    const row = { id: 'signup-1', ...farmer, userType: 'farm_owner', name: '=Ada "Okafor"',
        createdAt: new Date('2026-10-16T10:00:00Z'), investmentTimeline: null };
    const models = { BetaSignup: {
        async findAndCountAll(options) {
            for (const field of ['name', 'location', 'phoneNumber', 'produce', 'investmentTimeline']) {
                assert.ok(options.attributes.includes(field));
                assert.ok(options.where[Op.or].some(condition => field in condition));
            }
            assert.ok(options.where[Op.or].some(condition => condition.userType === 'farm_owner'));
            return { count: 1, rows: [row] };
        },
        async findAll(options) {
            assert.ok(options.attributes.includes('investmentTimeline'));
            return [row];
        }
    } };
    const controller = loadController('../src/modules/web/marketingAdmin/controller.js', models);
    const list = await controller.listBetaSignups({ query: { query: 'farmer' } }, response());
    assert.equal(list.status, 200);
    for (const field of ['name', 'location', 'phoneNumber', 'produce', 'investmentTimeline']) {
        assert.equal(list.data.signups[0][field], row[field]);
    }
    const csv = await controller.downloadBetaSignups({ query: {} }, response());
    assert.equal(csv.status, 200);
    assert.match(csv.body, /name,location,phone_number,produce,investment_timeline/);
    assert.ok(csv.body.includes('"\'=Ada ""Okafor"""'));
    assert.ok(csv.body.includes('"Cassava, maize and tomatoes"'));
    assert.ok(csv.body.includes('"\'+2348012345678"'));
});

test('Swagger gives valid farmer and investor examples with conditional required answers', () => {
    const spec = require('../src/config/swagger');
    const media = spec.paths['/web/beta-signups'].post.requestBody.content['application/json'];
    for (const field of ['name', 'location', 'phoneNumber', 'email', 'type']) {
        assert.ok(media.schema.required.includes(field));
    }
    assert.equal(media.schema.oneOf[0].required[0], 'investmentTimeline');
    assert.equal(media.schema.oneOf[1].required[0], 'produce');
    assert.ok(media.examples.investor.value.investmentTimeline);
    assert.ok(media.examples.farmer.value.produce);
    const listing = spec.paths['/web/marketing-admin/beta-signups'].get;
    const signups = listing.responses['200'].content['application/json'].example.data.signups;
    assert.equal(signups.length, 2);
    for (const signup of signups) {
        for (const field of ['name', 'location', 'phoneNumber', 'email', 'type']) {
            assert.ok(signup[field], field);
        }
        if (signup.type === 'investor') {
            assert.equal(signup.produce, null);
            assert.ok(signup.investmentTimeline);
        } else {
            assert.equal(signup.type, 'farm_owner');
            assert.equal(signup.investmentTimeline, null);
            assert.ok(signup.produce);
        }
    }
    for (const field of ['name', 'location', 'phoneNumber', 'produce', 'investmentTimeline']) {
        assert.equal(spec.components.schemas.BetaSignup.properties[field].nullable, true);
    }
    const csv = spec.paths['/web/marketing-admin/beta-signups/download'].get
        .responses['200'].content['text/csv'].example;
    assert.match(csv, /name,location,phone_number,produce,investment_timeline/);
});
