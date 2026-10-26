const { errorHandler, responseFormatter } = require('../../middlewares/common/responseFormatter');
const { securityMiddleware } = require('../../middlewares/common/security');
const authRouter = require('./auth/route');
const kycRouter = require('./kyc/route');
const profileRouter = require('./profile/route');
const adminRouter = require('./admin/route');
const marketingAdminRouter = require('./marketingAdmin/route');
const dashboardRouter = require('./dashboard/route');
const farmsRouter = require('./farms/route');
const farmCategoriesRouter = require('./farmCategories/route');
const investmentsRouter = require('./investments/route');
const portfolioRouter = require('./portfolio/route');
const betaSignupsRouter = require('./betaSignups/route');
const paystackRouter = require('./paystack/route');

const router = require('express').Router();

router.use(responseFormatter);

router.use('/auth', authRouter);

router.use('/beta-signups', betaSignupsRouter);

router.use('/admin', adminRouter);

router.use('/marketing-admin', marketingAdminRouter);

router.use('/payments/paystack', paystackRouter);

router.use(securityMiddleware);
router.use('/payments', require('./payments/route').router);

router.use('/kyc', kycRouter);

router.use('/profile', profileRouter);

router.use('/dashboard', dashboardRouter);

router.use('/investments', investmentsRouter);

router.use('/portfolio', portfolioRouter);

router.use('/farms', farmsRouter);

router.use('/farm-categories', farmCategoriesRouter);

router.use(errorHandler);

module.exports = router;
