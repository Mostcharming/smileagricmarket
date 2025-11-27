const express = require('express');
const router = express.Router();
const {
    signupSendOtp,
    signupVerifyOtp,
    signupCompleteProfile,
    loginSendOtp,
    loginVerifyOtp,
} = require('./controller');

/**
 * @swagger
 * /v1/mobile/auth/signup/send-otp:
 *   post:
 *     tags:
 *       - Mobile Auth - Signup
 *     summary: Send OTP for signup
 *     description: Send a 6-digit OTP to the provided phone number for signup verification
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
router.post('/signup/send-otp', signupSendOtp);

/**
 * @swagger
 * /v1/mobile/auth/signup/verify-otp:
 *   post:
 *     tags:
 *       - Mobile Auth - Signup
 *     summary: Verify OTP for signup
 *     description: Verify the OTP sent to the phone number. Dev users can use '777666' as override
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
 *       400:
 *         description: Invalid OTP or expired OTP
 *       404:
 *         description: User not found
 */
router.post('/signup/verify-otp', signupVerifyOtp);

/**
 * @swagger
 * /v1/mobile/auth/signup/complete-profile:
 *   post:
 *     tags:
 *       - Mobile Auth - Signup
 *     summary: Complete user profile after OTP verification
 *     description: Complete the user profile with full name, gender, and email. Phone number must be verified first.
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
 *                       $ref: '#/components/schemas/User'
 *       400:
 *         description: Phone not verified or invalid request
 *       404:
 *         description: User not found
 */
router.post('/signup/complete-profile', signupCompleteProfile);

/**
 * @swagger
 * /v1/mobile/auth/login/send-otp:
 *   post:
 *     tags:
 *       - Mobile Auth - Login
 *     summary: Send OTP for login
 *     description: Send a 6-digit OTP to the registered phone number for login
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
 *                 description: Registered phone number
 *                 example: '08012345678'
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       400:
 *         description: Phone number not verified
 *       404:
 *         description: User not registered
 *       500:
 *         description: Internal server error
 */
router.post('/login/send-otp', loginSendOtp);

/**
 * @swagger
 * /v1/mobile/auth/login/verify-otp:
 *   post:
 *     tags:
 *       - Mobile Auth - Login
 *     summary: Verify OTP and login
 *     description: Verify the OTP to complete login. Dev users can use '777666' as override
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
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid OTP or expired OTP
 *       404:
 *         description: User not found
 */
router.post('/login/verify-otp', loginVerifyOtp);

module.exports = router;
