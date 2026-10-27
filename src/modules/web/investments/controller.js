'use strict';

const { randomBytes } = require('crypto');
const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const { Op } = require('sequelize');
const { toBackendApiUrl } = require('../../../utils/url');
const { resolveInvestmentProjectStatus } = require('../../../utils/investmentProject');
const {
    InvestmentTermsError, buildInvestmentQuote, buildInvestmentAgreement,
    validateAgreementAcceptance, acceptInvestmentAgreement, assertSameAgreement
} = require('../../../utils/investmentAgreement');
const models = defineModels(sequelize);
const {
    Investment,
    FarmCategory,
    UserFarm,
    UserFarmInvestment,
    InvestmentPayment,
    User,
    KYC,
    FarmDocument,
    UserFarmMilestone,
    Milestone,
    InvestmentMilestone
} = models;

const FUNDED_PAYMENT_STATUSES = ['recorded', 'successful'];

const DURATION_UNITS = ['weeks', 'months', 'years'];
const RISK_LEVELS = ['low', 'medium', 'high'];

function firstDefined(...values) {
    return values.find(value => value !== undefined);
}

function toMoney(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function toMoneyCents(value) {
    const normalized = String(value ?? '').trim();
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;

    const amount = Number(normalized);
    const cents = Math.round(amount * 100);
    return Number.isFinite(amount) && Number.isSafeInteger(cents) ? cents : null;
}

function fromMoneyCents(value) {
    return Number((value / 100).toFixed(2));
}

function generatePaymentReference() {
    return `SMILE${randomBytes(12).toString('hex').toUpperCase()}`;
}

function getIdempotencyKey(req) {
    const value = req.get('Idempotency-Key') || req.body?.idempotencyKey;
    if (value === undefined || value === null || String(value).trim() === '') return null;

    if (typeof value !== 'string') return undefined;
    const key = value.trim();
    return key.length <= 100 ? key : undefined;
}

function formatInvestmentPayment(payment) {
    const data = payment.toJSON ? payment.toJSON() : payment;
    return {
        id: data.id,
        transactionId: data.id,
        reference: data.reference,
        farmId: data.userFarmId,
        investmentProjectId: data.userFarmInvestmentId,
        investmentTemplateId: data.investmentId,
        amount: toMoney(data.amount),
        currency: data.currency,
        gateway: data.gateway,
        gatewayReference: data.gatewayReference,
        gatewayTransactionId: data.gatewayTransactionId,
        accessCode: data.accessCode,
        authorizationUrl: data.authorizationUrl,
        status: data.status,
        paidAt: data.paidAt,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
    };
}

function formatFundingSummary(farmId, farmInvestment, totalExpectedFunding) {
    const fundingReceived = toMoney(farmInvestment.investmentReceived);
    const expectedFunding = toMoney(totalExpectedFunding);
    return {
        farmId,
        investmentProjectId: farmInvestment.id,
        fundingReceived,
        totalExpectedFunding: expectedFunding,
        remainingFunding: Math.max(Number((expectedFunding - fundingReceived).toFixed(2)), 0),
        percentFunded: getPercentFunded(fundingReceived, expectedFunding),
        investmentStatus: resolveInvestmentProjectStatus(farmInvestment),
        fundingStatus: getFundingStatus(fundingReceived, expectedFunding)
    };
}

class InvestmentRequestError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = 'InvestmentRequestError';
        this.statusCode = statusCode;
    }
}

function normalizeDurationUnit(value) {
    const unit = String(value || '').trim().toLowerCase();
    if (['week', 'weeks'].includes(unit)) return 'weeks';
    if (['month', 'months'].includes(unit)) return 'months';
    if (['year', 'years'].includes(unit)) return 'years';
    return null;
}

function parsePositiveInteger(value, fieldName, errors) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        errors.push(`${fieldName} must be a positive integer`);
        return null;
    }

    return parsed;
}

function parseDurationFilter(query, errors) {
    const filter = {};
    const duration = query.duration;

    if (duration !== undefined && duration !== null && duration !== '') {
        const normalizedDuration = String(duration).trim().toLowerCase().replace(/_/g, ' ');
        const durationMatch = normalizedDuration.match(/^(\d+)\s+([a-z]+)$/);

        if (durationMatch) {
            filter.durationValue = parsePositiveInteger(durationMatch[1], 'duration', errors);
            const durationUnit = normalizeDurationUnit(durationMatch[2]);
            if (!durationUnit) {
                errors.push('duration unit must be one of weeks, months, years');
            } else {
                filter.durationUnit = durationUnit;
            }
        } else if (/^\d+$/.test(normalizedDuration)) {
            filter.durationValue = parsePositiveInteger(normalizedDuration, 'duration', errors);
        } else {
            const durationUnit = normalizeDurationUnit(normalizedDuration);
            if (!durationUnit) {
                errors.push('duration must be a number, a duration unit, or a value like "6 months"');
            } else {
                filter.durationUnit = durationUnit;
            }
        }
    }

    if (query.durationValue !== undefined && query.durationValue !== null && query.durationValue !== '') {
        filter.durationValue = parsePositiveInteger(query.durationValue, 'durationValue', errors);
    }

    if (query.durationUnit !== undefined && query.durationUnit !== null && query.durationUnit !== '') {
        const durationUnit = normalizeDurationUnit(query.durationUnit);
        if (!durationUnit) {
            errors.push('durationUnit must be one of weeks, months, years');
        } else {
            filter.durationUnit = durationUnit;
        }
    }

    return filter;
}

