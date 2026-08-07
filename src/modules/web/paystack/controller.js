'use strict';

const { createHmac, timingSafeEqual } = require('crypto');
const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const {
    PaystackError,
    getPaystackConfig,
    parseResponseBody
} = require('../../../utils/paystack');
const {
    settlePaystackPayment
} = require('../investments/paymentService');

const models = defineModels(sequelize);
const { InvestmentPayment } = models;

function signaturesMatch(receivedSignature, expectedSignature) {
    if (!receivedSignature || !expectedSignature) return false;

    const received = Buffer.from(String(receivedSignature), 'utf8');
    const expected = Buffer.from(String(expectedSignature), 'utf8');
    return received.length === expected.length && timingSafeEqual(received, expected);
}

async function handlePaystackWebhook(req, res) {
    try {
        const { secretKey } = getPaystackConfig();
        const rawBody = req.rawBody;
        if (!rawBody) {
            return res.status(400).json({ received: false });
        }

        const expectedSignature = createHmac('sha512', secretKey)
            .update(rawBody)
            .digest('hex');
        if (!signaturesMatch(req.get('x-paystack-signature'), expectedSignature)) {
            return res.status(401).json({ received: false });
        }

        const event = parseResponseBody(rawBody.toString('utf8'));
        if (event?.event !== 'charge.success') {
            return res.status(200).json({ received: true });
        }

        const reference = event?.data?.reference;
        const payment = reference
            ? await InvestmentPayment.findOne({ where: { reference } })
            : null;

        if (!payment) {
            console.warn('Paystack webhook referenced an unknown investment payment:', reference);
            return res.status(200).json({ received: true });
        }

        const settlement = await settlePaystackPayment(payment.id, event.data);
        if (settlement.error) {
            console.error('Paystack webhook settlement rejected:', settlement.error);
        }

        return res.status(200).json({ received: true });
    } catch (error) {
        if (error instanceof PaystackError) {
            return res.status(error.statusCode).json({ received: false });
        }

        console.error('Paystack webhook error:', error);
        return res.status(500).json({ received: false });
    }
}

module.exports = {
    handlePaystackWebhook
};
