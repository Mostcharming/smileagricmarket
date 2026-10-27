'use strict';

function addWalletSwagger(spec) {
    const string = { type: 'string' };
    const account = {
        bankCode: { ...string, pattern: '^\\d{3,6}$', example: '011',
            description: 'bankCode of the selected bank from the wallet banks endpoint. Preserve leading zeros.' },
        accountNumber: { ...string, pattern: '^\\d{10}$', example: '0123456789', description: 'Ten-digit account number, sent as a string.' },
        accountName: { ...string, minLength: 1, example: 'ADA OKAFOR', description: 'Required account holder name. Must match the bank account name resolved by PayPetal; case and surrounding whitespace are ignored.' },
        bankName: { ...string, example: 'First Bank Nigeria', description: 'Optional. Taken from the selected bank when omitted.' }
    };
    const bank = { type: 'object', required: ['bankCode', 'bankName'], properties: {
        bankCode: account.bankCode, bankName: account.bankName, logoUrl: { ...string, format: 'uri' }
    } };
    const envelope = data => ({ type: 'object', properties: { error: { type: 'boolean' }, message: string, data } });
    const wallet = { type: 'object', properties: { id: { ...string, format: 'uuid' }, ...account,
        status: { ...string, enum: ['pending', 'syncing', 'verified'] }, isVerified: { type: 'boolean' } } };
    const errors = { 400: { description: 'Missing or invalid bank code, account number or account name' },
        401: { description: 'Bearer token required' }, 403: { description: 'Approved KYC required for wallet setup' },
        409: { description: 'Supplied account name does not match, or account changes are currently restricted' },
        502: { description: 'PayPetal bank lookup or account validation failed' }, 503: { description: 'PayPetal is not configured and enabled' } };

    for (const audience of ['web', 'mobile']) {
        const prefix = `/${audience}/profile/wallet`;
        const common = { tags: ['Profile Wallet'], security: [{ bearerAuth: [] }] };
        spec.paths[prefix + '/banks'] = { get: { ...common, summary: 'Get all wallet banks and bank codes',
            description: `Returns all supported banks from PayPetal with bankCode, bankName and optional logoUrl. Populate the bank dropdown, then send the selected bankCode as a string to POST ${prefix}/setup. Preserve leading zeros such as "011".`,
            responses: { 200: { description: 'Supported wallet banks', content: { 'application/json': {
                schema: envelope({ type: 'array', items: bank }),
                example: { error: false, message: 'Supported wallet banks', data: [{ bankCode: '011', bankName: 'First Bank Nigeria' }] }
            } } }, 401: errors[401], 502: errors[502], 503: errors[503] }
        } };
        spec.paths[prefix + '/get'] = { get: { ...common, summary: 'Get wallet details',
            description: `Returns the authenticated user's saved bank details, bankCode, verification status and latest registration error. Poll this endpoint after POST ${prefix}/setup to check payout registration. Reads saved details without making a PayPetal API call.`,
            responses: { 200: { description: 'Wallet retrieved successfully', content: { 'application/json': {
                schema: envelope({ type: 'object', properties: { ...wallet.properties,
                    userId: { ...string, format: 'uuid' },
                    bankCode: { ...account.bankCode, nullable: true },
                    verifiedAt: { ...string, format: 'date-time', nullable: true },
                    lastError: { ...string, nullable: true },
                    createdAt: { ...string, format: 'date-time' }, updatedAt: { ...string, format: 'date-time' }
                } }), example: { error: false, message: 'Wallet retrieved successfully', data: {
                    id: '11111111-1111-4111-8111-111111111111', userId: '22222222-2222-4222-8222-222222222222',
                    bankCode: '011', bankName: 'First Bank Nigeria', accountNumber: '0123456789', accountName: 'ADA OKAFOR',
                    status: 'verified', isVerified: true, verifiedAt: '2026-10-27T16:00:00.000Z', lastError: null,
                    createdAt: '2026-10-27T15:59:00.000Z', updatedAt: '2026-10-27T16:00:00.000Z'
                } }
            } } }, 401: errors[401], 404: { description: 'Wallet has not been set up' } }
        } };
        spec.paths[prefix + '/setup'] = { post: { ...common, summary: 'Create or update wallet account',
            description: `Select a bank from GET ${prefix}/banks, then submit bankCode, accountNumber and accountName here. The backend validates the supplied accountName against the bank account name resolved by PayPetal. bankName is optional and is taken from the selected bank when omitted. Requires approved KYC and supports phone-only users. Creates or updates the wallet and queues PayPetal payout registration using the saved customerId. Returns HTTP 202; poll GET ${prefix}/get for status and isVerified. Verification completes after the provider confirms the account.`,
            requestBody: { required: true, content: { 'application/json': {
                schema: { type: 'object', required: ['bankCode', 'accountNumber', 'accountName'], properties: account },
                example: { bankCode: '011', accountNumber: '0123456789', accountName: 'ADA OKAFOR' }
            } } },
            responses: { 202: { description: 'Wallet saved; payout account registration queued', content: { 'application/json': {
                schema: envelope(wallet), example: { error: false, message: 'Payout account registration queued', data: {
                    id: '11111111-1111-4111-8111-111111111111', bankCode: '011', bankName: 'First Bank Nigeria',
                    accountNumber: '0123456789', accountName: 'ADA OKAFOR', status: 'pending', isVerified: false
                } }
            } } }, ...errors }
        } };
    }
    return spec;
}

module.exports = { addWalletSwagger };
