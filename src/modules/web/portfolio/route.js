const express = require('express');
const {
    getPortfolio,
    getPortfolioFarms,
    getPortfolioFarmById
} = require('./controller');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     PortfolioTrend:
 *       type: object
 *       properties:
 *         direction:
 *           type: string
 *           enum: [up, down, flat]
 *           example: up
 *         percentage:
 *           type: number
 *           example: 25
 *         change:
 *           type: number
 *           example: 25000
 *         currentMonth:
 *           type: number
 *           example: 125000
 *         previousMonth:
 *           type: number
 *           example: 100000
 *         comparison:
 *           type: string
 *           example: current_month_vs_previous_month
 *     PortfolioMoneyBreakdown:
 *       type: object
 *       properties:
 *         currency:
 *           type: string
 *           example: NGN
 *         amount:
 *           type: number
 *           example: 500000
 *     PortfolioMoneyMetric:
 *       type: object
 *       properties:
 *         amount:
 *           type: number
 *           example: 500000
 *         currency:
 *           type: string
 *           description: Currency code, or MIXED when investments use more than one currency.
 *           example: NGN
 *         breakdown:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PortfolioMoneyBreakdown'
 *         trend:
 *           $ref: '#/components/schemas/PortfolioTrend'
 *     PortfolioTransaction:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         reference:
 *           type: string
 *           example: SMILE-INV-1785168000000-AB12CD34
 *         amount:
 *           type: number
 *           example: 50000
 *         currency:
 *           type: string
 *           example: NGN
 *         gateway:
 *           type: string
 *           example: paystack
 *         gatewayReference:
 *           type: string
 *           nullable: true
 *         paymentStatus:
 *           type: string
 *           enum: [recorded, successful]
 *         portfolioStatus:
 *           type: string
 *           enum: [active, completed]
 *         expectedReturn:
 *           type: number
 *           example: 9250
 *         earnedReturn:
 *           type: number
 *           example: 0
 *         paidAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         investedAt:
 *           type: string
 *           format: date-time
 *         effectiveEndDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     PortfolioFarmDocument:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         documentType:
 *           type: string
 *           enum: [picture, document]
 *         fileName:
 *           type: string
 *         fileUrl:
 *           type: string
 *           format: uri
 *         fileSize:
 *           type: integer
 *           nullable: true
 *         mimeType:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     PortfolioFarmMilestone:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         milestoneId:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *           nullable: true
 *         order:
 *           type: integer
 *           nullable: true
 *         amount:
 *           type: number
 *           example: 100000
 *         isCompleted:
 *           type: boolean
 *           example: true
 *         status:
 *           type: string
 *           enum: [completed, pending]
 *         completedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     PortfolioFarm:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         farmId:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *           example: Green Valley Rice Farm
 *         description:
 *           type: string
 *           nullable: true
 *         location:
 *           type: string
 *           nullable: true
 *         size:
 *           type: number
 *           nullable: true
 *         currency:
 *           type: string
 *           example: NGN
 *         isActive:
 *           type: boolean
 *         verificationStatus:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         rejectionNote:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         category:
 *           $ref: '#/components/schemas/FarmCategory'
 *         owner:
 *           type: object
 *           nullable: true
 *           properties:
 *             id:
 *               type: string
 *               format: uuid
 *             name:
 *               type: string
 *             bio:
 *               type: string
 *               nullable: true
 *             profileImageUrl:
 *               type: string
 *               nullable: true
 *         image:
 *           $ref: '#/components/schemas/PortfolioFarmDocument'
 *           nullable: true
 *         images:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PortfolioFarmDocument'
 *         documents:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PortfolioFarmDocument'
 *         funding:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               format: uuid
 *               nullable: true
 *             expectedInvestment:
 *               type: number
 *             investmentReceived:
 *               type: number
 *             investmentPending:
 *               type: number
 *             currency:
 *               type: string
 *             status:
 *               type: string
 *               enum: [pending, partial, completed, cancelled]
 *             notes:
 *               type: string
 *               nullable: true
 *             isActive:
 *               type: boolean
 *               nullable: true
 *             createdAt:
 *               type: string
 *               format: date-time
 *               nullable: true
 *             updatedAt:
 *               type: string
 *               format: date-time
 *               nullable: true
 *         milestones:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PortfolioFarmMilestone'
 *         milestoneStats:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *               example: 4
 *             completed:
 *               type: integer
 *               example: 2
 *             pending:
 *               type: integer
 *               example: 2
 *             completionPercentage:
 *               type: number
 *               example: 50
 *         portfolioStatus:
 *           type: string
 *           enum: [active, completed]
 *         userInvestment:
 *           type: object
 *           properties:
 *             amountInvested:
 *               type: number
 *               example: 50000
 *             expectedReturns:
 *               type: number
 *               example: 9250
 *             earnedReturns:
 *               type: number
 *               example: 0
 *             currency:
 *               type: string
 *               example: NGN
 *             breakdown:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   currency:
 *                     type: string
 *                   amountInvested:
 *                     type: number
 *                   expectedReturns:
 *                     type: number
 *                   earnedReturns:
 *                     type: number
 *             transactionCount:
 *               type: integer
 *               example: 1
 *             activeTransactionCount:
 *               type: integer
 *             completedTransactionCount:
 *               type: integer
 *             firstInvestedAt:
 *               type: string
 *               format: date-time
 *             lastInvestedAt:
 *               type: string
 *               format: date-time
 *         investments:
 *           type: array
 *           description: Investment templates and transactions through which the user funded this farm.
 *           items:
 *             allOf:
 *               - $ref: '#/components/schemas/Investment'
 *               - type: object
 *                 properties:
 *                   portfolioStatus:
 *                     type: string
 *                     enum: [active, completed]
 *                   amountInvested:
 *                     type: number
 *                   expectedReturns:
 *                     type: number
 *                   earnedReturns:
 *                     type: number
 *                   transactions:
 *                     type: array
 *                     items:
 *                       $ref: '#/components/schemas/PortfolioTransaction'
 */

