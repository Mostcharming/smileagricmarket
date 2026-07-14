'use strict';

const { randomBytes } = require('crypto');
const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const { Op } = require('sequelize');
const { toBackendApiUrl } = require('../../../utils/url');

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
    Milestone
} = models;

const PAYSTACK_GATEWAY = 'paystack';
const PAYSTACK_NOT_CONFIGURED_MESSAGE = 'Paystack initialization is not configured yet; the payment was recorded internally.';

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
    return `SMILE-INV-${Date.now()}-${randomBytes(6).toString('hex').toUpperCase()}`;
}

function getIdempotencyKey(req) {
    const value = req.get('Idempotency-Key') || req.body?.idempotencyKey;
    if (value === undefined || value === null || String(value).trim() === '') return null;

    const key = String(value).trim();
    return key.length <= 100 ? key : undefined;
}

function formatInvestmentPayment(payment) {
    const data = payment.toJSON ? payment.toJSON() : payment;
    return {
        id: data.id,
        reference: data.reference,
        farmId: data.userFarmId,
        investmentTemplateId: data.investmentId,
        amount: toMoney(data.amount),
        currency: data.currency,
        gateway: data.gateway,
        gatewayReference: data.gatewayReference,
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
        fundingReceived,
        totalExpectedFunding: expectedFunding,
        remainingFunding: Math.max(Number((expectedFunding - fundingReceived).toFixed(2)), 0),
        percentFunded: getPercentFunded(fundingReceived, expectedFunding),
        fundingStatus: getFundingStatus(farmInvestment.investmentStatus, fundingReceived, expectedFunding)
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
        pending: ['pending'],
        unfunded: ['pending'],
        partial: ['partial'],
        partially_funded: ['partial'],
        completed: ['completed'],
        complete: ['completed'],
        funded: ['completed'],
        fully_funded: ['completed'],
        cancelled: ['cancelled'],
        canceled: ['cancelled'],
        open: ['pending', 'partial']
    };

    if (!aliases[fundingStatus]) {
        errors.push('fundingStatus must be one of pending, partial, completed, cancelled, or open');
        return null;
    }

    return aliases[fundingStatus];
}

function getTemplateByCategory(investments) {
    const templateByCategory = new Map();

    investments.forEach(investment => {
        const data = investment.toJSON ? investment.toJSON() : investment;
        if (!templateByCategory.has(data.farmCategoryId)) {
            templateByCategory.set(data.farmCategoryId, data);
        }
    });

    return templateByCategory;
}

function getPercentFunded(fundingReceived, totalExpectedFunding) {
    if (totalExpectedFunding <= 0) return 0;
    const percent = (fundingReceived / totalExpectedFunding) * 100;
    return Number(Math.min(percent, 100).toFixed(2));
}

function getFundingStatus(rawStatus, fundingReceived, totalExpectedFunding) {
    if (rawStatus === 'cancelled') return rawStatus;
    if (totalExpectedFunding > 0 && fundingReceived >= totalExpectedFunding) return 'completed';
    if (fundingReceived > 0) return 'partial';
    return rawStatus || 'pending';
}

function formatFarmImage(req, document) {
    const data = document.toJSON ? document.toJSON() : document;
    return {
        id: data.id,
        fileName: data.fileName,
        fileUrl: toBackendApiUrl(req, data.fileUrl),
        mimeType: data.mimeType
    };
}

function getFarmImages(req, documents = []) {
    if (!Array.isArray(documents)) return [];

    return documents
        .filter(document => document.documentType === 'picture')
        .map(document => formatFarmImage(req, document));
}

function getFarmImage(req, documents = []) {
    return getFarmImages(req, documents)[0] || null;
}

function getMilestoneStatus(milestone, index, firstIncompleteIndex) {
    if (milestone.isCompleted) return 'completed';
    if (index === firstIncompleteIndex) return 'in_progress';
    return 'not_started';
}

