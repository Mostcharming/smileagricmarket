'use strict';

const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');
const { toBackendApiUrl } = require('../../../utils/url');

const models = defineModels(sequelize);
const {
    UserFarm,
    FarmCategory,
    UserFarmInvestment,
    UserFarmMilestone,
    FarmDocument,
    Investment,
    InvestmentMilestone
} = models;

function firstDefined(...values) {
    return values.find(value => value !== undefined);
}

function parseSelectedMilestoneId(body) {
    const directId = firstDefined(
        body.selectedMilestoneId,
        body.investmentMilestoneId
    );

    if (directId !== undefined && directId !== null && String(directId).trim() !== '') {
        return { milestoneId: String(directId).trim() };
    }

    const selectedMilestones = body.selectedMilestones;
    if (selectedMilestones === undefined || selectedMilestones === null || selectedMilestones === '') {
        return { error: 'selectedMilestoneId is required' };
    }

    let parsedMilestones = selectedMilestones;
    if (typeof selectedMilestones === 'string') {
        try {
            parsedMilestones = JSON.parse(selectedMilestones);
        } catch (error) {
            return { error: 'selectedMilestones must be a valid JSON array' };
        }
    }

    if (!Array.isArray(parsedMilestones)) {
        return { error: 'selectedMilestones must be an array' };
    }

    if (parsedMilestones.length !== 1) {
        return { error: 'Exactly one investment milestone must be selected' };
    }

    const selectedMilestone = parsedMilestones[0];
    const milestoneId = typeof selectedMilestone === 'string'
        ? selectedMilestone
        : firstDefined(
            selectedMilestone?.investmentMilestoneId,
            selectedMilestone?.milestoneId,
            selectedMilestone?.id
        );

    if (!milestoneId || String(milestoneId).trim() === '') {
        return { error: 'selectedMilestoneId is required' };
    }

    return { milestoneId: String(milestoneId).trim() };
}

function parseRequiredPositiveNumber(value, fieldName) {
    if (value === undefined || value === null || value === '') {
        return { error: `${fieldName} is required` };
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return { error: `${fieldName} must be a valid amount greater than zero` };
    }

    return { value: parsed };
}

function getSelectedMilestoneInclude(attributes = ['id', 'isCompleted', 'completedAt', 'amount']) {
    return {
        model: UserFarmMilestone,
        as: 'SelectedMilestones',
        attributes: [...attributes, 'milestoneId', 'investmentMilestoneId'],
        include: [
            {
                model: models.Milestone,
                as: 'Milestone',
                attributes: ['id', 'name', 'order'],
                required: false
            },
            {
                model: InvestmentMilestone,
                as: 'InvestmentMilestone',
                attributes: ['id', 'investmentId', 'name', 'fundReleasePercentage', 'order'],
                required: false
            }
        ]
    };
}

function getInvestmentTemplateInclude() {
    return {
        model: Investment,
        as: 'InvestmentTemplate',
        attributes: [
            'id',
            'farmCategoryId',
            'name',
            'description',
            'startDate',
            'endDate',
            'roiPercentage',
            'durationValue',
            'durationUnit',
            'riskLevel',
            'fundingMinGoal',
            'fundingMaxGoal',
            'investmentMinGoal',
            'investmentMaxGoal',
            'currency'
        ]
    };
}

