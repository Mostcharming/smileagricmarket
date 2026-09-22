'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const express = require('express');
const { Op, Sequelize } = require('sequelize');
const {
    moneyCents, buildInvestmentQuote, buildInvestmentAgreement,
    acceptInvestmentAgreement
} = require('../src/utils/investmentAgreement');

const IDS = {
    investor: '11111111-1111-4111-8111-111111111111',
    farm: '22222222-2222-4222-8222-222222222222',
    project: '33333333-3333-4333-8333-333333333333',
    template: '44444444-4444-4444-8444-444444444444',
    owner: '55555555-5555-4555-8555-555555555555',
    category: '66666666-6666-4666-8666-666666666666'
};

function fixtures() {
    return {
        farm: { id: IDS.farm, userId: IDS.owner, name: 'Greenfield Cassava Cluster', isActive: true, verificationStatus: 'approved', Documents: [], User: { id: IDS.owner, fullName: 'Farm Owner' } },
        project: { id: IDS.project, userFarmId: IDS.farm, investmentId: IDS.template, farmCategoryId: IDS.category,
            isActive: true, expectedInvestment: '1000000.00', investmentReceived: '0.00', investmentStatus: 'not_started',
            startDate: '2099-01-01', endDate: '2100-01-01', currency: 'NGN', ProjectMilestones: [], Payments: [] },
        template: { id: IDS.template, name: 'Cassava', farmCategoryId: IDS.category, isActive: true, investmentMinGoal: '50000.00', investmentMaxGoal: '1000000.00',
            fundingMinGoal: '100000.00', fundingMaxGoal: '1000000.00', roiPercentage: '42.00', durationValue: 12, durationUnit: 'months', riskLevel: 'low', currency: 'NGN' }
    };
}

test('calculator computes principal, profit and total without trusting client ROI or duration', () => {
    const input = fixtures();
    const quote = buildInvestmentQuote({ ...input, amount: 250000 });
    assert.equal(quote.expectedProfit, 105000);
    assert.equal(quote.totalReturn, 355000);
    assert.equal(quote.payoutDate, input.project.endDate);
    assert.equal(quote.durationEditable, false);
    assert.equal(moneyCents('0.29'), 29);
    assert.equal(moneyCents('9999999999999.99'), 999999999999999);
    for (const amount of [-1, 0, '1e5', true, {}, '0.001', 'Infinity', '9007199254740992']) {
        assert.throws(() => buildInvestmentQuote({ ...input, amount }));
    }
    input.template.investmentMinGoal = '0.01';
    assert.equal(buildInvestmentQuote({ ...input, amount: '0.29' }).expectedProfit, 0.12);
});

test('calculator respects pending reservations, minimums, maximums, and final small balance', () => {
    const input = fixtures();
    assert.throws(() => buildInvestmentQuote({ ...input, amount: 49999 }), /between/);
    assert.throws(() => buildInvestmentQuote({ ...input, amount: 250000, pendingAmount: 900000 }), /between/);
    assert.throws(() => buildInvestmentQuote({ ...input, pendingAmount: 1000000 }), /no unreserved/);
    const quote = buildInvestmentQuote({ ...input, amount: 25000, pendingAmount: 975000 });
    assert.deepEqual(quote.limits, { minimumAmount: 25000, maximumAmount: 25000, remainingFunding: 25000 });
    assert.throws(() => buildInvestmentQuote({ ...input, amount: 10000, pendingAmount: 975000 }), /between/);
    input.project.investmentStatus = 'completed';
    assert.throws(() => buildInvestmentQuote({ ...input, amount: 250000 }), /not available/);
});

