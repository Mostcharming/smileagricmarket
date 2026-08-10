const express = require('express');
const router = express.Router();
const {
    getInvestments,
    getInvestmentById,
    investInFarm,
    verifyInvestmentPayment
} = require('./controller');

/**
 * @swagger
 * /web/investments:
 *   get:
 *     tags:
 *       - Web Investments
 *     summary: List verified farms available for investment
 *     description: Returns one item per verified farm. Filters decide which farms qualify; each returned farm then includes funding totals, unique investor counts, and details aggregated across all of its active investment projects. Use an investmentProjectId from investmentProjects for payment.
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
 *         description: Only return farms with at least one active project in this farm category.
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
 *         name: investmentStatus
 *         schema:
 *           type: string
 *           enum: [not_started, funding_started, active, completed, open]
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
 *                         $ref: '#/components/schemas/UserInvestmentFarm'
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             description: Investment project ID
 *                           investmentProjectId:
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
 *                               startDate:
 *                                 type: string
 *                                 format: date
 *                                 nullable: true
 *                                 example: '2026-08-01'
 *                               endDate:
 *                                 type: string
 *                                 format: date
 *                                 nullable: true
 *                                 example: '2027-07-31'
 *                           roi:
 *                             type: number
 *                             example: 18.5
 *                           roiPercentage:
 *                             type: number
 *                             example: 18.5
 *                           startDate:
 *                             type: string
 *                             format: date
 *                             example: '2026-08-01'
 *                             description: Investment project creation date
 *                           endDate:
 *                             type: string
 *                             format: date
 *                             example: '2027-02-01'
 *                             description: Project start date plus the template duration
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
 *                           amountRaised:
 *                             type: number
 *                             example: 1250000
 *                           totalExpectedFunding:
 *                             type: number
 *                             example: 5000000
 *                           fundingGoalAmount:
 *                             type: number
 *                             example: 5000000
 *                           location:
 *                             type: string
 *                             example: Ibadan, Oyo
 *                           percentFunded:
 *                             type: number
 *                             example: 25
 *                           percentRaised:
 *                             type: number
 *                             example: 25
 *                           completionPercentage:
 *                             type: number
 *                             example: 30
 *                           investorCount:
 *                             type: integer
 *                             example: 18
 *                           minimumInvest:
 *                             type: number
 *                             example: 50000
 *                           investmentStatus:
 *                             type: string
 *                             enum: [not_started, funding_started, active, completed]
 *                             example: funding_started
 *                           fundingStatus:
 *                             type: string
 *                             enum: [not_started, partial, funded]
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
 *                     farmId: 7e3dcc29-7865-4f0f-9d6f-b95b355d6aec
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
 *                       startDate: '2026-08-01'
 *                       endDate: '2027-07-31'
 *                     roi: 18.5
 *                     roiPercentage: 18.5
 *                     startDate: '2026-08-10'
 *                     endDate: '2027-02-10'
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
 *                     investmentStatus: funding_started
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
 *     summary: Get complete details for one verified investment farm
 *     description: Returns the farm, owner rating state, documents, funding aggregated across active projects, unique active-project investors, and every investment project with its template and project-scoped milestones.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: farmId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The farmId returned from the investments list.
 *     responses:
 *       200:
 *         description: Investment farm details retrieved successfully
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
 *                   example: Investment farm details retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/UserInvestmentFarm'
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: Investment project ID
 *                     investmentProjectId:
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
 *                         startDate:
 *                           type: string
 *                           format: date
 *                           nullable: true
 *                           example: '2026-08-01'
 *                         endDate:
 *                           type: string
 *                           format: date
 *                           nullable: true
 *                           example: '2027-07-31'
 *                     roi:
 *                       type: number
 *                       example: 18.5
 *                     roiPercentage:
 *                       type: number
 *                       example: 18.5
 *                     startDate:
 *                       type: string
 *                       format: date
 *                       example: '2026-08-01'
 *                       description: Investment project creation date
 *                     endDate:
 *                       type: string
 *                       format: date
 *                       example: '2027-02-01'
 *                       description: Project start date plus the template duration
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
 *                     amountRaised:
 *                       type: number
 *                       example: 1250000
 *                     totalExpectedFunding:
 *                       type: number
 *                       example: 5000000
 *                     fundingGoalAmount:
 *                       type: number
 *                       example: 5000000
 *                     location:
 *                       type: string
 *                       example: Ibadan, Oyo
 *                     percentFunded:
 *                       type: number
 *                       example: 25
 *                     percentRaised:
 *                       type: number
 *                       example: 25
 *                     completionPercentage:
 *                       type: number
 *                       example: 30
 *                     investorCount:
 *                       type: integer
 *                       example: 18
 *                     minimumInvest:
 *                       type: number
 *                       example: 50000
 *                     investmentStatus:
 *                       type: string
 *                       enum: [not_started, funding_started, active, completed]
 *                       example: funding_started
 *                     fundingStatus:
 *                       type: string
 *                       enum: [not_started, partial, funded]
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
 *                           allocatedAmount:
 *                             type: number
 *                             example: 750000
 *                           fundReleasePercentage:
 *                             type: number
 *                             example: 15
 *                           isCompleted:
 *                             type: boolean
 *                             example: true
 *                           status:
 *                             type: string
 *                             enum: [request_for_funding, processing_funding, completed]
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
 *                         processingFundingMilestones:
 *                           type: integer
 *                           example: 1
 *                         requestForFundingMilestones:
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
 *               message: Investment farm details retrieved successfully
 *               data:
 *                 id: 9a3f6e1b-49f3-4c89-9d29-d10f7f5229db
 *                 farmId: 7e3dcc29-7865-4f0f-9d6f-b95b355d6aec
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
 *                   startDate: '2026-08-01'
 *                   endDate: '2027-07-31'
 *                 roi: 18.5
 *                 roiPercentage: 18.5
 *                 startDate: '2026-08-10'
 *                 endDate: '2027-02-10'
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
 *                 investmentStatus: funding_started
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
 *                     status: processing_funding
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
 *                     status: request_for_funding
 *                     completedAt: null
 *                     createdAt: 2026-06-20T09:00:00.000Z
 *                     updatedAt: 2026-06-20T09:00:00.000Z
 *                 milestoneStats:
 *                   totalMilestones: 3
 *                   completedMilestones: 1
 *                   processingFundingMilestones: 1
 *                   requestForFundingMilestones: 1
 *                   completionPercentage: 30
 *                 createdAt: 2026-07-06T08:30:00.000Z
 *                 updatedAt: 2026-07-06T08:30:00.000Z
 *       400:
 *         description: Farm ID is required
 *       401:
 *         description: User not authenticated
 *       404:
 *         description: Verified investment farm not found
 *       500:
 *         description: Failed to retrieve investment farm details
 */
