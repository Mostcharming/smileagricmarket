const { errorHandler, responseFormatter } = require('../../middlewares/common/responseFormatter');
const { securityMiddleware } = require('../../middlewares/common/security');
const authRouter = require('./auth/route');
const kycRouter = require('./kyc/route');
const profileRouter = require('./profile/route');
const adminRouter = require('./admin/route');
const dashboardRouter = require('./dashboard/route');
const farmsRouter = require('./farms/route');
const farmCategoriesRouter = require('./farmCategories/route');
const investmentsRouter = require('./investments/route');

const router = require('express').Router();

router.use(responseFormatter);

// Auth routes - no security middleware needed
router.use('/auth', authRouter);

// Admin routes - has its own authentication
router.use('/admin', adminRouter);

// All other routes require authentication
router.use(securityMiddleware);

// KYC routes - requires authentication
router.use('/kyc', kycRouter);

// Profile routes - requires authentication
router.use('/profile', profileRouter);

// Dashboard routes - requires authentication
router.use('/dashboard', dashboardRouter);

// Investments routes - requires authentication
router.use('/investments', investmentsRouter);

// Farms routes - requires authentication
router.use('/farms', farmsRouter);

// Farm Categories routes - requires authentication
router.use('/farm-categories', farmCategoriesRouter);

router.use(errorHandler);

module.exports = router;
