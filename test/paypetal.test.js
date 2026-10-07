'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const { createClient, settings } = require('../src/utils/paypetal');
const { allocateMilestones, providerAmount, assertAgreement, maturityTerms } = require('../src/services/payments/domain');

test('project milestone allocation preserves every minor unit and stable order', () => {
    const result = allocateMilestones('100.01', [
        { id: 'second', name: 'Planting', order: 2, fundReleasePercentage: '33.33' },
        { id: 'first', name: 'Preparation', order: 1, fundReleasePercentage: '33.33' },
        { id: 'third', name: 'Harvest', order: 3, fundReleasePercentage: '33.34' }
    ]);
    assert.deepEqual(result.map(row => row.milestoneId), ['first', 'second', 'third']);
    assert.equal(result.reduce((total, row) => total + row.cents, 0), 10001);
    assert.deepEqual(result.map(row => row.cents), [3333, 3333, 3335]);
    assert.throws(() => allocateMilestones('100', [{ id: 'bad', name: 'Bad', order: 1, fundReleasePercentage: '99' }]), /100%/);
    assert.throws(() => allocateMilestones('0.01', [
        { id: 'a', name: 'A', order: 1, fundReleasePercentage: 50 }, { id: 'b', name: 'B', order: 2, fundReleasePercentage: 50 }
    ]), /too small/);
});

test('ROI-only maturity terms freeze accepted ROI, date and policy', () => {
    const payment = { amount: '250000.00', currency: 'NGN', agreement: { terms: {
        roiPercentage: '42.00', payoutDate: '2027-01-01', maturityReturnMode: 'roi_only'
    } } };
    const terms = maturityTerms(payment, { endDate: '2028-01-01' }, { roiPercentage: '99.00' }, 'principal_plus_roi');
    assert.equal(terms.amount, '105000.00');
    assert.equal(terms.principal, '250000.00');
    assert.equal(terms.roi, '105000.00');
    assert.equal(terms.returnMode, 'roi_only');
    assert.equal(terms.dueAt.toISOString(), '2027-01-01T23:59:59.999Z');
    assert.equal(maturityTerms({ amount: '0.29', currency: 'NGN' }, { endDate: '2027-01-01' }, { roiPercentage: '42' }, 'roi_only').amount, '0.12');
});

test('provider amounts and agreement identity cannot be guessed from unsigned notifications', () => {
    assert.equal(providerAmount('250.29', 'major'), 25029);
    assert.equal(providerAmount('25029', 'minor'), 25029);
    assert.throws(() => providerAmount('250.29', 'minor'));
    const record = { id: 'saved-id', kind: 'project', reference: 'saved-ref', amount: '100.00', currency: 'NGN', counterparty: 'farmer' };
    const remote = { reference: record.reference, amount: 100, currency: 'NGN', receiverCustomer: { customerId: 'farmer' }, metadata: { smileAgreementId: record.id } };
    assert.equal(assertAgreement(record, remote), remote);
    for (const change of [{ amount: 99 }, { currency: 'USD' }, { reference: 'spoofed' }, { receiverCustomer: { customerId: 'attacker' } }, { metadata: {} }]) {
        assert.throws(() => assertAgreement(record, { ...remote, ...change }), /does not match/);
    }
});

test('PayPetal client authenticates once, handles both envelopes and reads all payout pages', async () => {
    const calls = [];
    const client = createClient({ getSettings: () => ({ baseUrl: 'https://sandbox.paypetalhq.xyz', secretKey: 'fake-secret', appId: 'fake-app', timeoutMs: 20000 }),
        transport: async options => {
            calls.push(options);
            if (options.url.endsWith('/api/auth/login')) return { status: 200, data: JSON.stringify({ status: true, dataResponse: { accessToken: 'fake-token', expireAt: '2099-01-01' } }) };
            if (options.url.includes('payout?page=')) {
                const page = new URL(options.url).searchParams.get('page');
                return { status: 200, data: { status: 'success', responseData: { content: [{ customerId: `customer-${page}` }], totalPages: 2 } } };
            }
            return { status: 200, data: { status: 'success', responseData: [] } };
        } });
    await Promise.all([client.banks(), client.subwallets()]);
    assert.equal(calls.filter(call => call.url.endsWith('/api/auth/login')).length, 1);
    assert.equal(calls[0].data.base64Hashed, Buffer.from('fake-secret:fake-app').toString('base64'));
    assert.equal(calls[1].headers.Authorization, 'Bearer fake-token');
    assert.deepEqual(await client.payoutAccounts('customer-2'), [{ customerId: 'customer-1' }, { customerId: 'customer-2' }]);
});

test('creation network timeout is marked uncertain and is not automatically replayed by the HTTP client', async () => {
    let creations = 0;
    const client = createClient({ getSettings: () => ({ baseUrl: 'https://sandbox.paypetalhq.xyz', secretKey: 'fake', appId: 'fake' }),
        transport: async options => {
            if (options.url.endsWith('/api/auth/login')) return { status: 200, data: { status: true, dataResponse: { accessToken: 'fake', expireAt: '2099-01-01' } } };
            creations++;
            throw new Error('network timeout');
        } });
    await assert.rejects(client.createAgreement({ referenceId: 'persisted-reference' }), error => error.uncertain === true);
    assert.equal(creations, 1);
});

test('provider business rejection preserves its documented reconciliation error code', async () => {
    const client = createClient({ getSettings: () => ({ baseUrl: 'https://sandbox.paypetalhq.xyz', secretKey: 'fake', appId: 'fake' }),
        transport: async options => options.url.endsWith('/api/auth/login')
            ? { status: 200, data: { status: true, dataResponse: { accessToken: 'fake', expireAt: '2099-01-01' } } }
            : { status: 400, data: { status: 'error', responseData: { code: 'agreement_not_found' } } } });
    await assert.rejects(client.agreement('missing'), error => error.code === 'agreement_not_found' && !error.uncertain);
});

test('configuration defaults to disabled sandbox integration with ROI-only payouts', () => {
    const config = settings({});
    assert.equal(config.enabled, false);
    assert.equal(config.provider, 'paystack');
    assert.equal(config.returnMode, 'roi_only');
    assert.equal(config.baseUrl, 'https://sandbox.paypetalhq.xyz');
    assert.throws(() => settings({ PAYPETAL_BASE_URL: 'https://untrusted.example' }), /host/);
});

test('approved milestones may await bank payment but completed milestones must remain approved', async () => {
    const sequelize = new Sequelize('postgres://fake:fake@localhost/test', { logging: false });
    const model = require('../src/database/models/UserFarmMilestone')(sequelize);
    const valid = { userFarmId: '11111111-1111-4111-8111-111111111111',
        userFarmInvestmentId: '22222222-2222-4222-8222-222222222222',
        investmentMilestoneId: '33333333-3333-4333-8333-333333333333', name: 'Planting',
        fundReleasePercentage: 50, reviewStatus: 'approved', fundingStatus: 'processing_funding', isCompleted: false };
    await model.build(valid).validate();
    await assert.rejects(model.build({ ...valid, fundingStatus: 'completed' }).validate());
    await assert.rejects(model.build({ ...valid, reviewStatus: 'pending', fundingStatus: 'completed', isCompleted: true }).validate());
    await sequelize.close();
});
