'use strict';

const axios = require('axios');
const JSONbig = require('json-bigint')({ storeAsString: true });
const process = require('node:process');
const { logPaypetalEvent } = require('./paypetalLogger');

class PaypetalError extends Error {
    constructor(message, { statusCode = 502, code = 'paypetal_error', uncertain = false } = {}) {
        super(message);
        this.name = 'PaypetalError';
        Object.assign(this, { statusCode, code, uncertain });
    }
}

function settings(env = process.env) {
    const provider = env.PAYMENTS_PROVIDER || 'paypetal';
    if (!['paystack', 'paypetal'].includes(provider)) {
        throw new PaypetalError('Invalid PAYMENTS_PROVIDER', { statusCode: 503 });
    }
    const enabled = env.PAYPETAL_ENABLED === 'true';
    const baseUrl = env.PAYPETAL_BASE_URL || 'https://sandbox.paypetalhq.xyz';
    if (!['https://sandbox.paypetalhq.xyz', 'https://api.service.paypetal.co'].includes(baseUrl)) {
        throw new PaypetalError('Unsupported PayPetal API host', { statusCode: 503 });
    }
    const responseUnit = env.PAYPETAL_RESPONSE_AMOUNT_UNIT || 'major';
    if (!['major', 'minor'].includes(responseUnit)) throw new PaypetalError('Invalid PayPetal response amount unit', { statusCode: 503 });
    const returnMode = env.PAYPETAL_MATURITY_RETURN || 'roi_only';
    if (!['principal_plus_roi', 'roi_only'].includes(returnMode)) throw new PaypetalError('Invalid maturity return mode', { statusCode: 503 });
    return {
        provider, enabled, baseUrl, responseUnit, returnMode,
        secretKey: env.PAYPETAL_SECRET_KEY, appId: env.PAYPETAL_APP_ID,
        websiteUrl: env.WEBSITE_URL || 'https://smileagrimarket.com',
        repaymentSubwalletId: env.PAYPETAL_REPAYMENT_SUBWALLET_ID,
        depositReconciliation: env.PAYPETAL_DEPOSIT_RECONCILIATION,
        timeoutMs: 20000
    };
}

function requireEnabled() {
    const config = settings();
    if (!config.enabled || !config.secretKey || !config.appId) {
        throw new PaypetalError('PayPetal is not configured and enabled', { statusCode: 503 });
    }
    return config;
}

function createClient({ transport = axios, getSettings = requireEnabled } = {}) {
    let token;
    let expires = 0;
    let authenticating;
    async function send(method, path, data, accessToken, fullResponse = false) {
        const config = getSettings();
        const context = { method: method.toUpperCase(), url: config.baseUrl + path };
        logPaypetalEvent({ event: 'request', ...context });
        let response;
        try {
            response = await transport({
                method, url: config.baseUrl + path, data, timeout: config.timeoutMs,
                headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
                transformResponse: [body => body], validateStatus: () => true
            });
        } catch (error) {
            logPaypetalEvent({ event: 'transport_error', ...context,
                errorCode: error.code, errorMessage: error.message });
            throw new PaypetalError('PayPetal connection failed; reconciliation required', { code: 'transport_error', uncertain: true });
        }
        let body;
        try { body = typeof response.data === 'string' ? JSONbig.parse(response.data) : response.data; }
        catch (_) {
            logPaypetalEvent({ event: 'invalid_response', ...context, httpStatus: response.status,
                responseBody: { unreadable: true, length: String(response.data ?? '').length } });
            throw new PaypetalError('Invalid PayPetal response', { uncertain: true });
        }
        logPaypetalEvent({ event: 'response', ...context, httpStatus: response.status, responseBody: body });
        if (response.status < 200 || response.status >= 300 || ![true, 'success'].includes(body?.status)) {
            throw new PaypetalError('PayPetal request rejected', {
                statusCode: response.status === 401 ? 401 : response.status === 429 ? 429 : 502,
                code: body?.responseData?.code || (response.status === 400 ? 'provider_rejected' : 'provider_unavailable'),
                uncertain: response.status >= 500
            });
        }
        return fullResponse ? body : body.status === true ? body.dataResponse : body.responseData;
    }
    async function authenticate() {
        if (token && expires > Date.now() + 60000) return token;
        if (!authenticating) {
            authenticating = (async () => {
                const config = getSettings();
                const result = await send('post', '/api/auth/login', {
                    base64Hashed: Buffer.from(`${config.secretKey}:${config.appId}`).toString('base64')
                });
                if (!result?.accessToken) throw new PaypetalError('PayPetal authentication returned no token');
                token = result.accessToken;
                const parsed = Date.parse(result.expireAt);
                expires = Number.isFinite(parsed) ? parsed : Date.now() + 3600000;
                return token;
            })().finally(() => { authenticating = null; });
        }
        return authenticating;
    }
    async function request(method, path, data, fullResponse = false) {
        try { return await send(method, path, data, await authenticate(), fullResponse); }
        catch (error) {
            if (error.statusCode !== 401) throw error;
            token = null;
            return send(method, path, data, await authenticate(), fullResponse);
        }
    }
    const encode = encodeURIComponent;
    return {
        request,
        createCustomer: data => request('post', '/api/v1/customer', data, true),
        customers: () => request('get', '/api/v1/customer/all'),
        banks: () => request('get', '/api/v1/account/banks'),
        validateAccount: data => request('post', '/api/v1/account/bank/validate', data),
        payoutAccounts: async customerId => {
            const accounts = [];
            for (let page = 1; page <= 1000; page++) {
                const result = await request('get', `/api/v1/escrow/trustcore/payout?page=${page}&size=100`);
                if (!Array.isArray(result?.content) || !Number.isInteger(result.totalPages)) throw new PaypetalError('Invalid payout account pagination');
                accounts.push(...result.content);
                if (customerId && accounts.some(account => account.customerId === customerId)) return accounts;
                if (page >= result.totalPages) return accounts;
            }
            throw new PaypetalError('Payout account pagination exceeds supported limit');
        },
        addPayoutAccount: (id, data) => request('post', `/api/v1/escrow/trustcore/payout/${encode(id)}`, data),
        updatePayoutAccount: (id, data) => request('put', `/api/v1/escrow/trustcore/payout/${encode(id)}`, data),
        createAgreement: data => request('post', '/api/v1/escrow/trustcores', data),
        agreement: reference => request('get', `/api/v1/escrow/trustcore?reference=${encode(reference)}`),
        milestones: reference => request('get', `/api/v1/escrow/trustcore/${encode(reference)}/milestones`),
        releaseMilestone: (reference, id) => request('put', `/api/v1/escrow/trustcore/${encode(reference)}/milestones/${encode(id)}/release`),
        completeAgreement: reference => request('put', `/api/v1/escrow/trustcore/${encode(reference)}/complete`),
        subwallets: () => request('get', '/api/v1/account/subwallets'),
        createSubwallet: data => request('post', '/api/v1/account/subwallet/create', data)
    };
}

module.exports = { PaypetalError, settings, requireEnabled, createClient };