test('agreement version binds the amount and project terms, and requires three explicit booleans', () => {
    const input = fixtures();
    const review = buildInvestmentAgreement(buildInvestmentQuote({ ...input, amount: 250000 }));
    const acceptance = { version: review.version, risksUnderstood: true, termsAccepted: true, fundsLockedUntilMaturity: true };
    const accepted = acceptInvestmentAgreement(review, acceptance, IDS.investor);
    assert.equal(accepted.acceptedBy, IDS.investor);
    assert.ok(accepted.acceptedAt);
    for (const key of ['risksUnderstood', 'termsAccepted', 'fundsLockedUntilMaturity']) {
        for (const value of [false, 'true', 1, undefined]) {
            assert.throws(() => acceptInvestmentAgreement(review, { ...acceptance, [key]: value }, IDS.investor), /all three/);
        }
    }
    const changedAmount = buildInvestmentAgreement(buildInvestmentQuote({ ...input, amount: 300000 }));
    assert.throws(() => acceptInvestmentAgreement(changedAmount, acceptance, IDS.investor), /terms have changed/);
    input.template.roiPercentage = '43.00';
    const changedRoi = buildInvestmentAgreement(buildInvestmentQuote({ ...input, amount: 250000 }));
    assert.notEqual(changedRoi.version, review.version);
    input.template.roiPercentage = '42.00';
    const changedAvailability = buildInvestmentAgreement(buildInvestmentQuote({ ...input, amount: 250000, pendingAmount: 100000 }));
    assert.equal(changedAvailability.version, review.version);
});

