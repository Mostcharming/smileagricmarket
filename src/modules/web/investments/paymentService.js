'use strict';

const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const { resolveInvestmentProjectStatus } = require('../../../utils/investmentProject');

const models = defineModels(sequelize);
const { InvestmentPayment, UserFarmInvestment } = models;

function majorAmountToSubunit(value) {
    const normalized = String(value ?? '').trim();
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;

    const amount = Number(normalized);
    const subunit = Math.round(amount * 100);
    return Number.isSafeInteger(subunit) ? subunit : null;
}

function parseSubunit(value) {
    const normalized = String(value ?? '').trim();
    if (!/^\d+$/.test(normalized)) return null;

    const subunit = Number(normalized);
    return Number.isSafeInteger(subunit) ? subunit : null;
}

function toMoney(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function fromSubunit(value) {
    return Number((value / 100).toFixed(2));
}

function mapPaystackStatus(status) {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'success') return 'successful';
    if (normalized === 'abandoned') return 'cancelled';
    if (['failed', 'reversed'].includes(normalized)) return 'failed';
    return 'pending';
}

function parsePaidAt(value) {
    if (!value) return null;
    const paidAt = new Date(value);
    return Number.isNaN(paidAt.getTime()) ? null : paidAt;
}

async function settlePaystackPayment(paymentId, gatewayData) {
    return sequelize.transaction(async transaction => {
        const payment = await InvestmentPayment.findByPk(paymentId, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!payment) {
            return {
                error: 'Investment transaction not found',
                statusCode: 404
            };
        }

        if (payment.status === 'successful') {
            const farmInvestment = await UserFarmInvestment.findByPk(
                payment.userFarmInvestmentId,
                { transaction }
            );

            return {
                payment,
                farmInvestment,
                credited: false,
                alreadySettled: true
            };
        }

        const gatewayTransactionId = gatewayData?.id === undefined
            || gatewayData?.id === null
            ? null
            : String(gatewayData.id);
        const gatewayReference = String(gatewayData?.reference || '');
        const gatewayStatus = mapPaystackStatus(gatewayData?.status);
        const expectedSubunit = majorAmountToSubunit(payment.amount);
        const receivedSubunit = parseSubunit(gatewayData?.amount);
        const expectedCurrency = String(payment.currency || '').toUpperCase();
        const receivedCurrency = String(gatewayData?.currency || '').toUpperCase();
        const commonUpdate = {
            gatewayTransactionId,
            gatewayReference: gatewayReference || payment.gatewayReference,
            gatewayResponse: gatewayData
        };

        if (!gatewayReference || gatewayReference !== payment.reference) {
            await payment.update({
                ...commonUpdate,
                status: 'failed'
            }, { transaction });

            return {
                payment,
                error: 'Paystack transaction reference does not match',
                statusCode: 409
            };
        }

        if (receivedSubunit === null || receivedSubunit !== expectedSubunit) {
            await payment.update({
                ...commonUpdate,
                status: 'failed'
            }, { transaction });

            return {
                payment,
                error: 'Paystack transaction amount does not match',
                statusCode: 409
            };
        }

        if (!receivedCurrency || receivedCurrency !== expectedCurrency) {
            await payment.update({
                ...commonUpdate,
                status: 'failed'
            }, { transaction });

            return {
                payment,
                error: 'Paystack transaction currency does not match',
                statusCode: 409
            };
        }

        if (gatewayStatus !== 'successful') {
            await payment.update({
                ...commonUpdate,
                status: gatewayStatus
            }, { transaction });

            const farmInvestment = await UserFarmInvestment.findByPk(
                payment.userFarmInvestmentId,
                { transaction }
            );

            return {
                payment,
                farmInvestment,
                credited: false,
                alreadySettled: false
            };
        }

        const farmInvestment = await UserFarmInvestment.findByPk(
            payment.userFarmInvestmentId,
            {
                transaction,
                lock: transaction.LOCK.UPDATE
            }
        );

        if (!farmInvestment) {
            return {
                error: 'Farm funding record not found',
                statusCode: 409
            };
        }

        const expectedFunding = toMoney(farmInvestment.expectedInvestment);
        const fundingReceived = toMoney(farmInvestment.investmentReceived);
        const nextFundingReceived = Number(
            (fundingReceived + toMoney(payment.amount)).toFixed(2)
        );
        const nextFundingPending = Math.max(
            Number((expectedFunding - nextFundingReceived).toFixed(2)),
            0
        );
        const nextInvestmentStatus = resolveInvestmentProjectStatus({
            investmentStatus: farmInvestment.investmentStatus,
            investmentReceived: nextFundingReceived,
            expectedInvestment: expectedFunding,
            endDate: farmInvestment.endDate
        });

        await farmInvestment.update({
            investmentReceived: nextFundingReceived,
            investmentPending: nextFundingPending,
            investmentStatus: nextInvestmentStatus
        }, { transaction });

        await payment.update({
            ...commonUpdate,
            status: 'successful',
            paidAt: parsePaidAt(gatewayData?.paid_at || gatewayData?.paidAt) || new Date()
        }, { transaction });

        return {
            payment,
            farmInvestment,
            credited: true,
            alreadySettled: false
        };
    });
}

module.exports = {
    majorAmountToSubunit,
    settlePaystackPayment
};