function addFarmResponseAliases(farm) {
    const farmObj = farm?.toJSON ? farm.toJSON() : farm;
    if (!farmObj) return farmObj;

    const selectedAssignment = farmObj.SelectedMilestones?.[0] || null;
    const selectedTemplateMilestone = selectedAssignment?.InvestmentMilestone || null;
    const selectedLegacyMilestone = selectedAssignment?.Milestone || null;
    const selectedMilestoneData = selectedTemplateMilestone || selectedLegacyMilestone;
    const documents = farmObj.Documents || [];

    return {
        ...farmObj,
        plotSize: farmObj.size === null || farmObj.size === undefined
            ? null
            : Number(farmObj.size),
        address: farmObj.location,
        fundingGoalAmount: farmObj.investmentAmount === null || farmObj.investmentAmount === undefined
            ? null
            : Number(farmObj.investmentAmount),
        selectedMilestone: selectedAssignment ? {
            id: selectedMilestoneData?.id
                || selectedAssignment.investmentMilestoneId
                || selectedAssignment.milestoneId,
            selectionId: selectedAssignment.id,
            investmentId: selectedTemplateMilestone?.investmentId || null,
            name: selectedMilestoneData?.name || null,
            fundReleasePercentage: selectedTemplateMilestone?.fundReleasePercentage === undefined
                ? null
                : Number(selectedTemplateMilestone.fundReleasePercentage),
            order: selectedMilestoneData?.order ?? null,
            isCompleted: !!selectedAssignment.isCompleted,
            completedAt: selectedAssignment.completedAt || null
        } : null,
        photos: documents.filter(document => document.documentType === 'picture'),
        farmDocuments: documents.filter(document => document.documentType === 'document')
    };
}

