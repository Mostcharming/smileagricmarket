'use strict';

const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const { toBackendApiUrl } = require('../../../utils/url');

const models = defineModels(sequelize);
const { User, KYC, Wallet } = models;

/**
 * Upload or update user profile picture
 */
async function uploadProfilePicture(req, res) {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        if (!req.profileImage) {
            return res.fail('Profile picture is required', 400);
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.fail('User not found', 404);
        }

        await user.update({
            profileImagePath: req.profileImage.path,
            profileImageUrl: req.profileImage.url
        });

        return res.success(
            {
                id: user.id,
                profileImageUrl: toBackendApiUrl(req, user.profileImageUrl),
                message: 'Profile picture uploaded successfully'
            },
            'Profile picture uploaded successfully'
        );
    } catch (error) {
        console.error('Upload profile picture error:', error);
        return res.fail(error.message, 500);
    }
}

/**
 * Update user profile information
 */
async function updateProfile(req, res) {
    try {
        const userId = req.user?.id;
        const { fullName, gender, email, phoneNumber, bio } = req.body;

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.fail('User not found', 404);
        }

        // Validation
        if (email && email !== user.email) {
            const existingUser = await User.findOne({ where: { email } });
            if (existingUser) {
                return res.fail('Email already in use', 409);
            }
        }

        if (phoneNumber && phoneNumber !== user.phoneNumber) {
            const existingUser = await User.findOne({ where: { phoneNumber } });
            if (existingUser) {
                return res.fail('Phone number already in use', 409);
            }
        }

        // Update only provided fields
        const updateData = {};
        if (fullName) updateData.fullName = fullName;
        if (gender) updateData.gender = gender;
        if (email) updateData.email = email;
        if (phoneNumber) updateData.phoneNumber = phoneNumber;
        if (bio !== undefined) updateData.bio = bio;

        await user.update(updateData);

        return res.success(
            {
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                phoneNumber: user.phoneNumber,
                gender: user.gender,
                bio: user.bio,
                isPhoneVerified: user.isPhoneVerified
            },
            'Profile updated successfully'
        );
    } catch (error) {
        console.error('Update profile error:', error);
        return res.fail(error.message, 500);
    }
}

/**
 * Get user profile information
 */
async function getProfile(req, res) {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        const user = await User.findByPk(userId, {
            include: [
                {
                    model: KYC,
                    as: 'KYCs',
                    attributes: ['id', 'status', 'identificationType', 'submittedAt', 'verifiedAt', 'rejectionReason']
                },
                {
                    model: Wallet,
                    as: 'Wallet',
                    attributes: ['id', 'bankName', 'accountNumber', 'accountName', 'isVerified']
                }
            ]
        });

        if (!user) {
            return res.fail('User not found', 404);
        }

        // Get latest KYC
        const latestKYC = user.KYCs && user.KYCs.length > 0
            ? user.KYCs[user.KYCs.length - 1]
            : null;

        return res.success(
            {
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                phoneNumber: user.phoneNumber,
                gender: user.gender,
                bio: user.bio,
                profileImageUrl: user.profileImageUrl ? toBackendApiUrl(req, user.profileImageUrl) : null,
                isPhoneVerified: user.isPhoneVerified,
                kycStatus: latestKYC ? latestKYC.status : null,
                kycInfo: latestKYC ? {
                    id: latestKYC.id,
                    identificationType: latestKYC.identificationType,
                    status: latestKYC.status,
                    submittedAt: latestKYC.submittedAt,
                    verifiedAt: latestKYC.verifiedAt,
                    rejectionReason: latestKYC.rejectionReason
                } : null,
                wallet: user.Wallet ? {
                    id: user.Wallet.id,
                    bankName: user.Wallet.bankName,
                    accountNumber: user.Wallet.accountNumber,
                    accountName: user.Wallet.accountName,
                    isVerified: user.Wallet.isVerified
                } : null,
                createdAt: user.createdAt
            },
            'Profile retrieved successfully'
        );
    } catch (error) {
        console.error('Get profile error:', error);
        return res.fail(error.message, 500);
    }
}

/**
 * Setup wallet account
 */
