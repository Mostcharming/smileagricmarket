'use strict';

const { createHash } = require('crypto');
const { resolveInvestmentProjectStatus } = require('./investmentProject');

const ACKNOWLEDGEMENTS = {
    risksUnderstood: 'I understand that projected profits are not guaranteed and losses are possible.',
    termsAccepted: 'I have read and accept the investment terms shown in this agreement.',
    fundsLockedUntilMaturity: 'I understand that my funds are locked until maturity.'
};
const SECTIONS = [
    { id: 'funding', title: 'Funding and milestone review', text: 'Project funding and milestone progress are tracked by Smile Agric. Milestone funding requests are subject to review.' },
    { id: 'profit', title: 'Projected returns', text: 'Expected profit is calculated from the principal and the project ROI for the stated term. It is an estimate, not a guaranteed return.' },
    { id: 'rights', title: 'Investor records', text: 'You can view your payment status, invested farm, project progress, and accepted agreement from your account.' },
    { id: 'risk', title: 'Risk disclaimer', text: 'Agricultural investments carry risks, including crop failure, weather, market prices, and delays. You may lose some or all of your investment.' }
];

class InvestmentTermsError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = 'InvestmentTermsError';
        this.statusCode = statusCode;
    }
}

// Parse money as integers, including at the upper end of DECIMAL(15, 2).
function moneyCents(value) {
    if (!['number', 'string'].includes(typeof value)) return null;
    const match = String(value).trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
    if (!match) return null;
    const cents = BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'));
    return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

function buildInvestmentQuote({ farm, project, template, amount, pendingAmount = 0, asOf = new Date() }) {
    if (!project?.isActive || !template?.isActive
        || resolveInvestmentProjectStatus(project, asOf) === 'completed') {
        throw new InvestmentTermsError('Investment project is not available', 409);
    }
    const goal = moneyCents(project.expectedInvestment ?? template.fundingMaxGoal);
    const raised = moneyCents(project.investmentReceived ?? 0);
    const reserved = moneyCents(pendingAmount ?? 0);
    const minimum = moneyCents(template.investmentMinGoal);
    const maximum = moneyCents(template.investmentMaxGoal);
    const roiBasisPoints = moneyCents(template.roiPercentage);
    const durationValue = Number(template.durationValue);
    if (goal === null || goal <= 0 || raised === null || reserved === null
        || minimum === null || maximum === null || maximum < minimum
        || roiBasisPoints === null || !Number.isInteger(durationValue) || durationValue <= 0
        || !['weeks', 'months', 'years'].includes(template.durationUnit)
        || !project.startDate || !project.endDate) {
        throw new InvestmentTermsError('Investment project terms are incomplete', 409);
    }
    const remaining = Math.max(goal - raised - reserved, 0);
    const maxAmount = Math.min(maximum, remaining);
    const minAmount = Math.min(minimum, remaining);
    if (remaining === 0 || maxAmount <= 0 || maxAmount < minAmount) {
        throw new InvestmentTermsError('This project has no unreserved funding remaining', 409);
    }
    const principal = amount === undefined ? Math.max(minAmount, 1) : moneyCents(amount);
    if (principal === null || principal <= 0) {
        throw new InvestmentTermsError('amount must be a positive number with no more than two decimal places');
    }
    if (principal < minAmount || principal > maxAmount) {
        throw new InvestmentTermsError(`amount must be between ${minAmount / 100} and ${maxAmount / 100}`);
    }
    const profit = (BigInt(principal) * BigInt(roiBasisPoints) + 5000n) / 10000n;
    const total = BigInt(principal) + profit;
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new InvestmentTermsError('Projected return exceeds the supported monetary range');
    }
    const currency = String(project.currency || template.currency || 'NGN').toUpperCase();
    return {
        farmId: farm.id,
        farmName: farm.name,
        investmentProjectId: project.id,
        investmentTemplateId: template.id,
        investmentName: template.name,
        currency,
        principal: principal / 100,
        expectedProfit: Number(profit) / 100,
        totalReturn: Number(total) / 100,
        roiPercentage: roiBasisPoints / 100,
        riskLevel: template.riskLevel,
        duration: { value: durationValue, unit: template.durationUnit, label: `${durationValue} ${template.durationUnit}` },
        startDate: project.startDate,
        payoutDate: project.endDate,
        durationEditable: false,
        limits: { minimumAmount: minAmount / 100, maximumAmount: maxAmount / 100, remainingFunding: remaining / 100 },
        suggestedAmounts: [50000, 100000, 500000, 1000000, 2000000, 3000000]
            .filter(value => value * 100 >= minAmount && value * 100 <= maxAmount)
    };
}

function buildInvestmentAgreement(quote) {
    // Availability changes do not alter the terms accepted by an investor.
    const { limits, suggestedAmounts, durationEditable, ...terms } = quote;
    const content = {
        revision: '2026-09-23',
        terms: { ...terms, payoutFrequency: 'at_maturity', earlyExitAllowed: false },
        sections: SECTIONS.map(section => ({ ...section })),
        acknowledgements: { ...ACKNOWLEDGEMENTS }
    };
    const version = createHash('sha256').update(JSON.stringify(content)).digest('hex');
    return { reference: `AGR-${version.slice(0, 12).toUpperCase()}`, version, ...content };
}

function validateAgreementAcceptance(acceptance) {
    if (!acceptance || typeof acceptance.version !== 'string'
        || !/^[a-f0-9]{64}$/.test(acceptance.version)
        || Object.keys(ACKNOWLEDGEMENTS).some(key => acceptance[key] !== true)) {
        throw new InvestmentTermsError('Review the agreement and explicitly accept all three acknowledgements');
    }
}

function acceptInvestmentAgreement(agreement, acceptance, investorId) {
    validateAgreementAcceptance(acceptance);
    if (acceptance.version !== agreement.version) {
        throw new InvestmentTermsError('Investment terms have changed. Review the agreement again before paying', 409);
    }
    return {
        ...agreement,
        acceptedBy: investorId,
        acceptedAt: new Date().toISOString(),
        acceptance: Object.fromEntries(Object.keys(ACKNOWLEDGEMENTS).map(key => [key, true]))
    };
}

function assertSameAgreement(payment, acceptance) {
    if (!payment.agreement || payment.agreement.version !== acceptance.version) {
        throw new InvestmentTermsError('This Idempotency-Key belongs to a different agreement', 409);
    }
}

module.exports = {
    ACKNOWLEDGEMENTS, InvestmentTermsError, moneyCents, buildInvestmentQuote,
    buildInvestmentAgreement, validateAgreementAcceptance, acceptInvestmentAgreement,
    assertSameAgreement
};
