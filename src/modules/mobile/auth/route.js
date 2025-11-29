const express = require('express');
const router = express.Router();
const {
    requestOtp,
    verifyOtp,
    completeProfile,
} = require('./controller');

/**
 * @swagger
 * /mobile/auth/request-otp:
 *   post:
 *     tags:
 *       - Mobile Auth
 *     summary: Request OTP (for signup or login)
 *     description: Send a 6-digit OTP to the provided phone number. Works for both new and existing users.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 description: User phone number
 *                 example: '08012345678'
 *     responses:
 *       200:
 *         description: OTP sent successfully
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
 *                   example: 'OTP sent to your phone'
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request - Phone number is required
 *       500:
 *         description: Internal server error
 */
router.post('/request-otp', requestOtp);

/**
 * @swagger
 * /mobile/auth/verify-otp:
 *   post:
 *     tags:
 *       - Mobile Auth
 *     summary: Verify OTP
 *     description: Verify the OTP sent to the phone number. Returns isNewUser flag to indicate if it's a new or existing user. Dev users can use '777666' as override.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - otp
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: '08012345678'
 *               otp:
 *                 type: string
 *                 description: 6-digit OTP or '777666' in dev mode
 *                 example: '123456'
 *     responses:
 *       200:
 *         description: OTP verified successfully
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
 *                   example: 'OTP verified successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     phoneNumber:
 *                       type: string
 *                     userId:
 *                       type: string
 *                     isNewUser:
 *                       type: boolean
 *                       description: true if new user, false if existing user
 *       400:
 *         description: Invalid OTP or expired OTP
 *       404:
 *         description: OTP not found or expired
 */
router.post('/verify-otp', verifyOtp);

/**
 * @swagger
 * /mobile/auth/complete-profile:
 *   post:
 *     tags:
 *       - Mobile Auth
 *     summary: Complete user profile
 *     description: Complete the user profile with full name, gender, and email after OTP verification. Generates JWT token.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: '08012345678'
 *               fullName:
 *                 type: string
 *                 example: 'John Doe'
 *               gender:
 *                 type: string
 *                 enum: [male, female, other]
 *                 example: 'male'
 *               email:
 *                 type: string
 *                 format: email
 *                 example: 'john@example.com'
 *     responses:
 *       200:
 *         description: Profile completed successfully
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
 *                   example: 'Profile completed successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       description: JWT authentication token
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         phoneNumber:
 *                           type: string
 *                         fullName:
 *                           type: string
 *                         email:
 *                           type: string
 *                         gender:
 *                           type: string
 *       400:
 *         description: Phone not found or invalid request
 *       404:
 *         description: User not found
 */
router.post('/complete-profile', completeProfile);


module.exports = router;
