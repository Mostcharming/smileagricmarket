const express = require('express');
const router = express.Router();
const {
    getUserDashboard,
    getDashboardStats
} = require('./controller');

/**
 * @swagger
 * /web/dashboard:
 *   get:
 *     tags:
 *       - Web Dashboard
 *     summary: Get user dashboard overview
 *     description: Retrieve user dashboard with farm statistics, investment data, and milestone progress.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalFarmsListed:
 *                           type: integer
 *                           description: Total number of farms listed by the user
 *                         completedFarmProjects:
 *                           type: integer
 *                           description: Number of completed farm projects
 *                         totalExpectedInvestment:
 *                           type: number
 *                           description: Total expected investment across all farms
 *                         totalInvestmentReceived:
 *                           type: number
 *                           description: Total investment received across all farms
 *                         investmentPending:
 *                           type: number
 *                           description: Pending investment (expected - received)
 *                     farms:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           description:
 *                             type: string
 *                           location:
 *                             type: string
 *                           size:
 *                             type: number
 *                           Category:
 *                             type: object
 *                           Investment:
 *                             type: object
 *                           SelectedMilestones:
 *                             type: array
 *       401:
 *         description: User not authenticated
 *       404:
 *         description: User not found
 *       500:
 *         description: Failed to retrieve dashboard data
 */
router.get('/', getUserDashboard);

/**
 * @swagger
 * /web/dashboard/stats:
 *   get:
 *     tags:
 *       - Web Dashboard
 *     summary: Get dashboard statistics
 *     description: Retrieve aggregated dashboard statistics including farm counts and investment breakdown.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     farmsCount:
 *                       type: integer
 *                     investmentStats:
 *                       type: array
 *                     milestoneStats:
 *                       type: array
 *       401:
 *         description: User not authenticated
 *       500:
 *         description: Failed to retrieve dashboard statistics
 */
router.get('/stats', getDashboardStats);

module.exports = router;
