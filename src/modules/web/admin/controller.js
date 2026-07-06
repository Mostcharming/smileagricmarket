'use strict';

const bcrypt = require('bcrypt');
const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const { signToken } = require('../../../middlewares/common/security');
const { Op } = require('sequelize');
const notify = require('../../../utils/notify');
const { toBackendApiUrl } = require('../../../utils/url');

const models = defineModels(sequelize);
const { Admin, User, KYC } = models;

async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.fail('Email and password are required', 400);
        }

        const admin = await Admin.findOne({
            where: { email }
        });

        if (!admin) {
            return res.fail('Invalid email or password', 401);
        }

        if (!admin.isActive) {
            return res.fail('Your account has been deactivated. Please contact support.', 403);
        }

        const isPasswordValid = await bcrypt.compare(password, admin.password);
        if (!isPasswordValid) {
            return res.fail('Invalid email or password', 401);
        }

        await admin.update({ lastLoginAt: new Date() });

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

async function getUserDirectory(req, res) {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            kycStatus = ''
        } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        const whereClause = search ? {
            [Op.or]: [
                { fullName: { [Op.iLike]: `%${search}%` } },
                { email: { [Op.iLike]: `%${search}%` } },
                { phoneNumber: { [Op.iLike]: `%${search}%` } }
            ]
        } : {};

        const { count, rows: users } = await User.findAndCountAll({
            where: whereClause,
            attributes: ['id', 'fullName', 'email', 'phoneNumber', 'createdAt'],
            limit: limitNum,
            offset: offset,
            order: [['createdAt', 'DESC']]
        });

        const userIds = users.map(user => user.id);
        const kycRecords = await KYC.findAll({
            where: { userId: userIds },
            attributes: ['userId', 'status', 'submittedAt', 'verifiedAt']
        });

        const kycMap = {};
        kycRecords.forEach(kyc => {
            kycMap[kyc.userId] = kyc;
        });

        let formattedUsers = users.map(user => {
            const kyc = kycMap[user.id];
            const userKycStatus = kyc ? kyc.status : 'not_submitted';

            return {
                id: user.id,
                fullName: user.fullName || 'N/A',
                email: user.email || 'N/A',
                phoneNumber: user.phoneNumber || 'N/A',
                kycStatus: userKycStatus,
                kycSubmittedAt: kyc ? kyc.submittedAt : null,
                kycVerifiedAt: kyc ? kyc.verifiedAt : null,
                createdAt: user.createdAt
            };
        });

        if (kycStatus && ['not_submitted', 'pending', 'approved', 'rejected'].includes(kycStatus)) {
            formattedUsers = formattedUsers.filter(user => user.kycStatus === kycStatus);
        }

        const totalPages = Math.ceil(formattedUsers.length / limitNum);
        const paginatedUsers = formattedUsers.slice(offset, offset + limitNum);

        return res.success(
            {
                users: paginatedUsers,
                pagination: {
                    currentPage: pageNum,
                    totalPages: totalPages,
                    totalUsers: formattedUsers.length,
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

async function getKYCByUserId(req, res) {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.fail('User ID is required', 400);
        }

        const user = await User.findByPk(userId, {
            attributes: ['id', 'fullName', 'email', 'phoneNumber', 'createdAt']
        });

        if (!user) {
            return res.fail('User not found', 404);
        }

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
                    dateOfBirth: kyc.dateOfBirth,
                    idDocumentUrl: toBackendApiUrl(req, kyc.idDocumentUrl),
                    selfieImageUrl: toBackendApiUrl(req, kyc.selfieImageUrl),
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

        const kyc = await KYC.findByPk(kycId);

        if (!kyc) {
            return res.fail('KYC record not found', 404);
        }

        if (kyc.status === 'approved') {
            return res.fail('KYC is already approved', 409);
        }

        await kyc.update({
            status: 'approved',
            verifiedBy: adminId,
            verifiedAt: new Date(),
            rejectionReason: null
        });

        const user = await User.findByPk(kyc.userId);

        if (user) {
            try {
                await notify(
                    user,
                    'user',
                    'KYC_APPROVED_TEMPLATE',
                    {},
                    ['sms'],
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

        const kyc = await KYC.findByPk(kycId);

        if (!kyc) {
            return res.fail('KYC record not found', 404);
        }

        if (kyc.status === 'rejected') {
            return res.fail('KYC is already rejected', 409);
        }

        await kyc.update({
            status: 'rejected',
            verifiedBy: adminId,
            verifiedAt: new Date(),
            rejectionReason: rejectionReason.trim()
        });

        const user = await User.findByPk(kyc.userId);

        if (user) {
            try {
                await notify(
                    user,
                    'user',
                    'KYC_REJECTED_TEMPLATE',
                    { reason: rejectionReason.trim() },
                    ['sms'],
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

// ==================== ADMIN USER FARMS ====================
const { UserFarm, FarmCategory, UserFarmInvestment, UserFarmMilestone, FarmDocument } = models;

// List all user farms (admin)
async function listAllUserFarms(req, res) {
    try {
        let {
            page = 1,
            limit = 20,
            search = '',
            verificationStatus = '',
            farmCategoryId = ''
        } = req.query;

        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        // Build where clause
        const whereClause = {};
        if (search) {
            whereClause.name = { [Op.iLike]: `%${search}%` };
        }
        if (verificationStatus) {
            whereClause.verificationStatus = verificationStatus;
        }
        if (farmCategoryId) {
            whereClause.farmCategoryId = farmCategoryId;
        }

        // Get total count
        const total = await UserFarm.count({ where: whereClause });

        // Fetch farms with pagination
        const farms = await UserFarm.findAll({
            where: whereClause,
            include: [
                {
                    model: FarmCategory,
                    as: 'Category',
                    attributes: ['id', 'name']
                }
            ],
            attributes: ['id', 'name', 'verificationStatus', 'location', 'farmCategoryId'],
            order: [['createdAt', 'DESC']],
            limit,
            offset
        });

        const totalPages = Math.ceil(total / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        return res.success({
            farms,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage,
                hasPreviousPage,
                startIndex: offset + 1,
                endIndex: Math.min(offset + limit, total)
            }
        }, 'User farms retrieved successfully');
    } catch (error) {
        console.error('List all user farms error:', error);
        return res.fail('Failed to retrieve user farms', 500);
    }
}

// Get single user farm details (admin)
async function getUserFarmDetails(req, res) {
    try {
        const { farmId } = req.params;
        if (!farmId) {
            return res.fail('Farm ID is required', 400);
        }
        const farm = await UserFarm.findOne({
            where: { id: farmId },
            include: [
                {
                    model: FarmCategory,
                    as: 'Category',
                    attributes: ['id', 'name', 'description']
                },
                {
                    model: UserFarmInvestment,
                    as: 'Investment',
                    attributes: ['id', 'expectedInvestment', 'investmentReceived', 'investmentPending', 'investmentStatus', 'currency', 'notes']
                },
                {
                    model: UserFarmMilestone,
                    as: 'SelectedMilestones',
                    attributes: ['id', 'isCompleted', 'completedAt', 'amount'],
                    include: [{
                        model: models.Milestone,
                        as: 'Milestone',
                        attributes: ['id', 'name', 'order']
                    }]
                },
                {
                    model: FarmDocument,
                    as: 'Documents',
                    attributes: ['id', 'documentType', 'fileName', 'fileUrl', 'fileSize', 'mimeType', 'createdAt']
                },
                {
                    model: User,
                    as: 'User',
                    attributes: ['id', 'fullName', 'email', 'phoneNumber', 'createdAt']
                }
            ]
        });
        if (!farm) {
            return res.fail('Farm not found', 404);
        }
        // Map fileUrl to full URL for all documents
        const farmObj = farm.toJSON ? farm.toJSON() : farm;
        if (farmObj.Documents && Array.isArray(farmObj.Documents)) {
            farmObj.Documents = farmObj.Documents.map(doc => ({
                ...doc,
                fileUrl: toBackendApiUrl(req, doc.fileUrl)
            }));
        }
        // Attach user details (uploader) with additional metrics
        let userDetails = null;
        if (farmObj.User) {
            // Count verified farms for the user
            const verifiedFarmsCount = await UserFarm.count({
                where: {
                    userId: farmObj.User.id,
                    verificationStatus: 'approved'
                }
            });

            // Sum all investments received for the user's farms
            const userFarmIds = await UserFarm.findAll({
                where: { userId: farmObj.User.id },
                attributes: ['id'],
                raw: true
            });

            const investmentData = await UserFarmInvestment.findOne({
                where: {
                    userFarmId: userFarmIds.map(f => f.id)
                },
                attributes: [
                    [sequelize.fn('SUM', sequelize.col('investment_received')), 'totalInvestmentsReceived']
                ],
                raw: true
            });

            userDetails = {
                ...farmObj.User,
                verifiedFarmsCount,
                totalFundsReceived: investmentData?.totalInvestmentsReceived || 0
            };
        }
        return res.success({
            ...farmObj,
            user: userDetails
        }, 'Farm details retrieved successfully');
    } catch (error) {
        console.error('Get user farm details error:', error);
        return res.fail('Failed to retrieve farm details', 500);
    }
}

// Approve user farm (admin)
async function approveUserFarm(req, res) {
    try {
        const { farmId } = req.body;
        const adminId = req.admin?.id;

        if (!farmId) {
            return res.fail('Farm ID is required', 400);
        }

        if (!adminId) {
            return res.fail('Admin authentication required', 401);
        }

        const farm = await UserFarm.findByPk(farmId);

        if (!farm) {
            return res.fail('Farm not found', 404);
        }

        if (farm.verificationStatus === 'approved') {
            return res.fail('Farm is already approved', 409);
        }

        await farm.update({
            verificationStatus: 'approved'
        });

        const user = await User.findByPk(farm.userId);

        if (user) {
            try {
                await notify(
                    user,
                    'user',
                    'FARM_APPROVED_TEMPLATE',
                    { farmName: farm.name },
                    ['sms'],
                    true,
                    models
                );
            } catch (notifyError) {
                console.error('Failed to send farm approval notification:', notifyError);
                // Continue even if notification fails
            }
        }

        return res.success(
            {
                farmId: farm.id,
                status: farm.verificationStatus
            },
            'Farm approved successfully'
        );
    } catch (error) {
        console.error('Approve user farm error:', error);
        return res.fail(error.message, 500);
    }
}

// Reject user farm (admin)
async function rejectUserFarm(req, res) {
    try {
        const { farmId, note } = req.body;
        const adminId = req.admin?.id;

        if (!farmId) {
            return res.fail('Farm ID is required', 400);
        }

        if (!note || note.trim() === '') {
            return res.fail('Rejection note is required', 400);
        }

        if (!adminId) {
            return res.fail('Admin authentication required', 401);
        }

        const farm = await UserFarm.findByPk(farmId);

        if (!farm) {
            return res.fail('Farm not found', 404);
        }

        if (farm.verificationStatus === 'rejected') {
            return res.fail('Farm is already rejected', 409);
        }

        await farm.update({
            verificationStatus: 'rejected',
            rejectionNote: note.trim()
        });

        const user = await User.findByPk(farm.userId);

        if (user) {
            try {
                await notify(
                    user,
                    'user',
                    'FARM_REJECTED_TEMPLATE',
                    { farmName: farm.name, reason: note.trim() },
                    ['sms'],
                    true,
                    models
                );
            } catch (notifyError) {
                console.error('Failed to send farm rejection notification:', notifyError);
                // Continue even if notification fails
            }
        }

        return res.success(
            {
                farmId: farm.id,
                status: farm.verificationStatus,
                rejectionNote: note.trim()
            },
            'Farm rejected successfully'
        );
    } catch (error) {
        console.error('Reject user farm error:', error);
        return res.fail(error.message, 500);
    }
}

module.exports = {
    login,
    getUserDirectory,
    getKYCByUserId,
    approveKYC,
    rejectKYC,
    listAllUserFarms,
    getUserFarmDetails,
    approveUserFarm,
    rejectUserFarm
};
