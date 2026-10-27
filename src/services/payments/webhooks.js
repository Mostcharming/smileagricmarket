'use strict';

const { Op, QueryTypes } = require('sequelize');
const { createHash } = require('node:crypto');
const { PaymentError } = require('./domain');

function webhookIdentity(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new PaymentError('Invalid webhook payload', 400);
    // These are explicit supported envelopes, pending PayPetal's final webhook contract.
    const candidates = [payload, payload.data, payload.dataResponse, payload.responseData,
        payload.dataResponse?.data, payload.responseData?.data].filter(value => value && typeof value === 'object' && !Array.isArray(value));
    const read = name => {
        const values = [...new Set(candidates.filter(value => Object.hasOwn(value, name)).map(value => value[name]))];
        if (values.length > 1 || values.some(value => typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value))) {
            throw new PaymentError('Invalid or conflicting webhook transaction identity', 400);
        }
        return values[0];
    };
    const reference = read('reference');
    const transactionId = read('transactionId');
    if (!reference && !transactionId) throw new PaymentError('Webhook must identify a transaction', 400);
    return { reference, transactionId };
}

function createPaymentWebhooks({ sequelize, models, confirmInvestment, now = () => new Date() }) {
    const { InvestmentPayment, PaymentWebhook, PaymentJob } = models;

    async function consumeWebhookRateLimit(ip, config) {
        for (const [key, maximum] of [['global', config.globalLimit],
            ['ip:' + createHash('sha256').update(ip).digest('hex'), config.ipLimit]]) {
            // PostgreSQL's clock and atomic upsert enforce one limit across PM2 workers and hosts.
            const [row] = await sequelize.query(`
                INSERT INTO payment_webhook_rate_limits (key, request_count, expires_at, created_at, updated_at)
                VALUES (:key, 1, date_trunc('minute', CURRENT_TIMESTAMP) + INTERVAL '1 minute', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE SET
                    request_count = CASE WHEN payment_webhook_rate_limits.expires_at <= CURRENT_TIMESTAMP THEN 1
                        ELSE LEAST(payment_webhook_rate_limits.request_count + 1, :maximum + 1) END,
                    expires_at = CASE WHEN payment_webhook_rate_limits.expires_at <= CURRENT_TIMESTAMP
                        THEN date_trunc('minute', CURRENT_TIMESTAMP) + INTERVAL '1 minute'
                        ELSE payment_webhook_rate_limits.expires_at END,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING request_count AS count,
                    GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - CURRENT_TIMESTAMP)))) AS "retryAfter"`,
            { replacements: { key, maximum }, type: QueryTypes.SELECT });
            if (Number(row.count) > maximum) return { allowed: false, retryAfter: Number(row.retryAfter) };
            if (key === 'global' && Number(row.count) === 1) await sequelize.query(
                "DELETE FROM payment_webhook_rate_limits WHERE key <> 'global' AND expires_at < CURRENT_TIMESTAMP - INTERVAL '10 minutes'"
            );
        }
        return { allowed: true };
    }

    async function receiveWebhook({ payload, bodyHash }) {
        const { reference, transactionId } = webhookIdentity(payload);
        if (!/^[a-f0-9]{64}$/.test(bodyHash || '')) throw new PaymentError('Invalid webhook digest', 400);
        return sequelize.transaction(async transaction => {
            const payment = await InvestmentPayment.findOne({ where: { gateway: 'paypetal',
                [Op.or]: [...(reference ? [{ reference }] : []), ...(transactionId ? [{ gatewayTransactionId: transactionId }] : [])] },
            transaction, lock: transaction.LOCK.UPDATE });
            if (!payment || (reference && payment.reference !== reference)
                || (transactionId && payment.gatewayTransactionId && transactionId !== payment.gatewayTransactionId)
                || (!payment.initiationAttemptedAt && !payment.gatewayResponse?.initialization)) return { ignored: true };
            const [receipt] = await PaymentWebhook.findOrCreate({ where: { bodyHash },
                defaults: { investmentPaymentId: payment.id, payload }, transaction });
            if (receipt.investmentPaymentId !== payment.id) throw new PaymentError('Conflicting webhook receipt');
            if (payment.status === 'successful') {
                await receipt.update({ status: 'processed', processedAt: now() }, { transaction });
                return { duplicate: true };
            }
            const [job, created] = await PaymentJob.findOrCreate({ where: { key: `confirm_investment:${payment.id}` },
                defaults: { action: 'confirm_investment', entityId: payment.id, availableAt: now() }, transaction });
            // Never take over an active lease or unblock a failed financial identity check.
            if (!created && (job.status === 'completed'
                || (job.status === 'blocked' && job.lastError === 'Provider request failed; reconcile and retry'))) {
                await job.update({ status: 'pending', attempts: 0, lastError: null,
                    availableAt: new Date(Math.max(now().getTime(), new Date(job.availableAt).getTime())) }, { transaction });
            }
            return { queued: true };
        });
    }

    async function processInvestmentWebhook(paymentId, attempts) {
        const payment = await InvestmentPayment.findByPk(paymentId);
        if (!payment || payment.gateway !== 'paypetal') throw new PaymentError('PayPetal investment payment not found', 404);
        // The notification's claimed status/amount/payer is never used to settle funds.
        const result = await confirmInvestment(payment.id, payment.investorId);
        const pending = result.payment.status === 'pending';
        await PaymentWebhook.update({ status: pending ? 'awaiting_payment' : 'processed', processedAt: pending ? null : now() },
            { where: { investmentPaymentId: payment.id, status: { [Op.in]: ['queued', 'awaiting_payment'] } } });
        // Allow brief provider consistency delays; later notifications can requeue a pending payment.
        return !pending || attempts >= 10;
    }

    return { consumeWebhookRateLimit, receiveWebhook, processInvestmentWebhook };
}

module.exports = { createPaymentWebhooks, webhookIdentity };
