const express = require('express');
const router = express.Router();
const uploadProfileImage = require('../../../utils/uploadProfileImage');
const {
    uploadProfilePicture,
    updateProfile,
    getProfile,
    getProfileCompletionStatus
} = require('./controller');

/**
 * @swagger
 * /web/profile/update:
 *   put:
 *     tags:
 *       - Web Profile
 *     summary: Update user profile
 *     description: Update user profile information including full name, gender, email, phone number, and bio
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
 *                 description: User's full name
 *                 example: 'John Doe'
 *               gender:
 *                 type: string
 *                 enum: [male, female, other]
 *                 description: User's gender
 *                 example: 'male'
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *                 example: 'john@example.com'
 *               phoneNumber:
 *                 type: string
 *                 description: User's phone number
 *                 example: '+2348123456789'
 *               bio:
 *                 type: string
 *                 description: User's biography or profile description
 *                 example: 'I am a farmer from Lagos'
 *     responses:
 *       200:
 *         description: Profile updated successfully
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
 *                   example: 'Profile updated successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     fullName:
 *                       type: string
 *                     email:
 *                       type: string
 *                     phoneNumber:
 *                       type: string
 *                     gender:
 *                       type: string
 *                     bio:
 *                       type: string
 *       401:
 *         description: User not authenticated
 *       404:
 *         description: User not found
 *       409:
 *         description: Email or phone number already in use
 */
router.put('/update', updateProfile);

/**
 * @swagger
 * /web/profile/upload-picture:
 *   post:
 *     tags:
 *       - Web Profile
 *     summary: Upload profile picture
 *     description: Upload or update user's profile picture
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - picture
 *             properties:
 *               picture:
 *                 type: string
 *                 format: binary
 *                 description: Profile picture image file (JPEG, PNG, GIF, or WEBP). Max 5MB
 *     responses:
 *       200:
 *         description: Profile picture uploaded successfully
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
 *                   example: 'Profile picture uploaded successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     profileImageUrl:
 *                       type: string
 *       400:
 *         description: Profile picture is required or invalid file
 *       401:
 *         description: User not authenticated
 *       404:
 *         description: User not found
 */
router.post('/upload-picture', uploadProfileImage(), uploadProfilePicture);

/**
 * @swagger
 * /web/profile/get:
 *   get:
 *     tags:
 *       - Web Profile
 *     summary: Get user profile
 *     description: Retrieve complete user profile information including KYC status and wallet details
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
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
 *                   example: 'Profile retrieved successfully'
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     fullName:
 *                       type: string
 *                     email:
 *                       type: string
 *                     phoneNumber:
 *                       type: string
 *                     gender:
 *                       type: string
 *                     bio:
 *                       type: string
 *                     profileImageUrl:
 *                       type: string
 *                       description: URL to the user's profile picture
 *                     isPhoneVerified:
 *                       type: boolean
 *                     kycStatus:
 *                       type: string
 *                       enum: [pending, approved, rejected]
 *                     kycInfo:
 *                       type: object
 *                     wallet:
 *                       type: object
 *       401:
 *         description: User not authenticated
 *       404:
 *         description: User not found
 */
router.get('/get', getProfile);

/**
 * @swagger
 * /web/profile/completion-status:
 *   get:
 *     tags:
 *       - Web Profile
 *     summary: Get profile completion status
 *     description: Get the profile completion percentage (0-100%) and list of missing fields required to complete the profile setup
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile completion status retrieved successfully
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
 *                   example: 'Profile completion status retrieved'
 *                 data:
 *                   type: object
 *                   properties:
 *                     completionPercentage:
 *                       type: number
 *                       description: Profile completion percentage (0-100)
 *                       example: 87
 *                     completionScore:
 *                       type: string
 *                       description: Completed items out of total required items
 *                       example: '7/8'
 *                     missingFields:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: List of fields still required for 100% completion
 *                       example: ['walletSetup']
 *                     profileStatus:
 *                       type: object
 *                       properties:
 *                         fullName:
 *                           type: boolean
 *                         gender:
 *                           type: boolean
 *                         email:
 *                           type: boolean
 *                         phoneNumber:
 *                           type: boolean
 *                         bio:
 *                           type: boolean
 *                         profilePicture:
 *                           type: boolean
 *                         kycVerification:
 *                           type: boolean
 *                         walletSetup:
 *                           type: boolean
 *       401:
 *         description: User not authenticated
 *       404:
 *         description: User not found
 */
router.get('/completion-status', getProfileCompletionStatus);

router.use('/wallet', require('./walletRoute'));

module.exports = router;