function normalizeRiskLevel(value, errors) {
    if (value === undefined || value === null || value === '') return null;

    const riskLevel = String(value).trim().toLowerCase();
    if (!RISK_LEVELS.includes(riskLevel)) {
        errors.push('riskLevel must be one of low, medium, high');
        return null;
    }

    return riskLevel;
}

function normalizeFundingStatuses(value, errors) {
    if (value === undefined || value === null || value === '') return null;

    const fundingStatus = String(value).trim().toLowerCase().replace(/[-\s]+/g, '_');
    const aliases = {
        not_started: ['not_started'],
        pending: ['not_started'],
        unfunded: ['not_started'],
        funding_started: ['funding_started'],
        partial: ['funding_started'],
        partially_funded: ['funding_started'],
        active: ['active'],
        funded: ['active'],
        fully_funded: ['active'],
        completed: ['completed'],
        complete: ['completed'],
        open: ['not_started', 'funding_started', 'active']
    };

    if (!aliases[fundingStatus]) {
        errors.push('investmentStatus must be one of not_started, funding_started, active, completed, or open');
        return null;
    }

    return aliases[fundingStatus];
}

function getPercentFunded(fundingReceived, totalExpectedFunding) {
    if (totalExpectedFunding <= 0) return 0;
    const percent = (fundingReceived / totalExpectedFunding) * 100;
    return Number(Math.min(percent, 100).toFixed(2));
}

function getFundingStatus(fundingReceived, totalExpectedFunding) {
    if (totalExpectedFunding > 0 && fundingReceived >= totalExpectedFunding) return 'funded';
    if (fundingReceived > 0) return 'partial';
    return 'not_started';
}

function formatFarmImage(req, document) {
    const data = document.toJSON ? document.toJSON() : document;
    return {
        id: data.id,
        documentType: data.documentType,
        fileName: data.fileName,
        fileUrl: toBackendApiUrl(req, data.fileUrl),
        fileSize: data.fileSize ?? null,
        mimeType: data.mimeType,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
    };
}

function getMilestoneStatus(milestone) {
    if (milestone.fundingStatus) return milestone.fundingStatus;
    return milestone.isCompleted ? 'completed' : 'not_requested';
}

function formatFarmMilestones(milestones = []) {
    const sortedMilestones = [...milestones].sort((a, b) => {
        const aData = a.toJSON ? a.toJSON() : a;
        const bData = b.toJSON ? b.toJSON() : b;
        const aOrder = aData.order
            ?? (aData.InvestmentMilestone || aData.Milestone)?.order
            ?? Number.MAX_SAFE_INTEGER;
        const bOrder = bData.order
            ?? (bData.InvestmentMilestone || bData.Milestone)?.order
            ?? Number.MAX_SAFE_INTEGER;

        if (aOrder !== bOrder) return aOrder - bOrder;
        return new Date(aData.createdAt || 0) - new Date(bData.createdAt || 0);
    });
    const formattedMilestones = sortedMilestones.map(milestone => {
        const data = milestone.toJSON ? milestone.toJSON() : milestone;
        const milestoneData = data.InvestmentMilestone || data.Milestone || {};
        const status = getMilestoneStatus(data);

        return {
            id: data.id,
            userFarmMilestoneId: data.id,
            investmentProjectId: data.userFarmInvestmentId || null,
            milestoneId: data.investmentMilestoneId || data.milestoneId,
            milestoneType: data.investmentMilestoneId
                ? 'investment_template'
                : 'farm_category',
            name: data.name || milestoneData.name || null,
            order: data.order ?? milestoneData.order ?? null,
            fundReleasePercentage: data.fundReleasePercentage === null
                || data.fundReleasePercentage === undefined
                ? (milestoneData.fundReleasePercentage === undefined
                    ? null
                    : toMoney(milestoneData.fundReleasePercentage))
                : toMoney(data.fundReleasePercentage),
            allocatedAmount: data.amount === undefined
                ? null
                : toMoney(data.amount),
            amount: toMoney(data.amount),
            isCompleted: !!data.isCompleted,
            status,
            completedAt: data.completedAt,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt
        };
    });
    const completedMilestones = formattedMilestones.filter(milestone => milestone.status === 'completed').length;
    const processingFundingMilestones = formattedMilestones.filter(
        milestone => milestone.status === 'processing_funding'
    ).length;
    const requestForFundingMilestones = formattedMilestones.filter(
        milestone => milestone.status === 'request_for_funding'
    ).length;
    const totalMilestones = formattedMilestones.length;
    const completionPercentage = formattedMilestones.reduce((total, milestone) => {
        return milestone.status === 'completed'
            ? total + Number(milestone.fundReleasePercentage || 0)
            : total;
    }, 0);

    return {
        milestones: formattedMilestones,
        stats: {
            totalMilestones,
            completedMilestones,
            processingFundingMilestones,
            requestForFundingMilestones,
            completionPercentage: Number(Math.min(completionPercentage, 100).toFixed(2))
        }
    };
}

