const express = require('express');
const router = express.Router();
const { getInvestments, getInvestmentById, investInFarm } = require('./controller');

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
 *                   example: Investments retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     investments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           farmId:
 *                             type: string
 *                             format: uuid
 *                           farmName:
 *                             type: string
 *                             example: Green Valley Rice Farm
 *                           image:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 format: uuid
 *                               fileName:
 *                                 type: string
 *                                 example: farm-front-view.jpg
 *                               fileUrl:
 *                                 type: string
 *                                 example: http://localhost:5011/upload/farm-documents/pictures/farm-front-view.jpg
 *                               mimeType:
 *                                 type: string
 *                                 example: image/jpeg
 *                           imageUrl:
 *                             type: string
 *                             nullable: true
 *                             example: http://localhost:5011/upload/farm-documents/pictures/farm-front-view.jpg
 *                           farmCategory:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 format: uuid
 *                               name:
 *                                 type: string
 *                                 example: Rice Farming
 *                           investmentTemplate:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 format: uuid
 *                               name:
 *                                 type: string
 *                                 example: Rice Growth Plan
 *                           roi:
 *                             type: number
 *                             example: 18.5
 *                           roiPercentage:
 *                             type: number
 *                             example: 18.5
 *                           duration:
 *                             type: object
 *                             properties:
 *                               value:
 *                                 type: integer
 *                                 example: 6
 *                               unit:
 *                                 type: string
 *                                 enum: [weeks, months, years]
 *                                 example: months
 *                               label:
 *                                 type: string
 *                                 example: 6 months
 *                           riskLevel:
 *                             type: string
 *                             enum: [low, medium, high]
 *                             example: medium
 *                           farmOwner:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 format: uuid
 *                               name:
 *                                 type: string
 *                                 example: Amina Bello
 *                           farmOwnerName:
 *                             type: string
 *                             example: Amina Bello
 *                           rating:
 *                             type: number
 *                             nullable: true
 *                             example: null
 *                           fundingReceived:
 *                             type: number
 *                             example: 1250000
 *                           totalExpectedFunding:
 *                             type: number
 *                             example: 5000000
 *                           location:
 *                             type: string
 *                             example: Ibadan, Oyo
 *                           percentFunded:
 *                             type: number
 *                             example: 25
 *                           minimumInvest:
 *                             type: number
 *                             example: 50000
 *                           fundingStatus:
 *                             type: string
 *                             enum: [pending, partial, completed, cancelled]
 *                             example: partial
 *                           currency:
 *                             type: string
 *                             example: NGN
 *                           lastViewed:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                             example: null
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 10
 *                         total:
 *                           type: integer
 *                           example: 25
 *                         totalPages:
 *                           type: integer
 *                           example: 3
 *                         hasNextPage:
 *                           type: boolean
 *                           example: true
 *                         hasPreviousPage:
 *                           type: boolean
 *                           example: false
 *                         startIndex:
 *                           type: integer
 *                           example: 1
 *                         endIndex:
 *                           type: integer
 *                           example: 10
 *             example:
 *               error: false
 *               message: Investments retrieved successfully
 *               data:
 *                 investments:
 *                   - id: 9a3f6e1b-49f3-4c89-9d29-d10f7f5229db
 *                     farmId: 9a3f6e1b-49f3-4c89-9d29-d10f7f5229db
 *                     farmName: Green Valley Rice Farm
 *                     image:
 *                       id: 91d0cf89-65f1-4e3e-8f64-b648b82c9f44
 *                       fileName: farm-front-view.jpg
 *                       fileUrl: http://localhost:5011/upload/farm-documents/pictures/farm-front-view.jpg
 *                       mimeType: image/jpeg
 *                     imageUrl: http://localhost:5011/upload/farm-documents/pictures/farm-front-view.jpg
 *                     farmCategory:
 *                       id: 18c0932f-c3a7-41ed-8b47-f51b87b87912
 *                       name: Rice Farming
 *                     investmentTemplate:
 *                       id: ba34bf03-2e08-49de-8243-3a9f36f0aaf6
 *                       name: Rice Growth Plan
 *                     roi: 18.5
 *                     roiPercentage: 18.5
 *                     duration:
 *                       value: 6
 *                       unit: months
 *                       label: 6 months
 *                     riskLevel: medium
 *                     farmOwner:
 *                       id: 6e421fc4-14fb-4c03-a6df-c30e9223b30c
 *                       name: Amina Bello
 *                     farmOwnerName: Amina Bello
 *                     rating: null
 *                     fundingReceived: 1250000
 *                     totalExpectedFunding: 5000000
 *                     location: Ibadan, Oyo
 *                     percentFunded: 25
 *                     minimumInvest: 50000
 *                     fundingStatus: partial
 *                     currency: NGN
 *                     lastViewed: null
 *                     createdAt: 2026-07-06T08:30:00.000Z
 *                     updatedAt: 2026-07-06T08:30:00.000Z
 *                 pagination:
 *                   page: 1
 *                   limit: 10
 *                   total: 25
 *                   totalPages: 3
 *                   hasNextPage: true
 *                   hasPreviousPage: false
 *                   startIndex: 1
 *                   endIndex: 10
 *       400:
 *         description: Invalid filter value
 *       401:
 *         description: User not authenticated
 *       500:
 *         description: Failed to retrieve investments
 */