function removeUploadedFarmFiles(req) {
    const farmFiles = req.farmFiles || {};

    [...(farmFiles.pictures || []), ...(farmFiles.documents || [])].forEach(file => {
        try {
            if (file?.path && fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
        } catch (error) {
            console.error('Failed to remove farm upload after rejected creation:', error);
        }
    });
}

function failFarmCreation(req, res, message, statusCode) {
    removeUploadedFarmFiles(req);
    return res.fail(message, statusCode);
}

async function listUserFarms(req, res) {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        // Get pagination parameters
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(parseInt(req.query.limit) || 10, 100); // Max 100 per page
        const offset = (page - 1) * limit;

        // Get search parameter
        const search = req.query.search ? req.query.search.trim() : '';

        // Build where clause
        const whereClause = {
            userId,
            isActive: true
        };

        // Add search filter if provided
        if (search) {
            whereClause[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { description: { [Op.iLike]: `%${search}%` } },
                { location: { [Op.iLike]: `%${search}%` } }
            ];
        }

        // Get total count
        const total = await UserFarm.count({
            where: whereClause
        });

        // Fetch farms with pagination
        const farms = await UserFarm.findAll({
            where: whereClause,
            include: [
                {
                    model: FarmCategory,
                    as: 'Category',
                    attributes: ['id', 'name']
                },
                getInvestmentTemplateInclude(),
                {
                    model: UserFarmInvestment,
                    as: 'Investment',
                    attributes: ['id', 'expectedInvestment', 'investmentReceived', 'investmentStatus', 'currency']
                },
                getSelectedMilestoneInclude(['id', 'isCompleted', 'amount']),
                {
                    model: FarmDocument,
                    as: 'Documents',
                    attributes: ['id', 'documentType', 'fileName', 'fileUrl', 'fileSize']
                }
            ],
            attributes: ['id', 'investmentId', 'name', 'description', 'location', 'size', 'investmentAmount', 'currency', 'verificationStatus', 'createdAt', 'updatedAt'],
            order: [['createdAt', 'DESC']],
            limit,
            offset
        });

        // Calculate pagination metadata
        const totalPages = Math.ceil(total / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        // Map fileUrl to full URL for each farm's documents
        const farmsWithFullUrls = farms.map(farm => {
            const farmObj = farm.toJSON();
            if (farmObj.Documents && Array.isArray(farmObj.Documents)) {
                farmObj.Documents = farmObj.Documents.map(doc => ({
                    ...doc,
                    fileUrl: toBackendApiUrl(req, doc.fileUrl)
                }));
            }
            return addFarmResponseAliases(farmObj);
        });
        return res.success({
            farms: farmsWithFullUrls,
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
        }, 'Farms retrieved successfully');
    } catch (error) {
        console.error('List user farms error:', error);
        return res.fail('Failed to retrieve farms', 500);
    }
}

async function getFarmById(req, res) {
    try {
        const userId = req.user?.id;
        const { farmId } = req.params;

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        if (!farmId) {
            return res.fail('Farm ID is required', 400);
        }

        const farm = await UserFarm.findOne({
            where: {
                id: farmId,
                userId,
                isActive: true
            },
            include: [
                {
                    model: FarmCategory,
                    as: 'Category',
                    attributes: ['id', 'name', 'description']
                },
                getInvestmentTemplateInclude(),
                {
                    model: UserFarmInvestment,
                    as: 'Investment',
                    attributes: ['id', 'expectedInvestment', 'investmentReceived', 'investmentPending', 'investmentStatus', 'currency', 'notes']
                },
                getSelectedMilestoneInclude(),
                {
                    model: FarmDocument,
                    as: 'Documents',
                    attributes: ['id', 'documentType', 'fileName', 'fileUrl', 'fileSize', 'mimeType', 'createdAt']
                }
            ]
        });

        if (!farm) {
            return res.fail('Farm not found', 404);
        }

        // Calculate completion percentage
        const totalMilestones = farm.SelectedMilestones.length;
        const completedMilestones = farm.SelectedMilestones.filter(m => m.isCompleted).length;
        const completionPercentage = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

        // Map fileUrl to full URL for all documents
        let farmObj = farm.toJSON();
        if (farmObj.Documents && Array.isArray(farmObj.Documents)) {
            farmObj.Documents = farmObj.Documents.map(doc => ({
                ...doc,
                fileUrl: toBackendApiUrl(req, doc.fileUrl)
            }));
        }
        farmObj = addFarmResponseAliases(farmObj);
        return res.success({
            ...farmObj,
            stats: {
                totalMilestones,
                completedMilestones,
                completionPercentage
            }
        }, 'Farm details retrieved successfully');
    } catch (error) {
        console.error('Get farm by ID error:', error);
        return res.fail('Failed to retrieve farm details', 500);
    }
}

async function createFarm(req, res) {
    let transaction;

    try {
        const userId = req.user?.id;
        const {
            farmCategoryId,
            investmentId,
            description
        } = req.body;
        const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        const location = firstDefined(req.body.address, req.body.location);
        const plotSize = firstDefined(req.body.plotSize, req.body.size);
        const fundingGoalAmount = firstDefined(
            req.body.fundingGoalAmount,
            req.body.investmentAmount
        );

        if (!userId) {
            return failFarmCreation(req, res, 'User not authenticated', 401);
        }

        if (!farmCategoryId) {
            return failFarmCreation(req, res, 'farmCategoryId is required', 400);
        }

        if (!name) {
            return failFarmCreation(req, res, 'name is required', 400);
        }

        if (!location || String(location).trim() === '') {
            return failFarmCreation(req, res, 'address is required', 400);
        }

        const { value: parsedPlotSize, error: plotSizeError } = parseRequiredPositiveNumber(
            plotSize,
            'plotSize'
        );
        if (plotSizeError) {
            return failFarmCreation(req, res, plotSizeError, 400);
        }

        const { value: parsedFundingGoal, error: fundingGoalError } = parseRequiredPositiveNumber(
            fundingGoalAmount,
            'fundingGoalAmount'
        );
        if (fundingGoalError) {
            return failFarmCreation(req, res, fundingGoalError, 400);
        }

        const {
            milestoneId: selectedMilestoneId,
            error: selectedMilestoneError
        } = parseSelectedMilestoneId(req.body);
        if (selectedMilestoneError) {
            return failFarmCreation(req, res, selectedMilestoneError, 400);
        }

        const photos = req.farmFiles?.pictures || [];
        const documents = req.farmFiles?.documents || [];
        if (photos.length === 0) {
            return failFarmCreation(req, res, 'At least one farm photo is required', 400);
        }
        if (documents.length === 0) {
            return failFarmCreation(req, res, 'At least one farm document is required', 400);
        }

        const category = await FarmCategory.findOne({
            where: {
                id: farmCategoryId,
                isActive: true
            }
        });
        if (!category) {
            return failFarmCreation(req, res, 'Active farm category not found', 404);
        }

        const selectedMilestone = await InvestmentMilestone.findOne({
            where: {
                id: selectedMilestoneId,
                isActive: true
            },
            include: [{
                model: Investment,
                as: 'Investment',
                required: true,
                where: {
                    farmCategoryId,
                    isActive: true
                }
            }]
        });

        if (!selectedMilestone) {
            return failFarmCreation(
                req,
                res,
                'Selected milestone is not part of an active investment template for this farm category',
                400
            );
        }

        const investmentTemplate = selectedMilestone.Investment;
        if (investmentId && investmentId !== investmentTemplate.id) {
            return failFarmCreation(
                req,
                res,
                'investmentId does not match the selected milestone',
                400
            );
        }

        const fundingMinGoal = Number(investmentTemplate.fundingMinGoal);
        const fundingMaxGoal = Number(investmentTemplate.fundingMaxGoal);
        if (parsedFundingGoal < fundingMinGoal || parsedFundingGoal > fundingMaxGoal) {
            return failFarmCreation(
                req,
                res,
                `fundingGoalAmount must be between ${fundingMinGoal} and ${fundingMaxGoal} ${investmentTemplate.currency}`,
                400
            );
        }

        if (
            req.body.currency
            && String(req.body.currency).trim().toUpperCase() !== investmentTemplate.currency
        ) {
            return failFarmCreation(
                req,
                res,
                `currency must match the investment template currency (${investmentTemplate.currency})`,
                400
            );
        }

        transaction = await sequelize.transaction();

        const farm = await UserFarm.create({
            userId,
            farmCategoryId,
            investmentId: investmentTemplate.id,
            name,
            description: description === undefined || description === null
                ? null
                : String(description).trim() || null,
            location: String(location).trim(),
            size: parsedPlotSize,
            investmentAmount: parsedFundingGoal,
            currency: investmentTemplate.currency,
            isActive: true,
            verificationStatus: 'pending'
        }, { transaction });

        await UserFarmInvestment.create({
            userFarmId: farm.id,
            currency: investmentTemplate.currency,
            expectedInvestment: parsedFundingGoal,
            investmentReceived: 0.00,
            investmentPending: parsedFundingGoal,
            investmentStatus: 'pending',
            notes: null,
            isActive: true
        }, { transaction });

        await UserFarmMilestone.create({
            userFarmId: farm.id,
            milestoneId: null,
            investmentMilestoneId: selectedMilestone.id,
            amount: 0,
            isCompleted: false
        }, { transaction });

        const documentsToCreate = [
            ...photos.map(photo => ({
                userFarmId: farm.id,
                documentType: 'picture',
                fileName: photo.originalName,
                fileUrl: photo.url,
                fileSize: photo.size,
                mimeType: photo.mimeType
            })),
            ...documents.map(document => ({
                userFarmId: farm.id,
                documentType: 'document',
                fileName: document.originalName,
                fileUrl: document.url,
                fileSize: document.size,
                mimeType: document.mimeType
            }))
        ];
        await FarmDocument.bulkCreate(documentsToCreate, { transaction });

        await transaction.commit();
        transaction = null;

        const createdFarm = await UserFarm.findByPk(farm.id, {
            include: [
                {
                    model: FarmCategory,
                    as: 'Category',
                    attributes: ['id', 'name']
                },
                getInvestmentTemplateInclude(),
                {
                    model: UserFarmInvestment,
                    as: 'Investment',
                    attributes: ['id', 'expectedInvestment', 'investmentReceived', 'investmentPending', 'investmentStatus', 'currency']
                },
                getSelectedMilestoneInclude(),
                {
                    model: FarmDocument,
                    as: 'Documents',
                    attributes: ['id', 'documentType', 'fileName', 'fileUrl', 'fileSize', 'mimeType']
                }
            ]
        });

        // Map fileUrl to full URL for all documents
        let farmObj = createdFarm.toJSON ? createdFarm.toJSON() : createdFarm;
        if (farmObj.Documents && Array.isArray(farmObj.Documents)) {
            farmObj.Documents = farmObj.Documents.map(doc => ({
                ...doc,
                fileUrl: toBackendApiUrl(req, doc.fileUrl)
            }));
        }
        farmObj = addFarmResponseAliases(farmObj);
        return res.success(farmObj, 'Farm created successfully', 201);
    } catch (error) {
        if (transaction) {
            await transaction.rollback();
        }
        removeUploadedFarmFiles(req);
        console.error('Create farm error:', error);
        return res.fail('Failed to create farm', 500);
    }
}

async function updateFarm(req, res) {
    let transaction;

    try {
        const userId = req.user?.id;
        const { farmId } = req.params;
        const { name, description, isActive } = req.body;
        const location = firstDefined(req.body.address, req.body.location);
        const size = firstDefined(req.body.plotSize, req.body.size);
        const fundingGoalAmount = firstDefined(
            req.body.fundingGoalAmount,
            req.body.investmentAmount
        );

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        if (!farmId) {
            return res.fail('Farm ID is required', 400);
        }

        const farm = await UserFarm.findOne({
            where: {
                id: farmId,
                userId
            }
        });

        if (!farm) {
            return res.fail('Farm not found', 404);
        }

        let parsedSize;
        if (size !== undefined) {
            const result = parseRequiredPositiveNumber(size, 'plotSize');
            if (result.error) return res.fail(result.error, 400);
            parsedSize = result.value;
        }

        let parsedFundingGoal;
        if (fundingGoalAmount !== undefined) {
            const result = parseRequiredPositiveNumber(
                fundingGoalAmount,
                'fundingGoalAmount'
            );
            if (result.error) return res.fail(result.error, 400);
            parsedFundingGoal = result.value;

            const investmentTemplate = await Investment.findByPk(farm.investmentId);
            if (!investmentTemplate) {
                return res.fail('Farm investment template not found', 409);
            }

            const minGoal = Number(investmentTemplate.fundingMinGoal);
            const maxGoal = Number(investmentTemplate.fundingMaxGoal);
            if (parsedFundingGoal < minGoal || parsedFundingGoal > maxGoal) {
                return res.fail(
                    `fundingGoalAmount must be between ${minGoal} and ${maxGoal} ${investmentTemplate.currency}`,
                    400
                );
            }
        }

        if (name !== undefined && (!String(name).trim())) {
            return res.fail('name cannot be empty', 400);
        }
        if (location !== undefined && (!String(location).trim())) {
            return res.fail('address cannot be empty', 400);
        }

        transaction = await sequelize.transaction();
        if (name !== undefined) farm.name = String(name).trim();
        if (description !== undefined) farm.description = description;
        if (location !== undefined) farm.location = String(location).trim();
        if (parsedSize !== undefined) farm.size = parsedSize;
        if (parsedFundingGoal !== undefined) farm.investmentAmount = parsedFundingGoal;
        if (isActive !== undefined) farm.isActive = isActive;

        await farm.save({ transaction });

        if (parsedFundingGoal !== undefined) {
            const farmInvestment = await UserFarmInvestment.findOne({
                where: { userFarmId: farm.id },
                transaction
            });

            if (farmInvestment) {
                const received = Number(farmInvestment.investmentReceived) || 0;
                await farmInvestment.update({
                    expectedInvestment: parsedFundingGoal,
                    investmentPending: Math.max(parsedFundingGoal - received, 0),
                    investmentStatus: received >= parsedFundingGoal
                        ? 'completed'
                        : received > 0
                            ? 'partial'
                            : 'pending'
                }, { transaction });
            }
        }

        await transaction.commit();
        transaction = null;

        const updatedFarm = await UserFarm.findByPk(farm.id, {
            include: [
                {
                    model: FarmCategory,
                    as: 'Category',
                    attributes: ['id', 'name']
                },
                getInvestmentTemplateInclude(),
                {
                    model: UserFarmInvestment,
                    as: 'Investment',
                    attributes: ['id', 'expectedInvestment', 'investmentReceived', 'investmentStatus', 'currency']
                }
            ]
        });

        return res.success(addFarmResponseAliases(updatedFarm), 'Farm updated successfully');
    } catch (error) {
        if (transaction) {
            await transaction.rollback();
        }
        console.error('Update farm error:', error);
        return res.fail('Failed to update farm', 500);
    }
}

async function deleteFarm(req, res) {
    try {
        const userId = req.user?.id;
        const { farmId } = req.params;

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        if (!farmId) {
            return res.fail('Farm ID is required', 400);
        }

        const farm = await UserFarm.findOne({
            where: {
                id: farmId,
                userId
            }
        });

        if (!farm) {
            return res.fail('Farm not found', 404);
        }

        // Soft delete by marking as inactive
        farm.isActive = false;
        await farm.save();

        return res.success({}, 'Farm deleted successfully');
    } catch (error) {
        console.error('Delete farm error:', error);
        return res.fail('Failed to delete farm', 500);
    }
}

async function addMilestonesToFarm(req, res) {
    let transaction;

    try {
        const userId = req.user?.id;
        const { farmId } = req.params;

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        if (!farmId) {
            return res.fail('Farm ID is required', 400);
        }

        const { milestoneId, error: milestoneParseError } = parseSelectedMilestoneId({
            ...req.body,
            selectedMilestones: firstDefined(
                req.body.selectedMilestones,
                req.body.milestones
            )
        });
        if (milestoneParseError) {
            return res.fail(milestoneParseError, 400);
        }

        const farm = await UserFarm.findOne({
            where: { id: farmId, userId }
        });

        if (!farm) {
            return res.fail('Farm not found', 404);
        }

        if (!farm.investmentId) {
            return res.fail('Farm is not linked to an investment template', 409);
        }

        const investmentMilestone = await InvestmentMilestone.findOne({
            where: {
                id: milestoneId,
                investmentId: farm.investmentId,
                isActive: true
            }
        });

        if (!investmentMilestone) {
            return res.fail(
                'Selected milestone is not part of this farm investment template',
                400
            );
        }

        transaction = await sequelize.transaction();
        await UserFarmMilestone.destroy({
            where: {
                userFarmId: farmId,
                investmentMilestoneId: {
                    [Op.ne]: null
                }
            },
            transaction
        });
        await UserFarmMilestone.create({
            userFarmId: farmId,
            milestoneId: null,
            investmentMilestoneId: investmentMilestone.id,
            amount: 0,
            isCompleted: false
        }, { transaction });
        await transaction.commit();
        transaction = null;

        const updatedFarm = await UserFarm.findByPk(farmId, {
            include: [getSelectedMilestoneInclude()]
        });

        return res.success(
            addFarmResponseAliases(updatedFarm),
            'Farm funding milestone updated successfully'
        );
    } catch (error) {
        if (transaction) {
            await transaction.rollback();
        }
        console.error('Add milestones error:', error);
        return res.fail('Failed to update farm funding milestone', 500);
    }
}

async function uploadFarmDocumentsToFarm(req, res) {
    try {
        const userId = req.user?.id;
        const { farmId } = req.params;

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        if (!farmId) {
            return res.fail('Farm ID is required', 400);
        }

        // Verify farm ownership
        const farm = await UserFarm.findOne({
            where: { id: farmId, userId }
        });

        if (!farm) {
            return res.fail('Farm not found', 404);
        }

        if (!req.farmFiles || (req.farmFiles.pictures.length === 0 && req.farmFiles.documents.length === 0)) {
            return res.fail('At least one file (picture or document) is required', 400);
        }

        const documentsToCreate = [];

        // Add pictures
        if (req.farmFiles.pictures && req.farmFiles.pictures.length > 0) {
            req.farmFiles.pictures.forEach(picture => {
                documentsToCreate.push({
                    userFarmId: farmId,
                    documentType: 'picture',
                    fileName: picture.originalName,
                    fileUrl: picture.url,
                    fileSize: picture.size,
                    mimeType: picture.mimeType
                });
            });
        }

        // Add documents
        if (req.farmFiles.documents && req.farmFiles.documents.length > 0) {
            req.farmFiles.documents.forEach(doc => {
                documentsToCreate.push({
                    userFarmId: farmId,
                    documentType: 'document',
                    fileName: doc.originalName,
                    fileUrl: doc.url,
                    fileSize: doc.size,
                    mimeType: doc.mimeType
                });
            });
        }

        if (documentsToCreate.length > 0) {
            await models.FarmDocument.bulkCreate(documentsToCreate);
        }

        const updatedFarm = await UserFarm.findByPk(farmId, {
            include: [{
                model: models.FarmDocument,
                as: 'Documents',
                attributes: ['id', 'documentType', 'fileName', 'fileUrl', 'fileSize', 'mimeType', 'createdAt']
            }]
        });

        // Map fileUrl to full URL for all documents
        const farmObj = updatedFarm.toJSON ? updatedFarm.toJSON() : updatedFarm;
        if (farmObj.Documents && Array.isArray(farmObj.Documents)) {
            farmObj.Documents = farmObj.Documents.map(doc => ({
                ...doc,
                fileUrl: toBackendApiUrl(req, doc.fileUrl)
            }));
        }
        return res.success(farmObj, 'Documents uploaded successfully');
    } catch (error) {
        console.error('Upload documents error:', error);
        return res.fail('Failed to upload documents', 500);
    }
}

async function deleteFarmDocument(req, res) {
    try {
        const userId = req.user?.id;
        const { documentId } = req.params;

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        if (!documentId) {
            return res.fail('Document ID is required', 400);
        }

        const document = await models.FarmDocument.findOne({
            where: { id: documentId },
            include: [{
                model: UserFarm,
                as: 'Farm',
                attributes: ['userId']
            }]
        });

        if (!document) {
            return res.fail('Document not found', 404);
        }

        // Verify ownership
        if (document.Farm.userId !== userId) {
            return res.fail('Unauthorized to delete this document', 403);
        }

        // Delete the document file
        const filePath = document.fileUrl.replace('/upload/farm-documents/', '');
        const fullPath = path.join(__dirname, '../../..', '..', 'uploads', 'farm-documents', filePath);

        try {
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
        } catch (err) {
            console.error('Error deleting file:', err);
        }

        // Delete from database
        await document.destroy();

        return res.success({}, 'Document deleted successfully');
    } catch (error) {
        console.error('Delete document error:', error);
        return res.fail('Failed to delete document', 500);
    }
}

async function removeMilestoneFromFarm(req, res) {
    try {
        const userId = req.user?.id;
        const { farmId, milestoneId } = req.params;

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        if (!farmId || !milestoneId) {
            return res.fail('Farm ID and Milestone ID are required', 400);
        }

        // Verify farm ownership
        const farm = await UserFarm.findOne({
            where: { id: farmId, userId }
        });

        if (!farm) {
            return res.fail('Farm not found', 404);
        }

        // Remove milestone
        await models.UserFarmMilestone.destroy({
            where: {
                userFarmId: farmId,
                [Op.or]: [
                    { milestoneId },
                    { investmentMilestoneId: milestoneId }
                ]
            }
        });

        return res.success({}, 'Milestone removed from farm successfully');
    } catch (error) {
        console.error('Remove milestone error:', error);
        return res.fail('Failed to remove milestone', 500);
    }
}

module.exports = {
    listUserFarms,
    getFarmById,
    createFarm,
    updateFarm,
    deleteFarm,
    addMilestonesToFarm,
    uploadFarmDocumentsToFarm,
    deleteFarmDocument,
    removeMilestoneFromFarm
};
