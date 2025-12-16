const express = require('express');
const router = express.Router();
const uploadKYC = require('../../../utils/uploadKYC');
const {
    submitKYC,
    getKYCStatus,
    updateKYC,
    getKYCList,
    approveKYC,
    rejectKYC
} = require('./controller');

/**
 * @swagger
 * /mobile/kyc/submit:
 *   post:
 *     tags:
 *       - Mobile KYC
 *     summary: Submit KYC documents
 *     description: Submit identification information with a selfie image for KYC verification.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - identificationType
 *               - identificationNumber
 *               - selfie
 *             properties:
 *               identificationType:
 *                 type: string
 *                 enum: [national_id, passport, driver_license, tin, voter_card]
 *                 description: Type of identification
 *                 example: 'national_id'
 *               identificationNumber:
 *                 type: string
 *                 description: The identification number
 *                 example: '12345678901234'
 *               selfie:
 *                 type: string
 *                 format: binary
 *                 description: Selfie image (JPEG, PNG, GIF, WebP, max 10MB)
 *     responses:
 *       200:
 *         description: KYC submitted successfully
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
 *                   example: 'KYC submitted successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     kycId:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [pending, approved, rejected]
 *                     submittedAt:
 *                       type: string
 *                       format: date-time
 *                     selfie:
 *                       type: string
 *       400:
 *         description: Invalid input or file missing
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: KYC already submitted or approved
 */
router.post('/submit', uploadKYC, submitKYC);

/**
 * @swagger
 * /mobile/kyc/status:
 *   get:
 *     tags:
 *       - Mobile KYC
 *     summary: Get KYC status
 *     description: Get the current KYC verification status for the logged-in user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: KYC status retrieved successfully
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [not_submitted, pending, approved, rejected]
 *                     identificationType:
 *                       type: string
 *                     submittedAt:
 *                       type: string
 *                       format: date-time
 *                     verifiedAt:
 *                       type: string
 *                       format: date-time
 *                     rejectionReason:
 *                       type: string
 *                     selfie:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get('/status', getKYCStatus);

/**
 * @swagger
 * /mobile/kyc/update:
 *   put:
 *     tags:
 *       - Mobile KYC
 *     summary: Update KYC submission
 *     description: Resubmit KYC with corrected information if previously rejected. Cannot update approved KYC.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - identificationType
 *               - identificationNumber
 *               - selfie
 *             properties:
 *               identificationType:
 *                 type: string
 *                 enum: [national_id, passport, driver_license, tin, voter_card]
 *                 example: 'national_id'
 *               identificationNumber:
 *                 type: string
 *                 example: '12345678901234'
 *               selfie:
 *                 type: string
 *                 format: binary
 *                 description: Selfie image (required)
 *     responses:
 *       200:
 *         description: KYC updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: KYC record not found
 *       409:
 *         description: Cannot update approved KYC
 */
router.put('/update', uploadKYC, updateKYC);

/**
 * @swagger
 * /mobile/kyc/list:
 *   get:
 *     tags:
 *       - Mobile KYC
 *     summary: Get all KYC records
 *     description: Get paginated list of all KYC submissions (Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         description: Filter by KYC status
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: KYC list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     data:
 *                       type: array
 *       401:
 *         description: Unauthorized
 */
router.get('/list', getKYCList);

// /**
//  * @swagger
//  * /mobile/kyc/approve:
//  *   post:
//  *     tags:
//  *       - Mobile KYC
//  *     summary: Approve KYC
//  *     description: Approve a KYC submission (Admin only)
//  *     security:
//  *       - bearerAuth: []
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - kycId
//  *             properties:
//  *               kycId:
//  *                 type: string
//  *                 description: UUID of the KYC record
//  *     responses:
//  *       200:
//  *         description: KYC approved successfully
//  *       400:
//  *         description: Invalid input
//  *       401:
//  *         description: Unauthorized
//  *       404:
//  *         description: KYC record not found
//  *       409:
//  *         description: KYC already approved
//  */
// router.post('/approve', approveKYC);

// /**
//  * @swagger
//  * /mobile/kyc/reject:
//  *   post:
//  *     tags:
//  *       - Mobile KYC
//  *     summary: Reject KYC
//  *     description: Reject a KYC submission with a reason (Admin only)
//  *     security:
//  *       - bearerAuth: []
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - kycId
//  *               - rejectionReason
//  *             properties:
//  *               kycId:
//  *                 type: string
//  *                 description: UUID of the KYC record
//  *               rejectionReason:
//  *                 type: string
//  *                 description: Reason for rejection
//  *                 example: 'ID document is not clear. Please resubmit with better quality image.'
//  *     responses:
//  *       200:
//  *         description: KYC rejected successfully
//  *       400:
//  *         description: Invalid input or missing reason
//  *       401:
//  *         description: Unauthorized
//  *       404:
//  *         description: KYC record not found
//  */
// router.post('/reject', rejectKYC);

module.exports = router;
