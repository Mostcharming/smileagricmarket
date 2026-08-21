'use strict';

const { Op } = require('sequelize');
const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const { toBackendApiUrl } = require('../../../utils/url');

const models = defineModels(sequelize);
const {
    Admin,
    User,
    UserFarm,
    FarmCategory,
    FarmDocument,
    Investment,
    InvestmentMilestone,
    InvestmentPayment,
    UserFarmInvestment,
    UserFarmMilestone,
    MilestoneFundingEvidence,
    MilestoneVerificationChecklist,
    MilestoneReviewAudit
} = models;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVESTMENT_STATUSES = ['not_started', 'funding_started', 'active', 'completed'];
const FUNDING_STATUSES = ['request_for_funding', 'processing_funding', 'completed'];
const REVIEW_STATUSES = ['pending', 'approved', 'rejected', 'more_evidence_required'];
const CHECKLIST_STATUSES = ['verified', 'needs_clarification', 'rejected'];
const REVIEW_ACTIONS = ['approve', 'reject', 'request_more_evidence'];

class AdminInvestmentRequestError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

function firstDefined(...values) {
    return values.find(value => value !== undefined && value !== null && value !== '');
}

function cleanString(value, maxLength = 200) {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength);
}

function parseUuid(value, fieldName) {
    if (!value) return '';
    const normalized = String(value).trim();
    if (!UUID_PATTERN.test(normalized)) {
        throw new AdminInvestmentRequestError(`${fieldName} must be a valid UUID`);
    }
    return normalized;
}

function parseEnum(value, allowedValues, fieldName) {
    if (!value) return '';
    const normalized = String(value).trim().toLowerCase();
    if (!allowedValues.includes(normalized)) {
        throw new AdminInvestmentRequestError(
            `${fieldName} must be one of ${allowedValues.join(', ')}`
        );
    }
    return normalized;
}

function parseDateOnly(value, fieldName) {
    if (!value) return '';
    const normalized = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        throw new AdminInvestmentRequestError(`${fieldName} must use YYYY-MM-DD format`);
    }

    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
        throw new AdminInvestmentRequestError(`${fieldName} must be a valid date`);
    }
    return normalized;
}

