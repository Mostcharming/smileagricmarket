const { errorHandler, responseFormatter } = require('../../middlewares/common/responseFormatter');
const { securityMiddleware } = require('../../middlewares/common/security');
const authRouter = require('./auth/route');
const kycRouter = require('./kyc/route');

const router = require('express').Router();

router.use(responseFormatter);

// Auth routes - no security middleware needed
router.use('/auth', authRouter);

// All other routes require authentication
router.use(securityMiddleware);

// KYC routes - requires authentication
router.use('/kyc', kycRouter);

router.use(errorHandler);

module.exports = router;
