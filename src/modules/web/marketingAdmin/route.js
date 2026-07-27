'use strict';

const express = require('express');
const { verifyToken } = require('../../../middlewares/common/security');
const {
    downloadBetaSignups,
    listBetaSignups,
    login
} = require('./controller');

const router = express.Router();

function verifyMarketingAdminToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization
            || req.headers['x-access-token']
            || req.query.token;

        if (!authHeader) {
            return res.fail('Authentication token required', 401);
        }

        const token = typeof authHeader === 'string'
            && authHeader.toLowerCase().startsWith('bearer ')
            ? authHeader.slice(7).trim()
            : authHeader;

        let payload;
        try {
            payload = verifyToken(token);
        } catch (error) {
            return res.fail('Invalid or expired token', 401);
        }

        const marketingAdmin = payload?.user?.marketingAdmin;
        if (!marketingAdmin || marketingAdmin.role !== 'marketing_admin') {
            return res.fail('Marketing admin authentication required', 403);
        }

        req.marketingAdmin = marketingAdmin;
        return next();
    } catch (error) {
        return res.fail(error.message, 500);
    }
}

/**
 * @swagger
 * /web/marketing-admin/login:
 *   post:
 *     tags:
 *       - Web Marketing Admin
 *     summary: Marketing admin login
 *     description: Authenticate a marketing admin with an email address and password.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: marketing@smileagric.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Marketing@123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Login successful
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       description: JWT bearer token
 *                     marketingAdmin:
 *                       $ref: '#/components/schemas/MarketingAdmin'
 *       400:
 *         description: Email and password are required
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Marketing admin account is inactive
 *       500:
 *         description: Internal server error
 */
router.post('/login', login);

/**
 * @swagger
 * /web/marketing-admin/beta-signups:
 *   get:
 *     tags:
 *       - Web Marketing Admin
 *     summary: List beta signups
 *     description: Returns beta email submissions in newest-first order with pagination and text search.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Records per page
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *           maxLength: 254
 *         description: Case-insensitive search by email, first name, or source
 *         example: ada@example.com
 *     responses:
 *       200:
 *         description: Beta signups retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Beta signups retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     signups:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/BetaSignup'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: integer
 *                           example: 1
 *                         totalPages:
 *                           type: integer
 *                           example: 5
 *                         totalItems:
 *                           type: integer
 *                           example: 93
 *                         limit:
 *                           type: integer
 *                           example: 20
 *                         hasNextPage:
 *                           type: boolean
 *                           example: true
 *                         hasPreviousPage:
 *                           type: boolean
 *                           example: false
 *       400:
 *         description: Invalid query
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Marketing admin authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/beta-signups', verifyMarketingAdminToken, listBetaSignups);

/**
 * @swagger
 * /web/marketing-admin/beta-signups/download:
 *   get:
 *     tags:
 *       - Web Marketing Admin
 *     summary: Download all beta signups
 *     description: Downloads every beta signup matching the optional query as a UTF-8 CSV file. This endpoint is not paginated.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *           maxLength: 254
 *         description: Case-insensitive search by email, first name, or source
 *         example: ada@example.com
 *     responses:
 *       200:
 *         description: CSV export of beta signups
 *         headers:
 *           Content-Disposition:
 *             description: Attachment filename
 *             schema:
 *               type: string
 *               example: attachment; filename="beta-signups-2026-07-27.csv"
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       400:
 *         description: Invalid query
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Marketing admin authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/beta-signups/download', verifyMarketingAdminToken, downloadBetaSignups);

module.exports = router;