function formatOwner(req, owner) {
    if (!owner) return null;

    return {
        id: owner.id,
        name: owner.fullName || 'N/A',
        fullName: owner.fullName || 'N/A',
        bio: owner.bio || null,
        profileImageUrl: toBackendApiUrl(req, owner.profileImageUrl),
        rating: {
            average: null,
            count: 0
        }
    };
}

function formatInvestmentTemplate(template) {
    if (!template) return null;

    return {
        id: template.id,
        farmCategoryId: template.farmCategoryId,
        name: template.name,
        description: template.description || null,
        roiPercentage: toMoney(template.roiPercentage),
        duration: {
            value: template.durationValue,
            unit: template.durationUnit,
            label: template.durationValue && template.durationUnit
                ? `${template.durationValue} ${template.durationUnit}`
                : null
        },
        riskLevel: template.riskLevel || 'medium',
        fundingMinGoal: toMoney(template.fundingMinGoal),
        fundingMaxGoal: toMoney(template.fundingMaxGoal),
        investmentMinGoal: toMoney(template.investmentMinGoal),
        investmentMaxGoal: toMoney(template.investmentMaxGoal),
        currency: template.currency,
        isActive: template.isActive,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt
    };
}

function formatInvestmentProject(project, options = {}) {
    const { includeMilestones = false } = options;
    const data = project?.toJSON ? project.toJSON() : (project || {});
    const template = data.InvestmentTemplate || null;
    const projectPayments = Array.isArray(data.Payments) ? data.Payments : [];
    const investorCount = new Set(
        projectPayments.map(payment => payment.investorId).filter(Boolean)
    ).size;
    const fundingGoalAmount = toMoney(data.expectedInvestment);
    const amountRaised = toMoney(data.investmentReceived);
    const { milestones, stats: milestoneStats } = formatFarmMilestones(
        data.ProjectMilestones || []
    );

    const formattedProject = {
        id: data.id,
        investmentProjectId: data.id,
        farmId: data.userFarmId,
        farmCategory: data.Category ? {
            id: data.Category.id,
            name: data.Category.name,
            description: data.Category.description || null
        } : null,
        investmentTemplate: formatInvestmentTemplate(template),
        fundingGoalAmount,
        totalExpectedFunding: fundingGoalAmount,
        amountRaised,
        fundingReceived: amountRaised,
        remainingFunding: Math.max(Number((fundingGoalAmount - amountRaised).toFixed(2)), 0),
        percentRaised: getPercentFunded(amountRaised, fundingGoalAmount),
        percentFunded: getPercentFunded(amountRaised, fundingGoalAmount),
        investorCount,
        numberOfInvestors: investorCount,
        completionPercentage: milestoneStats.completionPercentage,
        milestoneStats,
        roi: toMoney(template?.roiPercentage),
        roiPercentage: toMoney(template?.roiPercentage),
        duration: formatInvestmentTemplate(template)?.duration || null,
        riskLevel: template?.riskLevel || 'medium',
        minimumInvest: toMoney(template?.investmentMinGoal),
        startDate: data.startDate,
        endDate: data.endDate,
        investmentStatus: resolveInvestmentProjectStatus(data),
        fundingStatus: getFundingStatus(amountRaised, fundingGoalAmount),
        currency: data.currency || template?.currency,
        notes: data.notes || null,
        isActive: !!data.isActive,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
    };

    if (includeMilestones) {
        formattedProject.milestones = milestones;
    }

    return formattedProject;
}

