const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../../middlewares/common/security');
const {
    createFarmCategory,
    getAllFarmCategories,
    getFarmCategoryById,
    updateFarmCategory,
    deleteFarmCategory,
    createMilestone,
    getAllMilestones,
    getMilestonesByCategory,
    updateMilestone,
    deleteMilestone,
    deleteMilestonesByCategory
} = require('./farmCategoryController');

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

// ==================== FARM CATEGORY ROUTES ====================

/**
 * @swagger
 * /web/admin/farm-categories:
 *   post:
 *     tags:
 *       - Web Admin Farm Categories
 *     summary: Create Farm Category
 *     description: Create a new farm category
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
 *             properties:
 *               name:
 *                 type: string
 *                 description: Farm category name
 *                 example: 'Vegetables'
 *               description:
 *                 type: string
 *                 description: Optional category description
 *                 example: 'All types of vegetables'
 *     responses:
 *       200:
 *         description: Farm category created successfully
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
 *                   example: 'Farm category created successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request - name is required
 *       401:
 *         description: Unauthorized - Token required or invalid
 *       403:
 *         description: Forbidden - Admin authentication required
 *       409:
 *         description: Conflict - Category name already exists
 *       500:
 *         description: Internal server error
 */
router.post('/farm-categories', verifyAdminToken, createFarmCategory);

/**
 * @swagger
 * /web/admin/farm-categories:
 *   get:
 *     tags:
 *       - Web Admin Farm Categories
 *     summary: Get All Farm Categories
 *     description: Retrieve all farm categories with milestone count (no pagination)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *           default: 'true'
 *         description: Filter only active categories
 *     responses:
 *       200:
 *         description: Farm categories retrieved successfully
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
 *                   example: 'Farm categories retrieved successfully'
 *                 data:
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
 *                       isActive:
 *                         type: boolean
 *                       milestoneCount:
 *                         type: integer
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized - Token required or invalid
 *       403:
 *         description: Forbidden - Admin authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/farm-categories', verifyAdminToken, getAllFarmCategories);

/**
 * @swagger
 * /web/admin/farm-categories/{categoryId}:
 *   get:
 *     tags:
 *       - Web Admin Farm Categories
 *     summary: Get Farm Category by ID
 *     description: Retrieve a specific farm category with its milestones
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Farm category ID
 *     responses:
 *       200:
 *         description: Farm category retrieved successfully
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
 *                   example: 'Farm category retrieved successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *                     milestones:
 *                       type: array
 *                       items:
 *                         type: object
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized - Token required or invalid
 *       403:
 *         description: Forbidden - Admin authentication required
 *       404:
 *         description: Farm category not found
 *       500:
 *         description: Internal server error
 */
router.get('/farm-categories/:categoryId', verifyAdminToken, getFarmCategoryById);

/**
 * @swagger
 * /web/admin/farm-categories/{categoryId}:
 *   put:
 *     tags:
 *       - Web Admin Farm Categories
 *     summary: Update Farm Category
 *     description: Update an existing farm category
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Farm category ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Farm category name
 *                 example: 'Vegetables'
 *               description:
 *                 type: string
 *                 description: Optional category description
 *                 example: 'All types of vegetables'
 *     responses:
 *       200:
 *         description: Farm category updated successfully
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
 *                   example: 'Farm category updated successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request - name is required
 *       401:
 *         description: Unauthorized - Token required or invalid
 *       403:
 *         description: Forbidden - Admin authentication required
 *       404:
 *         description: Farm category not found
 *       409:
 *         description: Conflict - Category name already exists
 *       500:
 *         description: Internal server error
 */
router.put('/farm-categories/:categoryId', verifyAdminToken, updateFarmCategory);

/**
 * @swagger
 * /web/admin/farm-categories/{categoryId}:
 *   delete:
 *     tags:
 *       - Web Admin Farm Categories
 *     summary: Delete Farm Category
 *     description: Delete a farm category (only if it has no milestones)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Farm category ID
 *     responses:
 *       200:
 *         description: Farm category deleted successfully
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
 *                   example: 'Farm category deleted successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *       401:
 *         description: Unauthorized - Token required or invalid
 *       403:
 *         description: Forbidden - Admin authentication required
 *       404:
 *         description: Farm category not found
 *       409:
 *         description: Conflict - Category has milestones and cannot be deleted
 *       500:
 *         description: Internal server error
 */
router.delete('/farm-categories/:categoryId', verifyAdminToken, deleteFarmCategory);

// ==================== MILESTONE ROUTES ====================

