'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const spec = require('../src/config/swagger');

for (const audience of ['web', 'mobile']) {
    test(`${audience} Profile Wallet documents banks, setup and wallet details`, () => {
        const prefix = `/${audience}/profile/wallet`;
        const tag = audience === 'web' ? 'Web Profile Wallet' : 'Mobile Profile Wallet';
        const tagged = Object.entries(spec.paths).flatMap(([path, item]) => Object.entries(item)
            .filter(([, operation]) => operation.tags?.includes(tag)).map(([method]) => `${method} ${path}`));
        assert.deepEqual(tagged.sort(), [`get ${prefix}/banks`, `post ${prefix}/setup`, `get ${prefix}/get`].sort());
        const banks = spec.paths[prefix + '/banks'].get.responses['200'].content['application/json'].schema.properties.data;
        assert.equal(banks.type, 'array');
        assert.equal(banks.items.properties.bankCode.type, 'string');
        const setup = spec.paths[prefix + '/setup'].post;
        assert.deepEqual(setup.requestBody.content['application/json'].schema.required, ['bankCode', 'accountNumber', 'accountName']);
        assert.equal(setup.requestBody.content['application/json'].example.accountName, 'ADA OKAFOR');
        assert.ok(setup.responses['200']);
        assert.equal(setup.responses['202'], undefined);
        assert.equal(setup.responses['200'].content['application/json'].example.data.isVerified, true);
        for (const suffix of ['/banks', '/accounts/validate', '/accounts', '/payouts', '/returns', '/projects/{projectId}']) {
            assert.equal(spec.paths[`/${audience}/payments${suffix}`], undefined);
        }
        const details = spec.paths[prefix + '/get'].get;
        assert.ok(details.security.some(value => value.bearerAuth));
        const data = details.responses['200'].content['application/json'].schema.properties.data.properties;
        assert.equal(data.bankCode.type, 'string');
        assert.equal(data.status.type, 'string');
        assert.equal(data.isVerified.type, 'boolean');
        assert.ok(details.responses['404']);
    });
}
