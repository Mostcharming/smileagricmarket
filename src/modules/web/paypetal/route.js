'use strict';

const express = require('express');
const { createHash } = require('node:crypto');
const JSONbig = require('json-bigint')({ storeAsString: true });
const { getWebhookConfig, authenticateWebhook, webhookSource, inList } = require('../../../middlewares/common/paypetalWebhookSecurity');
const { webhookIdentity } = require('../../../services/payments/webhooks');

function createPaypetalWebhookRouter({ getConfig = getWebhookConfig,
    getService = () => require('../../../services/payments/service').getPaymentService(),
    now = Date.now, logger = console, transportGlobalLimit = 1200, transportIpLimit = 240, bodyTimeoutMs = 10000 } = {}) {
    const router = express.Router();
    let minute = -1;
    let requests = 0;
    const addresses = new Map();
    const reject = (res, status) => res.writableEnded ? res : res.status(status).json({ received: false });
    const throttled = res => {
        res.set('Retry-After', String(Math.max(1, 60 - Math.floor(now() / 1000) % 60)));
        return reject(res, 429);
    };
    router.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        const current = Math.floor(now() / 60000);
        if (minute !== current) { minute = current; requests = 0; addresses.clear(); }
        // This cheap, bounded guard also covers invalid signatures and malformed requests.
        requests = Math.min(requests + 1, transportGlobalLimit + 1);
        if (requests > transportGlobalLimit) return throttled(res);
        if (req.method !== 'POST') { res.set('Allow', 'POST'); return reject(res, 405); }
        try { req.webhookConfig = getConfig(); }
        catch (_) { return reject(res, 503); }
        const source = webhookSource(req, req.webhookConfig);
        if (!source.ip) return reject(res, 400);
        const count = (addresses.get(source.ip) || 0) + 1;
        addresses.set(source.ip, Math.min(count, transportIpLimit + 1));
        if (count > transportIpLimit) return throttled(res);
        if (req.webhookConfig.requireHttps && !source.secure) return reject(res, 400);
        if (req.webhookConfig.allowedIps.enabled && !inList(source.ip, req.webhookConfig.allowedIps)) return reject(res, 403);
        if (!req.is('application/json')) return reject(res, 415);
        req.webhookIp = source.ip;
        const deadline = setTimeout(() => {
            if (!res.headersSent) { res.set('Connection', 'close'); reject(res, 408); }
        }, bodyTimeoutMs);
        deadline.unref();
        const clear = () => clearTimeout(deadline);
        req.once('end', clear); req.once('aborted', clear); res.once('close', clear);
        next();
    });
    router.post('/', express.raw({ type: 'application/json', limit: '16kb', inflate: false }), async (req, res) => {
        if (res.writableEnded) return;
        if (!Buffer.isBuffer(req.body) || !req.body.length) return reject(res, 400);
        if (!authenticateWebhook(req, req.webhookConfig, req.body)) return reject(res, 401);
        let payload;
        try { payload = JSONbig.parse(req.body.toString('utf8')); webhookIdentity(payload); }
        catch (_) { return reject(res, 400); }
        try {
            const service = getService();
            const rate = await service.consumeWebhookRateLimit(req.webhookIp, req.webhookConfig);
            if (!rate.allowed) { res.set('Retry-After', String(rate.retryAfter)); return reject(res, 429); }
            await service.receiveWebhook({ payload, bodyHash: createHash('sha256').update(req.body).digest('hex') });
            // Return only after the receipt and durable verification job have committed.
            return res.status(200).json({ received: true });
        } catch (error) {
            if (error.name === 'PaymentError' && error.statusCode === 400) return reject(res, 400);
            logger.error('PayPetal webhook storage unavailable; notification must be retried');
            return reject(res, 503);
        }
    });
    router.use((error, req, res, next) => reject(res,
        error.type === 'entity.too.large' ? 413 : error.status === 415 ? 415 : 400));
    return router;
}

module.exports = { createPaypetalWebhookRouter };