function formatFarmMilestones(milestones = []) {
    const sortedMilestones = [...milestones].sort((a, b) => {
        const aData = a.toJSON ? a.toJSON() : a;
        const bData = b.toJSON ? b.toJSON() : b;
        const aOrder = aData.Milestone?.order ?? Number.MAX_SAFE_INTEGER;
        const bOrder = bData.Milestone?.order ?? Number.MAX_SAFE_INTEGER;

        if (aOrder !== bOrder) return aOrder - bOrder;
        return new Date(aData.createdAt || 0) - new Date(bData.createdAt || 0);
    });
    const firstIncompleteIndex = sortedMilestones.findIndex(milestone => {
        const data = milestone.toJSON ? milestone.toJSON() : milestone;
        return !data.isCompleted;
    });

    const formattedMilestones = sortedMilestones.map((milestone, index) => {
        const data = milestone.toJSON ? milestone.toJSON() : milestone;
        const milestoneData = data.Milestone || {};
        const status = getMilestoneStatus(data, index, firstIncompleteIndex);

        return {
            id: data.id,
            userFarmMilestoneId: data.id,
            milestoneId: data.milestoneId,
            name: milestoneData.name || null,
            order: milestoneData.order ?? null,
            amount: toMoney(data.amount),
            isCompleted: !!data.isCompleted,
            status,
            completedAt: data.completedAt,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt
        };
    });
    const completedMilestones = formattedMilestones.filter(milestone => milestone.status === 'completed').length;
    const inProgressMilestones = formattedMilestones.filter(milestone => milestone.status === 'in_progress').length;
    const notStartedMilestones = formattedMilestones.filter(milestone => milestone.status === 'not_started').length;
    const totalMilestones = formattedMilestones.length;

    return {
        milestones: formattedMilestones,
        stats: {
            totalMilestones,
            completedMilestones,
            inProgressMilestones,
            notStartedMilestones,
            completionPercentage: totalMilestones > 0
                ? Math.round((completedMilestones / totalMilestones) * 100)
                : 0
        }
    };
}

