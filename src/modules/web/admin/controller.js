'use strict';

const bcrypt = require('bcrypt');
const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const { signToken } = require('../../../middlewares/common/security');
const { Op } = require('sequelize');
const notify = require('../../../utils/notify');

const models = defineModels(sequelize);
const { Admin, User, KYC } = models;

/**
 * Admin Login
 */
async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.fail('Email and password are required', 400);
        }

        // Find admin by email
        const admin = await Admin.findOne({
            where: { email }
        });

        if (!admin) {
            return res.fail('Invalid email or password', 401);
        }

        // Check if admin is active
        if (!admin.isActive) {
            return res.fail('Your account has been deactivated. Please contact support.', 403);
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, admin.password);
        if (!isPasswordValid) {
            return res.fail('Invalid email or password', 401);
        }

        // Update last login
        await admin.update({ lastLoginAt: new Date() });

        // Generate JWT token
        const token = signToken({
            admin: {
                id: admin.id,
                email: admin.email,
                role: admin.role,
                fullName: admin.fullName
            }
        });

        return res.success(
            {
                token,
                admin: {
                    id: admin.id,
                    fullName: admin.fullName,
                    email: admin.email,
                    role: admin.role,
                    lastLoginAt: admin.lastLoginAt
                }
            },
            'Login successful'
        );
    } catch (error) {
        console.error('Admin login error:', error);
        return res.fail(error.message, 500);
    }
}

/**
 * Get User Directory (Paginated with search)
 */
async function getUserDirectory(req, res) {
    try {
        const {
            page = 1,
            limit = 20,
            search = ''
        } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        // Build search condition
        const whereClause = search ? {
            [Op.or]: [
                { fullName: { [Op.iLike]: `%${search}%` } },
                { email: { [Op.iLike]: `%${search}%` } },
                { phoneNumber: { [Op.iLike]: `%${search}%` } }
            ]
        } : {};

        // Get users
        const { count, rows: users } = await User.findAndCountAll({
            where: whereClause,
            attributes: ['id', 'fullName', 'email', 'phoneNumber', 'createdAt'],
            limit: limitNum,
            offset: offset,
            order: [['createdAt', 'DESC']]
        });

        // Get KYC data for all users
        const userIds = users.map(user => user.id);
        const kycRecords = await KYC.findAll({
            where: { userId: userIds },
            attributes: ['userId', 'status', 'submittedAt', 'verifiedAt']
        });

        // Create a map of userId to KYC record
        const kycMap = {};
        kycRecords.forEach(kyc => {
            kycMap[kyc.userId] = kyc;
        });

        // Format the response
        const formattedUsers = users.map(user => {
            const kyc = kycMap[user.id];
            const kycStatus = kyc ? kyc.status : 'not_submitted';

            return {
                id: user.id,
                fullName: user.fullName || 'N/A',
                email: user.email || 'N/A',
                phoneNumber: user.phoneNumber || 'N/A',
                kycStatus: kycStatus,
                kycSubmittedAt: kyc ? kyc.submittedAt : null,
                kycVerifiedAt: kyc ? kyc.verifiedAt : null,
                createdAt: user.createdAt
            };
        });

        const totalPages = Math.ceil(count / limitNum);

        return res.success(
            {
                users: formattedUsers,
                pagination: {
                    currentPage: pageNum,
                    totalPages: totalPages,
                    totalUsers: count,
                    limit: limitNum,
                    hasNextPage: pageNum < totalPages,
                    hasPreviousPage: pageNum > 1
                }
            },
            'User directory retrieved successfully'
        );
    } catch (error) {
        console.error('Get user directory error:', error);
        return res.fail(error.message, 500);
    }
}

/**
 * Get KYC details by User ID
 */
