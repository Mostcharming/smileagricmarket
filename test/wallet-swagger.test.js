'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const spec = require('../src/config/swagger');

for (const audience of ['web', 'mobile']) {
    test(`${audience} Profile Wallet contains only get banks and create/update wallet setup`, () => {
        const prefix = `/${audience}/profile/wallet`;
        const tag = audience === 'web' ? 'Web Profile Wallet' : 'Mobile Profile Wallet';
        const tagged = Object.entries(spec.paths).flatMap(([path, item]) => Object.entries(item)
            .filter(([, operation]) => operation.tags?.includes(tag)).map(([method]) => `${method} ${path}`));
        assert.deepEqual(tagged.sort(), [`get ${prefix}/banks`, `post ${prefix}/setup`].sort());
        const banks = spec.paths[prefix + '/banks'].get.responses['200'].content['application/json'].schema.properties.data;
        assert.equal(banks.type, 'array');
        assert.equal(banks.items.properties.bankCode.type, 'string');
        const setup = spec.paths[prefix + '/setup'].post;
        assert.deepEqual(setup.requestBody.content['application/json'].schema.required, ['bankCode', 'accountNumber']);
        assert.ok(setup.responses['202']);
        for (const suffix of ['/banks', '/accounts/validate', '/accounts', '/payouts', '/returns']) {
            assert.equal(spec.paths[`/${audience}/payments${suffix}`], undefined);
        }
        assert.equal(spec.paths[prefix + '/get'], undefined);
    });
}
