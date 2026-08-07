'use strict';

const axios = require('axios');
const JSONbig = require('json-bigint')({ storeAsString: true });
const config = require('../config');

class PaystackError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'PaystackError';
        this.statusCode = options.statusCode || 502;
        this.code = options.code || 'paystack_error';
        this.gatewayData = options.gatewayData || null;
    }
}

function getPaystackConfig() {
    const paystackConfig = config.paystack || {};

    if (!paystackConfig.secretKey) {
        throw new PaystackError('Paystack is not configured', {
            statusCode: 503,
            code: 'paystack_not_configured'
        });
    }

    return paystackConfig;
}

function parseResponseBody(rawBody) {
    if (rawBody === null || rawBody === undefined || rawBody === '') return null;
    if (typeof rawBody === 'object') return rawBody;

    try {
        return JSONbig.parse(rawBody);
    } catch (error) {
        throw new PaystackError('Paystack returned an invalid response', {
            code: 'paystack_invalid_response'
        });
    }
}

async function paystackRequest(method, url, data) {
    const paystackConfig = getPaystackConfig();
    let response;

    try {
        response = await axios({
            method,
            url: `${paystackConfig.baseUrl}${url}`,
            data,
            timeout: paystackConfig.timeoutMs,
            headers: {
                Authorization: `Bearer ${paystackConfig.secretKey}`,
                'Content-Type': 'application/json'
            },
            transformResponse: [body => body],
            validateStatus: () => true
        });
    } catch (error) {
        throw new PaystackError(
            error.code === 'ECONNABORTED'
                ? 'Paystack request timed out'
                : 'Unable to connect to Paystack',
            {
                code: error.code === 'ECONNABORTED'
                    ? 'paystack_timeout'
                    : 'paystack_unavailable'
            }
        );
    }

    const responseBody = parseResponseBody(response.data);
    if (
        response.status < 200
        || response.status >= 300
        || responseBody?.status !== true
    ) {
        throw new PaystackError(
            responseBody?.message || 'Paystack rejected the request',
            {
                code: 'paystack_rejected',
                gatewayData: responseBody
            }
        );
    }

    return responseBody;
}

async function initializeTransaction({
    email,
    amountInSubunit,
    currency,
    reference,
    metadata
}) {
    const paystackConfig = getPaystackConfig();

    return paystackRequest('post', '/transaction/initialize', {
        email,
        amount: String(amountInSubunit),
        currency,
        reference,
        callback_url: paystackConfig.callbackUrl,
        metadata: JSON.stringify(metadata)
    });
}

async function verifyTransaction(reference) {
    return paystackRequest(
        'get',
        `/transaction/verify/${encodeURIComponent(reference)}`
    );
}

module.exports = {
    PaystackError,
    getPaystackConfig,
    initializeTransaction,
    parseResponseBody,
    verifyTransaction
};