router.get('/:farmId', getInvestmentById);

/**
 * @swagger
 * /web/investments/{investmentProjectId}/invest:
 *   post:
 *     tags:
 *       - Web Investments
 *     summary: Invest in another user's farm investment project
 *     description: Targets one investment project, saves an internal transaction, initializes Paystack, and returns the transaction ID, checkout URL, access code, and reference. Project funding is credited only after a successful Paystack verification or signed webhook.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: investmentProjectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID of one investment project from the farm's investmentProjects array; Paystack credits only this project.
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
 *         description: Paystack transaction initialized successfully
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
 *                     transactionId:
 *                       type: string
 *                       format: uuid
 *                       description: Saved SmileAgriMarket investment transaction ID
 *                     payment:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         transactionId:
 *                           type: string
 *                           format: uuid
 *                         reference:
 *                           type: string
 *                           description: Unique reference sent to Paystack
 *                         gatewayTransactionId:
 *                           type: string
 *                           nullable: true
 *                           description: Paystack numeric transaction ID, populated by verification/webhook and stored as text for precision
 *                         accessCode:
 *                           type: string
 *                           description: Access code used by Paystack Popup or mobile SDK
 *                         authorizationUrl:
 *                           type: string
 *                           format: uri
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
 *                           example: pending
 *                     investment:
 *                       type: object
 *                       properties:
 *                         farmId:
 *                           type: string
 *                           format: uuid
 *                         investmentProjectId:
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
 *                         investmentStatus:
 *                           type: string
 *                           enum: [not_started, funding_started, active, completed]
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
 *                           example: true
 *                         reference:
 *                           type: string
 *                         authorizationUrl:
 *                           type: string
 *                           format: uri
 *                         accessCode:
 *                           type: string
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
 *       502:
 *         description: Paystack rejected initialization or returned an invalid response
 *       503:
 *         description: Paystack is not configured or unavailable
 */
router.post('/:investmentProjectId/invest', investInFarm);

/**
 * @swagger
 * /web/investments/payments/{transactionId}/verify:
 *   post:
 *     tags:
 *       - Web Investments
 *     summary: Verify and settle a Paystack investment
 *     description: Verifies the saved transaction with Paystack, confirms reference, amount, and currency, stores Paystack's transaction ID, and credits the farm exactly once when successful.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Transaction ID returned by the invest endpoint
 *     responses:
 *       200:
 *         description: Current verified transaction state
 *       401:
 *         description: User not authenticated
 *       404:
 *         description: Investment transaction not found
 *       409:
 *         description: Paystack reference, amount, or currency does not match
 *       502:
 *         description: Paystack verification failed
 *       503:
 *         description: Paystack is not configured or unavailable
 */
router.post('/payments/:transactionId/verify', verifyInvestmentPayment);

module.exports = router;
