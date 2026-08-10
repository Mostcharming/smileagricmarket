'use strict';

const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');
const { toBackendApiUrl } = require('../../../utils/url');
const {
    calculateInvestmentProjectEndDate,
    resolveInvestmentProjectStatus
} = require('../../../utils/investmentProject');

const models = defineModels(sequelize);
const {
    UserFarm,
    FarmCategory,
    UserFarmInvestment,
    UserFarmMilestone,
    FarmDocument,
    Investment,
    InvestmentMilestone,
    InvestmentPayment
} = models;

const FUNDED_PAYMENT_STATUSES = ['recorded', 'successful'];

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

function calculatePercentageAmount(totalAmount, percentage) {
    const totalCents = Math.round(Number(totalAmount) * 100);
    const parsedPercentage = Number(percentage);
    if (!Number.isSafeInteger(totalCents) || !Number.isFinite(parsedPercentage)) return 0;
    return Number((Math.round((totalCents * parsedPercentage) / 100) / 100).toFixed(2));
}

function calculatePercentage(value, total) {
    const parsedValue = Number(value);
    const parsedTotal = Number(total);
    if (!Number.isFinite(parsedValue) || !Number.isFinite(parsedTotal) || parsedTotal <= 0) {
        return 0;
    }
    return Number(Math.min((parsedValue / parsedTotal) * 100, 100).toFixed(2));
}

