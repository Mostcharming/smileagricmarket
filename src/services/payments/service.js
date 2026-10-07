'use strict';

const { randomUUID } = require('crypto');
const { Op } = require('sequelize');
const { resolveInvestmentProjectStatus } = require('../../utils/investmentProject');
const { PaymentError, amount, decimal, allocateMilestones, providerAmount, assertAgreement, maturityTerms, listData } = require('./domain');

function createPaymentService({ sequelize, models, provider, getSettings, now = () => new Date() }) {
    const { PaymentProfile, ProjectEscrow, PaymentDeposit, EscrowRelease, InvestorPayout, PaymentJob,
        User, Wallet, UserFarm, UserFarmInvestment, UserFarmMilestone, InvestmentPayment, Investment, KYC } = models;

    async function enqueue(action, entityId, transaction, availableAt = now()) {
        const [job] = await PaymentJob.findOrCreate({ where: { key: `${action}:${entityId}` },
            defaults: { action, entityId, availableAt }, transaction });
        return job;
    }

    async function ensureProject(project, ownerId, transaction) {
        if (!['NGN', 'USD'].includes(project.currency)) throw new PaymentError('PayPetal supports NGN and USD only');
        const rows = await UserFarmMilestone.findAll({ where: { userFarmInvestmentId: project.id }, transaction });
        const plan = allocateMilestones(project.expectedInvestment, rows);
        const [escrow] = await ProjectEscrow.findOrCreate({ where: { userFarmInvestmentId: project.id },
            defaults: { ownerId, reference: `SMILE-FARM-${project.id}`, walletName: `SMILE-FARM-${project.id}`,
                currency: project.currency, targetAmount: project.expectedInvestment, milestones: plan }, transaction });
        for (const row of plan) await rows.find(item => item.id === row.milestoneId).update({ amount: decimal(row.cents) }, { transaction });
        await enqueue('provision_project', escrow.id, transaction);
        return escrow;
    }

    async function provisionProject(id) {
        const escrow = await ProjectEscrow.findByPk(id);
        if (escrow.providerWalletId) return;
        const wallets = listData(await provider.subwallets());
        const matches = wallets.filter(wallet => wallet.name === escrow.walletName);
        if (matches.length > 1) throw new PaymentError('Multiple project wallets found; operator reconciliation required');
        let wallet = matches[0];
        if (!wallet && escrow.creationAttemptedAt) {
            throw new PaymentError('Project wallet creation outcome is unknown; verify it in PayPetal before retrying');
        }
        if (!wallet) {
            await escrow.update({ creationAttemptedAt: now() });
            const result = await provider.createSubwallet({ name: escrow.walletName, currency: escrow.currency, reference: escrow.reference });
            wallet = result?.data;
        }
        if (!wallet?.id || wallet.currency !== escrow.currency || !wallet.accountNumber || !wallet.bankName) {
            throw new PaymentError('PayPetal returned incomplete project wallet details');
        }
        await escrow.update({ providerWalletId: wallet.id, accountNumber: wallet.accountNumber,
            accountName: wallet.accountName, bankName: wallet.bankName, status: 'collecting', lastError: null });
    }

    async function validateAccount(input) {
        const bankCode = String(input.bankCode || '').trim();
        const accountNumber = String(input.accountNumber || '').trim();
        if (!/^\d{3,6}$/.test(bankCode) || !/^\d{10}$/.test(accountNumber)) {
            throw new PaymentError('bankCode and a 10-digit accountNumber are required', 400);
        }
        const resolved = await provider.validateAccount({ bankCode, accountNumber });
        if (!resolved?.accountName || resolved.accountNumber !== accountNumber || resolved.bankCode !== bankCode) {
            throw new PaymentError('PayPetal returned mismatched bank account details');
        }
        return resolved;
    }

    async function setupAccount(userId, input) {
        const resolved = await validateAccount(input);
        if (String(input.accountName || '').trim().toUpperCase() !== resolved.accountName.trim().toUpperCase()) {
            const error = new PaymentError('Confirm the resolved account name before saving this payout account', 409);
            error.details = { accountName: resolved.accountName };
            throw error;
        }
        return sequelize.transaction(async transaction => {
            const user = await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!user) throw new PaymentError('User not found', 404);
            const approved = await KYC.findOne({ where: { userId, status: 'approved' }, transaction });
            if (!approved) throw new PaymentError('Approved KYC is required to register a payout account', 403);
            const liveProject = await ProjectEscrow.findOne({ where: { ownerId: userId,
                status: { [Op.in]: ['escrowing', 'held', 'releasing'] } }, transaction });
            const livePayout = await InvestorPayout.findOne({ where: { investorId: userId,
                status: { [Op.in]: ['creating', 'funded', 'processing', 'unknown'] } }, transaction });
            if (liveProject || livePayout) throw new PaymentError('Payout account cannot change while funds are committed to a payout');
            const [profile] = await PaymentProfile.findOrCreate({ where: { userId }, defaults: { identity: {
                fullname: user.fullName, email: user.email, phoneNumber: user.phoneNumber
            } }, transaction });
            if (profile.status === 'syncing') throw new PaymentError('Payout account registration is already processing');
            if (!user.fullName || !user.email) throw new PaymentError('Full name and email are required');
            await profile.update({ bankCode: resolved.bankCode, accountNumber: resolved.accountNumber,
                accountName: resolved.accountName, bankName: String(input.bankName || '').slice(0, 255),
                verifiedAt: null, status: 'pending', lastError: null }, { transaction });
            const [wallet] = await Wallet.findOrCreate({ where: { userId }, defaults: {}, transaction });
            await wallet.update({ bankName: profile.bankName, accountNumber: profile.accountNumber,
                accountName: profile.accountName, isVerified: false }, { transaction });
            const job = await enqueue('sync_account', profile.id, transaction);
            if (['completed', 'blocked'].includes(job.status)) await job.update({ status: 'pending', attempts: 0, availableAt: now(), lastError: null }, { transaction });
            return profile;
        });
    }

    async function syncAccount(id) {
        const profile = await sequelize.transaction(async transaction => {
            const row = await PaymentProfile.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            if (row.status === 'verified') return row;
            await row.update({ status: 'syncing' }, { transaction });
            return row;
        });
        if (profile.status === 'verified') return;
        if (!profile.customerId) {
            const customers = listData(await provider.customers());
            const matches = customers.filter(customer => customer.email?.toLowerCase() === profile.identity.email?.toLowerCase());
            if (matches.length > 1) throw new PaymentError('Ambiguous PayPetal customer identity');
            let customer = matches[0];
            if (customer && (customer.fullname !== profile.identity.fullname || customer.phoneNumber !== profile.identity.phoneNumber)) {
                throw new PaymentError('Existing PayPetal customer does not match the saved user identity');
            }
            if (!customer && profile.creationAttemptedAt) throw new PaymentError('Customer creation outcome is unknown; reconcile it in PayPetal');
            if (!customer) {
                await profile.update({ creationAttemptedAt: now() });
                customer = await provider.createCustomer(profile.identity);
            }
            if (!customer?.customerId) throw new PaymentError('PayPetal returned no customer ID');
            await profile.update({ customerId: customer.customerId });
        }
        const resolved = await validateAccount(profile);
        if (resolved.accountName !== profile.accountName) throw new PaymentError('Payout account name changed; reconfirm the account');
        const accounts = listData(await provider.payoutAccounts(profile.customerId));
        const account = accounts.find(item => item.customerId === profile.customerId);
        const matches = account?.accountNumber === profile.accountNumber && account?.bankCode === profile.bankCode;
        if (!matches) {
            const data = { accountNumber: profile.accountNumber, bankCode: profile.bankCode };
            if (account) await provider.updatePayoutAccount(profile.customerId, data);
            else await provider.addPayoutAccount(profile.customerId, data);
        }
        // Re-read instead of trusting an acknowledgement of a non-idempotent write.
        const saved = listData(await provider.payoutAccounts(profile.customerId)).find(item => item.customerId === profile.customerId);
        if (saved?.accountNumber !== profile.accountNumber || saved?.bankCode !== profile.bankCode) throw new PaymentError('Payout account registration is not confirmed');
        await sequelize.transaction(async transaction => {
            await profile.update({ status: 'verified', verifiedAt: now(), lastError: null }, { transaction });
            await Wallet.update({ isVerified: true }, { where: { userId: profile.userId }, transaction });
        });
    }

    async function verifiedProfile(userId, transaction) {
        const profile = await PaymentProfile.findOne({ where: { userId }, transaction,
            ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
        if (profile?.status !== 'verified' || !profile.customerId) throw new PaymentError('A verified PayPetal payout account is required');
        return profile;
    }

    async function investmentInstructions(payment) {
        const escrow = await ProjectEscrow.findOne({ where: { userFarmInvestmentId: payment.userFarmInvestmentId } });
        if (!escrow?.providerWalletId || escrow.status !== 'collecting') {
            throw new PaymentError('Project payment account is not ready to receive investments');
        }
        await verifiedProfile(payment.investorId);
        return { provider: 'paypetal', method: 'bank_transfer', reference: payment.reference,
            amount: payment.amount, currency: payment.currency, bankName: escrow.bankName,
            accountNumber: escrow.accountNumber, accountName: escrow.accountName,
            confirmation: 'admin_statement_reconciliation', investmentProjectId: payment.userFarmInvestmentId };
    }

    async function acceptingProject(project, investorId, transaction) {
        const escrow = await ProjectEscrow.findOne({ where: { userFarmInvestmentId: project.id }, transaction, lock: transaction.LOCK.UPDATE });
        if (!escrow?.providerWalletId || escrow.status !== 'collecting') throw new PaymentError('Project payment account is not ready');
        if (amount(project.investmentReceived) !== amount(escrow.confirmedAmount)
            || amount(project.expectedInvestment) !== amount(escrow.targetAmount) || project.currency !== escrow.currency) {
            throw new PaymentError('Project funding records do not match its PayPetal account');
        }
        await verifiedProfile(investorId, transaction);
    }

    async function recordDeposit(paymentId, input, adminId) {
        if (getSettings().depositReconciliation !== 'manual') {
            throw new PaymentError('Shared-account deposit reconciliation is not configured', 503);
        }
        if (!adminId || !input.providerTransactionId || !input.evidenceReference || !input.receivedAt) {
            throw new PaymentError('Provider transaction ID, statement evidence reference, and receivedAt are required', 400);
        }
        if (String(input.providerTransactionId).length > 255 || String(input.evidenceReference).length > 2000) throw new PaymentError('Deposit evidence exceeds supported length', 400);
        const receivedAt = new Date(input.receivedAt);
        if (Number.isNaN(receivedAt.getTime()) || receivedAt > now()) throw new PaymentError('Invalid receivedAt', 400);
        return sequelize.transaction(async transaction => {
            const payment = await InvestmentPayment.findByPk(paymentId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!payment || payment.gateway !== 'paypetal') throw new PaymentError('PayPetal investment payment not found', 404);
            const existing = await PaymentDeposit.findOne({ where: { investmentPaymentId: payment.id }, transaction });
            if (existing) {
                if (existing.providerTransactionId !== input.providerTransactionId
                    || amount(existing.amount) !== amount(input.amount) || existing.currency !== input.currency) {
                    throw new PaymentError('Investment already matched to a different deposit instruction');
                }
                return existing;
            }
            if (payment.status !== 'pending') throw new PaymentError('Only a pending investment can be matched to a deposit');
            if (amount(input.amount) !== amount(payment.amount) || input.currency !== payment.currency) throw new PaymentError('Deposit amount or currency does not match the investment');
            const project = await UserFarmInvestment.findByPk(payment.userFarmInvestmentId, { transaction, lock: transaction.LOCK.UPDATE });
            const escrow = await ProjectEscrow.findOne({ where: { userFarmInvestmentId: project.id }, transaction, lock: transaction.LOCK.UPDATE });
            if (escrow?.status !== 'collecting') throw new PaymentError('Project is not collecting funds');
            const total = amount(escrow.confirmedAmount) + amount(payment.amount);
            if (total > amount(escrow.targetAmount)) throw new PaymentError('Deposit would exceed the project funding target');
            const wallet = listData(await provider.subwallets()).find(item => item.id === escrow.providerWalletId);
            if (!wallet || wallet.currency !== escrow.currency || providerAmount(wallet.accountBalance, getSettings().responseUnit) < total) {
                throw new PaymentError('Project wallet does not contain the reconciled funds');
            }
            const deposit = await PaymentDeposit.create({ projectEscrowId: escrow.id, investmentPaymentId: payment.id,
                providerTransactionId: String(input.providerTransactionId), amount: payment.amount, currency: payment.currency,
                reviewedBy: adminId, evidenceReference: String(input.evidenceReference), receivedAt }, { transaction });
            await payment.update({ status: 'successful', paidAt: receivedAt, gatewayTransactionId: null }, { transaction });
            const received = amount(project.investmentReceived) + amount(payment.amount);
            await project.update({ investmentReceived: decimal(received), investmentPending: decimal(Math.max(amount(project.expectedInvestment) - received, 0)),
                investmentStatus: resolveInvestmentProjectStatus({ ...project.get({ plain: true }), investmentReceived: decimal(received) }) }, { transaction });
            await escrow.update({ confirmedAmount: decimal(total) }, { transaction });
            await scheduleMaturity(payment, project, transaction);
            if (total === amount(escrow.targetAmount)) await enqueue('activate_project', escrow.id, transaction);
            return deposit;
        });
    }

    async function scheduleMaturity(payment, project, transaction) {
        const template = await Investment.findByPk(payment.investmentId, { transaction });
        const terms = maturityTerms(payment, project, template, getSettings().returnMode);
        const [payout] = await InvestorPayout.findOrCreate({ where: { investmentPaymentId: payment.id },
            defaults: { ...terms, investorId: payment.investorId, reference: `SMILE-ROI-${payment.id}` }, transaction });
        await enqueue('pay_roi', payout.id, transaction, terms.dueAt);
        return payout;
    }

    async function remoteAgreement(reference) {
        try { return await provider.agreement(reference); }
        catch (error) { if (error.code === 'agreement_not_found') return null; throw error; }
    }

    function projectInstruction(escrow) {
        return { ...escrow.get({ plain: true }), kind: 'project', amount: escrow.targetAmount, initiator: escrow.providerWalletId };
    }

    async function activateProject(id) {
        const escrow = await sequelize.transaction(async transaction => {
            const row = await ProjectEscrow.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            if (['held', 'releasing', 'completed'].includes(row.status)) return row;
            if (amount(row.confirmedAmount) !== amount(row.targetAmount)) throw new PaymentError('Project must be fully funded before milestone escrow is activated');
            const profile = await verifiedProfile(row.ownerId, transaction);
            const milestones = await UserFarmMilestone.findAll({ where: { userFarmInvestmentId: row.userFarmInvestmentId }, order: [['order', 'ASC']], transaction });
            const plan = row.milestones || allocateMilestones(row.targetAmount, milestones);
            await row.update({ status: 'escrowing', counterparty: profile.customerId, milestones: plan }, { transaction });
            return row;
        });
        if (['held', 'releasing', 'completed'].includes(escrow.status)) return;
        let remote = await remoteAgreement(escrow.reference);
        if (!remote) {
            if (escrow.escrowAttemptedAt) throw new PaymentError('Project escrow creation outcome is unknown; provider reconciliation required');
            const wallet = listData(await provider.subwallets()).find(item => item.id === escrow.providerWalletId);
            if (!wallet || wallet.currency !== escrow.currency || providerAmount(wallet.accountBalance, getSettings().responseUnit) < amount(escrow.targetAmount)) {
                throw new PaymentError('Insufficient project wallet funds to activate escrow, including any provider fees');
            }
            await escrow.update({ escrowAttemptedAt: now() });
            await provider.createAgreement({ referenceId: escrow.reference, initiator: escrow.providerWalletId,
                counterparty: escrow.counterparty, amount: String(amount(escrow.targetAmount)), currency: escrow.currency,
                merchantCharge: '0', description: `Farm project ${escrow.userFarmInvestmentId}`, redirectUrl: getSettings().websiteUrl,
                metadata: { smileAgreementId: escrow.id, investmentProjectId: escrow.userFarmInvestmentId },
                milestone: { milestones: escrow.milestones.map(item => ({ amount: String(item.cents), description: item.description })) } });
            remote = await remoteAgreement(escrow.reference);
        }
        assertAgreement(projectInstruction(escrow), remote, getSettings().responseUnit);
        if (remote.refundStatus !== 'NONE' || remote.payoutStatus !== 'NONE' || remote.status !== 'ONGOING') {
            throw new PaymentError('Project escrow is not in a funded, unreleased state');
        }
        const providerMilestones = await matchedMilestones(escrow);
        await sequelize.transaction(async transaction => {
            for (const row of providerMilestones) {
                await EscrowRelease.findOrCreate({ where: { userFarmMilestoneId: row.local.milestoneId }, defaults: {
                    projectEscrowId: escrow.id, providerMilestoneId: row.remote.id, amount: decimal(row.local.cents)
                }, transaction });
            }
            await escrow.update({ status: 'held', providerTransactionId: remote.transactionId, lastError: null }, { transaction });
        });
    }

    async function matchedMilestones(escrow) {
        const rows = listData(await provider.milestones(escrow.reference)).sort((a, b) => a.sequence - b.sequence);
        if (rows.length !== escrow.milestones.length) throw new PaymentError('Provider milestone count does not match project');
        return rows.map((remote, index) => {
            const local = escrow.milestones[index];
            if (!remote.id || remote.sequence !== index + 1 || remote.description !== local.description
                || providerAmount(remote.amount, getSettings().responseUnit) !== local.cents) {
                throw new PaymentError('Provider milestone does not match the approved project funding plan');
            }
            return { local, remote };
        });
    }

    async function queueMilestone(milestone, transaction) {
        const escrow = await ProjectEscrow.findOne({ where: { userFarmInvestmentId: milestone.userFarmInvestmentId }, transaction, lock: transaction.LOCK.UPDATE });
        if (!escrow || !['held', 'releasing'].includes(escrow.status)) throw new PaymentError('A fully funded project escrow is required before approval');
        await verifiedProfile(escrow.ownerId, transaction);
        const previous = await UserFarmMilestone.findOne({ where: { userFarmInvestmentId: milestone.userFarmInvestmentId,
            order: { [Op.lt]: milestone.order }, fundingStatus: { [Op.ne]: 'completed' } }, transaction });
        if (previous) throw new PaymentError('Previous milestones must have confirmed payment before approval');
        const release = await EscrowRelease.findOne({ where: { userFarmMilestoneId: milestone.id }, transaction });
        if (!release) throw new PaymentError('Provider milestone mapping is missing');
        await escrow.update({ status: 'releasing' }, { transaction });
        await enqueue('release_milestone', release.id, transaction);
    }

    async function releaseMilestone(id) {
        const release = await EscrowRelease.findByPk(id);
        if (release.status === 'completed') return;
        const milestone = await UserFarmMilestone.findByPk(release.userFarmMilestoneId);
        if (milestone?.reviewStatus !== 'approved') throw new PaymentError('Milestone is not approved');
        const escrow = await ProjectEscrow.findByPk(release.projectEscrowId);
        const agreement = assertAgreement(projectInstruction(escrow), await remoteAgreement(escrow.reference), getSettings().responseUnit);
        if (agreement.refundStatus !== 'NONE') throw new PaymentError('Project escrow is refunding or refunded');
        let rows = await matchedMilestones(escrow);
        let current = rows.find(row => row.remote.id === release.providerMilestoneId);
        if (!current) throw new PaymentError('Saved provider milestone is missing');
        if (['PENDING', 'NONE', 'FAILED'].includes(current.remote.status)) {
            const previous = rows.filter(row => row.remote.sequence < current.remote.sequence);
            if (previous.some(row => row.remote.status !== 'COMPLETED')) throw new PaymentError('Previous provider milestones are unpaid');
            await release.update({ status: 'processing' });
            await provider.releaseMilestone(escrow.reference, release.providerMilestoneId);
            rows = await matchedMilestones(escrow);
            current = rows.find(row => row.remote.id === release.providerMilestoneId);
        }
        if (current.remote.status !== 'COMPLETED') {
            await release.update({ status: 'processing' });
            return false;
        }
        await sequelize.transaction(async transaction => {
            const locked = await EscrowRelease.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            if (locked.status === 'completed') return;
            const lockedEscrow = await ProjectEscrow.findByPk(escrow.id, { transaction, lock: transaction.LOCK.UPDATE });
            const released = amount(lockedEscrow.releasedAmount) + amount(locked.amount);
            await locked.update({ status: 'completed', completedAt: now(), lastError: null }, { transaction });
            await milestone.update({ fundingStatus: 'completed', isCompleted: true, completedAt: now() }, { transaction });
            await lockedEscrow.update({ releasedAmount: decimal(released),
                status: released === amount(lockedEscrow.targetAmount) ? 'completed' : 'held' }, { transaction });
        });
        return true;
    }

    async function payRoi(id) {
        const payout = await InvestorPayout.findByPk(id);
        if (payout.status === 'completed') return;
        if (payout.dueAt > now()) return false;
        if (amount(payout.amount) === 0) {
            await payout.update({ status: 'completed', completedAt: now() });
            return true;
        }
        const config = getSettings();
        if (!config.repaymentSubwalletId) throw new PaymentError('Funded merchant repayment subwallet is not configured', 503);
        if (await ProjectEscrow.findOne({ where: { providerWalletId: config.repaymentSubwalletId } })) {
            throw new PaymentError('ROI repayments must use a separate merchant account, never a project investment account');
        }
        await sequelize.transaction(async transaction => {
            const profile = await verifiedProfile(payout.investorId, transaction);
            if (payout.initiator && payout.initiator !== config.repaymentSubwalletId) throw new PaymentError('Repayment funding account changed after payout was prepared');
            if (payout.counterparty && payout.counterparty !== profile.customerId) throw new PaymentError('Investor payout destination changed');
            await payout.update({ initiator: config.repaymentSubwalletId, counterparty: profile.customerId, status: 'creating' }, { transaction });
        });
        let remote = await remoteAgreement(payout.reference);
        if (!remote) {
            if (payout.creationAttemptedAt) throw new PaymentError('ROI escrow creation outcome is unknown; provider reconciliation required');
            const wallet = listData(await provider.subwallets()).find(item => item.id === payout.initiator);
            if (!wallet || wallet.currency !== payout.currency || providerAmount(wallet.accountBalance, config.responseUnit) < amount(payout.amount)) {
                throw new PaymentError('Repayment subwallet has insufficient funds');
            }
            await payout.update({ creationAttemptedAt: now() });
            await provider.createAgreement({ referenceId: payout.reference, initiator: payout.initiator,
                counterparty: payout.counterparty, amount: String(amount(payout.amount)), currency: payout.currency,
                merchantCharge: '0', description: `ROI for investment ${payout.investmentPaymentId}`, redirectUrl: config.websiteUrl,
                metadata: { smileAgreementId: payout.id, investmentPaymentId: payout.investmentPaymentId, kind: 'roi' } });
            remote = await remoteAgreement(payout.reference);
        }
        assertAgreement({ ...payout.get({ plain: true }), kind: 'roi' }, remote, config.responseUnit);
        if (remote.refundStatus !== 'NONE') throw new PaymentError('ROI escrow has an unexpected refund state');
        if (remote.status === 'ONGOING' && remote.payoutStatus === 'NONE') {
            await payout.update({ status: 'processing', providerTransactionId: remote.transactionId });
            await provider.completeAgreement(payout.reference);
            remote = await remoteAgreement(payout.reference);
            assertAgreement({ ...payout.get({ plain: true }), kind: 'roi' }, remote, config.responseUnit);
        }
        if (remote.status === 'COMPLETED' && remote.payoutStatus === 'COMPLETED') {
            await payout.update({ status: 'completed', providerTransactionId: remote.transactionId, completedAt: now(), lastError: null });
            return true;
        }
        if (!['PENDING', 'PROCESSING'].includes(remote.payoutStatus)) throw new PaymentError('Unexpected ROI payout state; operator reconciliation required');
        await payout.update({ status: 'processing' });
        return false;
    }

    async function runNextJob() {
        const leaseToken = randomUUID();
        const job = await sequelize.transaction(async transaction => {
            const row = await PaymentJob.findOne({ where: {
                [Op.or]: [
                    { status: { [Op.in]: ['pending', 'retry'] }, availableAt: { [Op.lte]: now() } },
                    { status: 'running', leaseUntil: { [Op.lt]: now() } }
                ] }, order: [['availableAt', 'ASC']], transaction, lock: transaction.LOCK.UPDATE, skipLocked: true });
            if (!row) return null;
            await row.update({ status: 'running', attempts: row.attempts + 1, leaseToken,
                leaseUntil: new Date(now().getTime() + 10 * 60000) }, { transaction });
            return row;
        });
        if (!job) return false;
        const heartbeat = setInterval(() => {
            PaymentJob.update({ leaseUntil: new Date(now().getTime() + 10 * 60000) },
                { where: { id: job.id, leaseToken, status: 'running' } }).catch(() => {});
        }, 60000);
        heartbeat.unref();
        const handlers = { provision_project: provisionProject, sync_account: syncAccount,
            activate_project: activateProject, release_milestone: releaseMilestone, pay_roi: payRoi };
        try {
            if (!handlers[job.action]) throw new PaymentError('Unknown payment job action');
            const done = await handlers[job.action](job.entityId);
            await PaymentJob.update({ status: done === false ? 'retry' : 'completed',
                availableAt: new Date(now().getTime() + 60000), leaseUntil: null, leaseToken: null, lastError: null },
            { where: { id: job.id, leaseToken } });
        } catch (error) {
            const blocked = error instanceof PaymentError || job.attempts >= 10;
            const message = error instanceof PaymentError ? error.message : 'Provider request failed; reconcile and retry';
            await PaymentJob.update({ status: blocked ? 'blocked' : 'retry', lastError: message,
                availableAt: new Date(now().getTime() + Math.min(3600000, 10000 * 2 ** Math.min(job.attempts, 8))),
                leaseUntil: null, leaseToken: null }, { where: { id: job.id, leaseToken } });
            if (job.action === 'sync_account') await PaymentProfile.update({ status: 'pending', lastError: message }, { where: { id: job.entityId } });
            if (job.action === 'provision_project' || job.action === 'activate_project') await ProjectEscrow.update({ lastError: message }, { where: { id: job.entityId } });
            if (job.action === 'pay_roi') await InvestorPayout.update({ lastError: message }, { where: { id: job.entityId } });
            if (job.action === 'release_milestone') await EscrowRelease.update({ lastError: message }, { where: { id: job.entityId } });
        } finally { clearInterval(heartbeat); }
        return true;
    }

    async function reconcileReference(reference) {
        // Unsigned events are hints only. No supplied amount, status, or beneficiary is trusted.
        const escrow = await ProjectEscrow.findOne({ where: { reference } });
        const payout = !escrow ? await InvestorPayout.findOne({ where: { reference } }) : null;
        if (escrow) {
            const jobs = await PaymentJob.findAll({ where: { entityId: [escrow.id,
                ...(await EscrowRelease.findAll({ where: { projectEscrowId: escrow.id } })).map(row => row.id)] } });
            for (const job of jobs) if (job.status === 'retry') await job.update({ availableAt: now() });
        } else if (payout) {
            const job = await PaymentJob.findOne({ where: { key: `pay_roi:${payout.id}` } });
            if (job?.status === 'retry') await job.update({ availableAt: now() });
        }
    }

    async function retryJob(id, adminId) {
        if (!adminId) throw new PaymentError('Admin authentication required', 401);
        return sequelize.transaction(async transaction => {
            const job = await PaymentJob.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!job) throw new PaymentError('Payment job not found', 404);
            if (!['blocked', 'retry'].includes(job.status)) throw new PaymentError('Only a blocked or retrying payment job can be retried');
            // Creation-attempt markers are deliberately retained: retry never recreates a possibly funded instruction.
            await job.update({ status: 'pending', attempts: 0, availableAt: now(), lastError: null,
                retryHistory: [...(job.retryHistory || []), { adminId, at: now().toISOString(), fromStatus: job.status, reason: job.lastError }] }, { transaction });
            return job;
        });
    }

    return { ensureProject, provisionProject, validateAccount, setupAccount, verifiedProfile, acceptingProject,
        investmentInstructions, recordDeposit, queueMilestone, runNextJob, retryJob, reconcileReference,
        activateProject, releaseMilestone, payRoi, scheduleMaturity, syncAccount };
}

let instance;
function getPaymentService() {
    if (!instance) {
        const { sequelize } = require('../../database');
        const models = require('../../database/models')(sequelize);
        const { createClient, requireEnabled } = require('../../utils/paypetal');
        instance = createPaymentService({ sequelize, models, provider: createClient(), getSettings: requireEnabled });
    }
    return instance;
}

module.exports = { createPaymentService, getPaymentService };
