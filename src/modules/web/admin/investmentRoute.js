const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../../middlewares/common/security');
const {
    createInvestment,
    getAllInvestments,
    getInvestmentById,
    updateInvestment,
    deleteInvestment,
    createInvestmentMilestone,
    updateInvestmentMilestone,
    deleteInvestmentMilestone
} = require('./investmentController');

/**
 * Middleware to verify admin token
 */
const verifyAdminToken = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || req.headers['x-access-token'] || req.query.token;
        if (!authHeader) return res.fail('Authentication token required', 401);
        let token = authHeader;
        if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
            token = authHeader.slice(7).trim();
        }
        let payload;
        try {
            payload = verifyToken(token);
        } catch (err) {
            return res.fail('Invalid or expired token', 401);
        }

        if (!payload.user.admin) {
            return res.fail('Admin authentication required', 403);
        }

        req.admin = payload.user.admin;
        next();
    } catch (err) {
        return res.fail(err.message, 500);
    }
};

/**
 * @swagger
 * /web/admin/investments:
 *   post:
 *     tags:
 *       - Web Admin Investments
 *     summary: Create investment
 *     description: Create an investment product and optionally attach milestones.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - farmCategoryId
 *               - roiPercentage
 *               - durationValue
 *               - durationUnit
 *               - fundingMinGoal
 *               - fundingMaxGoal
 *               - investmentMinGoal
 *               - investmentMaxGoal
 *             properties:
 *               name:
 *                 type: string
 *                 example: Cassava Growth Plan
 *               description:
 *                 type: string
 *                 example: Long-term cassava farm investment.
 *               farmCategoryId:
 *                 type: string
 *                 format: uuid
 *               roiPercentage:
 *                 type: number
 *                 example: 18.5
 *               durationValue:
 *                 type: integer
 *                 example: 12
 *               durationUnit:
 *                 type: string
 *                 enum: [weeks, months, years]
 *                 example: months
 *               riskLevel:
 *                 type: string
 *                 enum: [low, medium, high]
 *                 example: medium
 *               fundingMinGoal:
 *                 type: number
 *                 example: 1000000
 *               fundingMaxGoal:
 *                 type: number
 *                 example: 5000000
 *               investmentMinGoal:
 *                 type: number
 *                 example: 50000
 *               investmentMaxGoal:
 *                 type: number
 *                 example: 500000
 *               currency:
 *                 type: string
 *                 example: NGN
 *               milestones:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/InvestmentMilestoneInput'
 *     responses:
 *       201:
 *         description: Investment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Investment'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Farm category not found
 */
router.post('/investments', verifyAdminToken, createInvestment);

/**
 * @swagger
 * /web/admin/investments:
 *   get:
 *     tags:
 *       - Web Admin Investments
 *     summary: List investments
 *     description: Retrieve investments with pagination, search, category filtering, and active filtering.
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
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: farmCategoryId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *           default: 'true'
 *     responses:
 *       200:
 *         description: Investments retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     investments:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Investment'
 *                     pagination:
 *                       type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/investments', verifyAdminToken, getAllInvestments);

/**
 * @swagger
 * /web/admin/investments/{investmentId}:
 *   get:
 *     tags:
 *       - Web Admin Investments
 *     summary: Get investment by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: investmentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Investment retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Investment'
 *       404:
 *         description: Investment not found
 */
router.get('/investments/:investmentId', verifyAdminToken, getInvestmentById);

/**
 * @swagger
 * /web/admin/investments/{investmentId}:
 *   put:
 *     tags:
 *       - Web Admin Investments
 *     summary: Update investment
 *     description: Update investment fields. If milestones is provided, existing investment milestones are replaced.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: investmentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               farmCategoryId:
 *                 type: string
 *                 format: uuid
 *               roiPercentage:
 *                 type: number
 *               durationValue:
 *                 type: integer
 *               durationUnit:
 *                 type: string
 *                 enum: [weeks, months, years]
 *               riskLevel:
 *                 type: string
 *                 enum: [low, medium, high]
 *               fundingMinGoal:
 *                 type: number
 *               fundingMaxGoal:
 *                 type: number
 *               investmentMinGoal:
 *                 type: number
 *               investmentMaxGoal:
 *                 type: number
 *               currency:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               milestones:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/InvestmentMilestoneInput'
 *     responses:
 *       200:
 *         description: Investment updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Investment'
 *       400:
 *         description: Bad request
 *       404:
 *         description: Investment or farm category not found
 */
router.put('/investments/:investmentId', verifyAdminToken, updateInvestment);

/**
 * @swagger
 * /web/admin/investments/{investmentId}:
 *   delete:
 *     tags:
 *       - Web Admin Investments
 *     summary: Delete investment
 *     description: Delete an investment and its milestones.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: investmentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Investment deleted successfully
 *       404:
 *         description: Investment not found
 */
router.delete('/investments/:investmentId', verifyAdminToken, deleteInvestment);

/**
 * @swagger
 * /web/admin/investments/{investmentId}/milestones:
 *   post:
 *     tags:
 *       - Web Admin Investments
 *     summary: Add investment milestone
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: investmentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InvestmentMilestoneInput'
 *     responses:
 *       201:
 *         description: Investment milestone created successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Investment not found
 */
router.post('/investments/:investmentId/milestones', verifyAdminToken, createInvestmentMilestone);

/**
 * @swagger
 * /web/admin/investment-milestones/{milestoneId}:
 *   put:
 *     tags:
 *       - Web Admin Investments
 *     summary: Update investment milestone
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               fundReleasePercentage:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *               order:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Investment milestone updated successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Investment milestone not found
 */
router.put('/investment-milestones/:milestoneId', verifyAdminToken, updateInvestmentMilestone);

/**
 * @swagger
 * /web/admin/investment-milestones/{milestoneId}:
 *   delete:
 *     tags:
 *       - Web Admin Investments
 *     summary: Delete investment milestone
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Investment milestone deleted successfully
 *       404:
 *         description: Investment milestone not found
 */
router.delete('/investment-milestones/:milestoneId', verifyAdminToken, deleteInvestmentMilestone);

module.exports = router;
