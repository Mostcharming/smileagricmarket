'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { addSwaggerExamples, sampleSchema } = require('../src/config/swaggerExamples');

test('every documented operation has request examples and response media examples', () => {
    const spec = require('../src/config/swagger');
    let operations = 0;
    for (const [route, path] of Object.entries(spec.paths)) {
        for (const [method, operation] of Object.entries(path)) {
            if (!operation.responses) continue;
            operations++;
            const label = `${method.toUpperCase()} ${route}`;
            for (const parameter of [...(path.parameters || []), ...(operation.parameters || [])]) {
                assert.ok('example' in parameter || parameter.examples, `${label}: ${parameter.name}`);
            }
            if (operation.requestBody) {
                for (const media of Object.values(operation.requestBody.content)) {
                    assert.ok('example' in media || media.examples, `${label}: request body`);
                }
            } else {
                assert.match(operation.description, /Example request:/, label);
            }
            for (const [status, response] of Object.entries(operation.responses)) {
                if (['204', '304'].includes(status)) continue;
                assert.ok(response.content, `${label}: ${status} content`);
                for (const [type, media] of Object.entries(response.content)) {
                    assert.ok('example' in media || media.examples, `${label}: ${status} ${type}`);
                }
            }
        }
    }
    assert.ok(operations >= 98, `Audited ${operations} operations`);
    const response = spec.paths['/web/farms/{farmId}/milestones'].post.responses['200'].content['application/json'].example;
    assert.deepEqual(response.data.investmentProjects[0].milestones.map(item => item.fundingStatus), [
        'request_for_funding', 'not_requested'
    ]);
    const webhook = spec.paths['/web/payments/paystack/webhook'].post;
    assert.deepEqual(webhook.responses['200'].content['application/json'].example, { received: true });
    assert.deepEqual(webhook.responses['401'].content['application/json'].example, { received: false });
    assert.equal(webhook.requestBody.content['application/json'].example.event, 'charge.success');
});

test('preserves handwritten and falsy examples, and resolves referenced/composed request schemas', () => {
    const spec = {
        components: { schemas: {
            Input: { type: 'object', properties: { enabled: { type: 'boolean', example: false } } }
        } },
        paths: { '/example': { post: {
            requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Input' } } } },
            responses: { '200': { content: { 'application/json': { example: { value: 42 } } } } }
        } } }
    };
    const result = addSwaggerExamples(spec).paths['/example'].post;
    assert.deepEqual(result.requestBody.content['application/json'].example, { enabled: false });
    assert.deepEqual(result.responses['200'].content['application/json'].example, { value: 42 });
    assert.deepEqual(sampleSchema(spec, { allOf: [
        { $ref: '#/components/schemas/Input' },
        { type: 'object', properties: { count: { type: 'integer', example: 0 } } }
    ] }), { enabled: false, count: 0 });
});

test('mobile investor Swagger covers the shared flow and calculator, consent, confirmation and download', () => {
    const spec = require('../src/config/swagger');
    const mobilePaths = Object.entries(spec.paths).filter(([route]) => /^\/mobile\/(investments|portfolio|farm-categories)(\/|$)/.test(route));
    assert.equal(mobilePaths.length, 14);
    for (const [route, item] of mobilePaths) {
        for (const operation of Object.values(item)) {
            if (!operation.responses) continue;
            assert.deepEqual(operation.security, [{ bearerAuth: [] }], route);
            assert.ok(operation.tags.every(tag => tag.startsWith('Mobile ')), route);
        }
    }
    const mobile = spec.paths['/mobile/investments/{investmentProjectId}/invest'].post;
    const web = spec.paths['/web/investments/{investmentProjectId}/invest'].post;
    assert.ok(mobile.requestBody.content['application/json'].schema.required.includes('agreementAcceptance'));
    assert.ok(!web.requestBody.content['application/json'].schema.required.includes('agreementAcceptance'));
    assert.notEqual(mobile.responses, web.responses);
    const preview = spec.paths['/mobile/investments/projects/{investmentProjectId}/agreement'].get.responses['200'].content['application/json'].example.data;
    assert.equal(preview.quote.totalReturn, 355000);
    assert.equal(preview.agreement.version, mobile.requestBody.content['application/json'].example.agreementAcceptance.version);
    assert.equal(preview.agreement.terms.principal + preview.agreement.terms.expectedProfit, preview.agreement.terms.totalReturn);
    const download = spec.paths['/mobile/investments/payments/{transactionId}/agreement'].get;
    assert.ok(download.responses['200'].content['text/plain'].example);
    assert.ok(download.responses['200'].headers['Content-Disposition']);
    assert.match(spec.paths['/mobile/investments'].get.description, /GET \/v1\/mobile\/investments/);
    assert.ok(!spec.paths['/mobile/payments/paystack/webhook']);
    function checkRefs(value) {
        if (!value || typeof value !== 'object') return;
        if (value.$ref?.startsWith('#/')) {
            const resolved = value.$ref.slice(2).split('/').reduce((node, key) => node?.[key], spec);
            assert.ok(resolved, `Missing Swagger reference ${value.$ref}`);
        }
        Object.values(value).forEach(checkRefs);
    }
    checkRefs(spec);
});