function formatInvestmentFarm(req, farm, options = {}) {
    const {
        includeMilestones = false,
        includeInactiveProjects = true
    } = options;
    const data = farm.toJSON ? farm.toJSON() : farm;
    const documents = (data.Documents || []).map(document => formatFarmImage(req, document));
    const images = documents.filter(document => document.documentType === 'picture');
    const image = images[0] || null;
    const rawProjects = (Array.isArray(data.InvestmentProjects)
        ? data.InvestmentProjects
        : []).filter(project => includeInactiveProjects || project.isActive);
    const investmentProjects = rawProjects.map(project =>
        formatInvestmentProject(project, { includeMilestones })
    );
    const activeInvestmentProjects = investmentProjects.filter(project => project.isActive);
    const activeRawProjects = rawProjects.filter(project => project.isActive);
    const totalFundingAmount = activeInvestmentProjects.reduce(
        (total, project) => total + project.fundingGoalAmount,
        0
    );
    const amountRaised = activeInvestmentProjects.reduce(
        (total, project) => total + project.amountRaised,
        0
    );
    const weightedCompletion = activeInvestmentProjects.reduce(
        (total, project) => total + (project.fundingGoalAmount * project.completionPercentage),
        0
    );
    const investorIds = activeRawProjects.flatMap(project =>
        (project.Payments || []).map(payment => payment.investorId).filter(Boolean)
    );
    const investorCount = new Set(investorIds).size;
    const owner = formatOwner(req, data.User);
    const projectCurrencies = [...new Set(
        activeInvestmentProjects.map(project => project.currency).filter(Boolean)
    )];
    const currency = projectCurrencies.length === 1
        ? projectCurrencies[0]
        : (projectCurrencies.length > 1 ? 'MIXED' : null);

    return {
        id: data.id,
        farmId: data.id,
        farmName: data.name,
        name: data.name,
        location: data.location,
        size: data.size,
        isActive: data.isActive,
        verificationStatus: data.verificationStatus,
        farmVerificationStatus: data.verificationStatus,
        owner,
        farmOwner: owner,
        farmOwnerName: owner?.name || 'N/A',
        rating: owner?.rating.average ?? null,
        ratingCount: owner?.rating.count ?? 0,
        image,
        imageUrl: image?.fileUrl || null,
        images,
        documents,
        investmentProjectCount: investmentProjects.length,
        numberOfInvestmentProjects: investmentProjects.length,
        activeInvestmentProjectCount: activeInvestmentProjects.length,
        investorCount,
        numberOfInvestors: investorCount,
        totalFundingAmount,
        totalFundingGoalAmount: totalFundingAmount,
        totalExpectedFunding: totalFundingAmount,
        amountRaised,
        fundingReceived: amountRaised,
        totalFundsRaised: amountRaised,
        remainingFunding: Math.max(Number((totalFundingAmount - amountRaised).toFixed(2)), 0),
        percentRaised: getPercentFunded(amountRaised, totalFundingAmount),
        percentFunded: getPercentFunded(amountRaised, totalFundingAmount),
        completionPercentage: totalFundingAmount > 0
            ? Number((weightedCompletion / totalFundingAmount).toFixed(2))
            : 0,
        currency,
        fundingAcrossActiveProjects: {
            projectCount: activeInvestmentProjects.length,
            totalFundingAmount,
            amountRaised,
            remainingFunding: Math.max(Number((totalFundingAmount - amountRaised).toFixed(2)), 0),
            percentRaised: getPercentFunded(amountRaised, totalFundingAmount),
            investorCount,
            currency
        },
        investmentProjects,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        lastViewed: null
    };
}