router.get('/', getInvestments);

/**
 * @swagger
 * /web/investments/{farmId}:
 *   get:
 *     tags:
 *       - Web Investments
 *     summary: Get user-side investment details
 *     description: Retrieve one verified farm investment with template details, all farm images, and user-farm milestone progress.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: farmId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The farm/investment ID returned from the investments list.
 *     responses:
 *       200:
 *         description: Investment details retrieved successfully
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
 *                   example: Investment details retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     farmId:
 *                       type: string
 *                       format: uuid
 *                     farmName:
 *                       type: string
 *                       example: Green Valley Rice Farm
 *                     image:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         fileName:
 *                           type: string
 *                           example: farm-front-view.jpg
 *                         fileUrl:
 *                           type: string
 *                           example: http://localhost:5011/upload/farm-documents/pictures/farm-front-view.jpg
 *                         mimeType:
 *                           type: string
 *                           example: image/jpeg
 *                     imageUrl:
 *                       type: string
 *                       nullable: true
 *                       example: http://localhost:5011/upload/farm-documents/pictures/farm-front-view.jpg
 *                     images:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           fileName:
 *                             type: string
 *                           fileUrl:
 *                             type: string
 *                           mimeType:
 *                             type: string
 *                     farmCategory:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         name:
 *                           type: string
 *                           example: Rice Farming
 *                     investmentTemplate:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         name:
 *                           type: string
 *                           example: Rice Growth Plan
 *                     roi:
 *                       type: number
 *                       example: 18.5
 *                     roiPercentage:
 *                       type: number
 *                       example: 18.5
 *                     duration:
 *                       type: object
 *                       properties:
 *                         value:
 *                           type: integer
 *                           example: 6
 *                         unit:
 *                           type: string
 *                           enum: [weeks, months, years]
 *                           example: months
 *                         label:
 *                           type: string
 *                           example: 6 months
 *                     riskLevel:
 *                       type: string
 *                       enum: [low, medium, high]
 *                       example: medium
 *                     farmOwner:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         name:
 *                           type: string
 *                           example: Amina Bello
 *                     farmOwnerName:
 *                       type: string
 *                       example: Amina Bello
 *                     rating:
 *                       type: number
 *                       nullable: true
 *                       example: null
 *                     fundingReceived:
 *                       type: number
 *                       example: 1250000
 *                     totalExpectedFunding:
 *                       type: number
 *                       example: 5000000
 *                     location:
 *                       type: string
 *                       example: Ibadan, Oyo
 *                     percentFunded:
 *                       type: number
 *                       example: 25
 *                     minimumInvest:
 *                       type: number
 *                       example: 50000
 *                     fundingStatus:
 *                       type: string
 *                       enum: [pending, partial, completed, cancelled]
 *                       example: partial
 *                     currency:
 *                       type: string
 *                       example: NGN
 *                     lastViewed:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       example: null
 *                     milestones:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           userFarmMilestoneId:
 *                             type: string
 *                             format: uuid
 *                           milestoneId:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                             example: Land preparation
 *                           order:
 *                             type: integer
 *                             nullable: true
 *                             example: 1
 *                           amount:
 *                             type: number
 *                             example: 750000
 *                           isCompleted:
 *                             type: boolean
 *                             example: true
 *                           status:
 *                             type: string
 *                             enum: [completed, in_progress, not_started]
 *                             example: completed
 *                           completedAt:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     milestoneStats:
 *                       type: object
 *                       properties:
 *                         totalMilestones:
 *                           type: integer
 *                           example: 3
 *                         completedMilestones:
 *                           type: integer
 *                           example: 1
 *                         inProgressMilestones:
 *                           type: integer
 *                           example: 1
 *                         notStartedMilestones:
 *                           type: integer
 *                           example: 1
 *                         completionPercentage:
 *                           type: integer
 *                           example: 33
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *             example:
 *               error: false
 *               message: Investment details retrieved successfully
 *               data:
 *                 id: 9a3f6e1b-49f3-4c89-9d29-d10f7f5229db
 *                 farmId: 9a3f6e1b-49f3-4c89-9d29-d10f7f5229db
 *                 farmName: Green Valley Rice Farm
 *                 image:
 *                   id: 91d0cf89-65f1-4e3e-8f64-b648b82c9f44
 *                   fileName: farm-front-view.jpg
 *                   fileUrl: http://localhost:5011/upload/farm-documents/pictures/farm-front-view.jpg
 *                   mimeType: image/jpeg
 *                 imageUrl: http://localhost:5011/upload/farm-documents/pictures/farm-front-view.jpg
 *                 images:
 *                   - id: 91d0cf89-65f1-4e3e-8f64-b648b82c9f44
 *                     fileName: farm-front-view.jpg
 *                     fileUrl: http://localhost:5011/upload/farm-documents/pictures/farm-front-view.jpg
 *                     mimeType: image/jpeg
 *                   - id: cb4b1364-2374-42ea-8f3c-d88c9ae5d9e2
 *                     fileName: farm-side-view.jpg
 *                     fileUrl: http://localhost:5011/upload/farm-documents/pictures/farm-side-view.jpg
 *                     mimeType: image/jpeg
 *                 farmCategory:
 *                   id: 18c0932f-c3a7-41ed-8b47-f51b87b87912
 *                   name: Rice Farming
 *                 investmentTemplate:
 *                   id: ba34bf03-2e08-49de-8243-3a9f36f0aaf6
 *                   name: Rice Growth Plan
 *                 roi: 18.5
 *                 roiPercentage: 18.5
 *                 duration:
 *                   value: 6
 *                   unit: months
 *                   label: 6 months
 *                 riskLevel: medium
 *                 farmOwner:
 *                   id: 6e421fc4-14fb-4c03-a6df-c30e9223b30c
 *                   name: Amina Bello
 *                 farmOwnerName: Amina Bello
 *                 rating: null
 *                 fundingReceived: 1250000
 *                 totalExpectedFunding: 5000000
 *                 location: Ibadan, Oyo
 *                 percentFunded: 25
 *                 minimumInvest: 50000
 *                 fundingStatus: partial
 *                 currency: NGN
 *                 lastViewed: null
 *                 milestones:
 *                   - id: 3819dc5a-bbc5-4ecf-90bb-601881fdd9a4
 *                     userFarmMilestoneId: 3819dc5a-bbc5-4ecf-90bb-601881fdd9a4
 *                     milestoneId: 0b21f1df-8f24-4bc8-a034-7aaf12171fe0
 *                     name: Land preparation
 *                     order: 1
 *                     amount: 750000
 *                     isCompleted: true
 *                     status: completed
 *                     completedAt: 2026-07-01T10:00:00.000Z
 *                     createdAt: 2026-06-20T09:00:00.000Z
 *                     updatedAt: 2026-07-01T10:00:00.000Z
 *                   - id: c6a9d878-c3af-4c43-b09c-9a7129fbf645
 *                     userFarmMilestoneId: c6a9d878-c3af-4c43-b09c-9a7129fbf645
 *                     milestoneId: cfa88fa1-d27f-43ec-afb1-9f4ec596bc1d
 *                     name: Planting
 *                     order: 2
 *                     amount: 1200000
 *                     isCompleted: false
 *                     status: in_progress
 *                     completedAt: null
 *                     createdAt: 2026-06-20T09:00:00.000Z
 *                     updatedAt: 2026-06-20T09:00:00.000Z
 *                   - id: f291fce5-40ed-4763-87b6-c63a5ed6f298
 *                     userFarmMilestoneId: f291fce5-40ed-4763-87b6-c63a5ed6f298
 *                     milestoneId: a00f8a72-b1fa-4c4e-a193-a77ab3fd4b61
 *                     name: Harvest
 *                     order: 3
 *                     amount: 2000000
 *                     isCompleted: false
 *                     status: not_started
 *                     completedAt: null
 *                     createdAt: 2026-06-20T09:00:00.000Z
 *                     updatedAt: 2026-06-20T09:00:00.000Z
 *                 milestoneStats:
 *                   totalMilestones: 3
 *                   completedMilestones: 1
 *                   inProgressMilestones: 1
 *                   notStartedMilestones: 1
 *                   completionPercentage: 33
 *                 createdAt: 2026-07-06T08:30:00.000Z
 *                 updatedAt: 2026-07-06T08:30:00.000Z
 *       400:
 *         description: Farm ID is required
 *       401:
 *         description: User not authenticated
 *       404:
 *         description: Investment not found
 *       500:
 *         description: Failed to retrieve investment details
 */
