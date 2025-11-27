const { errorHandler, responseFormatter } = require('../../middlewares/common/responseFormatter');
const { securityMiddleware } = require('../../middlewares/common/security');
const authRouter = require('./auth/route');

const router = require('express').Router();

router.use(responseFormatter);

// Auth routes - no security middleware needed
router.use('/auth', authRouter);

// All other routes require authentication
router.use(securityMiddleware);

router.use(errorHandler);

module.exports = router;
