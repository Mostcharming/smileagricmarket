const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../../middlewares/common/security');
const {
    login,
    getUserDirectory,
    getKYCByUserId,
    approveKYC,
    rejectKYC
} = require('./controller');

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
            console.log(payload)
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
 * /web/admin/login:
 *   post:
 *     tags:
 *       - Web Admin
 *     summary: Admin Login
 *     description: Login for admin users with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Admin email address
 *                 example: 'admin@smileagric.com'
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Admin password
 *                 example: 'Admin@123'
 *     responses:
 *       200:
 *         description: Login successful
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
 *                   example: 'Login successful'
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       description: JWT authentication token
 *                     admin:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         fullName:
 *                           type: string
 *                         email:
 *                           type: string
 *                         role:
 *                           type: string
 *                           enum: [super_admin, admin, moderator]
 *                         lastLoginAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Bad request - Email and password are required
 *       401:
 *         description: Unauthorized - Invalid credentials
 *       403:
 *         description: Forbidden - Account deactivated
 *       500:
 *         description: Internal server error
 */
router.post('/login', login);

/**
 * @swagger
 * /web/admin/users:
 *   get:
 *     tags:
 *       - Web Admin
 *     summary: Get User Directory
 *     description: Get paginated list of users with search functionality. Returns user name, email, phone number, and KYC status.
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
 *           default: 20
 *         description: Number of users per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, email, or phone number
 *         example: 'john'
 *     responses:
 *       200:
 *         description: User directory retrieved successfully
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
 *                   example: 'User directory retrieved successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           fullName:
 *                             type: string
 *                             example: 'John Doe'
 *                           email:
 *                             type: string
 *                             example: 'john@example.com'
 *                           phoneNumber:
 *                             type: string
 *                             example: '08012345678'
 *                           kycStatus:
 *                             type: string
 *                             enum: [not_submitted, pending, approved, rejected]
 *                             example: 'approved'
 *                           kycSubmittedAt:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                           kycVerifiedAt:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: integer
 *                           example: 1
 *                         totalPages:
 *                           type: integer
 *                           example: 5
 *                         totalUsers:
 *                           type: integer
 *                           example: 100
 *                         limit:
 *                           type: integer
 *                           example: 20
 *                         hasNextPage:
 *                           type: boolean
 *                           example: true
 *                         hasPreviousPage:
 *                           type: boolean
 *                           example: false
 *       401:
 *         description: Unauthorized - Token required or invalid
 *       403:
 *         description: Forbidden - Admin authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/users', verifyAdminToken, getUserDirectory);

/**
 * @swagger
 * /web/admin/users/{userId}/kyc:
 *   get:
 *     tags:
 *       - Web Admin
 *     summary: Get KYC Details by User ID
 *     description: Get the KYC details for a specific user by their ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The user's unique identifier
 *     responses:
 *       200:
 *         description: KYC details retrieved successfully
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
 *                   example: 'KYC details retrieved successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         fullName:
 *                           type: string
 *                         email:
 *                           type: string
 *                         phoneNumber:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                     kyc:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         identificationType:
 *                           type: string
 *                           enum: [national_id, passport, driver_license, tin, voter_card]
 *                         identificationNumber:
 *                           type: string
 *                         idDocumentUrl:
 *                           type: string
 *                           nullable: true
 *                         selfieImageUrl:
 *                           type: string
 *                           nullable: true
 *                         status:
 *                           type: string
 *                           enum: [pending, approved, rejected]
 *                         rejectionReason:
 *                           type: string
 *                           nullable: true
 *                         submittedAt:
 *                           type: string
 *                           format: date-time
 *                         verifiedAt:
 *                           type: string
 *                           format: date-time
 *                           nullable: true
 *                         verifiedBy:
 *                           type: string
 *                           format: uuid
 *                           nullable: true
 *                     kycStatus:
 *                       type: string
 *                       enum: [not_submitted, pending, approved, rejected]
 *       400:
 *         description: Bad request - User ID is required
 *       401:
 *         description: Unauthorized - Token required or invalid
 *       403:
 *         description: Forbidden - Admin authentication required
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.get('/users/:userId/kyc', verifyAdminToken, getKYCByUserId);

/**
 * @swagger
 * /web/admin/kyc/approve:
 *   post:
 *     tags:
 *       - Web Admin
 *     summary: Approve KYC
 *     description: Approve a user's KYC submission. Sends an approval notification to the user via SMS and email.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - kycId
 *             properties:
 *               kycId:
 *                 type: string
 *                 format: uuid
 *                 description: The KYC record ID to approve
 *                 example: '550e8400-e29b-41d4-a716-446655440000'
 *     responses:
 *       200:
 *         description: KYC approved successfully
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
 *                   example: 'KYC approved successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     kycId:
 *                       type: string
 *                       format: uuid
 *                     status:
 *                       type: string
 *                       example: 'approved'
 *                     verifiedAt:
 *                       type: string
 *                       format: date-time
 *                     verifiedBy:
 *                       type: string
 *                       format: uuid
 *       400:
 *         description: Bad request - KYC ID is required
 *       401:
 *         description: Unauthorized - Token required or invalid
 *       403:
 *         description: Forbidden - Admin authentication required
 *       404:
 *         description: KYC record not found
 *       409:
 *         description: Conflict - KYC is already approved
 *       500:
 *         description: Internal server error
 */
router.post('/kyc/approve', verifyAdminToken, approveKYC);

/**
 * @swagger
 * /web/admin/kyc/reject:
 *   post:
 *     tags:
 *       - Web Admin
 *     summary: Reject KYC
 *     description: Reject a user's KYC submission with a reason. Sends a rejection notification to the user via SMS and email.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - kycId
 *               - rejectionReason
 *             properties:
 *               kycId:
 *                 type: string
 *                 format: uuid
 *                 description: The KYC record ID to reject
 *                 example: '550e8400-e29b-41d4-a716-446655440000'
 *               rejectionReason:
 *                 type: string
 *                 description: The reason for rejecting the KYC
 *                 example: 'The uploaded selfie does not match the ID document photo'
 *     responses:
 *       200:
 *         description: KYC rejected successfully
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
 *                   example: 'KYC rejected successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     kycId:
 *                       type: string
 *                       format: uuid
 *                     status:
 *                       type: string
 *                       example: 'rejected'
 *                     rejectionReason:
 *                       type: string
 *                     verifiedAt:
 *                       type: string
 *                       format: date-time
 *                     verifiedBy:
 *                       type: string
 *                       format: uuid
 *       400:
 *         description: Bad request - KYC ID and rejection reason are required
 *       401:
 *         description: Unauthorized - Token required or invalid
 *       403:
 *         description: Forbidden - Admin authentication required
 *       404:
 *         description: KYC record not found
 *       409:
 *         description: Conflict - KYC is already rejected
 *       500:
 *         description: Internal server error
 */
router.post('/kyc/reject', verifyAdminToken, rejectKYC);

module.exports = router;