/**
 * @swagger
 * /web/portfolio:
 *   get:
 *     tags:
 *       - Web Portfolio
 *     summary: Get the authenticated user's investment portfolio
 *     description: Returns all-time portfolio totals. Each trend compares activity in the current calendar month with the previous calendar month. Expected returns are investment amount multiplied by ROI; earned returns are recognized after an investment's configured end date.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Portfolio retrieved successfully
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
 *                   example: Portfolio retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     asOf:
 *                       type: string
 *                       format: date-time
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalInvested:
 *                           $ref: '#/components/schemas/PortfolioMoneyMetric'
 *                         totalFarmsInvested:
 *                           type: object
 *                           properties:
 *                             count:
 *                               type: integer
 *                               example: 4
 *                             trend:
 *                               $ref: '#/components/schemas/PortfolioTrend'
 *                         totalExpectedReturns:
 *                           $ref: '#/components/schemas/PortfolioMoneyMetric'
 *                         totalEarnedReturns:
 *                           $ref: '#/components/schemas/PortfolioMoneyMetric'
 *       401:
 *         description: User not authenticated
 *       500:
 *         description: Failed to retrieve portfolio
 */
router.get('/', getPortfolio);

/**
 * @swagger
 * /web/portfolio/farms:
 *   get:
 *     tags:
 *       - Web Portfolio
 *     summary: List all farms the authenticated user invested in
 *     description: Returns an unpaginated farm list with farm, owner, category, funding, document, milestone, investment-template, transaction, and user-investment details. Only recorded or successful investment payments are included.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [active, completed]
 *         description: Active investments have not reached their effective end date; completed investments have.
 *     responses:
 *       200:
 *         description: Portfolio farms retrieved successfully
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
 *                   example: Portfolio farms retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [all, active, completed]
 *                     total:
 *                       type: integer
 *                       example: 2
 *                     farms:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PortfolioFarm'
 *       400:
 *         description: Invalid status query
 *       401:
 *         description: User not authenticated
 *       500:
 *         description: Failed to retrieve portfolio farms
 */
router.get('/farms', getPortfolioFarms);

/**
 * @swagger
 * /web/portfolio/farms/{farmId}:
 *   get:
 *     tags:
 *       - Web Portfolio
 *     summary: Get one farm the authenticated user invested in
 *     description: Returns complete details for an invested farm, including all pictures and documents, owner and category information, funding progress, every selected milestone and its completion state, milestone statistics, investment templates, the user's invested amount, expected and earned returns, and all recognized investment transactions.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: farmId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID of a farm in which the authenticated user has invested.
 *     responses:
 *       200:
 *         description: Portfolio farm details retrieved successfully
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
 *                   example: Portfolio farm details retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/PortfolioFarm'
 *       400:
 *         description: Farm ID is required
 *       401:
 *         description: User not authenticated
 *       404:
 *         description: The farm was not found in the authenticated user's investments
 *       500:
 *         description: Failed to retrieve portfolio farm details
 */
router.get('/farms/:farmId', getPortfolioFarmById);

module.exports = router;