// Load real routes/controllers/security in an isolated module graph. Only database,
// Paystack, and unrelated auth/KYC routers are stubbed; no external services run.
async function setup(t) {
    const { farm, project, template } = fixtures();
    const rows = [];
    const calls = { initialize: 0, verify: 0 };
    const state = { approvedKyc: true, email: 'investor@example.com', gatewayStatus: 'success', gatewayAmount: null, ownerVerified: true };
    project.InvestmentTemplate = template;
    farm.InvestmentProjects = [project];
    project.update = async values => Object.assign(project, values);
    let queue = Promise.resolve();
    const sequelize = {
        literal: value => value,
        transaction(callback) {
            const result = queue.then(() => callback({ LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } }));
            queue = result.catch(() => {});
            return result;
        }
    };
    const matches = (row, where) => Object.entries(where).every(([key, value]) =>
        value && typeof value === 'object' && value[Op.in] ? value[Op.in].includes(row[key]) : row[key] === value);
    const models = {
        User: { findByPk: async id => ({ id, email: state.email, fullName: 'Investor' }) },
        KYC: { findOne: async () => state.approvedKyc ? { id: 'kyc' } : null },
        UserFarm: {
            findOne: async ({ where }) => where.id === farm.id && farm.isActive && farm.verificationStatus === 'approved' && state.ownerVerified ? farm : null,
            findAndCountAll: async () => ({ count: 1, rows: [farm] })
        },
        UserFarmInvestment: {
            findOne: async ({ where }) => matches(project, where) ? project : null,
            findByPk: async id => id === project.id ? project : null,
            findAll: async options => { calls.projectQuery = options; return [{ id: project.id, userFarmId: farm.id }]; }
        },
        Investment: { findOne: async ({ where }) => matches(template, where) ? template : null },
        InvestmentPayment: {
            findOne: async ({ where }) => rows.find(row => matches(row, where)) || null,
            findByPk: async id => rows.find(row => row.id === id) || null,
            sum: async (field, { where }) => rows.filter(row => matches(row, where)).reduce((sum, row) => sum + Number(row[field]), 0),
            findOrCreate: async ({ where, defaults }) => {
                const found = rows.find(row => matches(row, where));
                if (found) return [found, false];
                return [await models.InvestmentPayment.create(defaults), true];
            },
            create: async values => {
                const row = { id: randomUUID(), ...values, createdAt: new Date(), updatedAt: new Date(),
                    async update(update) { Object.assign(this, update); } };
                rows.push(row);
                return row;
            },
            findAll: async ({ where, attributes }) => {
                assert.ok(attributes.includes('agreement'));
                calls.portfolioWhere = where;
                return rows.filter(row => matches(row, where)).map(row => ({ ...row, FarmInvestment: project, InvestmentTemplate: template, Farm: farm }));
            }
        },
        FarmCategory: { findAll: async () => [{ toJSON: () => ({ id: IDS.category, name: 'Cassava', Investments: [template] }) }] },
        FarmDocument: {}, UserFarmMilestone: {}, Milestone: {}, InvestmentMilestone: {}
    };
    class PaystackError extends Error {}
    const gateway = {
        PaystackError, getPaystackConfig: () => ({}),
        initializeTransaction: async input => {
            calls.initialize++;
            return { data: { reference: input.reference, access_code: 'test-access-code', authorization_url: 'https://checkout.paystack.com/test' } };
        },
        verifyTransaction: async reference => {
            calls.verify++;
            const row = rows.find(row => row.reference === reference);
            return { data: { id: '12345678901234567890', reference, amount: state.gatewayAmount ?? Number(row.amount) * 100, currency: row.currency, status: state.gatewayStatus } };
        }
    };
    const src = path.resolve(__dirname, '../src');
    const cache = new Map();
    const load = filename => {
        const absolute = require.resolve(filename);
        if (cache.has(absolute)) return cache.get(absolute).exports;
        const module = { exports: {} };
        cache.set(absolute, module);
        const localRequire = createRequire(absolute);
        vm.runInNewContext(fs.readFileSync(absolute, 'utf8'), {
            module, exports: module.exports, console, Buffer, Date, URL, setTimeout, clearTimeout,
            require: name => {
                const resolved = localRequire.resolve(name);
                if (resolved === path.join(src, 'database/index.js')) return { sequelize };
                if (resolved === path.join(src, 'database/models/index.js')) return () => models;
                if (resolved === path.join(src, 'utils/paystack.js')) return gateway;
                if (resolved === path.join(src, 'config/index.js')) return { jwtSecret: 'unit-test-secret', jwtExpiresIn: '1h' };
                if (['mobile/auth/route.js', 'mobile/kyc/route.js'].some(file => resolved === path.join(src, 'modules', file))) return express.Router();
                return resolved.startsWith(src + path.sep) ? load(resolved) : localRequire(name);
            }
        }, { filename: absolute });
        return module.exports;
    };
    const app = express();
    app.use(express.json());
    app.use('/v1/mobile', load(path.join(src, 'modules/mobile/route.js')));
    const security = load(path.join(src, 'middlewares/common/security.js'));
    app.use('/v1/web/investments',
        require('../src/middlewares/common/responseFormatter').responseFormatter,
        security.securityMiddleware, load(path.join(src, 'modules/web/investments/route.js')));
    const token = security.signToken({ id: IDS.investor });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    async function request(route, { method = 'GET', body, auth = token, key, platform = 'mobile' } = {}) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/${platform}${route}`, {
            method, headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
                ...(body ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
            body: body ? JSON.stringify(body) : undefined
        });
        const isJson = response.headers.get('content-type')?.includes('application/json');
        return { status: response.status, body: isJson ? await response.json() : await response.text(), headers: response.headers };
    }
    const preview = async (amount = 250000) => {
        const result = await request(`/investments/projects/${IDS.project}/agreement?amount=${amount}`);
        assert.equal(result.status, 200, JSON.stringify(result.body));
        return { amount, agreementAcceptance: { version: result.body.data.agreement.version, risksUnderstood: true, termsAccepted: true, fundsLockedUntilMaturity: true } };
    };
    const invest = (body, key = 'mobile-attempt-1') => request(`/investments/${IDS.project}/invest`, { method: 'POST', body, key });
    return { request, preview, invest, rows, calls, state, project, template, farm, models, security };
}

test('mobile investor endpoints require authentication and validate identifiers and filters', async t => {
    const c = await setup(t);
    for (const route of ['/investments', '/portfolio', '/farm-categories', `/investments/projects/${IDS.project}/quote`, `/investments/payments/${IDS.project}`]) {
        assert.equal((await c.request(route, { auth: null })).status, 401);
        assert.equal((await c.request(route, { auth: 'invalid' })).status, 401);
    }
    assert.equal((await c.request('/investments/not-a-uuid')).status, 400);
    assert.equal((await c.request('/investments?riskLevel=invalid')).status, 400);
    assert.equal((await c.request('/investments?minRoi=50&maxRoi=10')).status, 400);
    assert.equal((await c.request('/investments?minInvestment=invalid')).status, 400);
    const list = await c.request('/investments?riskLevel=low&duration=12%20months&minRoi=10&maxRoi=50&minInvestment=50000&maxInvestment=300000');
    assert.equal(list.status, 200, JSON.stringify(list.body));
    const filter = c.calls.projectQuery.include[0].where;
    assert.equal(filter.roiPercentage[Op.gte], 10);
    assert.equal(filter.roiPercentage[Op.lte], 50);
    assert.equal(filter.investmentMinGoal[Op.lte], 300000);
    assert.equal(filter.investmentMaxGoal[Op.gte], 50000);
    assert.equal(filter.durationValue, 12);
    const detail = await c.request(`/investments/${IDS.farm}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.investmentProjects[0].id, IDS.project);
    const categories = await c.request('/farm-categories');
    assert.equal(categories.status, 200);
    assert.equal(categories.body.data.categories[0].investmentTemplate.id, IDS.template);
});

