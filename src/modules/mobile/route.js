const { errorHandler, responseFormatter } = require('../../middlewares/common/responseFormatter');
const { securityMiddleware } = require('../../middlewares/common/security');
const authRouter = require('./auth/route');
const kycRouter = require('./kyc/route');
const investmentsRouter = require('./investments/route');
const portfolioRouter = require('../web/portfolio/route');
const farmCategoriesRouter = require('../web/farmCategories/route');

const router = require('express').Router();

router.use(responseFormatter);

// Auth routes - no security middleware needed
router.use('/auth', authRouter);

// All other routes require authentication
router.use(securityMiddleware);

// KYC routes - requires authentication
router.use('/kyc', kycRouter);

// Investor browsing/history share the web contract and the same account records.
router.use('/investments', investmentsRouter);
router.use('/portfolio', portfolioRouter);
router.use('/farm-categories', farmCategoriesRouter);

router.use(errorHandler);

module.exports = router;