async function getInvestments(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
        const offset = (page - 1) * limit;
        const search = req.query.search ? String(req.query.search).trim() : '';
        const location = firstDefined(req.query.location, req.query.locatin);
        const farmCategoryId = firstDefined(req.query.farmCategoryId, req.query.categoryId);
        const fundingStatus = firstDefined(req.query.fundingStatus, req.query.investmentStatus);
        const errors = [];

        const templateWhere = {};
        const farmWhere = {
            isActive: true,
            verificationStatus: 'approved',
            userId: {
                [Op.in]: sequelize.literal("(SELECT user_id FROM kyc WHERE status = 'approved')")
            }
        };

        if (farmCategoryId) templateWhere.farmCategoryId = farmCategoryId;

        const riskLevel = normalizeRiskLevel(req.query.riskLevel, errors);
        if (riskLevel) templateWhere.riskLevel = riskLevel;

        Object.assign(templateWhere, parseDurationFilter(req.query, errors));

        for (const [minKey, maxKey, minField, maxField] of [
            ['minRoi', 'maxRoi', 'roiPercentage', 'roiPercentage'],
            ['minInvestment', 'maxInvestment', 'investmentMaxGoal', 'investmentMinGoal']
        ]) {
            const parse = key => {
                if (req.query[key] === undefined) return undefined;
                const value = req.query[key];
                if (typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(value)
                    || !Number.isFinite(Number(value))) {
                    errors.push(`${key} must be a non-negative number with at most two decimal places`);
                    return undefined;
                }
                return Number(value);
            };
            const min = parse(minKey);
            const max = parse(maxKey);
            if (min !== undefined && max !== undefined && min > max) errors.push(`${minKey} cannot exceed ${maxKey}`);
            if (min !== undefined) templateWhere[minField] = { ...templateWhere[minField], [Op.gte]: min };
            if (max !== undefined) templateWhere[maxField] = { ...templateWhere[maxField], [Op.lte]: max };
        }

        const fundingStatuses = normalizeFundingStatuses(fundingStatus, errors);

        if (search) {
            farmWhere[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { location: { [Op.iLike]: `%${search}%` } }
            ];
        }

        if (location !== undefined && location !== null && String(location).trim() !== '') {
            farmWhere.location = {
                [Op.iLike]: `%${String(location).trim()}%`
            };
        }

        if (errors.length > 0) {
            return res.fail(errors.join(', '), 400);
        }

        const farmInvestmentWhere = {
            isActive: true
        };

        if (farmCategoryId) {
            farmInvestmentWhere.farmCategoryId = farmCategoryId;
        }

        if (fundingStatuses) {
            const today = new Date().toISOString().slice(0, 10);
            const includesCompleted = fundingStatuses.includes('completed');
            const currentStatuses = fundingStatuses.filter(status => status !== 'completed');

            if (includesCompleted && currentStatuses.length > 0) {
                farmInvestmentWhere[Op.or] = [
                    { investmentStatus: 'completed' },
                    { endDate: { [Op.lte]: today } },
                    {
                        investmentStatus: { [Op.in]: currentStatuses },
                        endDate: { [Op.gt]: today }
                    }
                ];
            } else if (includesCompleted) {
                farmInvestmentWhere[Op.or] = [
                    { investmentStatus: 'completed' },
                    { endDate: { [Op.lte]: today } }
                ];
            } else {
                farmInvestmentWhere.investmentStatus = { [Op.in]: currentStatuses };
                farmInvestmentWhere.endDate = { [Op.gt]: today };
            }
        }

        const matchingProjects = await UserFarmInvestment.findAll({
            where: farmInvestmentWhere,
            include: [
                {
                    model: Investment,
                    as: 'InvestmentTemplate',
                    attributes: [],
                    required: true,
                    where: templateWhere
                }
            ],
            attributes: ['id', 'userFarmId'],
            raw: true
        });

        const matchingFarmIds = [...new Set(matchingProjects.map(project => project.userFarmId))];
        farmWhere.id = { [Op.in]: matchingFarmIds };

        const { count, rows: farms } = await UserFarm.findAndCountAll({
            where: farmWhere,
            attributes: [
                'id',
                'userId',
                'name',
                'location',
                'size',
                'isActive',
                'verificationStatus',
                'createdAt',
                'updatedAt'
            ],
            include: [
                {
                    model: User,
                    as: 'User',
                    attributes: ['id', 'fullName', 'bio', 'profileImageUrl'],
                    required: true
                },
                {
                    model: FarmDocument,
                    as: 'Documents',
                    attributes: [
                        'id',
                        'documentType',
                        'fileName',
                        'fileUrl',
                        'fileSize',
                        'mimeType',
                        'createdAt',
                        'updatedAt'
                    ],
                    required: false,
                    separate: true,
                    order: [['createdAt', 'ASC']]
                },
                {
                    model: UserFarmInvestment,
                    as: 'InvestmentProjects',
                    attributes: [
                        'id',
                        'userFarmId',
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
                    ],
                    required: true,
                    separate: true,
                    order: [['createdAt', 'DESC']],
                    include: [
                        {
                            model: FarmCategory,
                            as: 'Category',
                            attributes: ['id', 'name', 'description'],
                            required: false
                        },
                        {
                            model: Investment,
                            as: 'InvestmentTemplate',
                            attributes: [
                                'id',
                                'farmCategoryId',
                                'name',
                                'description',
                                'roiPercentage',
                                'durationValue',
                                'durationUnit',
                                'riskLevel',
                                'fundingMinGoal',
                                'fundingMaxGoal',
                                'investmentMinGoal',
                                'investmentMaxGoal',
                                'currency',
                                'isActive',
                                'createdAt',
                                'updatedAt'
                            ],
                            required: false
                        },
                        {
                            model: UserFarmMilestone,
                            as: 'ProjectMilestones',
                            attributes: [
                                'id',
                                'userFarmInvestmentId',
                                'milestoneId',
                                'investmentMilestoneId',
                                'name',
                                'fundReleasePercentage',
                                'order',
                                'fundingStatus',
                                'isCompleted',
                                'completedAt',
                                'amount',
                                'createdAt',
                                'updatedAt'
                            ],
                            required: false,
                            separate: true
                        },
                        {
                            model: InvestmentPayment,
                            as: 'Payments',
                            attributes: ['investorId'],
                            where: { status: { [Op.in]: FUNDED_PAYMENT_STATUSES } },
                            required: false,
                            separate: true
                        }
                    ]
                }
            ],
            distinct: true,
            order: [['createdAt', 'DESC']],
            limit,
            offset
        });

        const investments = farms.map(farm =>
            formatInvestmentFarm(req, farm, {
                includeMilestones: false,
                includeInactiveProjects: false
            })
        );
        const totalPages = Math.ceil(count / limit);

        return res.success({
            investments,
            farms: investments,
            pagination: {
                page,
                limit,
                total: count,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
                startIndex: count === 0 ? 0 : offset + 1,
                endIndex: Math.min(offset + investments.length, count)
            }
        }, 'Investments retrieved successfully');
    } catch (error) {
        console.error('Get user investments error:', error);
        return res.fail('Failed to retrieve investments', 500);
    }
}

