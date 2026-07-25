'use strict';

const express = require('express');
const { createRateLimitMiddleware } = require('../../../middlewares/common/rateLimiter');
const { createBetaSignup } = require('./controller');

const router = express.Router();

/**
 * @swagger
 * /web/beta-signups:
 *   post:
 *     tags:
 *       - Beta Signups
 *     summary: Join the AgriMarket beta
 *     description: Stores a landing-page beta signup and sends a confirmation email for new submissions.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: ada@example.com
 *               firstName:
 *                 type: string
 *                 maxLength: 100
 *                 example: Ada
 *     responses:
 *       201:
 *         description: Beta signup created
 *       200:
 *         description: Email was already registered
 *       400:
 *         description: Invalid email address
 *       429:
 *         description: Too many signup attempts
 */
router.post(
    '/',
    createRateLimitMiddleware({
        windowMs: 60 * 60 * 1000,
        maxRequests: 10,
        keyGenerator: (req) => `beta:${req.ip || req.connection.remoteAddress}`,
        message: 'Too many beta signup attempts. Please try again later.'
    }),
    createBetaSignup
);

module.exports = router;
