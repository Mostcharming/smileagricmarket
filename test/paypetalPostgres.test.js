'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const { Sequelize } = require('sequelize');
const { createPaymentService } = require('../src/services/payments/service');
const { PaypetalError } = require('../src/utils/paypetal');

const connection = process.env.PAYMENT_TEST_DATABASE_URL;

test('real PostgreSQL: shared-account deposits, durable releases, ROI only, and recovery', { skip: !connection }, async t => {
    const url = new URL(connection);
    assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Only a disposable local database is allowed');
    assert.equal(url.pathname, '/smile_paypetal_test', 'Refusing to modify another database');
    const sequelize = new Sequelize(connection, { logging: false });
    t.after(async () => sequelize.close());
    const models = require('../src/database/models')(sequelize);
    await sequelize.sync({ force: true });
    const q = sequelize.getQueryInterface();
    const tables = require('../src/database/paymentTables')(Sequelize);
    for (const definition of Object.values(tables).reverse()) await q.dropTable(definition.table);
    await sequelize.query(`ALTER TABLE user_farm_milestones ADD CONSTRAINT user_farm_milestone_review_completion_check CHECK (
        (review_status = 'approved' AND funding_status = 'completed' AND is_completed = TRUE)
        OR (review_status <> 'approved' AND funding_status <> 'completed' AND is_completed = FALSE))`);
    const migration = require('../src/database/migrations/20261007000000-create-paypetal-escrow');
    await migration.up(q, Sequelize);
    await migration.down(q);
    await migration.up(q, Sequelize);

    const owner = await models.User.create({ fullName: 'Farmer', email: 'farmer@example.test', phoneNumber: '+2348010000001' });
    const investor = await models.User.create({ fullName: 'Investor', email: 'investor@example.test', phoneNumber: '+2348010000002' });
    const admin = await models.Admin.create({ fullName: 'Admin', email: 'admin@example.test', password: 'fake-password' });
    for (const user of [owner, investor]) await models.KYC.create({ userId: user.id, identificationType: 'national_id', identificationNumber: user.id, status: 'approved' });
    const category = await models.FarmCategory.create({ name: 'Test category' });
    const template = await models.Investment.create({ farmCategoryId: category.id, name: 'Cassava', roiPercentage: 20,
        durationValue: 12, durationUnit: 'months', fundingMinGoal: 100, fundingMaxGoal: 1000,
        investmentMinGoal: 1, investmentMaxGoal: 1000, currency: 'NGN' });
    const farm = await models.UserFarm.create({ userId: owner.id, name: 'Test farm', verificationStatus: 'approved' });
    const project = await models.UserFarmInvestment.create({ userFarmId: farm.id, farmCategoryId: category.id, investmentId: template.id,
        expectedInvestment: '1000.01', investmentPending: '1000.01', currency: 'NGN', startDate: '2026-01-01', endDate: '2026-12-31' });
    const milestones = [];
    for (let index = 0; index < 2; index++) {
        const source = await models.InvestmentMilestone.create({ investmentId: template.id, name: `Stage ${index + 1}`, order: index + 1, fundReleasePercentage: 50 });
        milestones.push(await models.UserFarmMilestone.create({ userFarmId: farm.id, userFarmInvestmentId: project.id,
            investmentMilestoneId: source.id, name: source.name, order: source.order, fundReleasePercentage: 50, amount: '500.00' }));
    }
    let time = new Date('2026-10-07T12:00:00Z');
    const wallets = [{ id: 'repayment-wallet', name: 'ROI account', currency: 'NGN', accountBalance: '10000.00' }];
    const customers = [];
    const accounts = [];
    const agreements = new Map();
    const events = { wallets: 0, agreements: 0, releases: 0, payouts: 0 };
    let timeoutAfterCreation = false;
    const provider = {
        subwallets: async () => ({ data: wallets }),
        createSubwallet: async input => {
            events.wallets++;
            const wallet = { id: randomUUID(), name: input.name, currency: input.currency, accountBalance: '0.00',
                bankName: 'Test Bank', accountNumber: '1234567890', accountName: input.name };
            wallets.push(wallet);
            return { data: wallet };
        },
        customers: async () => customers,
        createCustomer: async input => { const customer = { customerId: randomUUID(), ...input }; customers.push(customer); return customer; },
        validateAccount: async input => ({ ...input, accountName: input.accountNumber === '0123456789' ? 'FARMER' : 'INVESTOR' }),
        payoutAccounts: async () => accounts,
        addPayoutAccount: async (customerId, input) => { accounts.push({ customerId, ...input }); },
        updatePayoutAccount: async (customerId, input) => Object.assign(accounts.find(row => row.customerId === customerId), input),
        agreement: async reference => {
            const row = agreements.get(reference);
            if (!row) throw new PaypetalError('Not found', { code: 'agreement_not_found' });
            return row;
        },
        createAgreement: async input => {
            events.agreements++;
            const wallet = wallets.find(row => row.id === input.initiator);
            assert.ok(wallet, 'The initiator must be the single project or merchant repayment wallet');
            const value = Number(input.amount) / 100;
            assert.ok(Number(wallet.accountBalance) >= value);
            wallet.accountBalance = (Number(wallet.accountBalance) - value).toFixed(2);
            const row = { reference: input.referenceId, transactionId: randomUUID(), amount: value.toFixed(2), currency: input.currency,
                receiverCustomer: { customerId: input.counterparty }, metadata: input.metadata,
                status: 'ONGOING', payoutStatus: 'NONE', refundStatus: 'NONE',
                milestones: (input.milestone?.milestones || []).map((item, index) => ({ id: randomUUID(),
                    sequence: index + 1, description: item.description, amount: (Number(item.amount) / 100).toFixed(2), status: 'PENDING' })) };
            agreements.set(row.reference, row);
            if (timeoutAfterCreation) { timeoutAfterCreation = false; throw new PaypetalError('Timeout', { uncertain: true }); }
            return { data: row };
        },
        milestones: async reference => agreements.get(reference).milestones,
        releaseMilestone: async (reference, id) => {
            events.releases++;
            const row = agreements.get(reference).milestones.find(item => item.id === id);
            assert.equal(row.status, 'PENDING');
            row.status = 'PROCESSING';
            return { milestone: row };
        },
        completeAgreement: async reference => { events.payouts++; agreements.get(reference).payoutStatus = 'PENDING'; }
    };
    const config = { responseUnit: 'major', returnMode: 'roi_only', depositReconciliation: 'manual',
        repaymentSubwalletId: 'repayment-wallet', websiteUrl: 'https://example.test' };
    const service = createPaymentService({ sequelize, models, provider, getSettings: () => config, now: () => time });

    await t.test('account names are confirmed and provider registration finishes before wallet verification', async () => {
        await assert.rejects(service.setupAccount(owner.id, { bankCode: '058', accountNumber: '0123456789', accountName: 'WRONG' }), /Confirm/);
        for (const [user, accountNumber, accountName] of [[owner, '0123456789', 'FARMER'], [investor, '1123456789', 'INVESTOR']]) {
            const profile = await service.setupAccount(user.id, { bankCode: '058', accountNumber, accountName });
            assert.equal(profile.status, 'pending');
            await service.runNextJob();
            await profile.reload();
            assert.equal(profile.status, 'verified');
            assert.equal((await models.Wallet.findOne({ where: { userId: user.id } })).isVerified, true);
        }
    });

    let escrow;
    await t.test('project provisioning creates exactly one physical shared account and survives duplicate jobs', async () => {
        escrow = await sequelize.transaction(transaction => service.ensureProject(project, owner.id, transaction));
        await service.runNextJob();
        await escrow.reload();
        assert.ok(escrow.providerWalletId);
        await service.provisionProject(escrow.id);
        assert.equal(events.wallets, 1);
        assert.equal(escrow.status, 'collecting');
    });

    const payments = [];
    await t.test('real investment controller returns shared bank instructions, requires idempotency, and never calls Paystack', async t => {
        const previous = process.env.PAYMENTS_PROVIDER;
        process.env.PAYMENTS_PROVIDER = 'paypetal';
        t.after(() => { if (previous === undefined) delete process.env.PAYMENTS_PROVIDER; else process.env.PAYMENTS_PROVIDER = previous; });
        const filename = path.resolve(__dirname, '../src/modules/web/investments/controller.js');
        const localRequire = createRequire(filename);
        const module = { exports: {} };
        vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, console,
            require: name => {
                if (name === '../../../database') return { sequelize };
                if (name === '../../../database/models') return () => models;
                if (name === '../../../services/payments/service') return { getPaymentService: () => service };
                if (name === '../../../utils/paypetal') return { requireEnabled: () => config };
                if (name === 'node:process') return { env: { PAYMENTS_PROVIDER: 'paypetal' } };
                if (name === './paymentService') return { majorAmountToSubunit: value => Math.round(Number(value) * 100),
                    settlePaystackPayment: () => { throw new Error('Paystack settlement must not run'); } };
                return localRequire(name);
            } }, { filename });
        const res = { success: (data, message, status = 200) => ({ status, data }), fail: (message, status) => ({ status, message }) };
        for (let index = 0; index < 2; index++) {
            const req = { user: { id: investor.id }, params: { investmentProjectId: project.id },
                body: { amount: index === 0 ? '600.01' : '400.00', currency: 'NGN' },
                headers: { 'idempotency-key': randomUUID() }, get(name) { return this.headers[name.toLowerCase()]; } };
            const result = await module.exports.investInFarm(req, res);
            assert.equal(result.status, 201, result.message);
            assert.equal(result.data.gateway.provider, 'paypetal');
            assert.equal(result.data.gateway.accountNumber, escrow.accountNumber);
            assert.equal(result.data.payment.status, 'pending');
            const retry = await module.exports.investInFarm(req, res);
            assert.equal(retry.status, 200, retry.message);
            assert.equal(retry.data.transactionId, result.data.transactionId);
            const payment = await models.InvestmentPayment.findByPk(result.data.transactionId);
            assert.equal(payment.agreement.terms.maturityReturnMode, 'roi_only');
            payments.push(payment);
        }
        assert.equal(await models.InvestmentPayment.count(), 2);
        const result = await module.exports.verifyInvestmentPayment({ user: { id: investor.id }, params: { transactionId: payments[0].id } }, res);
        assert.equal(result.status, 200);
        assert.equal(result.data.confirmation, 'admin_statement_reconciliation');
        assert.equal(result.data.payment.status, 'pending');
    });
    const deposit = (index, extra = {}) => ({ providerTransactionId: `bank-deposit-${index}`, evidenceReference: `statement:row-${index}`,
        receivedAt: '2026-10-07T11:00:00Z', amount: payments[index].amount, currency: 'NGN', ...extra });

    await t.test('shared balance never auto-credits an investor; statement confirmation is exact and idempotent', async () => {
        const wallet = wallets.find(row => row.id === escrow.providerWalletId);
        wallet.accountBalance = '1000.01';
        const instructions = await service.investmentInstructions(payments[0]);
        assert.equal(instructions.accountNumber, escrow.accountNumber);
        assert.equal(instructions.confirmation, 'admin_statement_reconciliation');
        await payments[0].reload();
        assert.equal(payments[0].status, 'pending');
        await assert.rejects(service.recordDeposit(payments[0].id, deposit(0, { amount: 600 }), admin.id), /does not match/);
        const results = await Promise.all([service.recordDeposit(payments[0].id, deposit(0), admin.id), service.recordDeposit(payments[0].id, deposit(0), admin.id)]);
        assert.equal(results[0].id, results[1].id);
        assert.equal(await models.PaymentDeposit.count(), 1);
        await project.reload();
        assert.equal(project.investmentReceived, '600.01');
        assert.equal(await models.InvestorPayout.count(), 1);
        await assert.rejects(service.recordDeposit(payments[1].id, deposit(1, { providerTransactionId: 'bank-deposit-0' }), admin.id));
        await payments[1].reload();
        assert.equal(payments[1].status, 'pending');
        await service.recordDeposit(payments[1].id, deposit(1), admin.id);
        await project.reload();
        assert.equal(project.investmentReceived, '1000.01');
        assert.equal(await models.PaymentDeposit.count(), 2);
    });

    await t.test('wallet-funded project escrow creation recovers a timeout without creating or debiting twice', async () => {
        timeoutAfterCreation = true;
        await service.runNextJob();
        const job = await models.PaymentJob.findOne({ where: { key: `activate_project:${escrow.id}` } });
        assert.equal(job.status, 'retry');
        await job.update({ availableAt: time });
        await Promise.all([service.runNextJob(), service.runNextJob()]);
        await escrow.reload();
        assert.equal(escrow.status, 'held');
        assert.equal(events.agreements, 1);
        assert.equal(await models.EscrowRelease.count(), 2);
        assert.equal(wallets.find(row => row.id === escrow.providerWalletId).accountBalance, '0.00');
        assert.equal(agreements.get(escrow.reference).milestones.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0), 100001);
    });

    await t.test('admin approval queues a payment and does not mark the milestone paid', async () => {
        await assert.rejects(sequelize.transaction(transaction => service.queueMilestone(milestones[1], transaction)), /Previous/);
        const filename = path.resolve(__dirname, '../src/modules/web/admin/userInvestmentController.js');
        const localRequire = createRequire(filename);
        const module = { exports: {} };
        vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, console: { ...console, error: () => {} },
            require: name => {
                if (name === '../../../database') return { sequelize };
                if (name === '../../../database/models') return () => models;
                if (name === '../../../services/payments/service') return { getPaymentService: () => service };
                if (name === '../../../utils/paypetal') return { requireEnabled: () => config };
                return localRequire(name);
            } }, { filename });
        const req = { admin: admin.get({ plain: true }), params: { milestoneId: milestones[0].id },
            body: { action: 'approve', checklist: [{ name: 'Evidence verified', status: 'verified' }] },
            protocol: 'https', get: () => 'example.test' };
        const res = { success: data => ({ status: 200, data }), fail: (message, status) => ({ status, message }) };
        const rejected = await module.exports.reviewUserInvestmentMilestone(req, res);
        assert.equal(rejected.status, 409);
        assert.equal(await models.MilestoneReviewAudit.count(), 0);
        await milestones[0].update({ fundingRequestedAt: time, fundingStatus: 'request_for_funding' });
        await models.MilestoneFundingEvidence.create({ userFarmMilestoneId: milestones[0].id, evidenceType: 'photo',
            fileName: 'stage.jpg', fileUrl: 'https://example.test/stage.jpg', fileSize: 123, mimeType: 'image/jpeg' });
        const approved = await module.exports.reviewUserInvestmentMilestone(req, res);
        assert.equal(approved.status, 200, approved.message);
        assert.equal(approved.data.reviewStatus, 'approved');
        assert.equal(approved.data.fundingStatus, 'processing_funding');
        assert.equal(approved.data.isCompleted, false);
        assert.equal(await models.MilestoneReviewAudit.count(), 1);
        await service.runNextJob();
        await milestones[0].reload();
        assert.equal(milestones[0].isCompleted, false);
        assert.equal(events.releases, 1);
        const release = await models.EscrowRelease.findOne({ where: { userFarmMilestoneId: milestones[0].id } });
        await service.releaseMilestone(release.id);
        assert.equal(events.releases, 1, 'A bank transfer already processing must not be sent twice');
        agreements.get(escrow.reference).milestones[0].status = 'COMPLETED';
        const job = await models.PaymentJob.findOne({ where: { key: `release_milestone:${release.id}` } });
        await job.update({ availableAt: time });
        await service.runNextJob();
        await milestones[0].reload();
        assert.equal(milestones[0].isCompleted, true);
        assert.equal(milestones[0].fundingStatus, 'completed');
        await service.releaseMilestone(release.id);
        await escrow.reload();
        assert.equal(escrow.releasedAmount, '500.01');
        await assert.rejects(service.setupAccount(owner.id, { bankCode: '058', accountNumber: '0123456789', accountName: 'FARMER' }), /cannot change/);
    });

    await t.test('unsigned webhook hints cannot credit deposits or confirm a payment', async () => {
        await service.reconcileReference(escrow.reference);
        await service.reconcileReference('forged-reference');
        assert.equal(await models.PaymentDeposit.count(), 2);
        await milestones[1].reload();
        assert.equal(milestones[1].isCompleted, false);
    });

    await t.test('maturity uses ROI only, separate funding, polling confirmation, and stable references', async () => {
        assert.equal(await models.InvestorPayout.count(), 2);
        const payouts = await models.InvestorPayout.findAll({ order: [['amount', 'ASC']] });
        assert.deepEqual(payouts.map(row => row.amount), ['80.00', '120.00']);
        await service.payRoi(payouts[0].id);
        assert.equal(events.payouts, 0, 'No release before maturity');
        time = new Date('2027-01-01T00:00:01Z');
        await service.payRoi(payouts[0].id);
        await payouts[0].reload();
        assert.equal(payouts[0].status, 'processing');
        await service.payRoi(payouts[0].id);
        assert.equal(events.payouts, 1);
        const remote = agreements.get(payouts[0].reference);
        remote.status = 'COMPLETED'; remote.payoutStatus = 'COMPLETED';
        await service.payRoi(payouts[0].id);
        await payouts[0].reload();
        assert.equal(payouts[0].status, 'completed');
        assert.equal(payouts[0].amount, '80.00');
        assert.equal(payouts[0].initiator, 'repayment-wallet');
        assert.equal(events.payouts, 1);
        config.repaymentSubwalletId = escrow.providerWalletId;
        await assert.rejects(service.payRoi(payouts[1].id), /never a project/);
        config.repaymentSubwalletId = 'repayment-wallet';
    });

    await t.test('financial schema cannot be rolled back once money records exist', async () => {
        await assert.rejects(migration.down(q), /Cannot remove escrow storage/);
        assert.equal(await models.PaymentDeposit.count(), 2);
    });
});