async function setupWallet(req, res) {
    try {
        const userId = req.user?.id;
        const { bankName, accountNumber, accountName } = req.body;

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        if (!bankName || !accountNumber || !accountName) {
            return res.fail('Bank name, account number, and account name are required', 400);
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.fail('User not found', 404);
        }

        let wallet = await Wallet.findOne({ where: { userId } });

        if (!wallet) {
            wallet = await Wallet.create({
                userId,
                bankName,
                accountNumber,
                accountName,
                isVerified: false
            });
        } else {
            await wallet.update({
                bankName,
                accountNumber,
                accountName
            });
        }

        return res.success(
            {
                id: wallet.id,
                userId: wallet.userId,
                bankName: wallet.bankName,
                accountNumber: wallet.accountNumber,
                accountName: wallet.accountName,
                isVerified: wallet.isVerified
            },
            'Wallet setup successfully'
        );
    } catch (error) {
        console.error('Setup wallet error:', error);
        return res.fail(error.message, 500);
    }
}

/**
 * Get profile completion status
 * Returns completion percentage (0-100) and missing fields
 */
async function getProfileCompletionStatus(req, res) {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        const user = await User.findByPk(userId, {
            include: [
                {
                    model: KYC,
                    as: 'KYCs',
                    attributes: ['id', 'status']
                },
                {
                    model: Wallet,
                    as: 'Wallet',
                    attributes: ['id', 'isVerified']
                }
            ]
        });

        if (!user) {
            return res.fail('User not found', 404);
        }

        // Calculate completion
        let completionScore = 0;
        let totalFields = 8; // 8 required items for 100%
        const missingFields = [];

        // 1. Full Name
        if (user.fullName) completionScore++;
        else missingFields.push('fullName');

        // 2. Gender
        if (user.gender) completionScore++;
        else missingFields.push('gender');

        // 3. Email
        if (user.email) completionScore++;
        else missingFields.push('email');

        // 4. Phone Number
        if (user.phoneNumber && user.isPhoneVerified) completionScore++;
        else missingFields.push('phoneNumber');

        // 5. Bio
        if (user.bio) completionScore++;
        else missingFields.push('bio');

        // 6. Profile Picture
        if (user.profileImageUrl) completionScore++;
        else missingFields.push('profilePicture');

        // 7. KYC Verification (approved status)
        const approvedKYC = user.KYCs && user.KYCs.some(kyc => kyc.status === 'approved');
        if (approvedKYC) completionScore++;
        else missingFields.push('kycVerification');

        // 8. Wallet Setup
        if (user.Wallet && user.Wallet.isVerified) completionScore++;
        else missingFields.push('walletSetup');

        const completionPercentage = Math.round((completionScore / totalFields) * 100);

        return res.success(
            {
                completionPercentage,
                completionScore: `${completionScore}/${totalFields}`,
                missingFields,
                profileStatus: {
                    fullName: !!user.fullName,
                    gender: !!user.gender,
                    email: !!user.email,
                    phoneNumber: user.phoneNumber && user.isPhoneVerified ? true : false,
                    bio: !!user.bio,
                    profilePicture: !!user.profileImageUrl,
                    kycVerification: approvedKYC ? true : false,
                    walletSetup: user.Wallet ? user.Wallet.isVerified : false
                }
            },
            'Profile completion status retrieved'
        );
    } catch (error) {
        console.error('Get profile completion status error:', error);
        return res.fail(error.message, 500);
    }
}

/**
 * Get wallet information
 */
async function getWallet(req, res) {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        const wallet = await Wallet.findOne({ where: { userId } });

        if (!wallet) {
            return res.fail('Wallet not found', 404);
        }

        return res.success(
            {
                id: wallet.id,
                userId: wallet.userId,
                bankName: wallet.bankName,
                accountNumber: wallet.accountNumber,
                accountName: wallet.accountName,
                isVerified: wallet.isVerified,
                createdAt: wallet.createdAt,
                updatedAt: wallet.updatedAt
            },
            'Wallet retrieved successfully'
        );
    } catch (error) {
        console.error('Get wallet error:', error);
        return res.fail(error.message, 500);
    }
}

module.exports = {
    uploadProfilePicture,
    updateProfile,
    getProfile,
    setupWallet,
    getWallet,
    getProfileCompletionStatus
};