test('mobile preview, checkout, verification, confirmation and download share one accepted snapshot', async t => {
    const c = await setup(t);
    const body = await c.preview();
    const initialized = await c.invest(body);
    assert.equal(initialized.status, 201, JSON.stringify(initialized.body));
    assert.equal(c.rows.length, 1);
    assert.equal(c.project.investmentReceived, '0.00');
    const transactionId = initialized.body.data.transactionId;
    assert.equal(initialized.body.data.gateway.accessCode, 'test-access-code');
    assert.equal((await c.invest(body)).status, 200);
    assert.equal(c.calls.initialize, 1);
    const pending = await c.request(`/investments/payments/${transactionId}`);
    assert.equal(pending.body.data.confirmed, false);
    // Later template edits cannot rewrite the accepted terms or portfolio return.
    c.template.roiPercentage = '90.00';
    const results = await Promise.all([1, 2].map(() => c.request(`/investments/payments/${transactionId}/verify`, { method: 'POST' })));
    assert.ok(results.every(result => result.status === 200), JSON.stringify(results));
    assert.equal(results.filter(result => result.body.data.credited).length, 1);
    assert.equal(c.project.investmentReceived, 250000);
    const confirmed = await c.request(`/investments/payments/${transactionId}`);
    assert.equal(confirmed.body.data.confirmed, true);
    assert.equal(confirmed.body.data.totalReturn, 355000);
    assert.equal(confirmed.body.data.roiPercentage, 42);
    const agreement = await c.request(`/investments/payments/${transactionId}/agreement`);
    assert.equal(agreement.body.data.agreement.acceptedBy, IDS.investor);
    assert.equal(agreement.body.data.agreement.version, body.agreementAcceptance.version);
    const download = await c.request(`/investments/payments/${transactionId}/agreement?download=true`);
    assert.match(download.headers.get('content-disposition'), /attachment; filename=/);
    assert.match(download.body, /NGN 355000\.00/);
    assert.match(download.body, /\[Accepted\]/);
    const portfolio = await c.request('/portfolio');
    assert.equal(portfolio.status, 200, JSON.stringify(portfolio.body));
    assert.equal(c.calls.portfolioWhere.investorId, IDS.investor);
    assert.equal(portfolio.body.data.summary.totalInvested.amount, 250000);
    assert.equal(portfolio.body.data.summary.totalExpectedReturns.amount, 105000);
});

test('checkout rejects absent consent, stale terms, missing KYC/email and own farm', async t => {
    const c = await setup(t);
    const body = await c.preview();
    assert.equal((await c.invest({ amount: 250000 })).status, 400);
    assert.equal((await c.invest(body, '')).status, 400);
    assert.equal((await c.invest({ ...body, agreementAcceptance: { ...body.agreementAcceptance, termsAccepted: 'true' } })).status, 400);
    c.template.roiPercentage = '43.00';
    assert.equal((await c.invest(body)).status, 409);
    c.template.roiPercentage = '42.00';
    c.state.approvedKyc = false;
    assert.equal((await c.invest(body)).status, 403);
    c.state.approvedKyc = true;
    c.state.email = null;
    assert.equal((await c.invest(body)).status, 409);
    c.state.email = 'investor@example.com';
    c.farm.userId = IDS.investor;
    assert.equal((await c.invest(body)).status, 403);
    assert.equal(c.rows.length, 0);
    assert.equal(c.calls.initialize, 0);
});