function nextDate(dateOnly) {
    const value = new Date(`${dateOnly}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + 1);
    return value.toISOString().slice(0, 10);
}

function parseNonNegativeNumber(value, fieldName) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new AdminInvestmentRequestError(`${fieldName} must be a non-negative number`);
    }
    return parsed;
}

function parsePagination(query) {
    const page = Number.parseInt(query.page || 1, 10);
    const limit = Number.parseInt(query.limit || 20, 10);
    if (!Number.isInteger(page) || page < 1) {
        throw new AdminInvestmentRequestError('page must be a positive integer');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new AdminInvestmentRequestError('limit must be between 1 and 100');
    }
    return { page, limit, offset: (page - 1) * limit };
}

function paginationMeta(total, page, limit) {
    const totalPages = Math.ceil(total / limit);
    return {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
    };
}

function addRange(where, field, from, to, { dateOnly = false } = {}) {
    if (!from && !to) return;
    where[field] = {};
    if (from) where[field][Op.gte] = dateOnly ? from : `${from}T00:00:00.000Z`;
    if (to) where[field][Op.lt] = dateOnly ? nextDate(to) : `${nextDate(to)}T00:00:00.000Z`;
}

function addNumberRange(where, field, minimum, maximum) {
    if (minimum === null && maximum === null) return;
    where[field] = {};
    if (minimum !== null) where[field][Op.gte] = minimum;
    if (maximum !== null) where[field][Op.lte] = maximum;
}

function addAndCondition(where, condition) {
    if (!condition) return;
    if (!where[Op.and]) where[Op.and] = [];
    where[Op.and].push(condition);
}

function buildProjectScope(query, rootAlias = '') {
    const projectWhere = {};
    const farmWhere = {};
    const userWhere = {};
    const search = cleanString(query.search);

    const investmentProjectId = parseUuid(
        firstDefined(query.investmentProjectId, query.userFarmInvestmentId),
        'investmentProjectId'
    );
    const investmentId = parseUuid(query.investmentId, 'investmentId');
    const farmCategoryId = parseUuid(query.farmCategoryId, 'farmCategoryId');
    const farmId = parseUuid(query.farmId, 'farmId');
    const userId = parseUuid(query.userId, 'userId');
    const status = parseEnum(
        firstDefined(query.investmentStatus, query.status),
        INVESTMENT_STATUSES,
        'investmentStatus'
    );
    const maturityFrom = parseDateOnly(query.maturityFrom, 'maturityFrom');
    const maturityTo = parseDateOnly(query.maturityTo, 'maturityTo');
    const startDateFrom = parseDateOnly(query.startDateFrom, 'startDateFrom');
    const startDateTo = parseDateOnly(query.startDateTo, 'startDateTo');
    const minimumAmount = parseNonNegativeNumber(query.minAmount, 'minAmount');
    const maximumAmount = parseNonNegativeNumber(query.maxAmount, 'maxAmount');

    if (maturityFrom && maturityTo && maturityFrom > maturityTo) {
        throw new AdminInvestmentRequestError('maturityFrom cannot be after maturityTo');
    }
    if (startDateFrom && startDateTo && startDateFrom > startDateTo) {
        throw new AdminInvestmentRequestError('startDateFrom cannot be after startDateTo');
    }
    if (minimumAmount !== null && maximumAmount !== null && minimumAmount > maximumAmount) {
        throw new AdminInvestmentRequestError('minAmount cannot be greater than maxAmount');
    }

    if (investmentProjectId) projectWhere.id = investmentProjectId;
    if (investmentId) projectWhere.investmentId = investmentId;
    if (farmCategoryId) projectWhere.farmCategoryId = farmCategoryId;
    if (status) projectWhere.investmentStatus = status;
    if (farmId) farmWhere.id = farmId;
    if (userId) userWhere.id = userId;
    addRange(projectWhere, 'endDate', maturityFrom, maturityTo, { dateOnly: true });
    addRange(projectWhere, 'startDate', startDateFrom, startDateTo, { dateOnly: true });
    addNumberRange(projectWhere, 'investmentReceived', minimumAmount, maximumAmount);

    if (search && rootAlias) {
        addAndCondition(projectWhere, {
            [Op.or]: [
                { [`$${rootAlias}Farm.User.full_name$`]: { [Op.iLike]: `%${search}%` } },
                { [`$${rootAlias}Farm.User.email$`]: { [Op.iLike]: `%${search}%` } },
                { [`$${rootAlias}Farm.name$`]: { [Op.iLike]: `%${search}%` } },
                { [`$${rootAlias}Farm.location$`]: { [Op.iLike]: `%${search}%` } },
                { [`$${rootAlias}InvestmentTemplate.name$`]: { [Op.iLike]: `%${search}%` } },
                { [`$${rootAlias}Category.name$`]: { [Op.iLike]: `%${search}%` } }
            ]
        });
    }

    return { projectWhere, farmWhere, userWhere, search };
}

function buildProjectIncludes(scope, prefix = '') {
    return [
        {
            model: UserFarm,
            as: 'Farm',
            required: true,
            where: scope.farmWhere,
            attributes: prefix ? [] : [
                'id',
                'name',
                'location',
                'size',
                'verificationStatus',
                'createdAt'
            ],
            include: [{
                model: User,
                as: 'User',
                required: true,
                where: scope.userWhere,
                attributes: prefix ? [] : ['id', 'fullName', 'email', 'phoneNumber']
            }]
        },
        {
            model: Investment,
            as: 'InvestmentTemplate',
            required: false,
            attributes: prefix ? [] : [
                'id',
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
                'startDate',
                'endDate'
            ]
        },
        {
            model: FarmCategory,
            as: 'Category',
            required: true,
            attributes: prefix ? [] : ['id', 'name', 'description']
        }
    ];
}

function formatNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatUserInvestment(project) {
    const data = project.toJSON ? project.toJSON() : project;
    const farm = data.Farm || {};
    return {
        id: data.id,
        amountInvestedSoFar: formatNumber(data.investmentReceived),
        fundingGoalAmount: formatNumber(data.expectedInvestment),
        amountRemaining: formatNumber(data.investmentPending),
        currency: data.currency,
        startDate: data.startDate,
        maturityDate: data.endDate,
        status: data.investmentStatus,
        isActive: data.isActive,
        notes: data.notes,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        user: farm.User || null,
        farm: farm.id ? {
            id: farm.id,
            name: farm.name,
            location: farm.location,
            size: farm.size,
            verificationStatus: farm.verificationStatus,
            createdAt: farm.createdAt
        } : null,
        investment: data.InvestmentTemplate || null,
        farmCategory: data.Category || null
    };
}

async function listUserInvestments(req, res) {
    try {
        const { page, limit, offset } = parsePagination(req.query);
        const scope = buildProjectScope(req.query, '');
        const allowedSortFields = {
            createdAt: 'createdAt',
            updatedAt: 'updatedAt',
            amountInvestedSoFar: 'investmentReceived',
            fundingGoalAmount: 'expectedInvestment',
            maturityDate: 'endDate',
            startDate: 'startDate',
            status: 'investmentStatus'
        };
        const requestedSort = cleanString(req.query.sortBy, 50) || 'createdAt';
        const sortBy = allowedSortFields[requestedSort];
        if (!sortBy) {
            throw new AdminInvestmentRequestError(
                `sortBy must be one of ${Object.keys(allowedSortFields).join(', ')}`
            );
        }
        const sortOrder = String(req.query.sortOrder || 'DESC').toUpperCase();
        if (!['ASC', 'DESC'].includes(sortOrder)) {
            throw new AdminInvestmentRequestError('sortOrder must be ASC or DESC');
        }

        if (scope.search) {
            addAndCondition(scope.projectWhere, {
                [Op.or]: [
                    { '$Farm.User.full_name$': { [Op.iLike]: `%${scope.search}%` } },
                    { '$Farm.User.email$': { [Op.iLike]: `%${scope.search}%` } },
                    { '$Farm.name$': { [Op.iLike]: `%${scope.search}%` } },
                    { '$Farm.location$': { [Op.iLike]: `%${scope.search}%` } },
                    { '$InvestmentTemplate.name$': { [Op.iLike]: `%${scope.search}%` } },
                    { '$Category.name$': { [Op.iLike]: `%${scope.search}%` } }
                ]
            });
        }

        const { count, rows } = await UserFarmInvestment.findAndCountAll({
            where: scope.projectWhere,
            include: buildProjectIncludes(scope),
            order: [[sortBy, sortOrder], ['id', 'ASC']],
            limit,
            offset,
            distinct: true,
            col: 'id',
            subQuery: false
        });

        return res.success({
            investments: rows.map(formatUserInvestment),
            pagination: paginationMeta(count, page, limit)
        }, 'User-created investments retrieved successfully');
    } catch (error) {
        console.error('List user-created investments error:', error);
        return res.fail(
            error instanceof AdminInvestmentRequestError
                ? error.message
                : 'Failed to retrieve user-created investments',
            error.statusCode || 500
        );
    }
}

function resolveMilestoneStatuses(query) {
    const ambiguousStatus = firstDefined(query.milestoneStatus, query.status);
    let reviewStatus = firstDefined(query.reviewStatus);
    let fundingStatus = firstDefined(query.fundingStatus);

    if (ambiguousStatus) {
        const normalized = String(ambiguousStatus).trim().toLowerCase();
        if (REVIEW_STATUSES.includes(normalized)) reviewStatus = normalized;
        else if (FUNDING_STATUSES.includes(normalized)) fundingStatus = normalized;
        else {
            throw new AdminInvestmentRequestError(
                `status must be one of ${[...REVIEW_STATUSES, ...FUNDING_STATUSES].join(', ')}`
            );
        }
    }

    return {
        reviewStatus: parseEnum(reviewStatus, REVIEW_STATUSES, 'reviewStatus'),
        fundingStatus: parseEnum(fundingStatus, FUNDING_STATUSES, 'fundingStatus')
    };
}

function buildMilestoneScope(query) {
    const projectScope = buildProjectScope({ ...query, status: '' });
    const milestoneWhere = {};
    const { reviewStatus, fundingStatus } = resolveMilestoneStatuses(query);
    const milestoneId = parseUuid(
        firstDefined(query.milestoneId, query.investmentMilestoneId),
        'milestoneId'
    );
    const dateFrom = parseDateOnly(query.dateFrom, 'dateFrom');
    const dateTo = parseDateOnly(query.dateTo, 'dateTo');
    const checklistStatus = parseEnum(
        query.checklistStatus,
        CHECKLIST_STATUSES,
        'checklistStatus'
    );
    const minimumAmount = parseNonNegativeNumber(query.minAmountRequested, 'minAmountRequested');
    const maximumAmount = parseNonNegativeNumber(query.maxAmountRequested, 'maxAmountRequested');

    if (dateFrom && dateTo && dateFrom > dateTo) {
        throw new AdminInvestmentRequestError('dateFrom cannot be after dateTo');
    }
    if (minimumAmount !== null && maximumAmount !== null && minimumAmount > maximumAmount) {
        throw new AdminInvestmentRequestError(
            'minAmountRequested cannot be greater than maxAmountRequested'
        );
    }

    milestoneWhere.userFarmInvestmentId = { [Op.ne]: null };
    if (reviewStatus) milestoneWhere.reviewStatus = reviewStatus;
    if (fundingStatus) milestoneWhere.fundingStatus = fundingStatus;
    if (milestoneId) milestoneWhere.investmentMilestoneId = milestoneId;
    addRange(milestoneWhere, 'fundingRequestedAt', dateFrom, dateTo);
    addNumberRange(milestoneWhere, 'amount', minimumAmount, maximumAmount);

    if (projectScope.search) {
        addAndCondition(milestoneWhere, {
            [Op.or]: [
                { name: { [Op.iLike]: `%${projectScope.search}%` } },
                { '$InvestmentProject.Farm.User.full_name$': { [Op.iLike]: `%${projectScope.search}%` } },
                { '$InvestmentProject.Farm.User.email$': { [Op.iLike]: `%${projectScope.search}%` } },
                { '$InvestmentProject.Farm.name$': { [Op.iLike]: `%${projectScope.search}%` } },
                { '$InvestmentProject.InvestmentTemplate.name$': { [Op.iLike]: `%${projectScope.search}%` } },
                { '$InvestmentProject.Category.name$': { [Op.iLike]: `%${projectScope.search}%` } }
            ]
        });
    }

    if (checklistStatus) {
        addAndCondition(milestoneWhere, sequelize.literal(`
            EXISTS (
                SELECT 1
                FROM "milestone_verification_checklists" AS checklist_filter
                WHERE checklist_filter."user_farm_milestone_id" = "UserFarmMilestone"."id"
                    AND checklist_filter."status" = ${sequelize.escape(checklistStatus)}
            )
        `));
    }

    return { ...projectScope, milestoneWhere };
}

function buildMilestoneIncludes(scope, attributes = true) {
    return [
        {
            model: UserFarmInvestment,
            as: 'InvestmentProject',
            required: true,
            where: scope.projectWhere,
            attributes: attributes ? [
                'id',
                'investmentId',
                'farmCategoryId',
                'expectedInvestment',
                'investmentReceived',
                'investmentPending',
                'currency',
                'startDate',
                'endDate',
                'investmentStatus'
            ] : [],
            include: buildProjectIncludes(scope, attributes ? '' : 'aggregate')
        },
        {
            model: InvestmentMilestone,
            as: 'InvestmentMilestone',
            required: false,
            attributes: attributes
                ? ['id', 'investmentId', 'name', 'fundReleasePercentage', 'order']
                : []
        }
    ];
}

function formatMilestoneListItem(milestone) {
    const data = milestone.toJSON ? milestone.toJSON() : milestone;
    const project = data.InvestmentProject || {};
    const farm = project.Farm || {};
    return {
        id: data.id,
        name: data.name || data.InvestmentMilestone?.name || null,
        order: data.order ?? data.InvestmentMilestone?.order ?? null,
        fundReleasePercentage: formatNumber(
            data.fundReleasePercentage ?? data.InvestmentMilestone?.fundReleasePercentage
        ),
        amountRequested: formatNumber(data.amount),
        currency: project.currency || project.InvestmentTemplate?.currency || null,
        status: data.reviewStatus,
        reviewStatus: data.reviewStatus,
        fundingStatus: data.fundingStatus,
        fundingRequestedAt: data.fundingRequestedAt,
        reviewedAt: data.reviewedAt,
        completedAt: data.completedAt,
        createdAt: data.createdAt,
        user: farm.User || null,
        farm: farm.id ? {
            id: farm.id,
            name: farm.name,
            location: farm.location,
            size: farm.size,
            verificationStatus: farm.verificationStatus
        } : null,
        investment: project.InvestmentTemplate || null,
        investmentProject: project.id ? {
            id: project.id,
            fundingGoalAmount: formatNumber(project.expectedInvestment),
            amountInvestedSoFar: formatNumber(project.investmentReceived),
            amountRemaining: formatNumber(project.investmentPending),
            startDate: project.startDate,
            maturityDate: project.endDate,
            status: project.investmentStatus
        } : null,
        farmCategory: project.Category || null,
        milestone: data.InvestmentMilestone || null
    };
}

function makeTrend(currentYear, previousYear) {
    const current = formatNumber(currentYear);
    const previous = formatNumber(previousYear);
    const change = Number((current - previous).toFixed(2));
    const percentageChange = previous === 0
        ? (current === 0 ? 0 : 100)
        : Number(((change / Math.abs(previous)) * 100).toFixed(2));
    return {
        currentYear: current,
        previousYear: previous,
        change,
        displayChange: change > 0 ? `+${change}` : String(change),
        percentageChange,
        direction: change > 0 ? 'up' : (change < 0 ? 'down' : 'unchanged')
    };
}

function summaryYearBoundaries() {
    const year = new Date().getUTCFullYear();
    return {
        previousStart: `${year - 1}-01-01T00:00:00.000Z`,
        currentStart: `${year}-01-01T00:00:00.000Z`,
        nextStart: `${year + 1}-01-01T00:00:00.000Z`
    };
}

async function getMilestoneSummary(scope) {
    const { previousStart, currentStart, nextStart } = summaryYearBoundaries();
    const milestoneRows = await UserFarmMilestone.findAll({
        attributes: [
            [sequelize.literal(`COUNT(*) FILTER (
                WHERE "UserFarmMilestone"."review_status" = 'pending'
                    AND "UserFarmMilestone"."funding_requested_at" IS NOT NULL
            )`), 'pendingTotal'],
            [sequelize.literal(`COUNT(*) FILTER (
                WHERE "UserFarmMilestone"."review_status" = 'pending'
                    AND "UserFarmMilestone"."funding_requested_at" >= ${sequelize.escape(currentStart)}
                    AND "UserFarmMilestone"."funding_requested_at" < ${sequelize.escape(nextStart)}
            )`), 'pendingCurrentYear'],
            [sequelize.literal(`COUNT(*) FILTER (
                WHERE "UserFarmMilestone"."review_status" = 'pending'
                    AND "UserFarmMilestone"."funding_requested_at" >= ${sequelize.escape(previousStart)}
                    AND "UserFarmMilestone"."funding_requested_at" < ${sequelize.escape(currentStart)}
            )`), 'pendingPreviousYear'],
            [sequelize.literal(`COALESCE(SUM(
                CASE WHEN "UserFarmMilestone"."review_status" = 'approved'
                    THEN "UserFarmMilestone"."amount" ELSE 0 END
            ), 0)`), 'disbursedTotal'],
            [sequelize.literal(`COALESCE(SUM(
                CASE WHEN "UserFarmMilestone"."review_status" = 'approved'
                    AND "UserFarmMilestone"."reviewed_at" >= ${sequelize.escape(currentStart)}
                    AND "UserFarmMilestone"."reviewed_at" < ${sequelize.escape(nextStart)}
                    THEN "UserFarmMilestone"."amount" ELSE 0 END
            ), 0)`), 'disbursedCurrentYear'],
            [sequelize.literal(`COALESCE(SUM(
                CASE WHEN "UserFarmMilestone"."review_status" = 'approved'
                    AND "UserFarmMilestone"."reviewed_at" >= ${sequelize.escape(previousStart)}
                    AND "UserFarmMilestone"."reviewed_at" < ${sequelize.escape(currentStart)}
                    THEN "UserFarmMilestone"."amount" ELSE 0 END
            ), 0)`), 'disbursedPreviousYear']
        ],
        where: scope.milestoneWhere,
        include: buildMilestoneIncludes(scope, false),
        raw: true,
        subQuery: false
    });
    const milestoneSummary = milestoneRows[0] || {};

    const paymentScope = buildProjectScope({ ...scope.originalQuery, status: '' });
    const paymentWhere = { status: 'successful' };
    if (paymentScope.search) {
        addAndCondition(paymentWhere, {
            [Op.or]: [
                { '$FarmInvestment.Farm.User.full_name$': { [Op.iLike]: `%${paymentScope.search}%` } },
                { '$FarmInvestment.Farm.User.email$': { [Op.iLike]: `%${paymentScope.search}%` } },
                { '$FarmInvestment.Farm.name$': { [Op.iLike]: `%${paymentScope.search}%` } },
                { '$FarmInvestment.InvestmentTemplate.name$': { [Op.iLike]: `%${paymentScope.search}%` } },
                { '$FarmInvestment.Category.name$': { [Op.iLike]: `%${paymentScope.search}%` } }
            ]
        });
    }
    const paymentRows = await InvestmentPayment.findAll({
        attributes: [
            [sequelize.literal('COALESCE(SUM("InvestmentPayment"."amount"), 0)'), 'receivedTotal'],
            [sequelize.literal(`COALESCE(SUM(
                CASE WHEN "InvestmentPayment"."paid_at" >= ${sequelize.escape(currentStart)}
                    AND "InvestmentPayment"."paid_at" < ${sequelize.escape(nextStart)}
                    THEN "InvestmentPayment"."amount" ELSE 0 END
            ), 0)`), 'receivedCurrentYear'],
            [sequelize.literal(`COALESCE(SUM(
                CASE WHEN "InvestmentPayment"."paid_at" >= ${sequelize.escape(previousStart)}
                    AND "InvestmentPayment"."paid_at" < ${sequelize.escape(currentStart)}
                    THEN "InvestmentPayment"."amount" ELSE 0 END
            ), 0)`), 'receivedPreviousYear']
        ],
        where: paymentWhere,
        include: [{
            model: UserFarmInvestment,
            as: 'FarmInvestment',
            required: true,
            where: paymentScope.projectWhere,
            attributes: [],
            include: buildProjectIncludes(paymentScope, 'aggregate')
        }],
        raw: true,
        subQuery: false
    });
    const paymentSummary = paymentRows[0] || {};

    const disbursedTotal = formatNumber(milestoneSummary.disbursedTotal);
    const disbursedCurrent = formatNumber(milestoneSummary.disbursedCurrentYear);
    const disbursedPrevious = formatNumber(milestoneSummary.disbursedPreviousYear);
    const escrowTotal = Math.max(formatNumber(paymentSummary.receivedTotal) - disbursedTotal, 0);
    const escrowCurrent = Math.max(
        formatNumber(paymentSummary.receivedCurrentYear) - disbursedCurrent,
        0
    );
    const escrowPrevious = Math.max(
        formatNumber(paymentSummary.receivedPreviousYear) - disbursedPrevious,
        0
    );

    return {
        pendingMilestones: {
            count: formatNumber(milestoneSummary.pendingTotal),
            trend: makeTrend(
                milestoneSummary.pendingCurrentYear,
                milestoneSummary.pendingPreviousYear
            )
        },
        totalDisbursed: {
            amount: disbursedTotal,
            trend: makeTrend(disbursedCurrent, disbursedPrevious)
        },
        totalInEscrow: {
            amount: Number(escrowTotal.toFixed(2)),
            trend: makeTrend(escrowCurrent, escrowPrevious)
        }
    };
}

async function listUserInvestmentMilestones(req, res) {
    try {
        const { page, limit, offset } = parsePagination(req.query);
        const scope = {
            ...buildMilestoneScope(req.query),
            originalQuery: req.query
        };
        const allowedSortFields = {
            createdAt: 'createdAt',
            updatedAt: 'updatedAt',
            requestedAt: 'fundingRequestedAt',
            reviewedAt: 'reviewedAt',
            amountRequested: 'amount',
            status: 'reviewStatus',
            order: 'order',
            name: 'name'
        };
        const requestedSort = cleanString(req.query.sortBy, 50) || 'requestedAt';
        const sortBy = allowedSortFields[requestedSort];
        if (!sortBy) {
            throw new AdminInvestmentRequestError(
                `sortBy must be one of ${Object.keys(allowedSortFields).join(', ')}`
            );
        }
        const sortOrder = String(req.query.sortOrder || 'DESC').toUpperCase();
        if (!['ASC', 'DESC'].includes(sortOrder)) {
            throw new AdminInvestmentRequestError('sortOrder must be ASC or DESC');
        }

        const [{ count, rows }, summary] = await Promise.all([
            UserFarmMilestone.findAndCountAll({
                where: scope.milestoneWhere,
                include: buildMilestoneIncludes(scope),
                order: [[sortBy, sortOrder], ['id', 'ASC']],
                limit,
                offset,
                distinct: true,
                col: 'id',
                subQuery: false
            }),
            getMilestoneSummary(scope)
        ]);

        return res.success({
            milestones: rows.map(formatMilestoneListItem),
            summary,
            pagination: paginationMeta(count, page, limit)
        }, 'User investment milestones retrieved successfully');
    } catch (error) {
        console.error('List user investment milestones error:', error);
        return res.fail(
            error instanceof AdminInvestmentRequestError
                ? error.message
                : 'Failed to retrieve user investment milestones',
            error.statusCode || 500
        );
    }
}

function csvCell(value) {
    if (value === null || value === undefined) return '';
    const stringValue = String(value);
    return /[",\r\n]/.test(stringValue)
        ? `"${stringValue.replace(/"/g, '""')}"`
        : stringValue;
}

