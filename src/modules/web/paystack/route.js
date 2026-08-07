'use strict';

const express = require('express');
const { handlePaystackWebhook } = require('./controller');

const router = express.Router();

/**
 * @swagger
 * /web/payments/paystack/webhook:
 *   post:
 *     tags:
 *       - Web Investments
 *     summary: Receive Paystack payment events
 *     description: Public Paystack webhook secured with the x-paystack-signature HMAC SHA-512 signature. Successful charges settle the saved investment transaction exactly once.
 *     parameters:
 *       - in: header
 *         name: x-paystack-signature
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Event acknowledged
 *       401:
 *         description: Invalid Paystack signature
 *       500:
 *         description: Webhook could not be processed and should be retried
 */
router.post('/webhook', handlePaystackWebhook);

module.exports = router;