test('owner-scoped payment and agreement endpoints do not expose or verify another investor payment', async t => {
    const c = await setup(t);
    const result = await c.invest(await c.preview());
    const id = result.body.data.transactionId;
    const auth = c.security.signToken({ id: IDS.owner });
    for (const [suffix, method] of [['', 'GET'], ['/agreement', 'GET'], ['/agreement?download=true', 'GET'], ['/verify', 'POST']]) {
        assert.equal((await c.request(`/investments/payments/${id}${suffix}`, { auth, method })).status, 404);
    }
    assert.equal(c.calls.verify, 0);
    c.state.gatewayAmount = 1;
    assert.equal((await c.request(`/investments/payments/${id}/verify`, { method: 'POST' })).status, 409);
    assert.equal(c.project.investmentReceived, '0.00');
    assert.equal((await c.request(`/investments/payments/${id}`)).body.data.confirmed, false);
});

test('preview rejects unavailable projects, nonverified owners and custom duration', async t => {
    const c = await setup(t);
    const route = `/investments/projects/${IDS.project}/quote?amount=250000`;
    assert.equal((await c.request(route + '&durationValue=24')).status, 400);
    c.state.ownerVerified = false;
    assert.equal((await c.request(route)).status, 404);
    c.state.ownerVerified = true;
    c.project.isActive = false;
    assert.equal((await c.request(route)).status, 404);
    c.project.isActive = true;
    c.project.investmentStatus = 'completed';
    assert.equal((await c.request(route)).status, 409);
});

test('mobile retries cannot reuse an idempotency key for another amount, agreement or currency', async t => {
    const c = await setup(t);
    const body = await c.preview();
    assert.equal((await c.invest(body)).status, 201);
    assert.equal((await c.invest({ ...body, amount: 300000 })).status, 409);
    assert.equal((await c.invest({ ...body, currency: 'USD' })).status, 409);
    assert.equal((await c.invest({ ...body, agreementAcceptance: { ...body.agreementAcceptance, version: 'a'.repeat(64) } })).status, 409);
    assert.equal(c.rows.length, 1);
    assert.equal(c.calls.initialize, 1);
});

test('pending and abandoned Paystack responses never display a confirmed investment', async t => {
    const c = await setup(t);
    const created = await c.invest(await c.preview());
    const id = created.body.data.transactionId;
    for (const status of ['pending', 'abandoned']) {
        c.state.gatewayStatus = status;
        const response = await c.request(`/investments/payments/${id}/verify`, { method: 'POST' });
        assert.equal(response.status, 200);
        assert.equal(response.body.data.credited, false);
        assert.equal((await c.request(`/investments/payments/${id}`)).body.data.confirmed, false);
        assert.equal(c.project.investmentReceived, '0.00');
    }
    assert.equal(c.rows[0].status, 'cancelled');
});

test('web checkout remains compatible without mobile consent and cannot be replayed as a mobile agreement', async t => {
    const c = await setup(t);
    const body = await c.preview();
    const web = await c.request(`/investments/${IDS.project}/invest`, {
        platform: 'web', method: 'POST', body: { amount: 250000 }, key: 'mobile-attempt-1'
    });
    assert.equal(web.status, 201, JSON.stringify(web.body));
    assert.equal(c.rows[0].agreement, null);
    assert.equal((await c.invest(body)).status, 409);
    const legacy = await c.request(`/investments/payments/${web.body.data.transactionId}/agreement`);
    assert.equal(legacy.status, 404);
});

test('agreement migration and Sequelize model agree and permit legacy payments', async () => {
    const migration = require('../src/database/migrations/20260923000000-add-investment-payment-agreement');
    const calls = [];
    await migration.up({ addColumn: async (...args) => calls.push(args) }, Sequelize);
    assert.equal(calls[0][0], 'investment_payments');
    assert.equal(calls[0][1], 'agreement');
    assert.equal(calls[0][2].allowNull, true);
    await migration.down({ removeColumn: async (...args) => calls.push(args) });
    assert.deepEqual(calls[1], ['investment_payments', 'agreement']);
    const sequelize = new Sequelize('postgres://test:test@localhost:5432/test', { logging: false });
    const model = require('../src/database/models/InvestmentPayment')(sequelize);
    assert.equal(model.getAttributes().agreement.type.key, 'JSONB');
    assert.equal(model.getAttributes().agreement.allowNull, true);
    await sequelize.close();
});