async function downloadUserInvestmentMilestones(req, res) {
    try {
        const scope = buildMilestoneScope(req.query);
        const rows = await UserFarmMilestone.findAll({
            where: scope.milestoneWhere,
            include: buildMilestoneIncludes(scope),
            order: [['fundingRequestedAt', 'DESC'], ['id', 'ASC']],
            subQuery: false
        });
        const headings = [
            'Milestone ID',
            'User Full Name',
            'User Email',
            'Farm',
            'Farm Location',
            'Investment',
            'Investment Project ID',
            'Milestone',
            'Amount Requested',
            'Currency',
            'Review Status',
            'Funding Status',
            'Requested At',
            'Reviewed At',
            'Maturity Date'
        ];
        const csvRows = rows.map(row => {
            const item = formatMilestoneListItem(row);
            return [
                item.id,
                item.user?.fullName,
                item.user?.email,
                item.farm?.name,
                item.farm?.location,
                item.investment?.name,
                item.investmentProject?.id,
                item.name,
                item.amountRequested,
                item.currency,
                item.reviewStatus,
                item.fundingStatus,
                item.fundingRequestedAt,
                item.reviewedAt,
                item.investmentProject?.maturityDate
            ].map(csvCell).join(',');
        });
        const fileDate = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="user-investment-milestones-${fileDate}.csv"`
        );
        return res.status(200).send(`\uFEFF${[headings.map(csvCell).join(','), ...csvRows].join('\r\n')}`);
    } catch (error) {
        console.error('Download user investment milestones error:', error);
        if (res.headersSent) return res.end();
        return res.fail(
            error instanceof AdminInvestmentRequestError
                ? error.message
                : 'Failed to download user investment milestones',
            error.statusCode || 500
        );
    }
}

function fundingEvidenceInclude() {
    return {
        model: MilestoneFundingEvidence,
        as: 'FundingEvidence',
        separate: true,
        order: [['createdAt', 'ASC']]
    };
}

function checklistInclude() {
    return {
        model: MilestoneVerificationChecklist,
        as: 'VerificationChecklist',
        separate: true,
        order: [['createdAt', 'ASC']],
        include: [{
            model: Admin,
            as: 'Reviewer',
            attributes: ['id', 'fullName', 'email', 'role']
        }]
    };
}

async function fetchMilestoneDetail(milestoneId) {
    return UserFarmMilestone.findOne({
        where: {
            id: milestoneId,
            userFarmInvestmentId: { [Op.ne]: null }
        },
        include: [
            {
                model: UserFarmInvestment,
                as: 'InvestmentProject',
                include: [
                    {
                        model: UserFarm,
                        as: 'Farm',
                        include: [
                            {
                                model: User,
                                as: 'User',
                                attributes: ['id', 'fullName', 'email', 'phoneNumber', 'createdAt']
                            },
                            {
                                model: FarmDocument,
                                as: 'Documents',
                                separate: true,
                                order: [['createdAt', 'ASC']]
                            }
                        ]
                    },
                    {
                        model: Investment,
                        as: 'InvestmentTemplate',
                        include: [{
                            model: InvestmentMilestone,
                            as: 'Milestones',
                            separate: true,
                            order: [['order', 'ASC'], ['createdAt', 'ASC']]
                        }]
                    },
                    {
                        model: FarmCategory,
                        as: 'Category'
                    },
                    {
                        model: UserFarmMilestone,
                        as: 'ProjectMilestones',
                        separate: true,
                        attributes: [
                            'id',
                            'investmentMilestoneId',
                            'name',
                            'order',
                            'fundReleasePercentage',
                            'amount',
                            'fundingStatus',
                            'reviewStatus',
                            'fundingRequestedAt',
                            'reviewedAt',
                            'completedAt'
                        ],
                        order: [['order', 'ASC'], ['createdAt', 'ASC']]
                    }
                ]
            },
            {
                model: InvestmentMilestone,
                as: 'InvestmentMilestone'
            },
            {
                model: Admin,
                as: 'Reviewer',
                attributes: ['id', 'fullName', 'email', 'role']
            },
            fundingEvidenceInclude(),
            checklistInclude(),
            {
                model: MilestoneReviewAudit,
                as: 'ReviewAuditTrail',
                separate: true,
                order: [['createdAt', 'DESC']],
                include: [{
                    model: Admin,
                    as: 'Admin',
                    attributes: ['id', 'fullName', 'email', 'role']
                }]
            }
        ]
    });
}

function formatMilestoneDetail(req, milestone) {
    const data = milestone.toJSON ? milestone.toJSON() : milestone;
    data.FundingEvidence = (data.FundingEvidence || []).map(evidence => ({
        ...evidence,
        fileUrl: toBackendApiUrl(req, evidence.fileUrl)
    }));
    if (data.InvestmentProject?.Farm?.Documents) {
        data.InvestmentProject.Farm.Documents = data.InvestmentProject.Farm.Documents.map(
            document => ({
                ...document,
                fileUrl: toBackendApiUrl(req, document.fileUrl)
            })
        );
    }
    const allMilestones = data.InvestmentProject?.ProjectMilestones || [];
    return {
        ...data,
        amountRequested: formatNumber(data.amount),
        status: data.reviewStatus,
        otherMilestones: allMilestones.filter(item => item.id !== data.id)
    };
}

async function getUserInvestmentMilestone(req, res) {
    try {
        const milestoneId = parseUuid(req.params.milestoneId, 'milestoneId');
        const milestone = await fetchMilestoneDetail(milestoneId);
        if (!milestone) {
            return res.fail('User investment milestone not found', 404);
        }
        return res.success(
            formatMilestoneDetail(req, milestone),
            'User investment milestone retrieved successfully'
        );
    } catch (error) {
        console.error('Get user investment milestone error:', error);
        return res.fail(
            error instanceof AdminInvestmentRequestError
                ? error.message
                : 'Failed to retrieve user investment milestone',
            error.statusCode || 500
        );
    }
}

function normalizeChecklistItems(input, { required = false } = {}) {
    if (input === undefined || input === null) {
        if (required) {
            throw new AdminInvestmentRequestError('checklist must be a non-empty array');
        }
        return null;
    }
    if (!Array.isArray(input) || (required && input.length === 0)) {
        throw new AdminInvestmentRequestError('checklist must be a non-empty array');
    }
    if (input.length > 100) {
        throw new AdminInvestmentRequestError('checklist cannot contain more than 100 items');
    }

    const normalized = input.map((item, index) => {
        const name = cleanString(item?.name, 200);
        const status = parseEnum(item?.status, CHECKLIST_STATUSES, `checklist[${index}].status`);
        const notes = item?.notes === undefined || item?.notes === null
            ? null
            : cleanString(String(item.notes), 5000);
        if (!name) {
            throw new AdminInvestmentRequestError(`checklist[${index}].name is required`);
        }
        return { name, status, notes };
    });
    const names = normalized.map(item => item.name.toLowerCase());
    if (new Set(names).size !== names.length) {
        throw new AdminInvestmentRequestError('checklist item names must be unique');
    }
    return normalized;
}

async function upsertChecklist(milestoneId, items, adminId, transaction) {
    if (!items) {
        return MilestoneVerificationChecklist.findAll({
            where: { userFarmMilestoneId: milestoneId },
            order: [['createdAt', 'ASC']],
            transaction
        });
    }

    const existingItems = await MilestoneVerificationChecklist.findAll({
        where: { userFarmMilestoneId: milestoneId },
        transaction,
        lock: transaction.LOCK.UPDATE
    });
    const existingByName = new Map(
        existingItems.map(item => [item.name.toLowerCase(), item])
    );

    for (const item of items) {
        const existing = existingByName.get(item.name.toLowerCase());
        const values = {
            name: item.name,
            status: item.status,
            notes: item.notes,
            reviewedBy: adminId,
            reviewedAt: new Date()
        };
        if (existing) await existing.update(values, { transaction });
        else {
            await MilestoneVerificationChecklist.create({
                userFarmMilestoneId: milestoneId,
                ...values
            }, { transaction });
        }
    }

    return MilestoneVerificationChecklist.findAll({
        where: { userFarmMilestoneId: milestoneId },
        order: [['createdAt', 'ASC']],
        transaction
    });
}

function checklistSnapshot(items) {
    return items.map(item => ({
        id: item.id,
        name: item.name,
        status: item.status,
        notes: item.notes,
        reviewedBy: item.reviewedBy,
        reviewedAt: item.reviewedAt
    }));
}

function normalizeInternalNotes(value) {
    if (value === undefined || value === null) return null;
    const notes = cleanString(String(value), 5000);
    return notes || null;
}

async function updateMilestoneChecklist(req, res) {
    try {
        const milestoneId = parseUuid(req.params.milestoneId, 'milestoneId');
        const adminId = parseUuid(req.admin?.id, 'adminId');
        if (!adminId) throw new AdminInvestmentRequestError('Admin authentication required', 401);
        const items = normalizeChecklistItems(
            firstDefined(req.body?.checklist, req.body?.items),
            { required: true }
        );
        const internalNotes = normalizeInternalNotes(req.body?.internalNotes);

        await sequelize.transaction(async transaction => {
            const milestone = await UserFarmMilestone.findOne({
                where: {
                    id: milestoneId,
                    userFarmInvestmentId: { [Op.ne]: null }
                },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!milestone) {
                throw new AdminInvestmentRequestError(
                    'User investment milestone not found',
                    404
                );
            }
            if (milestone.reviewStatus === 'approved') {
                throw new AdminInvestmentRequestError(
                    'An approved milestone checklist cannot be changed',
                    409
                );
            }

            const checklist = await upsertChecklist(milestone.id, items, adminId, transaction);
            if (milestone.reviewStatus === 'pending') {
                await milestone.update({
                    fundingStatus: 'processing_funding',
                    reviewedBy: adminId,
                    reviewedAt: new Date()
                }, { transaction });
            }
            await MilestoneReviewAudit.create({
                userFarmMilestoneId: milestone.id,
                adminId,
                action: 'checklist_updated',
                fromReviewStatus: milestone.reviewStatus,
                toReviewStatus: milestone.reviewStatus,
                internalNotes,
                checklistSnapshot: checklistSnapshot(checklist)
            }, { transaction });
        });

        const milestone = await fetchMilestoneDetail(milestoneId);
        return res.success(
            formatMilestoneDetail(req, milestone),
            'Milestone verification checklist updated successfully'
        );
    } catch (error) {
        console.error('Update milestone checklist error:', error);
        return res.fail(
            error instanceof AdminInvestmentRequestError
                ? error.message
                : 'Failed to update milestone verification checklist',
            error.statusCode || 500
        );
    }
}

async function reviewUserInvestmentMilestone(req, res) {
    try {
        const milestoneId = parseUuid(req.params.milestoneId, 'milestoneId');
        const adminId = parseUuid(req.admin?.id, 'adminId');
        if (!adminId) throw new AdminInvestmentRequestError('Admin authentication required', 401);
        const action = parseEnum(req.body?.action, REVIEW_ACTIONS, 'action');
        if (!action) throw new AdminInvestmentRequestError('action is required');
        const internalNotes = normalizeInternalNotes(req.body?.internalNotes);
        const checklistItems = normalizeChecklistItems(
            firstDefined(req.body?.checklist, req.body?.items)
        );
        if (['reject', 'request_more_evidence'].includes(action) && !internalNotes) {
            throw new AdminInvestmentRequestError(
                'internalNotes are required when rejecting or requesting more evidence'
            );
        }

        await sequelize.transaction(async transaction => {
            const milestone = await UserFarmMilestone.findOne({
                where: {
                    id: milestoneId,
                    userFarmInvestmentId: { [Op.ne]: null }
                },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!milestone) {
                throw new AdminInvestmentRequestError(
                    'User investment milestone not found',
                    404
                );
            }
            if (milestone.reviewStatus === 'approved') {
                throw new AdminInvestmentRequestError('Milestone is already approved', 409);
            }
            if (milestone.reviewStatus === 'rejected') {
                throw new AdminInvestmentRequestError('Milestone is already rejected', 409);
            }
            if (!milestone.fundingRequestedAt) {
                throw new AdminInvestmentRequestError(
                    'This milestone has not been submitted for funding',
                    409
                );
            }
            if (
                milestone.reviewStatus === 'more_evidence_required'
                && action === 'approve'
            ) {
                throw new AdminInvestmentRequestError(
                    'The user must resubmit the requested evidence before approval',
                    409
                );
            }

            const checklist = await upsertChecklist(
                milestone.id,
                checklistItems,
                adminId,
                transaction
            );
            if (action === 'approve') {
                const evidenceCount = await MilestoneFundingEvidence.count({
                    where: { userFarmMilestoneId: milestone.id },
                    transaction
                });
                if (evidenceCount === 0) {
                    throw new AdminInvestmentRequestError(
                        'Funding evidence is required before approval',
                        409
                    );
                }
                if (checklist.length === 0) {
                    throw new AdminInvestmentRequestError(
                        'At least one verification checklist item is required before approval',
                        409
                    );
                }
                const unresolvedItem = checklist.find(item => item.status !== 'verified');
                if (unresolvedItem) {
                    throw new AdminInvestmentRequestError(
                        `Checklist item "${unresolvedItem.name}" must be verified before approval`,
                        409
                    );
                }
            }

            const fromReviewStatus = milestone.reviewStatus;
            const decision = {
                approve: {
                    reviewStatus: 'approved',
                    fundingStatus: 'completed',
                    isCompleted: true,
                    completedAt: new Date()
                },
                reject: {
                    reviewStatus: 'rejected',
                    fundingStatus: 'request_for_funding',
                    isCompleted: false,
                    completedAt: null
                },
                request_more_evidence: {
                    reviewStatus: 'more_evidence_required',
                    fundingStatus: 'request_for_funding',
                    isCompleted: false,
                    completedAt: null
                }
            }[action];

            await milestone.update({
                ...decision,
                reviewedBy: adminId,
                reviewedAt: new Date()
            }, { transaction });

            await MilestoneReviewAudit.create({
                userFarmMilestoneId: milestone.id,
                adminId,
                action,
                fromReviewStatus,
                toReviewStatus: decision.reviewStatus,
                internalNotes,
                checklistSnapshot: checklistSnapshot(checklist)
            }, { transaction });
        });

        const milestone = await fetchMilestoneDetail(milestoneId);
        return res.success(
            formatMilestoneDetail(req, milestone),
            `Milestone ${action.replace(/_/g, ' ')} action completed successfully`
        );
    } catch (error) {
        console.error('Review user investment milestone error:', error);
        return res.fail(
            error instanceof AdminInvestmentRequestError
                ? error.message
                : 'Failed to review user investment milestone',
            error.statusCode || 500
        );
    }
}

module.exports = {
    listUserInvestments,
    listUserInvestmentMilestones,
    downloadUserInvestmentMilestones,
    getUserInvestmentMilestone,
    updateMilestoneChecklist,
    reviewUserInvestmentMilestone,
    _private: {
        parsePagination,
        normalizeChecklistItems,
        makeTrend,
        csvCell
    }
};
