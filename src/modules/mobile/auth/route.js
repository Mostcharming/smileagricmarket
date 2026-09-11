const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../../middlewares/common/security');
const {
    requestOtp,
    resendOtp,
    verifyOtp,
    completeProfile,
    setPassword,
    signupWithPassword,
    loginWithPassword,
    forgot,
    resendResetToken,
    verifyResetToken,
    reset,
} = require('./controller');

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
 * /mobile/auth/resend-otp:
 *   post:
 *     tags:
 *       - Mobile Auth
 *     summary: Resend OTP
 *     description: Resend OTP to the provided phone number for both signup and login
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
router.post('/resend-otp', resendOtp);

/**
 * @swagger
 * /mobile/auth/complete-profile:
 *   post:
 *     tags:
 *       - Mobile Auth
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
 * /mobile/auth/set-password:
 *   post:
 *     tags:
 *       - Mobile Auth
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
 * /mobile/auth/signup:
 *   post:
 *     tags:
 *       - Mobile Auth
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
 * /mobile/auth/login:
 *   post:
 *     tags:
 *       - Mobile Auth
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
 * /mobile/auth/forgot-password:
 *   post:
 *     tags: [Mobile Auth]
 *     summary: Request password reset OTP
 *     description: Send a six-digit password reset OTP to the registered email and phone number, when available. Supply phoneNumber or email; phoneNumber takes precedence when both are supplied. The OTP expires after 10 minutes and allows five verification attempts. Wait 60 seconds before requesting again; requests within the cooldown return success without sending a new code. A new code invalidates any previous mobile reset OTP and reset token. Next call /mobile/auth/verify-reset-otp, then /mobile/auth/reset-password. Signup and login OTPs cannot be used for password recovery.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           examples:
 *             phone:
 *               summary: Recover using phone number
 *               value:
 *                 phoneNumber: '08012345678'
 *             email:
 *               summary: Recover using email
 *               value:
 *                 email: 'john@example.com'
 *           schema:
 *             type: object
 *             anyOf:
 *               - required: [phoneNumber]
 *               - required: [email]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: '08012345678'
 *               email:
 *                 type: string
 *                 format: email
 *                 example: 'john@example.com'
 *     responses:
 *       200:
 *         description: Request accepted; identical response for unknown accounts and requests during cooldown
 *         content:
 *           application/json:
 *             example:
 *               error: false
 *               message: If an account exists, a password reset OTP will be sent
 *               data:
 *                 message: If an account exists, a password reset OTP will be sent
 *       400:
 *         description: A valid phone number or email is required
 *       500:
 *         description: Internal server error
 */
router.post('/forgot-password', forgot);

/**
 * @swagger
 * /mobile/auth/resend-reset-otp:
 *   post:
 *     tags: [Mobile Auth]
 *     summary: Resend password reset OTP
 *     description: Send a six-digit password reset OTP to the registered email and phone number, when available. Supply phoneNumber or email; phoneNumber takes precedence when both are supplied. The OTP expires after 10 minutes and allows five verification attempts. Wait 60 seconds before requesting again; requests within the cooldown return success without sending a new code. A new code invalidates any previous mobile reset OTP and reset token. Next call /mobile/auth/verify-reset-otp, then /mobile/auth/reset-password. Signup and login OTPs cannot be used for password recovery.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           examples:
 *             phone:
 *               summary: Recover using phone number
 *               value:
 *                 phoneNumber: '08012345678'
 *             email:
 *               summary: Recover using email
 *               value:
 *                 email: 'john@example.com'
 *           schema:
 *             type: object
 *             anyOf:
 *               - required: [phoneNumber]
 *               - required: [email]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: '08012345678'
 *               email:
 *                 type: string
 *                 format: email
 *                 example: 'john@example.com'
 *     responses:
 *       200:
 *         description: Request accepted; identical response for unknown accounts and requests during cooldown
 *         content:
 *           application/json:
 *             example:
 *               error: false
 *               message: If an account exists, a password reset OTP will be sent
 *               data:
 *                 message: If an account exists, a password reset OTP will be sent
 *       400:
 *         description: A valid phone number or email is required
 *       500:
 *         description: Internal server error
 */
router.post('/resend-reset-otp', resendResetToken);

/**
 * @swagger
 * /mobile/auth/resend-reset-token:
 *   post:
 *     tags: [Mobile Auth]
 *     summary: Resend password reset OTP (legacy route)
 *     description: Alias of /mobile/auth/resend-reset-otp. Sends an OTP with the same expiry, cooldown and invalidation rules. Use the OTP route for new integrations.
 *     security: []
 *     deprecated: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           examples:
 *             phone:
 *               summary: Recover using phone number
 *               value:
 *                 phoneNumber: '08012345678'
 *             email:
 *               summary: Recover using email
 *               value:
 *                 email: 'john@example.com'
 *           schema:
 *             type: object
 *             anyOf:
 *               - required: [phoneNumber]
 *               - required: [email]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: '08012345678'
 *               email:
 *                 type: string
 *                 format: email
 *                 example: 'john@example.com'
 *     responses:
 *       200:
 *         description: Request accepted; identical response for unknown accounts and requests during cooldown
 *         content:
 *           application/json:
 *             example:
 *               error: false
 *               message: If an account exists, a password reset OTP will be sent
 *               data:
 *                 message: If an account exists, a password reset OTP will be sent
 *       400:
 *         description: A valid phone number or email is required
 *       500:
 *         description: Internal server error
 */
