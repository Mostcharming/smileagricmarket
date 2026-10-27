'use strict';

const router = require('express').Router();
const { getWalletBanks, setupWallet } = require('./controller');

router.get('/banks', getWalletBanks);
router.post('/setup', setupWallet);

module.exports = router;
