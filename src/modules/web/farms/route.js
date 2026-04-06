const express = require('express');
const router = express.Router();
const uploadFarmDocuments = require('../../../utils/uploadFarmDocuments');
const {
    listUserFarms,
    getFarmById,
    createFarm,
    updateFarm,
    deleteFarm,
    addMilestonesToFarm,
    uploadFarmDocumentsToFarm,
    deleteFarmDocument,
    removeMilestoneFromFarm
} = require('./controller');

/**
 * @swagger
 * /web/farms:
 *   get:
 *     tags:
 *       - Web Farms
 *     summary: List user farms with pagination and search
 *     description: Retrieve a paginated list of user farms with optional search functionality.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *         description: Number of items per page (max 100)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by farm name, description, or location
 *     responses:
 *       200:
 *         description: Farms retrieved successfully
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
 *                     farms:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                           description:
 *                             type: string
 *                           location:
 *                             type: string
 *                           size:
 *                             type: number
 *                           investmentAmount:
 *                             type: number
 *                             description: Initial investment amount for the farm
 *                           currency:
 *                             type: string
 *                             description: Currency code (e.g., USD, EUR, GBP)
 *                           Category:
 *                             type: object
 *                           Investment:
 *                             type: object
 *                           SelectedMilestones:
 *                             type: array
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                         hasNextPage:
 *                           type: boolean
 *                         hasPreviousPage:
 *                           type: boolean
 *                         startIndex:
 *                           type: integer
 *                         endIndex:
 *                           type: integer
 *       401:
 *         description: User not authenticated
 *       500:
 *         description: Failed to retrieve farms
 */
router.get('/', listUserFarms);

/**
 * @swagger
 * /web/farms/{farmId}:
 *   get:
 *     tags:
 *       - Web Farms
 *     summary: Get farm details by ID
 *     description: Retrieve detailed information about a specific farm including investments and milestones.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: farmId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Farm unique identifier
 *     responses:
 *       200:
 *         description: Farm details retrieved successfully
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
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     Category:
 *                       type: object
 *                     Investment:
 *                       type: object
 *                     SelectedMilestones:
 *                       type: array
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalMilestones:
 *                           type: integer
 *                         completedMilestones:
 *                           type: integer
 *                         completionPercentage:
 *                           type: integer
 *       401:
 *         description: User not authenticated
 *       404:
 *         description: Farm not found
 *       500:
 *         description: Failed to retrieve farm details
 */
router.get('/:farmId', getFarmById);

/**
 * @swagger
 * /web/farms:
 *   post:
 *     tags:
 *       - Web Farms
 *     summary: Create a new farm with documents
 *     description: Create a new user farm with farm pictures, documents, and selected milestones. Farm starts with pending verification status.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - farmCategoryId
 *               - name
 *             properties:
 *               farmCategoryId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of the farm category
 *               name:
 *                 type: string
 *                 description: Farm name
 *               description:
 *                 type: string
 *                 description: Farm description
 *               location:
 *                 type: string
 *                 description: Farm location
 *               size:
 *                 type: number
 *                 description: Farm size (in hectares or other unit)
 *               investmentAmount:
 *                 type: number
 *                 description: Initial investment amount for the farm
 *               currency:
 *                 type: string
 *                 description: Currency code (e.g., USD, EUR, GBP) - defaults to USD
 *               selectedMilestones:
 *                 type: string
 *                 description: JSON array of milestone IDs (e.g., ["id1","id2"])
 *               pictures:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Farm pictures (jpg, png, webp - max 10 files, 50MB total)
 *               documents:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Farm documents (pdf - max 10 files, 50MB total)
 *     responses:
 *       201:
 *         description: Farm created successfully with pending verification status
 *       400:
 *         description: Missing required fields or invalid data
 *       401:
 *         description: User not authenticated
 *       404:
 *         description: Farm category not found
 *       500:
 *         description: Failed to create farm
 */
router.post('/', uploadFarmDocuments, createFarm);

