const { errorHandler, responseFormatter } = require('../../middlewares/common/responseFormatter');
const { securityMiddleware } = require('../../middlewares/common/security');

const router = require('express').Router();

router.use(responseFormatter);


router.use(securityMiddleware);


router.use(errorHandler);


module.exports = router;
