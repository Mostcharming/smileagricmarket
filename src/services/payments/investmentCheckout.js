'use strict';

const { PaymentError, amount, decimal, providerAmount } = require('./domain');
const { resolveInvestmentProjectStatus } = require('../../utils/investmentProject');

const payload = response => response?.dataResponse?.data || response?.dataResponse
    || response?.responseData?.data || response?.responseData;

function assertPaymentIdentity(payment, data, unit = 'major') {
    if (!data || typeof data.transactionId !== 'string' || !data.transactionId || data.transactionId.length > 100
        || data.reference !== payment.reference || data.currency !== payment.currency
        || providerAmount(data.amount, unit) !== amount(payment.amount)
        || (payment.gatewayTransactionId && data.transactionId !== payment.gatewayTransactionId)) {
        throw new PaymentError('PayPetal transaction identity, amount or currency does not match the investment');
    }
}

function checkoutInstructions(payment, response) {
    const data = payload(response);
    assertPaymentIdentity(payment, data);
    const paymentUrl = response?.dataResponse?.paymentUrl || response?.responseData?.paymentUrl;
    let url;
    try { url = new URL(paymentUrl); } catch (_) { /* rejected below */ }
    if (!url || url.protocol !== 'https:' || url.username || url.password) {
        throw new PaymentError('PayPetal returned no valid checkout URL; confirm the saved transaction before retrying');
    }
    return { provider: 'paypetal', method: 'checkout', reference: payment.reference,
        providerTransactionId: data.transactionId, paymentUrl, amount: decimal(amount(payment.amount)),
        currency: payment.currency, fee: data.fee ?? null, totalAmount: data.totalAmount ?? null,
        confirmation: 'provider_transaction', investmentProjectId: payment.userFarmInvestmentId };
}

