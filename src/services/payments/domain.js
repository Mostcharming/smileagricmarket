'use strict';

const { moneyCents } = require('../../utils/investmentAgreement');

class PaymentError extends Error {
    constructor(message, statusCode = 409) {
        super(message);
        this.name = 'PaymentError';
        this.statusCode = statusCode;
    }
}
const amount = value => {
    const cents = moneyCents(value);
    if (cents === null || cents > 999999999999999) throw new PaymentError('Invalid monetary amount');
    return cents;
};
const decimal = cents => {
    if (!Number.isSafeInteger(cents) || cents < 0 || cents > 999999999999999) throw new PaymentError('Amount exceeds database monetary range');
    return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
};

function allocateMilestones(principal, milestones) {
    const total = amount(principal);
    const ordered = [...milestones].sort((a, b) => a.order - b.order || String(a.id).localeCompare(String(b.id)));
    if (ordered.some(item => !Number.isInteger(item.order) || item.order < 0 || !item.name)
        || new Set(ordered.map(item => item.order)).size !== ordered.length) {
        throw new PaymentError('Project milestones require names and distinct integer orders');
    }
    const percentages = ordered.map(item => amount(item.fundReleasePercentage));
    if (!ordered.length || percentages.some(value => value <= 0) || percentages.reduce((sum, value) => sum + value, 0) !== 10000) {
        throw new PaymentError('Project milestones must have positive percentages totaling 100%');
    }
    const rows = ordered.map((item, i) => {
        const product = BigInt(total) * BigInt(percentages[i]);
        return { milestoneId: item.id, description: item.name, order: item.order, cents: Number(product / 10000n), remainder: Number(product % 10000n) };
    });
    const remaining = total - rows.reduce((sum, row) => sum + row.cents, 0);
    [...rows].sort((a, b) => b.remainder - a.remainder || a.order - b.order).slice(0, remaining).forEach(row => { row.cents++; });
    if (rows.some(row => row.cents <= 0)) throw new PaymentError('Investment is too small to fund every milestone');
    return rows.map(({ remainder, ...row }) => row);
}

function providerAmount(value, unit) {
    if (unit === 'major') return amount(value);
    if (!/^\d+$/.test(String(value))) throw new PaymentError('Invalid provider amount');
    const result = Number(value);
    if (!Number.isSafeInteger(result)) throw new PaymentError('Provider amount exceeds supported range');
    return result;
}

function assertAgreement(record, remote, unit = 'major') {
    if (!remote || remote.reference !== record.reference || remote.currency !== record.currency
        || providerAmount(remote.amount, unit) !== amount(record.amount)
        || remote.receiverCustomer?.customerId !== record.counterparty
        || (record.kind === 'investment' && remote.payerCustomer?.customerId !== record.initiator)
        || remote.metadata?.smileAgreementId !== record.id) {
        throw new PaymentError('PayPetal agreement identity or amount does not match the saved instruction');
    }
    return remote;
}

function maturityTerms(payment, project, template, mode) {
    const terms = payment.agreement?.terms;
    mode = terms?.maturityReturnMode || mode;
    if (!['roi_only', 'principal_plus_roi'].includes(mode)) throw new PaymentError('Invalid saved maturity payout mode');
    const principal = amount(payment.amount);
    const percentage = terms?.roiPercentage ?? template?.roiPercentage;
    const basisPoints = amount(percentage);
    const profit = Number((BigInt(principal) * BigInt(basisPoints) + 5000n) / 10000n);
    const cents = mode === 'roi_only' ? profit : principal + profit;
    if (!Number.isSafeInteger(cents)) throw new PaymentError('Maturity payout exceeds supported range');
    const date = terms?.payoutDate || project.endDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new PaymentError('Investment maturity date is missing');
    const dueAt = new Date(`${date}T23:59:59.999Z`);
    if (Number.isNaN(dueAt.getTime())) throw new PaymentError('Invalid maturity date');
    return { principal: decimal(principal), roi: decimal(profit), amount: decimal(cents), currency: payment.currency, dueAt, returnMode: mode };
}

function listData(result) {
    const list = Array.isArray(result) ? result : result?.data || result?.milestones || result?.content;
    if (!Array.isArray(list)) throw new PaymentError('Unexpected PayPetal list response');
    return list;
}

module.exports = { PaymentError, amount, decimal, allocateMilestones, providerAmount, assertAgreement, maturityTerms, listData };
