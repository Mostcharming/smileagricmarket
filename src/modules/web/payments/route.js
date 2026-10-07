'use strict';

const express = require('express');
const { Op } = require('sequelize');
const { requireEnabled, createClient } = require('../../../utils/paypetal');
const { getPaymentService } = require('../../../services/payments/service');
const { PaymentError, amount } = require('../../../services/payments/domain');

const uuid = value => {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(value))) throw new PaymentError('A valid UUID is required', 400);
    return value;
};
function storage() {
    const { sequelize } = require('../../../database');
    return { sequelize, models: require('../../../database/models')(sequelize) };
}
const handle = fn => async (req, res) => {
    try {
        requireEnabled();
        return await fn(req, res);
    } catch (error) {
        return res.fail(error.statusCode ? error.message : 'Payment operation failed', error.statusCode || 500, error.details);
    }
};
const profileResponse = row => row ? ({ id: row.id, bankCode: row.bankCode, bankName: row.bankName,
    accountNumber: row.accountNumber, accountName: row.accountName, status: row.status,
    isVerified: row.status === 'verified', verifiedAt: row.verifiedAt, lastError: row.lastError }) : null;
const pagination = query => ({ limit: Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100),
    offset: (Math.max(Number.parseInt(query.page, 10) || 1, 1) - 1) * Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100) });

const router = express.Router();
router.get('/banks', handle(async (req, res) => res.success(await createClient().banks(), 'Supported payout banks')));
router.post('/accounts/validate', handle(async (req, res) => res.success(await getPaymentService().validateAccount(req.body), 'Confirm this account name before saving')));
router.post('/accounts', handle(async (req, res) => res.success(profileResponse(await getPaymentService().setupAccount(req.user.id, req.body)), 'Payout account registration queued', 202)));
router.get('/accounts', handle(async (req, res) => res.success(profileResponse(await storage().models.PaymentProfile.findOne({ where: { userId: req.user.id } })), 'Payout account status')));
router.get('/returns', handle(async (req, res) => {
    const result = await storage().models.InvestorPayout.findAndCountAll({ where: { investorId: req.user.id }, ...pagination(req.query),
        attributes: ['id', 'investmentPaymentId', 'amount', 'principal', 'roi', 'currency', 'returnMode', 'dueAt', 'status', 'completedAt', 'lastError'], order: [['dueAt', 'DESC']] });
    return res.success(result, 'Investor ROI payouts');
}));
router.get('/projects/:projectId', handle(async (req, res) => {
    const { models } = storage();
    const projectId = uuid(req.params.projectId);
    const escrow = await models.ProjectEscrow.findOne({ where: { userFarmInvestmentId: projectId } });
    if (!escrow) throw new PaymentError('Project escrow not found', 404);
    const investor = await models.InvestmentPayment.findOne({ where: { userFarmInvestmentId: projectId, investorId: req.user.id } });
    if (escrow.ownerId !== req.user.id && !investor) throw new PaymentError('Project escrow not found', 404);
    return res.success({ investmentProjectId: projectId, bankName: escrow.bankName, accountName: escrow.accountName,
        accountNumber: escrow.accountNumber, currency: escrow.currency, targetAmount: escrow.targetAmount,
        confirmedAmount: escrow.confirmedAmount, releasedAmount: escrow.releasedAmount, status: escrow.status,
        canWithdraw: false }, 'Project payment account');
}));

const adminRouter = express.Router();
adminRouter.use((req, res, next) => req.admin?.id ? next() : res.fail('Admin authentication required', 401));
adminRouter.use((req, res, next) => req.admin?.role === 'marketing_admin' ? res.fail('Financial admin access required', 403) : next());
adminRouter.get('/jobs', handle(async (req, res) => {
    const allowed = ['pending', 'running', 'retry', 'blocked', 'completed'];
    if (req.query.status && !allowed.includes(req.query.status)) throw new PaymentError('Invalid job status', 400);
    return res.success(await storage().models.PaymentJob.findAndCountAll({ where: req.query.status ? { status: req.query.status } : {},
        ...pagination(req.query), order: [['updatedAt', 'DESC']] }), 'Payment processing jobs');
}));
adminRouter.post('/jobs/:jobId/retry', handle(async (req, res) => res.success(await getPaymentService().retryJob(uuid(req.params.jobId), req.admin.id), 'Payment reconciliation queued', 202)));
adminRouter.post('/deposits/:paymentId/confirm', handle(async (req, res) => res.success(
    await getPaymentService().recordDeposit(uuid(req.params.paymentId), req.body, req.admin.id), 'Statement deposit matched to investment')));
adminRouter.get('/deposits', handle(async (req, res) => res.success(await storage().models.PaymentDeposit.findAndCountAll({
    ...pagination(req.query), order: [['createdAt', 'DESC']] }), 'Verified project deposit audit trail')));
adminRouter.get('/returns', handle(async (req, res) => res.success(await storage().models.InvestorPayout.findAndCountAll({
    ...pagination(req.query), order: [['dueAt', 'DESC']] }), 'ROI payout records')));
adminRouter.get('/repayment-account', handle(async (req, res) => {
    const config = requireEnabled();
    const result = await createClient().subwallets();
    const wallets = Array.isArray(result) ? result : result?.data;
    if (!Array.isArray(wallets)) throw new PaymentError('Unexpected subwallet response');
    const wallet = wallets.find(row => row.id === config.repaymentSubwalletId);
    if (!wallet) throw new PaymentError('Repayment subwallet is not configured or was not found', 503);
    return res.success(wallet, 'Fund this merchant account to cover ROI payouts and provider fees');
}));
adminRouter.get('/projects/:projectId', handle(async (req, res) => {
    const { models } = storage();
    const escrow = await models.ProjectEscrow.findOne({ where: { userFarmInvestmentId: uuid(req.params.projectId) } });
    if (!escrow) throw new PaymentError('Project escrow not found', 404);
    const releases = await models.EscrowRelease.findAll({ where: { projectEscrowId: escrow.id }, order: [['createdAt', 'ASC']] });
    return res.success({ escrow, releases }, 'Project wallet, escrow, and payout reconciliation');
}));
adminRouter.post('/projects/:projectId/provision', handle(async (req, res) => {
    const { sequelize, models } = storage();
    const escrow = await sequelize.transaction(async transaction => {
        const project = await models.UserFarmInvestment.findByPk(uuid(req.params.projectId), { transaction, lock: transaction.LOCK.UPDATE });
        if (!project) throw new PaymentError('Investment project not found', 404);
        const existing = await models.ProjectEscrow.findOne({ where: { userFarmInvestmentId: project.id }, transaction });
        if (existing) return existing;
        const legacyPayment = await models.InvestmentPayment.findOne({ where: { userFarmInvestmentId: project.id,
            status: { [Op.in]: ['successful', 'recorded', 'pending'] } }, transaction });
        if (amount(project.investmentReceived) !== 0 || legacyPayment) throw new PaymentError('Existing funding must be reconciled before moving this project to PayPetal');
        const farm = await models.UserFarm.findByPk(project.userFarmId, { transaction });
        return getPaymentService().ensureProject(project, farm.userId, transaction);
    });
    return res.success(escrow, 'Physical project account provisioning queued', 202);
}));

module.exports = { router, adminRouter };
