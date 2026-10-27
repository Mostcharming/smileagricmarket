'use strict';

const { BlockList, isIP } = require('node:net');
const { createHmac, timingSafeEqual } = require('node:crypto');

// Provisional receiver contract selected locally; adjust when PayPetal supplies its specification.
const DEFAULT_AUTH_MODE = 'hmac_sha256';
const DEFAULT_AUTH_HEADER = 'x-paypetal-signature';

function networkList(value = '') {
    const list = new BlockList();
    const entries = value.split(',').map(item => item.trim()).filter(Boolean);
    if (entries.length > 30) throw new Error('Too many webhook network rules');
    for (const entry of entries) {
        const [address, prefix, extra] = entry.split('/');
        const family = isIP(address);
        if (!family || extra !== undefined) throw new Error('Invalid webhook network rule');
        if (prefix === undefined) list.addAddress(address, family === 4 ? 'ipv4' : 'ipv6');
        else {
            if (!/^\d+$/.test(prefix) || Number(prefix) > (family === 4 ? 32 : 128)) throw new Error('Invalid webhook subnet');
            list.addSubnet(address, Number(prefix), family === 4 ? 'ipv4' : 'ipv6');
        }
    }
    return { list, enabled: entries.length > 0 };
}

function getWebhookConfig(env = process.env) {
    const authMode = env.PAYPETAL_WEBHOOK_AUTH_MODE || DEFAULT_AUTH_MODE;
    const authHeader = String(env.PAYPETAL_WEBHOOK_AUTH_HEADER || DEFAULT_AUTH_HEADER).toLowerCase();
    const secrets = [env.PAYPETAL_WEBHOOK_SECRET, env.PAYPETAL_WEBHOOK_PREVIOUS_SECRET].filter(Boolean);
    // A separate secret is mandatory even for the provisional defaults; unsigned mode is never allowed.
    if (env.PAYPETAL_ENABLED !== 'true' || !['shared_secret', 'hmac_sha256'].includes(authMode)
        || !/^[a-z][a-z0-9-]{0,63}$/.test(authHeader)
        || /^(host|cookie|content-|x-forwarded-|forwarded$)/.test(authHeader)
        || !env.PAYPETAL_WEBHOOK_SECRET || secrets.some(secret => secret.length < 32
            || secret.trim() !== secret || Buffer.byteLength(secret) > 512)) {
        throw new Error('PayPetal webhook authentication is not configured');
    }
    const limit = (value, fallback) => {
        if (value === undefined || value === '') return fallback;
        if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 10000) throw new Error('Invalid webhook rate limit');
        return Number(value);
    };
    if (env.PAYPETAL_WEBHOOK_REQUIRE_HTTPS && !['true', 'false'].includes(env.PAYPETAL_WEBHOOK_REQUIRE_HTTPS)) {
        throw new Error('Invalid webhook HTTPS setting');
    }
    if (env.NODE_ENV === 'production' && env.PAYPETAL_WEBHOOK_REQUIRE_HTTPS === 'false') {
        throw new Error('Production webhooks require HTTPS');
    }
    return { authMode, authHeader, secrets,
        requireHttps: env.NODE_ENV === 'production' || env.PAYPETAL_WEBHOOK_REQUIRE_HTTPS === 'true',
        trustedProxies: networkList(env.PAYPETAL_WEBHOOK_TRUSTED_PROXIES),
        allowedIps: networkList(env.PAYPETAL_WEBHOOK_ALLOWED_IPS),
        ipLimit: limit(env.PAYPETAL_WEBHOOK_IP_LIMIT_PER_MINUTE, 120),
        globalLimit: limit(env.PAYPETAL_WEBHOOK_GLOBAL_LIMIT_PER_MINUTE, 600) };
}

function normalizeIp(value) {
    if (typeof value !== 'string') return null;
    const ip = value.toLowerCase().startsWith('::ffff:') && isIP(value.slice(7)) === 4 ? value.slice(7) : value;
    return isIP(ip) ? ip : null;
}
function inList(ip, rules) {
    return Boolean(ip && rules.list.check(ip, isIP(ip) === 4 ? 'ipv4' : 'ipv6'));
}

function webhookSource(req, config) {
    const peer = normalizeIp(req.socket.remoteAddress);
    if (!peer) return { ip: null, secure: false };
    const trustedPeer = inList(peer, config.trustedProxies);
    let ip = peer;
    if (trustedPeer && req.headers['x-forwarded-for'] !== undefined) {
        const value = req.headers['x-forwarded-for'];
        if (typeof value !== 'string' || value.length > 2048) return { ip: null, secure: false };
        const chain = value.split(',').map(item => normalizeIp(item.trim()));
        if (chain.length > 16 || chain.some(item => !item)) return { ip: null, secure: false };
        for (const address of chain.reverse()) {
            if (!inList(ip, config.trustedProxies)) break;
            ip = address;
        }
    }
    return { ip, secure: Boolean(req.socket.encrypted || (trustedPeer && req.headers['x-forwarded-proto'] === 'https')) };
}

function authenticateWebhook(req, config, rawBody) {
    const received = req.headers[config.authHeader];
    const occurrences = (req.rawHeaders || []).filter((value, index) => index % 2 === 0 && value.toLowerCase() === config.authHeader).length;
    if (typeof received !== 'string' || received.length > 512 || occurrences !== 1) return false;
    if (config.authMode === 'hmac_sha256' && !/^[a-f0-9]{64}$/i.test(received)) return false;
    const input = Buffer.from(received, config.authMode === 'hmac_sha256' ? 'hex' : 'utf8');
    let accepted = false;
    for (const secret of config.secrets) {
        const expected = config.authMode === 'hmac_sha256'
            ? createHmac('sha256', secret).update(rawBody).digest() : Buffer.from(secret);
        accepted = (input.length === expected.length && timingSafeEqual(input, expected)) || accepted;
    }
    return accepted;
}

module.exports = { getWebhookConfig, authenticateWebhook, webhookSource, inList, DEFAULT_AUTH_MODE, DEFAULT_AUTH_HEADER };