async function getKYCByUserId(req, res) {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.fail('User ID is required', 400);
        }

        // Find the user
        const user = await User.findByPk(userId, {
            attributes: ['id', 'fullName', 'email', 'phoneNumber', 'createdAt']
        });

        if (!user) {
            return res.fail('User not found', 404);
        }

        // Find the latest KYC record for this user
        const kyc = await KYC.findOne({
            where: { userId },
            order: [['createdAt', 'DESC']]
        });

        if (!kyc) {
            return res.success(
                {
                    user: {
                        id: user.id,
                        fullName: user.fullName || 'N/A',
                        email: user.email || 'N/A',
                        phoneNumber: user.phoneNumber || 'N/A',
                        createdAt: user.createdAt
                    },
                    kyc: null,
                    kycStatus: 'not_submitted'
                },
                'User has not submitted KYC'
            );
        }

        return res.success(
            {
                user: {
                    id: user.id,
                    fullName: user.fullName || 'N/A',
                    email: user.email || 'N/A',
                    phoneNumber: user.phoneNumber || 'N/A',
                    createdAt: user.createdAt
                },
                kyc: {
                    id: kyc.id,
                    identificationType: kyc.identificationType,
                    identificationNumber: kyc.identificationNumber,
                    idDocumentUrl: kyc.idDocumentUrl,
                    selfieImageUrl: kyc.selfieImageUrl,
                    status: kyc.status,
                    rejectionReason: kyc.rejectionReason,
                    submittedAt: kyc.submittedAt,
                    verifiedAt: kyc.verifiedAt,
                    verifiedBy: kyc.verifiedBy,
                    createdAt: kyc.createdAt,
                    updatedAt: kyc.updatedAt
                },
                kycStatus: kyc.status
            },
            `KYC details retrieved successfully`
        );
    } catch (error) {
        console.error('Get KYC by user ID error:', error);
        return res.fail(error.message, 500);
    }
}

/**
 * Approve KYC
 */
async function approveKYC(req, res) {
    try {
        const { kycId } = req.body;
        const adminId = req.admin?.id;

        if (!kycId) {
            return res.fail('KYC ID is required', 400);
        }

        if (!adminId) {
            return res.fail('Admin authentication required', 401);
        }

        // Find the KYC record
        const kyc = await KYC.findByPk(kycId);

        if (!kyc) {
            return res.fail('KYC record not found', 404);
        }

        if (kyc.status === 'approved') {
            return res.fail('KYC is already approved', 409);
        }

        // Update KYC status
        await kyc.update({
            status: 'approved',
            verifiedBy: adminId,
            verifiedAt: new Date(),
            rejectionReason: null
        });

        // Get user for notification
        const user = await User.findByPk(kyc.userId);

        if (user) {
            // Send approval notification
            try {
                await notify(
                    user,
                    'user',
                    'KYC_APPROVED_TEMPLATE',
                    {},
                    ['sms', 'email'],
                    true,
                    models
                );
            } catch (notifyError) {
                console.error('Failed to send KYC approval notification:', notifyError);
                // Continue even if notification fails
            }
        }

        return res.success(
            {
                kycId: kyc.id,
                status: kyc.status,
                verifiedAt: kyc.verifiedAt,
                verifiedBy: adminId
            },
            'KYC approved successfully'
        );
    } catch (error) {
        console.error('Approve KYC error:', error);
        return res.fail(error.message, 500);
    }
}

/**
 * Reject KYC
 */
async function rejectKYC(req, res) {
    try {
        const { kycId, rejectionReason } = req.body;
        const adminId = req.admin?.id;

        if (!kycId) {
            return res.fail('KYC ID is required', 400);
        }

        if (!rejectionReason || rejectionReason.trim() === '') {
            return res.fail('Rejection reason is required', 400);
        }

        if (!adminId) {
            return res.fail('Admin authentication required', 401);
        }

        // Find the KYC record
        const kyc = await KYC.findByPk(kycId);

        if (!kyc) {
            return res.fail('KYC record not found', 404);
        }

        if (kyc.status === 'rejected') {
            return res.fail('KYC is already rejected', 409);
        }

        // Update KYC status
        await kyc.update({
            status: 'rejected',
            verifiedBy: adminId,
            verifiedAt: new Date(),
            rejectionReason: rejectionReason.trim()
        });

        // Get user for notification
        const user = await User.findByPk(kyc.userId);

        if (user) {
            // Send rejection notification with reason
            try {
                await notify(
                    user,
                    'user',
                    'KYC_REJECTED_TEMPLATE',
                    { reason: rejectionReason.trim() },
                    ['sms', 'email'],
                    true,
                    models
                );
            } catch (notifyError) {
                console.error('Failed to send KYC rejection notification:', notifyError);
                // Continue even if notification fails
            }
        }

        return res.success(
            {
                kycId: kyc.id,
                status: kyc.status,
                rejectionReason: kyc.rejectionReason,
                verifiedAt: kyc.verifiedAt,
                verifiedBy: adminId
            },
            'KYC rejected successfully'
        );
    } catch (error) {
        console.error('Reject KYC error:', error);
        return res.fail(error.message, 500);
    }
}

module.exports = {
    login,
    getUserDirectory,
    getKYCByUserId,
    approveKYC,
    rejectKYC
};
