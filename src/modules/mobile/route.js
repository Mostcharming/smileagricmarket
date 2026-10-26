const { errorHandler, responseFormatter } = require('../../middlewares/common/responseFormatter');
const { securityMiddleware } = require('../../middlewares/common/security');
const authRouter = require('./auth/route');
const kycRouter = require('./kyc/route');
const investmentsRouter = require('./investments/route');
const portfolioRouter = require('../web/portfolio/route');
const farmCategoriesRouter = require('../web/farmCategories/route');

const router = require('express').Router();

router.use(responseFormatter);

router.use('/auth', authRouter);

router.use(securityMiddleware);
router.use('/payments', require('../web/payments/route').router);

router.use('/kyc', kycRouter);

router.use('/investments', investmentsRouter);
router.use('/portfolio', portfolioRouter);
router.use('/farm-categories', farmCategoriesRouter);

router.use(errorHandler);

module.exports = router;
