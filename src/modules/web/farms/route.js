const express = require('express');
const router = express.Router();
const uploadFarmDocuments = require('../../../utils/uploadFarmDocuments');
const {
    listUserFarms,
    getFarmById,
    createFarm,
    createInvestmentProject,
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
 *     description: Retrieve the user's farms, each farm's independent verification status, documentation, and investment projects.
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
 *         description: Search by farm name or location
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
 *                           location:
 *                             type: string
 *                           size:
 *                             type: number
 *                           verificationStatus:
 *                             type: string
 *                             enum: [pending, approved, rejected]
 *                           investmentProjects:
 *                             type: array
 *                             description: Projects created under this farm, each with independent dates, lifecycle status, funding, and milestones
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: string
 *                                   format: uuid
 *                                 startDate:
 *                                   type: string
 *                                   format: date
 *                                 endDate:
 *                                   type: string
 *                                   format: date
 *                                 investmentStatus:
 *                                   type: string
 *                                   enum: [not_started, funding_started, active, completed]
 *                                 fundingGoalAmount:
 *                                   type: number
 *                                 amountRaised:
 *                                   type: number
 *                                 percentRaised:
 *                                   type: number
 *                                 completionPercentage:
 *                                   type: number
 *                                   description: Sum of completed milestone funding percentages
 *                                 investorCount:
 *                                   type: integer
 *                           totalFundingGoalAmount:
 *                             type: number
 *                           totalFundsRaised:
 *                             type: number
 *                           percentRaised:
 *                             type: number
 *                           completionPercentage:
 *                             type: number
 *                           investorCount:
 *                             type: integer
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
 *     description: Retrieve a farm's verification status, details, documentation, and all investment projects.
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
 *                     verificationStatus:
 *                       type: string
 *                       enum: [pending, approved, rejected]
 *                     investmentProjects:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           fundingGoalAmount:
 *                             type: number
 *                           amountRaised:
 *                             type: number
 *                           percentRaised:
 *                             type: number
 *                           completionPercentage:
 *                             type: number
 *                             description: Weighted milestone completion using each forked milestone percentage
 *                           investorCount:
 *                             type: integer
 *                           milestones:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 selectionId:
 *                                   type: string
 *                                   format: uuid
 *                                 name:
 *                                   type: string
 *                                 fundReleasePercentage:
 *                                   type: number
 *                                 allocatedAmount:
 *                                   type: number
 *                                 fundingStatus:
 *                                   type: string
 *                                   enum: [request_for_funding, processing_funding, completed]
 *                     totalFundingGoalAmount:
 *                       type: number
 *                     totalFundsRaised:
 *                       type: number
 *                     percentRaised:
 *                       type: number
 *                     completionPercentage:
 *                       type: number
 *                     investorCount:
 *                       type: integer
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalMilestones:
 *                           type: integer
 *                         completedMilestones:
 *                           type: integer
 *                         completionPercentage:
 *                           type: number
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
 *     summary: Create a farm
 *     description: Create a pending farm. Only the farm name is required; size, address, photos, and documents can be added now or later. Create its investment project separately after the farm exists.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Farm name
 *               address:
 *                 type: string
 *                 description: Farm address/location
 *               plotSize:
 *                 type: number
 *                 minimum: 0
 *                 exclusiveMinimum: true
 *                 description: Farm plot size
 *               photos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Farm photos (jpg, png, webp; max 10 files and 50MB per file)
 *               documents:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Farm documents (PDF; max 10 files and 50MB per file)
 *     responses:
 *       201:
 *         description: Farm created successfully with pending verification status
 *       400:
 *         description: Missing name or invalid optional farm fields or documentation
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
 * /web/farms/{farmId}/investment-projects:
 *   post:
 *     tags:
 *       - Web Farms
 *     summary: Create an investment project for a farm
 *     description: Add an investment project to a farm. A farm may have multiple projects. The backend attaches the newest active template for the selected category, sets startDate to the project creation date, calculates endDate from the template duration, sets status to not_started, and initializes project-scoped milestones.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: farmId
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
 *             required:
 *               - farmCategoryId
 *               - fundingGoalAmount
 *             properties:
 *               farmCategoryId:
 *                 type: string
 *                 format: uuid
 *                 description: Active farm category whose current admin template will be used
 *               fundingGoalAmount:
 *                 type: number
 *                 minimum: 0
 *                 exclusiveMinimum: true
 *                 description: Funding goal within the category template's allowed funding range
 *     responses:
 *       201:
 *         description: Investment project created successfully
 *       400:
 *         description: Invalid category or funding goal
 *       401:
 *         description: User not authenticated
 *       404:
 *         description: Farm, category, or active category template not found
 *       500:
 *         description: Failed to create investment project
 */
router.post('/:farmId/investment-projects', createInvestmentProject);

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
 *               address:
 *                 type: string
 *               plotSize:
 *                 type: number
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
 *     summary: Request funding for an investment project milestone
 *     description: Request funding for one of the milestones already forked from the admin template. No project milestones are removed or replaced. investmentProjectId is required when the farm has multiple projects.
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
 *               - selectedMilestoneId
 *             properties:
 *               investmentProjectId:
 *                 type: string
 *                 format: uuid
 *                 description: Project to update; optional only when the farm has exactly one project
 *               selectedMilestoneId:
 *                 type: string
 *                 format: uuid
 *                 description: Template milestone ID stored in the selected project's forked milestone
 *     responses:
 *       200:
 *         description: Milestone funding requested successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: User not authenticated
 *       404:
 *         description: Farm not found
 *       409:
 *         description: Completed milestones cannot request funding again
 *       500:
 *         description: Failed to request milestone funding
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
 *       - in: query
 *         name: investmentProjectId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Project scope; required when the same template milestone exists in multiple projects
 *     responses:
 *       200:
 *         description: Milestone removed successfully
 *       401:
 *         description: User not authenticated
 *       404:
 *         description: Farm or milestone not found
 *       409:
 *         description: Forked investment project milestones cannot be removed
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