router.post('/resend-reset-token', resendResetToken);

/**
 * @swagger
 * /mobile/auth/verify-reset-otp:
 *   post:
 *     tags: [Mobile Auth]
 *     summary: Verify password reset OTP
 *     description: Verify the six-digit password reset OTP together with phoneNumber or email. The code is consumed on success and returns a single-use resetToken valid for 10 minutes. Submit that token to /mobile/auth/reset-password. Five incorrect attempts block the code until a new OTP is requested. No development override code is accepted.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           examples:
 *             phone:
 *               summary: Recover using phone number
 *               value:
 *                 phoneNumber: '08012345678'
 *                 otp: '012345'
 *             email:
 *               summary: Recover using email
 *               value:
 *                 email: 'john@example.com'
 *                 otp: '012345'
 *           schema:
 *             type: object
 *             anyOf:
 *               - required: [phoneNumber]
 *               - required: [email]
 *             required: [otp]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: '08012345678'
 *               email:
 *                 type: string
 *                 format: email
 *                 example: 'john@example.com'
 *               otp:
 *                 type: string
 *                 pattern: '^\d{6}$'
 *                 minLength: 6
 *                 maxLength: 6
 *                 description: Six-digit code from the password reset notification, including any leading zeros
 *                 example: '012345'
 *     responses:
 *       200:
 *         description: OTP consumed; use data.resetToken to set the new password
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
 *                   example: Password reset OTP verified successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     resetToken:
 *                       type: string
 *                       description: Single-use credential for the mobile reset-password endpoint only; not an authentication JWT
 *                       example: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
 *                     expiresIn:
 *                       type: integer
 *                       description: Reset token lifetime in seconds
 *                       example: 600
 *       400:
 *         description: Missing or invalid account identifier or OTP, expired or already-used OTP, or five failed attempts reached
 *       500:
 *         description: Internal server error
 */
router.post('/verify-reset-otp', verifyResetToken);

/**
 * @swagger
 * /mobile/auth/verify-reset-token:
 *   post:
 *     tags: [Mobile Auth]
 *     summary: Verify password reset OTP (legacy route)
 *     description: Alias of /mobile/auth/verify-reset-otp. The request now requires phoneNumber or email plus otp; a link resetToken is no longer accepted. Returns a single-use resetToken for the password update.
 *     security: []
 *     deprecated: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           examples:
 *             phone:
 *               summary: Recover using phone number
 *               value:
 *                 phoneNumber: '08012345678'
 *                 otp: '012345'
 *             email:
 *               summary: Recover using email
 *               value:
 *                 email: 'john@example.com'
 *                 otp: '012345'
 *           schema:
 *             type: object
 *             anyOf:
 *               - required: [phoneNumber]
 *               - required: [email]
 *             required: [otp]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: '08012345678'
 *               email:
 *                 type: string
 *                 format: email
 *                 example: 'john@example.com'
 *               otp:
 *                 type: string
 *                 pattern: '^\d{6}$'
 *                 minLength: 6
 *                 maxLength: 6
 *                 description: Six-digit code from the password reset notification, including any leading zeros
 *                 example: '012345'
 *     responses:
 *       200:
 *         description: OTP consumed; use data.resetToken to set the new password
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
 *                   example: Password reset OTP verified successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     resetToken:
 *                       type: string
 *                       description: Single-use credential for the mobile reset-password endpoint only; not an authentication JWT
 *                       example: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
 *                     expiresIn:
 *                       type: integer
 *                       description: Reset token lifetime in seconds
 *                       example: 600
 *       400:
 *         description: Missing or invalid account identifier or OTP, expired or already-used OTP, or five failed attempts reached
 *       500:
 *         description: Internal server error
 */
router.post('/verify-reset-token', verifyResetToken);

/**
 * @swagger
 * /mobile/auth/reset-password:
 *   post:
 *     tags: [Mobile Auth]
 *     summary: Set password after OTP verification
 *     description: Complete mobile password recovery using the resetToken returned by /mobile/auth/verify-reset-otp and matching passwords of at least six characters. The OTP itself, signup/login tokens and web reset-link tokens are not accepted. Returns the existing login response including authentication token and KYC status.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resetToken, password, passwordConfirmation]
 *             properties:
 *               resetToken:
 *                 type: string
 *                 pattern: '^[a-f0-9]{64}$'
 *                 description: Token returned by successful password reset OTP verification
 *                 example: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: 'NewPassword123!'
 *               passwordConfirmation:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: 'NewPassword123!'
 *     responses:
 *       200:
 *         description: Password updated and reset token consumed
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
 *                   example: Password reset successfully
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
 *                           format: uuid
 *                         phoneNumber:
 *                           type: string
 *                           nullable: true
 *                         fullName:
 *                           type: string
 *                           nullable: true
 *                         email:
 *                           type: string
 *                           nullable: true
 *                         gender:
 *                           type: string
 *                           nullable: true
 *                         kycVerified:
 *                           type: boolean
 *       400:
 *         description: Missing or invalid fields, mismatched or short passwords, or invalid, expired or already-used reset token
 *       500:
 *         description: Internal server error
 */
router.post('/reset-password', reset);


module.exports = router;