router.get('/:farmId', getInvestmentById);

/**
 * @swagger
 * /web/investments/{farmId}/invest:
 *   post:
 *     tags:
 *       - Web Investments
 *     summary: Invest in another user's farm
 *     description: Records an investment payment and atomically increases the farm's received funding. Paystack fields are reserved, but gateway initialization is deferred until the Paystack account is configured.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: farmId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: header
 *         name: Idempotency-Key
 *         required: false
 *         schema:
 *           type: string
 *           maxLength: 100
 *         description: A unique client-generated key that safely prevents duplicate investments when retrying a request.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 format: double
 *                 minimum: 0.01
 *                 example: 250000
 *               currency:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 3
 *                 example: NGN
 *               idempotencyKey:
 *                 type: string
 *                 maxLength: 100
 *                 description: Body alternative to the Idempotency-Key header.
 *     responses:
 *       201:
 *         description: Investment recorded successfully
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
 *                   example: Investment recorded successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     payment:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         reference:
 *                           type: string
 *                         amount:
 *                           type: number
 *                           example: 250000
 *                         currency:
 *                           type: string
 *                           example: NGN
 *                         gateway:
 *                           type: string
 *                           example: paystack
 *                         status:
 *                           type: string
 *                           example: recorded
 *                     investment:
 *                       type: object
 *                       properties:
 *                         farmId:
 *                           type: string
 *                           format: uuid
 *                         fundingReceived:
 *                           type: number
 *                           example: 1500000
 *                         totalExpectedFunding:
 *                           type: number
 *                           example: 5000000
 *                         remainingFunding:
 *                           type: number
 *                           example: 3500000
 *                         percentFunded:
 *                           type: number
 *                           example: 30
 *                         fundingStatus:
 *                           type: string
 *                           example: partial
 *                     gateway:
 *                       type: object
 *                       properties:
 *                         provider:
 *                           type: string
 *                           example: paystack
 *                         initialized:
 *                           type: boolean
 *                           example: false
 *       200:
 *         description: An idempotent retry returned the existing payment
 *       400:
 *         description: Invalid amount, currency, or investment limit
 *       401:
 *         description: User not authenticated
 *       403:
 *         description: Approved KYC is required or the user owns the farm
 *       404:
 *         description: Farm or investment template not found
 *       409:
 *         description: Farm is fully funded, unavailable, or the idempotency key conflicts
 *       500:
 *         description: Failed to process investment
 */
router.post('/:farmId/invest', investInFarm);

module.exports = router;