/**
 * @swagger
 * /web/admin/farm-categories/{categoryId}/milestones:
 *   post:
 *     tags:
 *       - Web Admin Milestones
 *     summary: Create Milestone
 *     description: Create a new milestone for a farm category
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Farm category ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Milestone name/description
 *                 example: 'Planting'
 *               order:
 *                 type: integer
 *                 description: Optional milestone order/sequence
 *                 example: 1
 *     responses:
 *       200:
 *         description: Milestone created successfully
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
 *                   example: 'Milestone created successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     farmCategoryId:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     order:
 *                       type: integer
 *                     isActive:
 *                       type: boolean
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request - name is required or invalid category ID
 *       401:
 *         description: Unauthorized - Token required or invalid
 *       403:
 *         description: Forbidden - Admin authentication required
 *       404:
 *         description: Farm category not found
 *       500:
 *         description: Internal server error
 */
router.post('/farm-categories/:categoryId/milestones', verifyAdminToken, createMilestone);

/**
 * @swagger
 * /web/admin/milestones:
 *   get:
 *     tags:
 *       - Web Admin Milestones
 *     summary: Get All Milestones
 *     description: Retrieve all milestones across all categories (no pagination)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *           default: 'true'
 *         description: Filter only active milestones
 *     responses:
 *       200:
 *         description: Milestones retrieved successfully
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
 *                   example: 'Milestones retrieved successfully'
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       farmCategoryId:
 *                         type: string
 *                         format: uuid
 *                       farmCategoryName:
 *                         type: string
 *                       name:
 *                         type: string
 *                       order:
 *                         type: integer
 *                       isActive:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized - Token required or invalid
 *       403:
 *         description: Forbidden - Admin authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/milestones', verifyAdminToken, getAllMilestones);

/**
 * @swagger
 * /web/admin/farm-categories/{categoryId}/milestones:
 *   get:
 *     tags:
 *       - Web Admin Milestones
 *     summary: Get Milestones by Category
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
 *         description: Farm category ID
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *           default: 'true'
 *         description: Filter only active milestones
 *     responses:
 *       200:
 *         description: Milestones retrieved successfully
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
 *                   example: 'Milestones retrieved successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     categoryId:
 *                       type: string
 *                       format: uuid
 *                     categoryName:
 *                       type: string
 *                     milestones:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                           order:
 *                             type: integer
 *                           isActive:
 *                             type: boolean
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *       401:
 *         description: Unauthorized - Token required or invalid
 *       403:
 *         description: Forbidden - Admin authentication required
 *       404:
 *         description: Farm category not found
 *       500:
 *         description: Internal server error
 */
router.get('/farm-categories/:categoryId/milestones', verifyAdminToken, getMilestonesByCategory);

/**
 * @swagger
 * /web/admin/milestones/{milestoneId}:
 *   put:
 *     tags:
 *       - Web Admin Milestones
 *     summary: Update Milestone
 *     description: Update an existing milestone
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Milestone ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Milestone name/description
 *                 example: 'Planting'
 *               order:
 *                 type: integer
 *                 description: Optional milestone order/sequence
 *                 example: 1
 *     responses:
 *       200:
 *         description: Milestone updated successfully
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
 *                   example: 'Milestone updated successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     farmCategoryId:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     order:
 *                       type: integer
 *                     isActive:
 *                       type: boolean
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request - name is required
 *       401:
 *         description: Unauthorized - Token required or invalid
 *       403:
 *         description: Forbidden - Admin authentication required
 *       404:
 *         description: Milestone not found
 *       500:
 *         description: Internal server error
 */
router.put('/milestones/:milestoneId', verifyAdminToken, updateMilestone);

/**
 * @swagger
 * /web/admin/milestones/{milestoneId}:
 *   delete:
 *     tags:
 *       - Web Admin Milestones
 *     summary: Delete Milestone
 *     description: Delete a specific milestone
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Milestone ID
 *     responses:
 *       200:
 *         description: Milestone deleted successfully
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
 *                   example: 'Milestone deleted successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *       401:
 *         description: Unauthorized - Token required or invalid
 *       403:
 *         description: Forbidden - Admin authentication required
 *       404:
 *         description: Milestone not found
 *       500:
 *         description: Internal server error
 */
router.delete('/milestones/:milestoneId', verifyAdminToken, deleteMilestone);

/**
 * @swagger
 * /web/admin/farm-categories/{categoryId}/milestones/delete-all:
 *   delete:
 *     tags:
 *       - Web Admin Milestones
 *     summary: Delete All Milestones by Category
 *     description: Delete all milestones for a specific farm category
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Farm category ID
 *     responses:
 *       200:
 *         description: Milestones deleted successfully
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
 *                   example: '3 milestone(s) deleted successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     categoryId:
 *                       type: string
 *                       format: uuid
 *                     deletedCount:
 *                       type: integer
 *       401:
 *         description: Unauthorized - Token required or invalid
 *       403:
 *         description: Forbidden - Admin authentication required
 *       404:
 *         description: Farm category not found
 *       500:
 *         description: Internal server error
 */
router.delete('/farm-categories/:categoryId/milestones/delete-all', verifyAdminToken, deleteMilestonesByCategory);

module.exports = router;
