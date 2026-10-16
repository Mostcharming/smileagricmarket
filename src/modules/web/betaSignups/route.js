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
 *     description: Requires name, location, phone number, email and type. Farmers must answer what they produce; investors must state how soon they want to invest. Accepts farmer as an alias for farm_owner. Existing emails remain registered without overwriting their details. Sends a confirmation email for new submissions.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - type
 *               - name
 *               - location
 *               - phoneNumber
 *             oneOf:
 *               - properties:
 *                   type:
 *                     enum: [investor]
 *                 required: [investmentTimeline]
 *               - properties:
 *                   type:
 *                     enum: [farm_owner, farmer]
 *                 required: [produce]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: ada@example.com
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 200
 *                 example: Ada Okafor
 *                 description: Full name. fullName and legacy firstName/first_name are also accepted.
 *               location:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 254
 *                 example: Ibadan, Oyo State
 *               phoneNumber:
 *                 type: string
 *                 maxLength: 30
 *                 example: '+2348012345678'
 *                 description: Phone number with 10 to 15 digits. phone is also accepted.
 *               type:
 *                 type: string
 *                 enum: [investor, farm_owner, farmer]
 *                 example: investor
 *               produce:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 1000
 *                 description: What do you produce? Required for farm_owner/farmer; ignored for investors.
 *                 example: Cassava, maize and tomatoes
 *               investmentTimeline:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 254
 *                 description: How soon do you want to invest? Required for investors; ignored for farmers.
 *                 example: Within the next 3 months
 *           examples:
 *             investor:
 *               value:
 *                 name: Ada Okafor
 *                 location: Lagos, Nigeria
 *                 phoneNumber: '+2348012345678'
 *                 email: ada@example.com
 *                 type: investor
 *                 investmentTimeline: Within the next 3 months
 *             farmer:
 *               value:
 *                 name: Tunde Adeyemi
 *                 location: Ibadan, Oyo State
 *                 phoneNumber: '08012345678'
 *                 email: tunde@example.com
 *                 type: farm_owner
 *                 produce: Cassava, maize and tomatoes
 *     responses:
 *       201:
 *         description: Beta signup created
 *       200:
 *         description: Email was already registered
 *       400:
 *         description: Invalid or missing contact details, user type, produce or investment timeline
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
