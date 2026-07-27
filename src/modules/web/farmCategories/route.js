const express = require('express');
const router = express.Router();
const {
    getCategories,
    getMilestonesByCategory,
    getInvestmentTemplate
} = require('./controller');

/**
 * @swagger
 * /web/farm-categories:
 *   get:
 *     tags:
 *       - Web Farm Categories
 *     summary: Get investable farm categories
 *     description: Retrieve active farm categories with their active admin investment templates and investment milestones
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       investmentTemplate:
 *                         type: object
 *                         nullable: true
 *                         description: Latest active investment template for the category
 *                       investmentTemplates:
 *                         type: array
 *                         items:
 *                           type: object
 *       500:
 *         description: Internal server error
 */
router.get('/', getCategories);

/**
 * @swagger
 * /web/farm-categories/{categoryId}/investment-template:
 *   get:
 *     tags:
 *       - Web Farm Categories
 *     summary: Get a category investment template
 *     description: Retrieve the latest active admin investment template, its funding rules, and selectable milestones. All active templates are also returned when a category has more than one.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Investment template retrieved successfully
 *       404:
 *         description: Active category, investment template, or milestones not found
 *       500:
 *         description: Internal server error
 */
router.get('/:categoryId/investment-template', getInvestmentTemplate);

/**
 * @swagger
 * /web/farm-categories/{categoryId}/milestones:
 *   get:
 *     tags:
 *       - Web Farm Categories
 *     summary: Get selectable investment milestones by category
 *     description: Compatibility endpoint that returns the active admin investment template and its selectable investment milestones
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the farm category
 *     responses:
 *       200:
 *         description: Milestones retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 category:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                 milestones:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       order:
 *                         type: integer
 *       400:
 *         description: Category ID is required
 *       404:
 *         description: Category not found
 *       500:
 *         description: Internal server error
 */
router.get('/:categoryId/milestones', getMilestonesByCategory);

module.exports = router;
