const express = require('express');
const router = express.Router();



router.post('/login', licenseChecker, login);
router.post('/forgot', forgot);
router.post('/reset', reset);


module.exports = router;
