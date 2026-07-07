'use strict';

const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const { toBackendApiUrl } = require('../../../utils/url');

const models = defineModels(sequelize);
const { User, KYC } = models;

async function submitKYC(req, res) {
    try {
        const userId = req.user?.id;
        const { identificationType, identificationNumber, dateOfBirth } = req.body;

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        if (!identificationType || !identificationNumber) {
            return res.fail('Identification type and number are required', 400);
        }

        const validTypes = ['national_id', 'passport', 'driver_license', 'tin', 'voter_card', 'nin_slip', 'residential_permit'];
        if (!validTypes.includes(identificationType)) {
            return res.fail(`Invalid identification type. Must be one of: ${validTypes.join(', ')}`, 400);
        }

        if (identificationNumber.length < 5) {
            return res.fail('Identification number must be at least 5 characters', 400);
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.fail('User not found', 404);
        }

        const pendingKYC = await KYC.findOne({
            where: { userId, status: 'pending' }
        });

        if (pendingKYC) {
            return res.fail('You already have a pending KYC submission. Please wait for verification.', 409);
        }

        const approvedKYC = await KYC.findOne({
            where: { userId, status: 'approved' }
        });

        if (approvedKYC) {
            return res.fail('KYC already approved for this user', 409);
        }

        const hasSelfie = req.kycFiles && req.kycFiles.selfie;

        if (!hasSelfie) {
            return res.fail('Selfie image is required', 400);
        }

        const kycData = {
            userId,
            identificationType,
            identificationNumber,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
            status: 'pending',
            submittedAt: new Date(),
            selfieImagePath: req.kycFiles.selfie.path,
            selfieImageUrl: req.kycFiles.selfie.url
        };

        const kyc = await KYC.create(kycData);

        return res.success(
            {
                kycId: kyc.id,
                status: kyc.status,
                message: 'KYC submitted successfully. Please wait for verification.',
                submittedAt: kyc.submittedAt,
                selfie: toBackendApiUrl(req, req.kycFiles.selfie.url)
            },
            'KYC submitted successfully'
        );
    } catch (error) {
        console.error('Submit KYC error:', error);
        return res.fail(error.message, 500);
    }
}

async function getKYCStatus(req, res) {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        const user = await User.findByPk(userId);
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
                    status: 'not_submitted',
                    message: 'No KYC submitted yet'
                },
                'No KYC found'
            );
        }

        const response = {
            kycId: kyc.id,
            status: kyc.status,
            identificationType: kyc.identificationType,
            identificationNumber: kyc.identificationNumber,
            dateOfBirth: kyc.dateOfBirth,
            submittedAt: kyc.submittedAt,
            verifiedAt: kyc.verifiedAt,
            rejectionReason: kyc.rejectionReason,
            selfie: toBackendApiUrl(req, kyc.selfieImageUrl)
        };

        return res.success(response, `KYC status: ${kyc.status}`);
    } catch (error) {
        console.error('Get KYC status error:', error);
        return res.fail(error.message, 500);
    }
}

async function updateKYC(req, res) {
    try {
        const userId = req.user?.id;
        const { identificationType, identificationNumber, dateOfBirth } = req.body;

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        if (!identificationType || !identificationNumber) {
            return res.fail('Identification type and number are required', 400);
        }

        const validTypes = ['national_id', 'passport', 'driver_license', 'tin', 'voter_card', 'nin_slip', 'residential_permit'];
        if (!validTypes.includes(identificationType)) {
            return res.fail(`Invalid identification type. Must be one of: ${validTypes.join(', ')}`, 400);
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.fail('User not found', 404);
        }

        const kyc = await KYC.findOne({
            where: { userId },
            order: [['createdAt', 'DESC']]
        });

        if (!kyc) {
            return res.fail('No KYC record found. Please submit first.', 404);
        }

        if (kyc.status === 'approved') {
            return res.fail('Cannot update approved KYC', 409);
        }

        const hasSelfie = req.kycFiles && req.kycFiles.selfie;

        if (!hasSelfie) {
            return res.fail('Selfie image is required', 400);
        }

        const updateData = {
            identificationType,
            identificationNumber,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
            status: 'pending',
            submittedAt: new Date(),
            rejectionReason: null,
            selfieImagePath: req.kycFiles.selfie.path,
            selfieImageUrl: req.kycFiles.selfie.url
        };

        await kyc.update(updateData);

        return res.success(
            {
                kycId: kyc.id,
                status: kyc.status,
                message: 'KYC updated successfully. Please wait for verification.',
                submittedAt: kyc.submittedAt,
                selfie: toBackendApiUrl(req, req.kycFiles.selfie.url)
            },
            'KYC updated successfully'
        );
    } catch (error) {
        console.error('Update KYC error:', error);
        return res.fail(error.message, 500);
    }
}

async function getKYCList(req, res) {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        const where = {};
        if (status && ['pending', 'approved', 'rejected'].includes(status)) {
            where.status = status;
        }

        const total = await KYC.count({ where });

        const kycs = await KYC.findAll({
            where,
            include: [
                {
                    model: User,
                    attributes: ['id', 'fullName', 'phoneNumber', 'email']
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset
        });

        const response = {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / limit),
            data: kycs.map(kyc => ({
                kycId: kyc.id,
                user: kyc.User,
                identificationType: kyc.identificationType,
                identificationNumber: kyc.identificationNumber,
                status: kyc.status,
                submittedAt: kyc.submittedAt,
                verifiedAt: kyc.verifiedAt,
                rejectionReason: kyc.rejectionReason,
                selfie: toBackendApiUrl(req, kyc.selfieImageUrl)
            }))
        };

        return res.success(response, 'KYC records retrieved successfully');
    } catch (error) {
        console.error('Get KYC list error:', error);
        return res.fail(error.message, 500);
    }
}

async function approveKYC(req, res) {
    try {
        const { kycId } = req.body;
        const adminId = req.user?.id;

        if (!kycId) {
            return res.fail('KYC ID is required', 400);
        }

        if (!adminId) {
            return res.fail('Admin not authenticated', 401);
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

        return res.success(
            {
                kycId: kyc.id,
                status: kyc.status,
                verifiedAt: kyc.verifiedAt
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
        const adminId = req.user?.id;

        if (!kycId) {
            return res.fail('KYC ID is required', 400);
        }

        if (!rejectionReason) {
            return res.fail('Rejection reason is required', 400);
        }

        if (!adminId) {
            return res.fail('Admin not authenticated', 401);
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
            rejectionReason
        });

        return res.success(
            {
                kycId: kyc.id,
                status: kyc.status,
                rejectionReason: kyc.rejectionReason,
                verifiedAt: kyc.verifiedAt
            },
            'KYC rejected successfully'
        );
    } catch (error) {
        console.error('Reject KYC error:', error);
        return res.fail(error.message, 500);
    }
}

module.exports = {
    submitKYC,
    getKYCStatus,
    updateKYC,
    getKYCList,
    approveKYC,
    rejectKYC
};
