'use strict';

const { Op } = require('sequelize');
const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const webInvestments = require('../../web/investments/controller');
const {
    InvestmentTermsError, buildInvestmentQuote, buildInvestmentAgreement
} = require('../../../utils/investmentAgreement');

const { UserFarmInvestment, Investment, UserFarm, InvestmentPayment } = defineModels(sequelize);

async function readQuote(req) {
    const project = await UserFarmInvestment.findOne({
        where: { id: req.params.investmentProjectId, isActive: true }
    });
    if (!project) throw new InvestmentTermsError('Investment project not found', 404);
    const farm = await UserFarm.findOne({
        where: {
            id: project.userFarmId, isActive: true, verificationStatus: 'approved',
            userId: { [Op.in]: sequelize.literal("(SELECT user_id FROM kyc WHERE status = 'approved')") }
        },
        attributes: ['id', 'userId', 'name']
    });
    if (!farm) throw new InvestmentTermsError('Verified investment farm not found', 404);
    if (farm.userId === req.user.id) throw new InvestmentTermsError('You cannot invest in your own farm', 403);
    const template = await Investment.findOne({ where: { id: project.investmentId, isActive: true } });
    if (!template) throw new InvestmentTermsError('Investment template not found', 404);
    const pendingAmount = await InvestmentPayment.sum('amount', {
        where: { userFarmInvestmentId: project.id, status: 'pending' }
    });
    // A project has one fixed term; the client must select another project to change it.
    if (req.query.durationValue !== undefined || req.query.durationUnit !== undefined) {
        throw new InvestmentTermsError('Duration is fixed by the project; select another project to change it');
    }
    if (req.query.currency !== undefined
        && String(req.query.currency).toUpperCase() !== String(project.currency || template.currency).toUpperCase()) {
        throw new InvestmentTermsError('currency must match the investment project');
    }
    return buildInvestmentQuote({ farm, project, template, amount: req.query.amount, pendingAmount });
}

function handleError(res, error) {
    if (error instanceof InvestmentTermsError) return res.fail(error.message, error.statusCode);
    console.error('Mobile investment request failed:', error);
    return res.fail('Failed to retrieve investment information', 500);
}

async function getQuote(req, res) {
    try {
        return res.success(await readQuote(req), 'Investment calculation retrieved successfully');
    } catch (error) { return handleError(res, error); }
}

async function getAgreementPreview(req, res) {
    try {
        const quote = await readQuote(req);
        return res.success({ quote, agreement: buildInvestmentAgreement(quote) }, 'Review your investment agreement');
    } catch (error) { return handleError(res, error); }
}

function invest(req, res) {
    return webInvestments.investInFarm(req, res, { requireAgreement: true });
}

async function findOwnedPayment(req) {
    const payment = await InvestmentPayment.findOne({
        where: { id: req.params.transactionId, investorId: req.user.id }
    });
    if (!payment) throw new InvestmentTermsError('Investment transaction not found', 404);
    return payment;
}

async function getPayment(req, res) {
    try {
        const payment = await findOwnedPayment(req);
        const terms = payment.agreement?.terms;
        return res.success({
            transactionId: payment.id,
            reference: payment.reference,
            status: payment.status,
            confirmed: payment.status === 'successful',
            amount: Number(payment.amount),
            currency: payment.currency,
            farmId: payment.userFarmId,
            investmentProjectId: payment.userFarmInvestmentId,
            farmName: terms?.farmName || null,
            roiPercentage: terms?.roiPercentage ?? null,
            duration: terms?.duration || null,
            expectedProfit: terms?.expectedProfit ?? null,
            totalReturn: terms?.totalReturn ?? null,
            payoutDate: terms?.payoutDate || null,
            paidAt: payment.paidAt,
            agreementAvailable: !!payment.agreement
        }, payment.status === 'successful' ? 'Investment confirmed' : 'Investment payment status retrieved');
    } catch (error) { return handleError(res, error); }
}

async function getAcceptedAgreement(req, res) {
    try {
        const payment = await findOwnedPayment(req);
        if (!payment.agreement) throw new InvestmentTermsError('No accepted agreement exists for this transaction', 404);
        if (req.query.download !== undefined && !['true', 'false'].includes(req.query.download)) {
            throw new InvestmentTermsError('download must be true or false');
        }
        const agreement = payment.agreement;
        if (req.query.download !== 'true') {
            return res.success({ transactionId: payment.id, paymentStatus: payment.status, agreement }, 'Accepted investment agreement retrieved');
        }
        const terms = agreement.terms;
        const money = value => `${terms.currency} ${Number(value).toFixed(2)}`;
        const text = [
            'SMILE AGRIC - INVESTMENT AGREEMENT',
            `Reference: ${agreement.reference}`, `Version: ${agreement.version}`,
            `Transaction: ${payment.id}`, `Payment status: ${payment.status}`,
            `Investor: ${agreement.acceptedBy}`, `Accepted at: ${agreement.acceptedAt}`,
            '', `Farm: ${terms.farmName}`, `Project: ${terms.investmentProjectId}`,
            `Principal: ${money(terms.principal)}`, `Projected profit: ${money(terms.expectedProfit)}`,
            `Projected total return: ${money(terms.totalReturn)}`, `ROI: ${terms.roiPercentage}%`,
            `Term: ${terms.duration.label}`, `Start date: ${terms.startDate}`, `Maturity: ${terms.payoutDate}`,
            'Payout frequency: at maturity', 'Early exit: not permitted before maturity', '',
            ...agreement.sections.flatMap(section => [section.title, section.text, '']),
            'ACKNOWLEDGEMENTS',
            ...Object.entries(agreement.acknowledgements).map(([key, label]) =>
                `${agreement.acceptance[key] ? '[Accepted]' : '[Not accepted]'} ${label}`)
        ].join('\n');
        res.set('Content-Disposition', `attachment; filename="investment-agreement-${payment.id}.txt"`);
        return res.type('text/plain').send(text);
    } catch (error) { return handleError(res, error); }
}

module.exports = { getQuote, getAgreementPreview, invest, getPayment, getAcceptedAgreement };