/**
 * @swagger
 * /web/farms/{farmId}:
 *   put:
 *     tags:
 *       - Web Farms
 *     summary: Update farm details
 *     description: Update information for a specific farm.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: farmId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Farm unique identifier
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
 *               location:
 *                 type: string
 *               size:
 *                 type: number
 *               investmentAmount:
 *                 type: number
 *                 description: Investment amount for the farm
 *               currency:
 *                 type: string
 *                 description: Currency code (e.g., USD, EUR, GBP)
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Farm updated successfully
 *       400:
 *         description: Invalid farm ID
 *       401:
 *         description: User not authenticated
 *       404:
 *         description: Farm not found
 *       500:
 *         description: Failed to update farm
 */
router.put('/:farmId', updateFarm);

/**
 * @swagger
 * /web/farms/{farmId}:
 *   delete:
 *     tags:
 *       - Web Farms
 *     summary: Delete (deactivate) a farm
 *     description: Soft delete a farm by marking it as inactive.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: farmId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Farm unique identifier
 *     responses:
 *       200:
 *         description: Farm deleted successfully
 *       400:
 *         description: Invalid farm ID
 *       401:
 *         description: User not authenticated
 *       404:
 *         description: Farm not found
 *       500:
 *         description: Failed to delete farm
 */
router.delete('/:farmId', deleteFarm);

/**
 * @swagger
 * /web/farms/{farmId}/milestones:
 *   post:
 *     tags:
 *       - Web Farms
 *     summary: Add milestones to a farm
 *     description: Add selected milestones to an existing farm.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: farmId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Farm unique identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - milestones
 *             properties:
 *               milestones:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Array of milestone IDs
 *     responses:
 *       200:
 *         description: Milestones added successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: User not authenticated
 *       404:
 *         description: Farm not found
 *       500:
 *         description: Failed to add milestones
 */
router.post('/:farmId/milestones', addMilestonesToFarm);

/**
 * @swagger
 * /web/farms/{farmId}/milestones/{milestoneId}:
 *   delete:
 *     tags:
 *       - Web Farms
 *     summary: Remove a milestone from a farm
 *     description: Remove a specific milestone from a farm.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: farmId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Farm unique identifier
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Milestone unique identifier
 *     responses:
 *       200:
 *         description: Milestone removed successfully
 *       401:
 *         description: User not authenticated
 *       404:
 *         description: Farm not found
 *       500:
 *         description: Failed to remove milestone
 */
router.delete('/:farmId/milestones/:milestoneId', removeMilestoneFromFarm);

/**
 * @swagger
 * /web/farms/{farmId}/documents:
 *   post:
 *     tags:
 *       - Web Farms
 *     summary: Upload documents to a farm
 *     description: Upload farm pictures and documents (PDFs) to an existing farm.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: farmId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Farm unique identifier
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               pictures:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Farm pictures (jpg, png, webp - max 10 files)
 *               documents:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Farm documents (pdf - max 10 files)
 *     responses:
 *       200:
 *         description: Documents uploaded successfully
 *       400:
 *         description: No files provided or invalid request
 *       401:
 *         description: User not authenticated
 *       404:
 *         description: Farm not found
 *       500:
 *         description: Failed to upload documents
 */
router.post('/:farmId/documents', uploadFarmDocuments, uploadFarmDocumentsToFarm);

/**
 * @swagger
 * /web/farms/documents/{documentId}:
 *   delete:
 *     tags:
 *       - Web Farms
 *     summary: Delete a farm document
 *     description: Delete a specific farm document (picture or PDF).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Document unique identifier
 *     responses:
 *       200:
 *         description: Document deleted successfully
 *       401:
 *         description: User not authenticated
 *       403:
 *         description: Unauthorized to delete this document
 *       404:
 *         description: Document not found
 *       500:
 *         description: Failed to delete document
 */
router.delete('/documents/:documentId', deleteFarmDocument);

module.exports = router;