function getSelectedMilestoneInclude(attributes = [
    'id',
    'name',
    'fundReleasePercentage',
    'order',
    'fundingStatus',
    'isCompleted',
    'completedAt',
    'amount'
]) {
    return {
        model: UserFarmMilestone,
        as: 'SelectedMilestones',
        attributes: [...attributes, 'userFarmInvestmentId', 'milestoneId', 'investmentMilestoneId'],
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

function getProjectMilestoneInclude(attributes = [
    'id',
    'name',
    'fundReleasePercentage',
    'order',
    'fundingStatus',
    'isCompleted',
    'completedAt',
    'amount'
]) {
    return {
        model: UserFarmMilestone,
        as: 'ProjectMilestones',
        attributes: [...attributes, 'userFarmInvestmentId', 'milestoneId', 'investmentMilestoneId'],
        separate: true,
        order: [['order', 'ASC'], ['createdAt', 'ASC']],
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

function getInvestmentProjectInclude(attributes = [
    'id',
    'farmCategoryId',
    'investmentId',
    'expectedInvestment',
    'investmentReceived',
    'investmentPending',
    'investmentStatus',
    'startDate',
    'endDate',
    'currency',
    'notes',
    'isActive',
    'createdAt',
    'updatedAt'
]) {
    return {
        model: UserFarmInvestment,
        as: 'InvestmentProjects',
        attributes,
        required: false,
        separate: true,
        order: [['createdAt', 'DESC']],
        include: [
            {
                model: FarmCategory,
                as: 'Category',
                attributes: ['id', 'name', 'description'],
                required: false
            },
            getInvestmentTemplateInclude(),
            getProjectMilestoneInclude(),
            {
                model: InvestmentPayment,
                as: 'Payments',
                attributes: ['investorId'],
                where: { status: { [Op.in]: FUNDED_PAYMENT_STATUSES } },
                required: false,
                separate: true
            }
        ]
    };
}

function formatMilestoneAssignments(assignments = []) {
    return assignments.map(selectedAssignment => {
        const selectedTemplateMilestone = selectedAssignment?.InvestmentMilestone || null;
        const selectedLegacyMilestone = selectedAssignment?.Milestone || null;
        const selectedMilestoneData = selectedTemplateMilestone || selectedLegacyMilestone;

        return {
            id: selectedMilestoneData?.id
                || selectedAssignment.investmentMilestoneId
                || selectedAssignment.milestoneId,
            selectionId: selectedAssignment.id,
            investmentProjectId: selectedAssignment.userFarmInvestmentId || null,
            investmentId: selectedTemplateMilestone?.investmentId || null,
            name: selectedAssignment.name || selectedMilestoneData?.name || null,
            fundReleasePercentage: selectedAssignment.fundReleasePercentage === null
                || selectedAssignment.fundReleasePercentage === undefined
                ? (selectedTemplateMilestone?.fundReleasePercentage === undefined
                    ? null
                    : Number(selectedTemplateMilestone.fundReleasePercentage))
                : Number(selectedAssignment.fundReleasePercentage),
            order: selectedAssignment.order
                ?? selectedMilestoneData?.order
                ?? null,
            allocatedAmount: selectedAssignment.amount === undefined
                ? null
                : Number(selectedAssignment.amount),
            amount: selectedAssignment.amount === undefined
                ? null
                : Number(selectedAssignment.amount),
            fundingStatus: selectedAssignment.fundingStatus
                || (selectedAssignment.isCompleted ? 'completed' : 'request_for_funding'),
            isCompleted: !!selectedAssignment.isCompleted,
            completedAt: selectedAssignment.completedAt || null
        };
    });
}

function formatInvestmentProject(investmentProject) {
    const {
        Category: projectCategory,
        InvestmentTemplate: projectTemplate,
        ProjectMilestones: projectMilestoneAssignments = [],
        Payments: projectPayments = [],
        ...projectFields
    } = investmentProject;
    const milestones = formatMilestoneAssignments(projectMilestoneAssignments);
    const fundingGoalAmount = investmentProject.expectedInvestment === null
        || investmentProject.expectedInvestment === undefined
        ? 0
        : Number(investmentProject.expectedInvestment);
    const amountRaised = Number(investmentProject.investmentReceived || 0);
    const completedPercentage = milestones.reduce((total, milestone) => {
        return milestone.fundingStatus === 'completed'
            ? total + Number(milestone.fundReleasePercentage || 0)
            : total;
    }, 0);
    const investorCount = new Set(projectPayments.map(payment => payment.investorId)).size;

    return {
        ...projectFields,
        investmentStatus: resolveInvestmentProjectStatus(investmentProject),
        fundingGoalAmount,
        amountRaised,
        percentRaised: calculatePercentage(amountRaised, fundingGoalAmount),
        investorCount,
        completionPercentage: Number(Math.min(completedPercentage, 100).toFixed(2)),
        milestoneStats: {
            total: milestones.length,
            requestForFunding: milestones.filter(
                milestone => milestone.fundingStatus === 'request_for_funding'
            ).length,
            processingFunding: milestones.filter(
                milestone => milestone.fundingStatus === 'processing_funding'
            ).length,
            completed: milestones.filter(
                milestone => milestone.fundingStatus === 'completed'
            ).length
        },
        farmCategory: projectCategory || null,
        investmentTemplate: projectTemplate || null,
        milestones
    };
}

function addFarmResponseAliases(farm) {
    const farmObj = farm?.toJSON ? farm.toJSON() : farm;
    if (!farmObj) return farmObj;

    const investmentProjects = (farmObj.InvestmentProjects || []).map(formatInvestmentProject);
    const formattedMilestones = formatMilestoneAssignments(farmObj.SelectedMilestones || []);
    const documents = farmObj.Documents || [];
    const farmFields = { ...farmObj };
    delete farmFields.InvestmentProjects;
    delete farmFields.SelectedMilestones;
    const totalFundingGoalAmount = investmentProjects.reduce(
        (total, project) => total + project.fundingGoalAmount,
        0
    );
    const totalFundsRaised = investmentProjects.reduce(
        (total, project) => total + project.amountRaised,
        0
    );
    const weightedCompletion = investmentProjects.reduce((total, project) => {
        return total + (project.fundingGoalAmount * project.completionPercentage);
    }, 0);
    const farmInvestorIds = (farmObj.InvestmentProjects || []).flatMap(project =>
        (project.Payments || []).map(payment => payment.investorId)
    );

    return {
        ...farmFields,
        plotSize: farmObj.size === null || farmObj.size === undefined
            ? null
            : Number(farmObj.size),
        address: farmObj.location,
        investmentProjects,
        investmentProject: investmentProjects[0] || null,
        totalFundingGoalAmount,
        totalFundsRaised,
        percentRaised: calculatePercentage(totalFundsRaised, totalFundingGoalAmount),
        completionPercentage: totalFundingGoalAmount > 0
            ? Number((weightedCompletion / totalFundingGoalAmount).toFixed(2))
            : 0,
        investorCount: new Set(farmInvestorIds).size,
        selectedMilestone: formattedMilestones[0]
            || investmentProjects[0]?.milestones?.[0]
            || null,
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
                getInvestmentProjectInclude(),
                getSelectedMilestoneInclude(['id', 'isCompleted', 'amount']),
                {
                    model: FarmDocument,
                    as: 'Documents',
                    attributes: ['id', 'documentType', 'fileName', 'fileUrl', 'fileSize']
                }
            ],
            attributes: ['id', 'name', 'location', 'size', 'verificationStatus', 'createdAt', 'updatedAt'],
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
                getInvestmentProjectInclude(),
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

        // Map fileUrl to full URL for all documents
        let farmObj = farm.toJSON();
        if (farmObj.Documents && Array.isArray(farmObj.Documents)) {
            farmObj.Documents = farmObj.Documents.map(doc => ({
                ...doc,
                fileUrl: toBackendApiUrl(req, doc.fileUrl)
            }));
        }
        farmObj = addFarmResponseAliases(farmObj);
        const totalMilestones = farmObj.investmentProjects.reduce(
            (total, project) => total + project.milestoneStats.total,
            0
        );
        const completedMilestones = farmObj.investmentProjects.reduce(
            (total, project) => total + project.milestoneStats.completed,
            0
        );
        return res.success({
            ...farmObj,
            stats: {
                totalMilestones,
                completedMilestones,
                completionPercentage: farmObj.completionPercentage,
                totalInvestmentProjects: farmObj.investmentProjects.length,
                totalFundingGoalAmount: farmObj.totalFundingGoalAmount,
                totalFundsRaised: farmObj.totalFundsRaised,
                percentRaised: farmObj.percentRaised,
                investorCount: farmObj.investorCount
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
        const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        const location = firstDefined(req.body.address, req.body.location);
        const plotSize = firstDefined(req.body.plotSize, req.body.size);

        if (!userId) {
            return failFarmCreation(req, res, 'User not authenticated', 401);
        }

        if (!name) {
            return failFarmCreation(req, res, 'name is required', 400);
        }

        let parsedPlotSize = null;
        if (plotSize !== undefined && plotSize !== null && String(plotSize).trim() !== '') {
            const result = parseRequiredPositiveNumber(plotSize, 'plotSize');
            if (result.error) {
                return failFarmCreation(req, res, result.error, 400);
            }
            parsedPlotSize = result.value;
        }

        const photos = req.farmFiles?.pictures || [];
        const documents = req.farmFiles?.documents || [];

        transaction = await sequelize.transaction();

        const farm = await UserFarm.create({
            userId,
            name,
            location: location === undefined || location === null || String(location).trim() === ''
                ? null
                : String(location).trim(),
            size: parsedPlotSize,
            isActive: true,
            verificationStatus: 'pending'
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
        if (documentsToCreate.length > 0) {
            await FarmDocument.bulkCreate(documentsToCreate, { transaction });
        }

        await transaction.commit();
        transaction = null;

        const createdFarm = await UserFarm.findByPk(farm.id, {
            include: [
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

async function createInvestmentProject(req, res) {
    let transaction;

    try {
        const userId = req.user?.id;
        const { farmId } = req.params;
        const { farmCategoryId } = req.body;
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

        if (!farmCategoryId || String(farmCategoryId).trim() === '') {
            return res.fail('farmCategoryId is required', 400);
        }

        const { value: parsedFundingGoal, error: fundingGoalError } = parseRequiredPositiveNumber(
            fundingGoalAmount,
            'fundingGoalAmount'
        );
        if (fundingGoalError) {
            return res.fail(fundingGoalError, 400);
        }

        const farm = await UserFarm.findOne({
            where: {
                id: farmId,
                userId,
                isActive: true
            },
            attributes: ['id']
        });
        if (!farm) {
            return res.fail('Farm not found', 404);
        }

        const category = await FarmCategory.findOne({
            where: {
                id: String(farmCategoryId).trim(),
                isActive: true
            },
            attributes: ['id', 'name', 'description']
        });
        if (!category) {
            return res.fail('Active farm category not found', 404);
        }

        // The newest active admin template is the category's current template.
        const investmentTemplate = await Investment.findOne({
            where: {
                farmCategoryId: category.id,
                isActive: true
            },
            include: [{
                model: InvestmentMilestone,
                as: 'Milestones',
                required: false,
                where: { isActive: true },
                attributes: ['id', 'investmentId', 'name', 'fundReleasePercentage', 'order']
            }],
            order: [
                ['createdAt', 'DESC'],
                [{ model: InvestmentMilestone, as: 'Milestones' }, 'order', 'ASC']
            ]
        });
        if (!investmentTemplate) {
            return res.fail('No active investment template exists for this farm category', 404);
        }

        const fundingMinGoal = Number(investmentTemplate.fundingMinGoal);
        const fundingMaxGoal = Number(investmentTemplate.fundingMaxGoal);
        if (parsedFundingGoal < fundingMinGoal || parsedFundingGoal > fundingMaxGoal) {
            return res.fail(
                `fundingGoalAmount must be between ${fundingMinGoal} and ${fundingMaxGoal} ${investmentTemplate.currency}`,
                400
            );
        }

        const startDate = new Date().toISOString().slice(0, 10);
        const endDate = calculateInvestmentProjectEndDate(
            startDate,
            investmentTemplate.durationValue,
            investmentTemplate.durationUnit
        );

        transaction = await sequelize.transaction();
        const createdProject = await UserFarmInvestment.create({
            userFarmId: farm.id,
            farmCategoryId: category.id,
            investmentId: investmentTemplate.id,
            expectedInvestment: parsedFundingGoal,
            investmentReceived: 0,
            investmentPending: parsedFundingGoal,
            currency: investmentTemplate.currency,
            startDate,
            endDate,
            investmentStatus: 'not_started',
            notes: null,
            isActive: true
        }, { transaction });

        const templateMilestones = investmentTemplate.Milestones || [];
        if (templateMilestones.length > 0) {
            await UserFarmMilestone.bulkCreate(templateMilestones.map(milestone => ({
                userFarmId: farm.id,
                userFarmInvestmentId: createdProject.id,
                milestoneId: null,
                investmentMilestoneId: milestone.id,
                name: milestone.name,
                fundReleasePercentage: milestone.fundReleasePercentage,
                order: milestone.order,
                fundingStatus: 'request_for_funding',
                amount: calculatePercentageAmount(
                    parsedFundingGoal,
                    milestone.fundReleasePercentage
                ),
                isCompleted: false,
                completedAt: null
            })), { transaction });
        }

        await transaction.commit();
        transaction = null;

        const createdFarm = await UserFarm.findByPk(farm.id, {
            attributes: ['id', 'name', 'location', 'size', 'verificationStatus', 'createdAt', 'updatedAt'],
            include: [
                getInvestmentProjectInclude(),
                getSelectedMilestoneInclude()
            ]
        });

        const formattedFarm = addFarmResponseAliases(createdFarm);
        const formattedProject = formattedFarm.investmentProjects.find(
            project => project.id === createdProject.id
        );

        return res.success(
            formattedProject,
            'Investment project created successfully',
            201
        );
    } catch (error) {
        if (transaction) {
            await transaction.rollback();
        }
        console.error('Create investment project error:', error);
        return res.fail('Failed to create investment project', 500);
    }
}

async function updateFarm(req, res) {
    let transaction;

    try {
        const userId = req.user?.id;
        const { farmId } = req.params;
        const { name, isActive } = req.body;
        const location = firstDefined(req.body.address, req.body.location);
        const size = firstDefined(req.body.plotSize, req.body.size);

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

        if (name !== undefined && (!String(name).trim())) {
            return res.fail('name cannot be empty', 400);
        }
        if (location !== undefined && (!String(location).trim())) {
            return res.fail('address cannot be empty', 400);
        }

        transaction = await sequelize.transaction();
        if (name !== undefined) farm.name = String(name).trim();
        if (location !== undefined) farm.location = String(location).trim();
        if (parsedSize !== undefined) farm.size = parsedSize;
        if (isActive !== undefined) farm.isActive = isActive;

        await farm.save({ transaction });

        await transaction.commit();
        transaction = null;

        const updatedFarm = await UserFarm.findByPk(farm.id, {
            include: [
                getInvestmentProjectInclude()
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
    try {
        const userId = req.user?.id;
        const { farmId } = req.params;
        const requestedProjectId = firstDefined(
            req.body.investmentProjectId,
            req.body.userFarmInvestmentId
        );

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

        const investmentProjects = await UserFarmInvestment.findAll({
            where: {
                userFarmId: farm.id,
                isActive: true,
                ...(requestedProjectId ? { id: requestedProjectId } : {})
            },
            attributes: ['id', 'investmentId']
        });
        if (!requestedProjectId && investmentProjects.length > 1) {
            return res.fail('investmentProjectId is required when a farm has multiple projects', 400);
        }
        const investmentProject = investmentProjects[0];
        if (!investmentProject?.investmentId) {
            return res.fail('Investment project not found for this farm', 404);
        }

        const projectMilestone = await UserFarmMilestone.findOne({
            where: {
                userFarmInvestmentId: investmentProject.id,
                investmentMilestoneId: milestoneId
            }
        });

        if (!projectMilestone) {
            return res.fail(
                'Selected milestone is not part of this farm investment template',
                400
            );
        }

        if (projectMilestone.fundingStatus === 'completed') {
            return res.fail('Completed milestones cannot request funding again', 409);
        }

        if (projectMilestone.fundingStatus !== 'processing_funding') {
            await projectMilestone.update({
                fundingStatus: 'request_for_funding',
                isCompleted: false,
                completedAt: null
            });
        }

        const updatedFarm = await UserFarm.findByPk(farmId, {
            include: [
                getInvestmentProjectInclude(),
                getSelectedMilestoneInclude()
            ]
        });

        return res.success(
            addFarmResponseAliases(updatedFarm),
            'Milestone funding requested successfully'
        );
    } catch (error) {
        console.error('Request milestone funding error:', error);
        return res.fail('Failed to request milestone funding', 500);
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
        const investmentProjectId = firstDefined(
            req.query.investmentProjectId,
            req.body?.investmentProjectId
        );

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

        const matchingMilestones = await models.UserFarmMilestone.findAll({
            where: {
                userFarmId: farmId,
                ...(investmentProjectId ? { userFarmInvestmentId: investmentProjectId } : {}),
                [Op.or]: [
                    { id: milestoneId },
                    { milestoneId },
                    { investmentMilestoneId: milestoneId }
                ]
            },
            attributes: ['id', 'userFarmInvestmentId']
        });

        if (matchingMilestones.length === 0) {
            return res.fail('Milestone not found for this farm', 404);
        }

        if (!investmentProjectId && matchingMilestones.length > 1) {
            return res.fail(
                'investmentProjectId is required because this milestone belongs to multiple projects',
                400
            );
        }

        if (matchingMilestones.some(milestone => milestone.userFarmInvestmentId)) {
            return res.fail(
                'Forked investment project milestones cannot be removed',
                409
            );
        }

        await models.UserFarmMilestone.destroy({
            where: { id: matchingMilestones.map(milestone => milestone.id) }
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
    createInvestmentProject,
    updateFarm,
    deleteFarm,
    addMilestonesToFarm,
    uploadFarmDocumentsToFarm,
    deleteFarmDocument,
    removeMilestoneFromFarm
};
