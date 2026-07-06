const express = require('express');
const router = express.Router();
const { getInvestments } = require('./controller');

/**
 * @swagger
 * /web/investments:
 *   get:
 *     tags:
 *       - Web Investments
 *     summary: List user-side investments
 *     description: Retrieve verified user farms that have an active admin investment template for their farm category.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *       - in: query
 *         name: farmCategoryId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: riskLevel
 *         schema:
 *           type: string
 *           enum: [low, medium, high]
 *       - in: query
 *         name: duration
 *         schema:
 *           type: string
 *         description: Duration filter such as "6 months", "months", or "6".
 *       - in: query
 *         name: durationValue
 *         schema:
 *           type: integer
 *       - in: query
 *         name: durationUnit
 *         schema:
 *           type: string
 *           enum: [weeks, months, years]
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *       - in: query
 *         name: fundingStatus
 *         schema:
 *           type: string
 *           enum: [pending, partial, completed, cancelled, open]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Investments retrieved successfully
 *       400:
 *         description: Invalid filter value
 *       401:
 *         description: User not authenticated
 *       500:
 *         description: Failed to retrieve investments
 */
router.get('/', getInvestments);

module.exports = router;
