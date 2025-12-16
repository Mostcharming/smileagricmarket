const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../../middlewares/common/security');
const {
    requestOtp,
    verifyOtp,
    completeProfile,
    setPassword,
    signupWithPassword,
    loginWithPassword,
    forgot,
    verifyResetToken,
    reset,
} = require('./controller');

// Middleware to verify signup token
const verifySignupToken = (req, res, next) => {
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

        // Check if it's a signup token
        if (!payload.user || !payload.user.isSignupInProgress) {
            return res.fail('This token is not valid for signup. Please verify OTP first.', 401);
        }

        req.user = payload.user;
        next();
    } catch (err) {
        return res.fail(err.message, 500);
    }
};

/**
 * @swagger
 * /web/auth/request-otp:
 *   post:
 *     tags:
 *       - Web Auth
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
 * /web/auth/verify-otp:
 *   post:
 *     tags:
 *       - Web Auth
 *     summary: Verify OTP
 *     description: Verify the OTP sent to the phone number. Returns a signup token for new users that should be used for the next signup form endpoints. Returns login token for existing users.
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
 *                     token:
 *                       type: string
 *                       description: Token for new users to use in profile forms, or auth token for existing users
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
 * /web/auth/complete-profile:
 *   post:
 *     tags:
 *       - Web Auth
 *     summary: Complete user profile - Form 1
 *     description: Submit profile information (fullName, gender, email) after OTP verification. Use the signup token received from verify-otp endpoint.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
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
 *         description: Profile information saved
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
 *                   example: 'Profile information saved'
 *                 data:
 *                   type: object
 *       401:
 *         description: Invalid or missing signup token
 *       409:
 *         description: Email already exists
 */
router.post('/complete-profile', verifySignupToken, completeProfile);

/**
 * @swagger
 * /web/auth/set-password:
 *   post:
 *     tags:
 *       - Web Auth
 *     summary: Set password - Form 2
 *     description: Submit password and complete user registration. Use the signup token received from verify-otp endpoint.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *               - passwordConfirmation
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 example: 'SecurePassword123!'
 *               passwordConfirmation:
 *                 type: string
 *                 format: password
 *                 example: 'SecurePassword123!'
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
 *         description: User registered successfully
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
 *                   example: 'User registered successfully'
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
 *                         kycVerified:
 *                           type: boolean
 *                           description: Whether user has approved KYC
 *       400:
 *         description: Invalid password or passwords do not match
 *       401:
 *         description: Invalid or missing signup token
 *       409:
 *         description: User already exists or email already exists
 */
router.post('/set-password', verifySignupToken, setPassword);

/**
 * @swagger
 * /web/auth/signup:
 *   post:
 *     tags:
 *       - Web Auth
 *     summary: Signup with password
 *     description: Register a new user with phone number, password, and optional profile information
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - password
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: '08012345678'
 *               password:
 *                 type: string
 *                 format: password
 *                 example: 'SecurePassword123!'
 *               fullName:
 *                 type: string
 *                 example: 'John Doe'
 *               email:
 *                 type: string
 *                 format: email
 *                 example: 'john@example.com'
 *               gender:
 *                 type: string
 *                 enum: [male, female, other]
 *                 example: 'male'
 *     responses:
 *       200:
 *         description: User registered successfully
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
 *                   example: 'User registered successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
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
 *                         kycVerified:
 *                           type: boolean
 *                           description: Whether user has approved KYC
 *       400:
 *         description: Phone number and password are required
 *       409:
 *         description: User already exists
 *       500:
 *         description: Internal server error
 */
router.post('/signup', signupWithPassword);

/**
 * @swagger
 * /web/auth/login:
 *   post:
 *     tags:
 *       - Web Auth
 *     summary: Login with password
 *     description: Login with phone number or email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 description: User phone number (required if email not provided)
 *                 example: '08012345678'
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User email (required if phoneNumber not provided)
 *                 example: 'john@example.com'
 *               password:
 *                 type: string
 *                 format: password
 *                 example: 'SecurePassword123!'
 *             required:
 *               - password
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
 *                         kycVerified:
 *                           type: boolean
 *                           description: Whether user has approved KYC
 *       400:
 *         description: Phone number or email and password are required
 *       401:
 *         description: Invalid credentials
 *       500:
 *         description: Internal server error
 */
router.post('/login', loginWithPassword);

/**
 * @swagger
 * /web/auth/forgot-password:
 *   post:
 *     tags:
 *       - Web Auth
 *     summary: Request password reset
 *     description: Send a password reset link to the user's phone number or email. Returns a generic message for security reasons (doesn't reveal if user exists).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 description: User phone number (required if email not provided)
 *                 example: '08012345678'
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User email (required if phoneNumber not provided)
 *                 example: 'john@example.com'
 *     responses:
 *       200:
 *         description: Password reset request processed
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
 *                   example: 'If an account exists, a reset link will be sent'
 *                 data:
 *                   type: object
 *       400:
 *         description: Phone number or email is required
 *       500:
 *         description: Internal server error
 */
router.post('/forgot-password', forgot);

/**
 * @swagger
 * /web/auth/verify-reset-token:
 *   post:
 *     tags:
 *       - Web Auth
 *     summary: Verify password reset token
 *     description: Verify that a reset token is valid and not expired. Returns masked user information.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - resetToken
 *             properties:
 *               resetToken:
 *                 type: string
 *                 description: The reset token from the reset link
 *                 example: 'abc123def456...'
 *     responses:
 *       200:
 *         description: Reset token is valid
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
 *                   example: 'Reset token is valid'
 *                 data:
 *                   type: object
 *                   properties:
 *                     phoneNumber:
 *                       type: string
 *                     email:
 *                       type: string
 *                     fullName:
 *                       type: string
 *       400:
 *         description: Reset token has expired
 *       404:
 *         description: Invalid reset token
 *       500:
 *         description: Internal server error
 */
router.post('/verify-reset-token', verifyResetToken);

/**
 * @swagger
 * /web/auth/reset-password:
 *   post:
 *     tags:
 *       - Web Auth
 *     summary: Reset password with valid token
 *     description: Complete the password reset process. Requires a valid, non-expired reset token.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - resetToken
 *               - password
 *               - passwordConfirmation
 *             properties:
 *               resetToken:
 *                 type: string
 *                 description: The reset token from the reset link
 *                 example: 'abc123def456...'
 *               password:
 *                 type: string
 *                 format: password
 *                 description: New password (minimum 6 characters)
 *                 example: 'NewPassword123!'
 *               passwordConfirmation:
 *                 type: string
 *                 format: password
 *                 description: Confirm the new password
 *                 example: 'NewPassword123!'
 *     responses:
 *       200:
 *         description: Password reset successfully
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
 *                   example: 'Password reset successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       description: JWT authentication token for automatic login
 *                     user:
 *                       type: object
 *                       description: User details
 *       400:
 *         description: Invalid input or token has expired
 *       404:
 *         description: Invalid reset token
 *       500:
 *         description: Internal server error
 */
router.post('/reset-password', reset);


module.exports = router;