function formatInvestmentFarm(req, farm, template, options = {}) {
    const { includeImages = false, includeMilestones = false } = options;
    const data = farm.toJSON ? farm.toJSON() : farm;
    const farmInvestment = data.Investment || {};
    const fundingReceived = toMoney(farmInvestment.investmentReceived);
    const totalExpectedFunding = farmInvestment.expectedInvestment !== null && farmInvestment.expectedInvestment !== undefined
        ? toMoney(farmInvestment.expectedInvestment)
        : toMoney(template.fundingMaxGoal);
    const images = getFarmImages(req, data.Documents);
    const image = images[0] || null;
    const formattedFarm = {
        id: data.id,
        farmId: data.id,
        farmName: data.name,
        image,
        imageUrl: image?.fileUrl || null,
        farmCategory: data.Category ? {
            id: data.Category.id,
            name: data.Category.name
        } : null,
        investmentTemplate: {
            id: template.id,
            name: template.name
        },
        roi: toMoney(template.roiPercentage),
        roiPercentage: toMoney(template.roiPercentage),
        duration: {
            value: template.durationValue,
            unit: template.durationUnit,
            label: `${template.durationValue} ${template.durationUnit}`
        },
        riskLevel: template.riskLevel || 'medium',
        farmOwner: {
            id: data.User?.id || null,
            name: data.User?.fullName || 'N/A'
        },
        farmOwnerName: data.User?.fullName || 'N/A',
        rating: null,
        fundingReceived,
        totalExpectedFunding,
        location: data.location,
        percentFunded: getPercentFunded(fundingReceived, totalExpectedFunding),
        minimumInvest: toMoney(template.investmentMinGoal),
        fundingStatus: getFundingStatus(farmInvestment.investmentStatus, fundingReceived, totalExpectedFunding),
        currency: farmInvestment.currency || template.currency,
        lastViewed: null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
    };

    if (includeImages) {
        formattedFarm.images = images;
    }

    if (includeMilestones) {
        const { milestones, stats } = formatFarmMilestones(data.SelectedMilestones);
        formattedFarm.milestones = milestones;
        formattedFarm.milestoneStats = stats;
    }

    return formattedFarm;
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

        const templateWhere = {
            isActive: true
        };
        const farmWhere = {
            isActive: true,
            verificationStatus: 'approved',
            userId: {
                [Op.in]: sequelize.literal("(SELECT user_id FROM kyc WHERE status = 'approved')")
            }
        };

        if (farmCategoryId) {
            templateWhere.farmCategoryId = farmCategoryId;
            farmWhere.farmCategoryId = farmCategoryId;
        }

        const riskLevel = normalizeRiskLevel(req.query.riskLevel, errors);
        if (riskLevel) templateWhere.riskLevel = riskLevel;

        Object.assign(templateWhere, parseDurationFilter(req.query, errors));

        const fundingStatuses = normalizeFundingStatuses(fundingStatus, errors);

        if (search) {
            farmWhere[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { description: { [Op.iLike]: `%${search}%` } },
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

        const investmentTemplates = await Investment.findAll({
            where: templateWhere,
            include: [{
                model: FarmCategory,
                as: 'FarmCategory',
                attributes: ['id', 'name', 'description'],
                required: true,
                where: {
                    isActive: true
                }
            }],
            attributes: [
                'id',
                'farmCategoryId',
                'name',
                'roiPercentage',
                'durationValue',
                'durationUnit',
                'riskLevel',
                'fundingMaxGoal',
                'investmentMinGoal',
                'currency',
                'createdAt'
            ],
            order: [['createdAt', 'DESC']]
        });

        const templateByCategory = getTemplateByCategory(investmentTemplates);
        const categoryIdsWithTemplates = [...templateByCategory.keys()];

        if (categoryIdsWithTemplates.length === 0) {
            return res.success({
                investments: [],
                pagination: {
                    page,
                    limit,
                    total: 0,
                    totalPages: 0,
                    hasNextPage: false,
                    hasPreviousPage: false,
                    startIndex: 0,
                    endIndex: 0
                }
            }, 'Investments retrieved successfully');
        }

        if (!farmCategoryId) {
            farmWhere.farmCategoryId = {
                [Op.in]: categoryIdsWithTemplates
            };
        }

        const farmInvestmentWhere = {
            isActive: true
        };

        if (fundingStatuses) {
            farmInvestmentWhere.investmentStatus = {
                [Op.in]: fundingStatuses
            };
        }

        const { count, rows: farms } = await UserFarm.findAndCountAll({
            where: farmWhere,
            include: [
                {
                    model: FarmCategory,
                    as: 'Category',
                    attributes: ['id', 'name', 'description'],
                    required: true
                },
                {
                    model: User,
                    as: 'User',
                    attributes: ['id', 'fullName'],
                    required: true
                },
                {
                    model: UserFarmInvestment,
                    as: 'Investment',
                    attributes: ['id', 'expectedInvestment', 'investmentReceived', 'investmentStatus', 'currency'],
                    where: farmInvestmentWhere,
                    required: !!fundingStatuses
                },
                {
                    model: FarmDocument,
                    as: 'Documents',
                    attributes: ['id', 'documentType', 'fileName', 'fileUrl', 'mimeType', 'createdAt'],
                    where: { documentType: 'picture' },
                    required: false,
                    separate: true,
                    limit: 1,
                    order: [['createdAt', 'ASC']]
                }
            ],
            attributes: ['id', 'farmCategoryId', 'name', 'description', 'location', 'size', 'currency', 'createdAt', 'updatedAt'],
            distinct: true,
            order: [['createdAt', 'DESC']],
            limit,
            offset
        });

        const investments = farms
            .map(farm => {
                const template = templateByCategory.get(farm.farmCategoryId);
                return template ? formatInvestmentFarm(req, farm, template) : null;
            })
            .filter(Boolean);
        const totalPages = Math.ceil(count / limit);

        return res.success({
            investments,
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
            include: [
                {
                    model: FarmCategory,
                    as: 'Category',
                    attributes: ['id', 'name', 'description'],
                    required: true
                },
                {
                    model: User,
                    as: 'User',
                    attributes: ['id', 'fullName'],
                    required: true
                },
                {
                    model: UserFarmInvestment,
                    as: 'Investment',
                    attributes: ['id', 'expectedInvestment', 'investmentReceived', 'investmentStatus', 'currency'],
                    where: { isActive: true },
                    required: false
                },
                {
                    model: FarmDocument,
                    as: 'Documents',
                    attributes: ['id', 'documentType', 'fileName', 'fileUrl', 'mimeType', 'createdAt'],
                    where: { documentType: 'picture' },
                    required: false,
                    separate: true,
                    order: [['createdAt', 'ASC']]
                },
                {
                    model: UserFarmMilestone,
                    as: 'SelectedMilestones',
                    attributes: ['id', 'milestoneId', 'isCompleted', 'completedAt', 'amount', 'createdAt', 'updatedAt'],
                    include: [{
                        model: Milestone,
                        as: 'Milestone',
                        attributes: ['id', 'name', 'order']
                    }],
                    required: false,
                    separate: true
                }
            ],
            attributes: ['id', 'farmCategoryId', 'name', 'description', 'location', 'size', 'currency', 'createdAt', 'updatedAt']
        });

        if (!farm) {
            return res.fail('Investment not found', 404);
        }

        const template = await Investment.findOne({
            where: {
                farmCategoryId: farm.farmCategoryId,
                isActive: true
            },
            attributes: [
                'id',
                'farmCategoryId',
                'name',
                'roiPercentage',
                'durationValue',
                'durationUnit',
                'riskLevel',
                'fundingMaxGoal',
                'investmentMinGoal',
                'currency',
                'createdAt'
            ],
            order: [['createdAt', 'DESC']]
        });

        if (!template) {
            return res.fail('Investment template not found for this farm category', 404);
        }

        return res.success(
            formatInvestmentFarm(req, farm, template, {
                includeImages: true,
                includeMilestones: true
            }),
            'Investment details retrieved successfully'
        );
    } catch (error) {
        console.error('Get user investment details error:', error);
        return res.fail('Failed to retrieve investment details', 500);
    }
}

async function investInFarm(req, res) {
    try {
        const investorId = req.user?.id;
        const { farmId } = req.params;
        const amountValue = firstDefined(req.body?.amount, req.body?.investmentAmount);
        const amountInCents = toMoneyCents(amountValue);
        const requestedCurrency = req.body?.currency
            ? String(req.body.currency).trim().toUpperCase()
            : null;
        const idempotencyKey = getIdempotencyKey(req);

        if (!investorId) {
            return res.fail('User not authenticated', 401);
        }

        if (!farmId) {
            return res.fail('Farm ID is required', 400);
        }

        if (amountInCents === null || amountInCents <= 0) {
            return res.fail('amount must be a positive number with no more than two decimal places', 400);
        }

        if (requestedCurrency && !/^[A-Z]{3}$/.test(requestedCurrency)) {
            return res.fail('currency must be a valid three-letter currency code', 400);
        }

        if (idempotencyKey === undefined) {
            return res.fail('Idempotency-Key cannot be longer than 100 characters', 400);
        }

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
            const farm = await UserFarm.findOne({
                where: {
                    id: farmId,
                    isActive: true,
                    verificationStatus: 'approved',
                    userId: {
                        [Op.in]: sequelize.literal("(SELECT user_id FROM kyc WHERE status = 'approved')")
                    }
                },
                attributes: ['id', 'userId', 'farmCategoryId', 'name', 'currency'],
                transaction,
                lock: transaction.LOCK.UPDATE
            });

            if (!farm) {
                throw new InvestmentRequestError('Investment farm not found or is not available', 404);
            }

            if (farm.userId === investorId) {
                throw new InvestmentRequestError('You cannot invest in your own farm', 403);
            }

            const farmInvestment = await UserFarmInvestment.findOne({
                where: {
                    userFarmId: farm.id,
                    isActive: true
                },
                transaction,
                lock: transaction.LOCK.UPDATE
            });

            if (!farmInvestment) {
                throw new InvestmentRequestError('This farm is not open for investment', 409);
            }

            const investmentTemplate = await Investment.findOne({
                where: {
                    farmCategoryId: farm.farmCategoryId,
                    isActive: true
                },
                attributes: [
                    'id',
                    'investmentMinGoal',
                    'investmentMaxGoal',
                    'fundingMaxGoal',
                    'currency',
                    'createdAt'
                ],
                order: [['createdAt', 'DESC']],
                transaction
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
                    const existingAmountInCents = toMoneyCents(existingPayment.amount);
                    if (existingPayment.userFarmId !== farm.id || existingAmountInCents !== amountInCents) {
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

            const remainingFundingInCents = Math.max(totalExpectedInCents - fundingReceivedInCents, 0);
            if (remainingFundingInCents === 0) {
                throw new InvestmentRequestError('This farm has already reached its funding target', 409);
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
                farmInvestment.currency || investmentTemplate.currency || farm.currency || 'NGN'
            ).toUpperCase();

            if (requestedCurrency && requestedCurrency !== currency) {
                throw new InvestmentRequestError(`Investment currency must be ${currency}`, 400);
            }

            // Temporary pre-Paystack flow. Once credentials are available, initialize
            // Paystack here as pending and move the funding update to verified payment handling.
            const paymentDefaults = {
                investorId,
                userFarmId: farm.id,
                userFarmInvestmentId: farmInvestment.id,
                investmentId: investmentTemplate.id,
                reference: generatePaymentReference(),
                idempotencyKey,
                amount: fromMoneyCents(amountInCents),
                currency,
                gateway: PAYSTACK_GATEWAY,
                gatewayReference: null,
                authorizationUrl: null,
                status: 'recorded',
                paidAt: null,
                gatewayResponse: {
                    integrationStatus: 'not_configured',
                    message: PAYSTACK_NOT_CONFIGURED_MESSAGE
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
                    const existingAmountInCents = toMoneyCents(payment.amount);
                    if (payment.userFarmId !== farm.id || existingAmountInCents !== amountInCents) {
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

            const nextFundingReceivedInCents = fundingReceivedInCents + amountInCents;
            const nextInvestmentStatus = nextFundingReceivedInCents >= totalExpectedInCents
                ? 'completed'
                : 'partial';

            await farmInvestment.update({
                expectedInvestment: fromMoneyCents(totalExpectedInCents),
                investmentReceived: fromMoneyCents(nextFundingReceivedInCents),
                investmentPending: fromMoneyCents(
                    Math.max(totalExpectedInCents - nextFundingReceivedInCents, 0)
                ),
                investmentStatus: nextInvestmentStatus
            }, { transaction });

            return {
                payment,
                farmInvestment,
                totalExpectedFunding: fromMoneyCents(totalExpectedInCents),
                created
            };
        });

        return res.success({
            payment: formatInvestmentPayment(result.payment),
            investment: formatFundingSummary(
                farmId,
                result.farmInvestment,
                result.totalExpectedFunding
            ),
            gateway: {
                provider: PAYSTACK_GATEWAY,
                initialized: false,
                message: PAYSTACK_NOT_CONFIGURED_MESSAGE
            }
        }, result.created ? 'Investment recorded successfully' : 'Investment request already recorded', result.created ? 201 : 200);
    } catch (error) {
        if (error instanceof InvestmentRequestError) {
            return res.fail(error.message, error.statusCode);
        }

        console.error('Invest in farm error:', error);
        return res.fail('Failed to process investment', 500);
    }
}

module.exports = {
    getInvestments,
    getInvestmentById,
    investInFarm
};
