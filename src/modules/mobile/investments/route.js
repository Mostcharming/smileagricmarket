'use strict';

const router = require('express').Router();
const { getInvestments, getInvestmentById, verifyInvestmentPayment } = require('../../web/investments/controller');
const { getQuote, getAgreementPreview, invest, getPayment, getAcceptedAgreement } = require('./controller');

// Authentication is applied by the parent mobile router. Swagger schemas for the
// shared web contract and these mobile-only actions live in mobileInvestmentSwagger.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
for (const name of ['farmId', 'investmentProjectId', 'transactionId']) {
    router.param(name, (req, res, next, value) => UUID.test(value)
        ? next() : res.fail(`${name} must be a valid UUID`, 400));
}

router.get('/', getInvestments);
router.get('/projects/:investmentProjectId/quote', getQuote);
router.get('/projects/:investmentProjectId/agreement', getAgreementPreview);
router.get('/payments/:transactionId', getPayment);
router.get('/payments/:transactionId/agreement', getAcceptedAgreement);
router.post('/payments/:transactionId/verify', verifyInvestmentPayment);
router.post('/:investmentProjectId/invest', invest);
router.get('/:farmId', getInvestmentById);

module.exports = router;