async function getInvestmentById(req, res) {
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
                isActive: true,
                verificationStatus: 'approved',
                userId: {
                    [Op.in]: sequelize.literal("(SELECT user_id FROM kyc WHERE status = 'approved')")
                }
            },
            attributes: [
                'id',
                'userId',
                'name',
                'location',
                'size',
                'isActive',
                'verificationStatus',
                'createdAt',
                'updatedAt'
            ],
            include: [
                {
                    model: User,
                    as: 'User',
                    attributes: ['id', 'fullName', 'bio', 'profileImageUrl'],
                    required: true
                },
                {
                    model: FarmDocument,
                    as: 'Documents',
                    attributes: [
                        'id',
                        'documentType',
                        'fileName',
                        'fileUrl',
                        'fileSize',
                        'mimeType',
                        'createdAt',
                        'updatedAt'
                    ],
                    required: false,
                    separate: true,
                    order: [['createdAt', 'ASC']]
                },
                {
                    model: UserFarmInvestment,
                    as: 'InvestmentProjects',
                    attributes: [
                        'id',
                        'userFarmId',
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
                    ],
                    required: true,
                    separate: true,
                    order: [['createdAt', 'DESC']],
                    include: [
                        {
                            model: FarmCategory,
                            as: 'Category',
                            attributes: ['id', 'name', 'description'],
                            required: false
                        },
                        {
                            model: Investment,
                            as: 'InvestmentTemplate',
                            attributes: [
                                'id',
                                'farmCategoryId',
                                'name',
                                'description',
                                'roiPercentage',
                                'durationValue',
                                'durationUnit',
                                'riskLevel',
                                'fundingMinGoal',
                                'fundingMaxGoal',
                                'investmentMinGoal',
                                'investmentMaxGoal',
                                'currency',
                                'isActive',
                                'createdAt',
                                'updatedAt'
                            ],
                            required: false
                        },
                        {
                            model: UserFarmMilestone,
                            as: 'ProjectMilestones',
                            attributes: [
                                'id',
                                'userFarmInvestmentId',
                                'milestoneId',
                                'investmentMilestoneId',
                                'name',
                                'fundReleasePercentage',
                                'order',
                                'fundingStatus',
                                'isCompleted',
                                'completedAt',
                                'amount',
                                'createdAt',
                                'updatedAt'
                            ],
                            required: false,
                            separate: true,
                            order: [['order', 'ASC'], ['createdAt', 'ASC']]
                        },
                        {
                            model: InvestmentPayment,
                            as: 'Payments',
                            attributes: ['investorId'],
                            where: { status: { [Op.in]: FUNDED_PAYMENT_STATUSES } },
                            required: false,
                            separate: true
                        }
                    ]
                }
            ]
        });

        if (!farm || !Array.isArray(farm.InvestmentProjects)
            || farm.InvestmentProjects.length === 0) {
            return res.fail('Verified investment farm not found', 404);
        }

        return res.success(
            formatInvestmentFarm(req, farm, { includeMilestones: true }),
            'Investment farm details retrieved successfully'
        );
    } catch (error) {
        console.error('Get user investment farm details error:', error);
        return res.fail('Failed to retrieve investment farm details', 500);
    }
}

