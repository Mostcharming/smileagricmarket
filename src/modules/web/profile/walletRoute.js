'use strict';

const router = require('express').Router();
const { getWalletBanks, setupWallet, getWallet } = require('./controller');

router.get('/banks', getWalletBanks);
router.post('/setup', setupWallet);
router.get('/get', getWallet);

module.exports = router;
