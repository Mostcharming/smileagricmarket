const express = require('express');
const router = express.Router();
const {
    getCategories,
    getMilestonesByCategory
} = require('./controller');

/**
 * @swagger
 * /web/farm-categories:
 *   get:
 *     tags:
 *       - Web Farm Categories
 *     summary: Get all farm categories
 *     description: Retrieve a list of all active farm categories
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
 *       500:
 *         description: Internal server error
 */
router.get('/', getCategories);

/**
 * @swagger
 * /web/farm-categories/{categoryId}/milestones:
 *   get:
 *     tags:
 *       - Web Farm Categories
 *     summary: Get milestones by category
 *     description: Retrieve all milestones for a specific farm category
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