async function investInFarm(req, res) {
    let savedPayment;
    try {
        const investorId = req.user?.id;
        const { investmentProjectId } = req.params;
        const amountValue = firstDefined(req.body?.amount, req.body?.investmentAmount);
        const amountInCents = toMoneyCents(amountValue);
        const requestedCurrency = req.body?.currency
            ? String(req.body.currency).trim().toUpperCase()
            : null;
        const idempotencyKey = getIdempotencyKey(req);

        if (!investorId) {
            return res.fail('User not authenticated', 401);
        }

        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(investmentProjectId || '')) {
            return res.fail('investmentProjectId must be a valid UUID', 400);
        }

        if (amountInCents === null || amountInCents <= 0) {
            return res.fail('amount must be a positive number with no more than two decimal places', 400);
        }

        if (requestedCurrency !== 'NGN') return res.fail('Investment currency must be NGN', 400);

        if (idempotencyKey === undefined) {
            return res.fail('Idempotency key must be a string of at most 100 characters', 400);
        }

        if (!idempotencyKey) return res.fail('Idempotency-Key or idempotencyKey is required', 400);
        validateAgreementAcceptance(req.body?.agreementAcceptance);

        const usePaypetal = require('../../../utils/paypetal').settings().provider === 'paypetal';
        if (!usePaypetal) return res.fail('Paystack investments are temporarily disabled', 503);
        require('../../../utils/paypetal').requireEnabled();
        const paymentService = require('../../../services/payments/service').getPaymentService();
        await paymentService.verifiedProfile(investorId);

        const investor = await User.findByPk(investorId, {
            attributes: ['id', 'email', 'fullName']
        });
        if (!investor) return res.fail('Investor not found', 404);

        const approvedKyc = await KYC.findOne({
            where: {
                userId: investorId,
                status: 'approved'
            },
            attributes: ['id']
        });

        if (!approvedKyc) {
            return res.fail('Approved KYC is required before investing', 403);
        }

        const result = await sequelize.transaction(async transaction => {
            const farmInvestment = await UserFarmInvestment.findOne({
                where: {
                    id: investmentProjectId,
                    isActive: true
                },
                transaction,
                lock: transaction.LOCK.UPDATE
            });

            if (!farmInvestment) {
                throw new InvestmentRequestError('Investment project not found or is not available', 404);
            }

            const farm = await UserFarm.findOne({
                where: {
                    id: farmInvestment.userFarmId,
                    isActive: true,
                    verificationStatus: 'approved',
                    userId: {
                        [Op.in]: sequelize.literal("(SELECT user_id FROM kyc WHERE status = 'approved')")
                    }
                },
                attributes: ['id', 'userId', 'name'],
                transaction,
                lock: transaction.LOCK.UPDATE
            });

            if (!farm) {
                throw new InvestmentRequestError('Investment farm not found or is not available', 404);
            }

            if (farm.userId === investorId) {
                throw new InvestmentRequestError('You cannot invest in your own farm', 403);
            }

            const investmentTemplate = await Investment.findOne({
                where: {
                    id: farmInvestment.investmentId,
                    isActive: true
                },
                attributes: [
                    'id',
                    'investmentMinGoal',
                    'investmentMaxGoal',
                    'fundingMaxGoal',
                    'currency',
                    'name', 'roiPercentage', 'durationValue', 'durationUnit', 'riskLevel', 'isActive',
                    'createdAt'
                ],
                order: [['createdAt', 'DESC']],
                transaction,
                lock: transaction.LOCK.SHARE
            });

            if (!investmentTemplate) {
                throw new InvestmentRequestError('Investment template not found for this farm category', 404);
            }

            const totalExpectedInCents = toMoneyCents(
                farmInvestment.expectedInvestment ?? investmentTemplate.fundingMaxGoal
            );
            const fundingReceivedInCents = toMoneyCents(farmInvestment.investmentReceived) ?? 0;
            const minimumInvestmentInCents = toMoneyCents(investmentTemplate.investmentMinGoal) ?? 0;
            const maximumInvestmentInCents = toMoneyCents(investmentTemplate.investmentMaxGoal);

            if (totalExpectedInCents === null || totalExpectedInCents <= 0) {
                throw new InvestmentRequestError('This farm does not have a valid funding target', 409);
            }

            if (idempotencyKey) {
                const existingPayment = await InvestmentPayment.findOne({
                    where: {
                        investorId,
                        idempotencyKey
                    },
                    transaction
                });

                if (existingPayment) {
                    assertSameAgreement(existingPayment, req.body.agreementAcceptance);
                    const existingAmountInCents = toMoneyCents(existingPayment.amount);
                    if (
                        existingPayment.userFarmInvestmentId !== farmInvestment.id
                        || existingAmountInCents !== amountInCents
                        || (requestedCurrency && requestedCurrency !== existingPayment.currency)
                    ) {
                        throw new InvestmentRequestError(
                            'This Idempotency-Key has already been used for another investment request',
                            409
                        );
                    }

                    return {
                        payment: existingPayment,
                        farmInvestment,
                        totalExpectedFunding: fromMoneyCents(totalExpectedInCents),
                        created: false
                    };
                }
            }

            if (resolveInvestmentProjectStatus(farmInvestment) === 'completed') {
                throw new InvestmentRequestError('This investment project has been completed', 409);
            }

            const pendingReservation = await InvestmentPayment.sum('amount', {
                where: {
                    userFarmInvestmentId: farmInvestment.id,
                    status: 'pending'
                },
                transaction
            });
            const pendingReservationInCents = toMoneyCents(pendingReservation || 0) || 0;
            const remainingFundingInCents = Math.max(
                totalExpectedInCents - fundingReceivedInCents - pendingReservationInCents,
                0
            );
            if (remainingFundingInCents === 0) {
                throw new InvestmentRequestError(
                    'This farm has no unreserved funding remaining',
                    409
                );
            }

            if (amountInCents < minimumInvestmentInCents && amountInCents !== remainingFundingInCents) {
                throw new InvestmentRequestError(
                    `Minimum investment is ${fromMoneyCents(minimumInvestmentInCents)}`,
                    400
                );
            }

            if (maximumInvestmentInCents !== null && amountInCents > maximumInvestmentInCents) {
                throw new InvestmentRequestError(
                    `Maximum investment is ${fromMoneyCents(maximumInvestmentInCents)}`,
                    400
                );
            }

            if (amountInCents > remainingFundingInCents) {
                throw new InvestmentRequestError(
                    `Investment amount exceeds the remaining funding of ${fromMoneyCents(remainingFundingInCents)}`,
                    409
                );
            }

            const currency = String(
                farmInvestment.currency || investmentTemplate.currency || 'NGN'
            ).toUpperCase();

            if (requestedCurrency && requestedCurrency !== currency) {
                throw new InvestmentRequestError(`Investment currency must be ${currency}`, 400);
            }

            await paymentService.acceptingProject(farmInvestment, investorId, transaction);

            const reference = generatePaymentReference();
            const agreement = acceptInvestmentAgreement(buildInvestmentAgreement(buildInvestmentQuote({
                farm, project: farmInvestment, template: investmentTemplate,
                amount: amountValue, pendingAmount: pendingReservation || 0
            })), req.body.agreementAcceptance, investorId);
            const paymentDefaults = {
                investorId,
                userFarmId: farm.id,
                userFarmInvestmentId: farmInvestment.id,
                investmentId: investmentTemplate.id,
                reference,
                idempotencyKey,
                amount: fromMoneyCents(amountInCents),
                currency,
                gateway: 'paypetal',
                gatewayReference: reference,
                gatewayTransactionId: null,
                accessCode: null,
                authorizationUrl: null,
                status: 'pending',
                paidAt: null,
                agreement,
                gatewayResponse: {
                    initializationStatus: 'created'
                }
            };

            let payment;
            let created = true;

            if (idempotencyKey) {
                [payment, created] = await InvestmentPayment.findOrCreate({
                    where: {
                        investorId,
                        idempotencyKey
                    },
                    defaults: paymentDefaults,
                    transaction
                });

                if (!created) {
                    assertSameAgreement(payment, req.body.agreementAcceptance);
                    const existingAmountInCents = toMoneyCents(payment.amount);
                    if (
                        payment.userFarmInvestmentId !== farmInvestment.id
                        || existingAmountInCents !== amountInCents
                        || (requestedCurrency && requestedCurrency !== payment.currency)
                    ) {
                        throw new InvestmentRequestError(
                            'This Idempotency-Key has already been used for another investment request',
                            409
                        );
                    }

                    return {
                        payment,
                        farmInvestment,
                        totalExpectedFunding: fromMoneyCents(totalExpectedInCents),
                        created: false
                    };
                }
            } else {
                payment = await InvestmentPayment.create(paymentDefaults, { transaction });
            }

            return {
                payment,
                farmInvestment,
                totalExpectedFunding: fromMoneyCents(totalExpectedInCents),
                created
            };
        });

        savedPayment = result.payment;
        const instructions = await paymentService.initiateInvestment(result.payment.id, investorId);
        await result.payment.reload();
        return res.success({ transactionId: result.payment.id,
            payment: formatInvestmentPayment(result.payment),
            investment: formatFundingSummary(result.payment.userFarmId, result.farmInvestment, result.totalExpectedFunding),
            investorInvestment: await paymentService.investorInvestment(investorId, result.payment.userFarmInvestmentId),
            gateway: instructions },
        result.created ? 'Investment checkout initialized successfully' : 'Investment transaction already exists',
        result.created ? 201 : 200);
    } catch (error) {
        if (error.name === 'PaymentError' || error.name === 'PaypetalError') return res.fail(error.message, error.statusCode, savedPayment ? { transactionId: savedPayment.id, reference: savedPayment.reference } : undefined);
        if (error instanceof InvestmentRequestError || error instanceof InvestmentTermsError) {
            return res.fail(error.message, error.statusCode);
        }

        if (error.name === 'SequelizeUniqueConstraintError') return res.fail('Investment reference or idempotency key is already in use; retry the same request', 409);

        console.error('Invest in farm error:', error);
        return res.fail('Failed to process investment', 500);
    }
}