function createInvestmentCheckout({ sequelize, models, provider, getSettings, scheduleMaturity, enqueue, now = () => new Date() }) {
    const { InvestmentPayment, PaymentDeposit, UserFarmInvestment, ProjectEscrow } = models;

    async function ownedPayment(id, investorId, transaction, lock = false) {
        const payment = await InvestmentPayment.findOne({ where: { id, investorId }, transaction,
            ...(lock ? { lock: transaction.LOCK.UPDATE } : {}) });
        if (!payment) throw new PaymentError('Investment transaction not found', 404);
        if (payment.gateway !== 'paypetal') throw new PaymentError('This payment does not use PayPetal');
        return payment;
    }

    async function investorInvestment(investorId, projectId, transaction) {
        const where = { investorId, userFarmInvestmentId: projectId, status: 'successful' };
        const total = await InvestmentPayment.sum('amount', { where, transaction });
        const paymentCount = await InvestmentPayment.count({ where, transaction });
        return { amount: Number(decimal(amount(total || 0))), currency: 'NGN', paymentCount };
    }

    async function initiateInvestment(paymentId, investorId) {
        const config = getSettings();
        let redirect;
        try { redirect = new URL(config.paymentRedirectUrl); } catch (_) { /* rejected below */ }
        if (!redirect || redirect.protocol !== 'https:' || redirect.username || redirect.password) {
            throw new PaymentError('Configure an HTTPS PayPetal payment redirect URL', 503);
        }
        const { payment, create } = await sequelize.transaction(async transaction => {
            const payment = await ownedPayment(paymentId, investorId, transaction, true);
            if (payment.gatewayResponse?.initialization) return { payment, create: false };
            if (payment.status !== 'pending') throw new PaymentError('Only a pending investment can start checkout');
            if (payment.initiationAttemptedAt) {
                throw new PaymentError('Checkout initiation is in progress or its outcome is unknown; confirm this transaction before retrying');
            }
            await payment.update({ initiationAttemptedAt: now() }, { transaction });
            return { payment, create: true };
        });
        if (!create) return checkoutInstructions(payment, payment.gatewayResponse.initialization);
        let response;
        try {
            response = await provider.initiatePayment({ amount: decimal(amount(payment.amount)), currency: payment.currency,
                reference: payment.reference, description: `Investment in ${payment.agreement?.terms?.farmName || 'farm project'} (${payment.userFarmInvestmentId})`,
                redirectUrl: config.paymentRedirectUrl });
        } catch (error) {
            await sequelize.transaction(async transaction => {
                const saved = await ownedPayment(paymentId, investorId, transaction, true);
                await saved.update({ ...(error.uncertain === false ? { initiationAttemptedAt: null } : {}),
                    gatewayResponse: { ...saved.gatewayResponse, initializationError: error.message } }, { transaction });
            });
            throw error;
        }
        let instructions;
        let invalidResponse;
        try { instructions = checkoutInstructions(payment, response); }
        catch (error) { invalidResponse = error; }
        // Persist the complete envelope and normalized checkout atomically, including malformed responses.
        await sequelize.transaction(async transaction => {
            const saved = await ownedPayment(paymentId, investorId, transaction, true);
            if (instructions && saved.gatewayTransactionId && saved.gatewayTransactionId !== instructions.providerTransactionId) {
                throw new PaymentError('PayPetal initialization conflicts with the confirmed transaction');
            }
            await saved.update({ ...(instructions ? { gatewayTransactionId: instructions.providerTransactionId,
                authorizationUrl: instructions.paymentUrl } : {}),
                gatewayResponse: { ...saved.gatewayResponse, initialization: response,
                    ...(instructions ? { instructions } : {}), initializationError: invalidResponse?.message || null } }, { transaction });
        });
        if (invalidResponse) throw invalidResponse;
        return instructions;
    }

    async function confirmInvestment(paymentId, investorId) {
        const saved = await ownedPayment(paymentId, investorId);
        if (!saved.initiationAttemptedAt && !saved.gatewayResponse?.initialization) {
            throw new PaymentError('This investment has no PayPetal checkout to confirm');
        }
        // The client supplies only the internal payment UUID. Never trust client transaction data.
        const response = saved.status === 'successful' ? null
            : await provider.transaction(saved.gatewayTransactionId || saved.reference);
        const result = await sequelize.transaction(async transaction => {
            const payment = await ownedPayment(paymentId, investorId, transaction, true);
            const project = await UserFarmInvestment.findByPk(payment.userFarmInvestmentId,
                { transaction, lock: transaction.LOCK.UPDATE });
            if (!project) throw new PaymentError('Investment project not found', 404);
            const summary = async (credited, alreadySettled) => ({ payment, farmInvestment: project, credited, alreadySettled,
                investorInvestment: await investorInvestment(investorId, project.id, transaction) });
            if (payment.status === 'successful') return summary(false, true);
            await payment.update({ gatewayResponse: { ...payment.gatewayResponse, verification: response } }, { transaction });
            const data = payload(response);
            try { assertPaymentIdentity(payment, data, getSettings().responseUnit); }
            catch (error) {
                await payment.update({ gatewayResponse: { ...payment.gatewayResponse, verificationError: error.message } }, { transaction });
                return { error };
            }
            const status = String(data.status || '').toUpperCase();
            if (!['SUCCESS', 'PENDING', 'PROCESSING', 'INITIATED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REVERSED'].includes(status)) {
                return { error: new PaymentError('PayPetal returned an unrecognized transaction status') };
            }
            if (status !== 'SUCCESS') {
                const failed = ['FAILED', 'EXPIRED', 'REVERSED'].includes(status);
                await payment.update({ status: failed ? 'failed' : status === 'CANCELLED' ? 'cancelled' : 'pending',
                    gatewayTransactionId: data.transactionId }, { transaction });
                return summary(false, false);
            }
            const escrow = await ProjectEscrow.findOne({ where: { userFarmInvestmentId: project.id },
                transaction, lock: transaction.LOCK.UPDATE });
            if (!escrow || escrow.status !== 'collecting') throw new PaymentError('Project is not collecting investments');
            if (amount(project.investmentReceived) !== amount(escrow.confirmedAmount)
                || project.currency !== payment.currency || escrow.currency !== payment.currency) {
                throw new PaymentError('Project funding records do not match');
            }
            const total = amount(escrow.confirmedAmount) + amount(payment.amount);
            if (total > amount(escrow.targetAmount) || total > amount(project.expectedInvestment)) {
                throw new PaymentError('Payment would exceed the project funding target; operator reconciliation required');
            }
            const existing = await PaymentDeposit.findOne({ where: { investmentPaymentId: payment.id }, transaction });
            if (existing) throw new PaymentError('Investment deposit already exists; operator reconciliation required');
            const paidAt = now();
            await PaymentDeposit.create({ projectEscrowId: escrow.id, investmentPaymentId: payment.id,
                providerTransactionId: data.transactionId, amount: payment.amount, currency: payment.currency,
                verificationSource: 'paypetal_transaction', reviewedBy: null,
                evidenceReference: `/api/v1/transaction/${data.transactionId}`, receivedAt: paidAt }, { transaction });
            await payment.update({ status: 'successful', paidAt, gatewayTransactionId: data.transactionId,
                gatewayResponse: { ...payment.gatewayResponse, verificationError: null } }, { transaction });
            await project.update({ investmentReceived: decimal(total),
                investmentPending: decimal(Math.max(amount(project.expectedInvestment) - total, 0)),
                investmentStatus: resolveInvestmentProjectStatus({ ...project.get({ plain: true }), investmentReceived: decimal(total) }) }, { transaction });
            await escrow.update({ confirmedAmount: decimal(total) }, { transaction });
            await scheduleMaturity(payment, project, transaction);
            // Checkout does not select a project subwallet. Activation still verifies its actual balance.
            if (total === amount(escrow.targetAmount)) await enqueue('activate_project', escrow.id, transaction);
            return summary(true, false);
        });
        if (result.error) throw result.error;
        return result;
    }

    return { initiateInvestment, confirmInvestment, investorInvestment };
}

module.exports = { createInvestmentCheckout, assertPaymentIdentity, checkoutInstructions };