async function confirmInvestmentPayment(req, res) {
    try {
        if (!req.user?.id) return res.fail('User not authenticated', 401);
        const { transactionId } = req.params;
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(transactionId || '')) {
            return res.fail('transactionId must be a valid UUID', 400);
        }
        const service = require('../../../services/payments/service').getPaymentService();
        const result = await service.confirmInvestment(transactionId, req.user.id);
        return res.success({ transactionId: result.payment.id, payment: formatInvestmentPayment(result.payment),
            investment: formatFundingSummary(result.payment.userFarmId, result.farmInvestment, result.farmInvestment.expectedInvestment),
            investorInvestment: result.investorInvestment, credited: result.credited, alreadySettled: result.alreadySettled,
            confirmed: result.payment.status === 'successful' },
        result.payment.status === 'successful' ? 'Investment payment confirmed' : 'Payment is not yet successful');
    } catch (error) {
        if (['PaymentError', 'PaypetalError'].includes(error.name)) return res.fail(error.message, error.statusCode);
        if (error.name === 'SequelizeUniqueConstraintError') return res.fail('Provider transaction has already been recorded', 409);
        console.error('Confirm investment payment error:', error);
        return res.fail('Failed to confirm investment payment', 500);
    }
}

module.exports = {
    getInvestments,
    getInvestmentById,
    investInFarm,
    confirmInvestmentPayment
};
