'use strict';

const { Op } = require('sequelize');
const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const { toBackendApiUrl } = require('../../../utils/url');

const models = defineModels(sequelize);
const {
    FarmCategory,
    FarmDocument,
    Investment,
    InvestmentMilestone,
    InvestmentPayment,
    Milestone,
    User,
    UserFarm,
    UserFarmInvestment,
    UserFarmMilestone
} = models;

const PORTFOLIO_PAYMENT_STATUSES = ['recorded', 'successful'];
const PORTFOLIO_STATUSES = ['active', 'completed'];
const DEFAULT_CURRENCY = 'NGN';

function toMoneyCents(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return 0;
    return Math.round(amount * 100);
}

function fromMoneyCents(value) {
    return Number((value / 100).toFixed(2));
}

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function getInvestedAt(payment) {
    return new Date(payment.paidAt || payment.createdAt);
}

function addDuration(date, durationValue, durationUnit) {
    const value = Number(durationValue);
    if (!(date instanceof Date) || Number.isNaN(date.getTime()) || !Number.isInteger(value) || value <= 0) {
        return null;
    }

    const result = new Date(date);
    if (durationUnit === 'weeks') {
        result.setUTCDate(result.getUTCDate() + (value * 7));
    } else if (durationUnit === 'months') {
        result.setUTCMonth(result.getUTCMonth() + value);
    } else if (durationUnit === 'years') {
        result.setUTCFullYear(result.getUTCFullYear() + value);
    } else {
        return null;
    }

    return result;
}

function getInvestmentEndDate(payment) {
    const template = payment.InvestmentTemplate;

    if (template?.endDate) {
        return new Date(`${template.endDate}T23:59:59.999Z`);
    }

    const configuredStartDate = template?.startDate
        ? new Date(`${template.startDate}T00:00:00.000Z`)
        : getInvestedAt(payment);

    return addDuration(configuredStartDate, template?.durationValue, template?.durationUnit);
}

function getPortfolioStatus(payment, asOf = new Date()) {
    const endDate = getInvestmentEndDate(payment);
    return endDate && endDate < asOf ? 'completed' : 'active';
}

function getExpectedReturnCents(payment) {
    const amountInCents = toMoneyCents(payment.amount);
    const roiPercentage = toNumber(payment.InvestmentTemplate?.roiPercentage);
    return Math.round((amountInCents * roiPercentage) / 100);
}

function getMonthRanges(asOf = new Date()) {
    const currentMonthStart = new Date(Date.UTC(
        asOf.getUTCFullYear(),
        asOf.getUTCMonth(),
        1
    ));
    const nextMonthStart = new Date(Date.UTC(
        asOf.getUTCFullYear(),
        asOf.getUTCMonth() + 1,
        1
    ));
    const previousMonthStart = new Date(Date.UTC(
        asOf.getUTCFullYear(),
        asOf.getUTCMonth() - 1,
        1
    ));

    return {
        currentMonthStart,
        currentMonthEnd: nextMonthStart,
        previousMonthStart,
        previousMonthEnd: currentMonthStart
    };
}

function isWithinRange(value, start, end) {
    return value instanceof Date
        && !Number.isNaN(value.getTime())
        && value >= start
        && value < end;
}

function buildTrend(currentValue, previousValue, money = false) {
    const change = currentValue - previousValue;
    let direction = 'flat';

    if (change > 0) direction = 'up';
    if (change < 0) direction = 'down';

    const percentage = previousValue === 0
        ? (currentValue === 0 ? 0 : 100)
        : Number((Math.abs((change / previousValue) * 100)).toFixed(2));

    const format = money ? fromMoneyCents : value => value;

    return {
        direction,
        percentage,
        change: format(change),
        currentMonth: format(currentValue),
        previousMonth: format(previousValue),
        comparison: 'current_month_vs_previous_month'
    };
}

function groupMoneyByCurrency(entries, valueSelector) {
    const totals = new Map();

    entries.forEach(entry => {
        const currency = String(entry.currency || DEFAULT_CURRENCY).toUpperCase();
        totals.set(currency, (totals.get(currency) || 0) + valueSelector(entry));
    });

    return [...totals.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([currency, amountInCents]) => ({
            currency,
            amount: fromMoneyCents(amountInCents)
        }));
}

function buildMoneyMetric(entries, valueSelector, currentEntries, previousEntries) {
    const totalInCents = entries.reduce((sum, entry) => sum + valueSelector(entry), 0);
    const currentInCents = currentEntries.reduce((sum, entry) => sum + valueSelector(entry), 0);
    const previousInCents = previousEntries.reduce((sum, entry) => sum + valueSelector(entry), 0);
    const breakdown = groupMoneyByCurrency(entries, valueSelector);

    return {
        amount: fromMoneyCents(totalInCents),
        currency: breakdown.length <= 1
            ? (breakdown[0]?.currency || DEFAULT_CURRENCY)
            : 'MIXED',
        breakdown,
        trend: buildTrend(currentInCents, previousInCents, true)
    };
}

function formatPaymentForPortfolio(payment, asOf) {
    const data = payment.toJSON ? payment.toJSON() : payment;
    const investedAt = getInvestedAt(data);
    const endDate = getInvestmentEndDate(data);
    const portfolioStatus = getPortfolioStatus(data, asOf);
    const expectedReturnInCents = getExpectedReturnCents(data);

    return {
        ...data,
        investedAt,
        effectiveEndDate: endDate,
        portfolioStatus,
        amountInCents: toMoneyCents(data.amount),
        expectedReturnInCents,
        earnedReturnInCents: portfolioStatus === 'completed' ? expectedReturnInCents : 0,
        currency: String(data.currency || DEFAULT_CURRENCY).toUpperCase()
    };
}

async function findPortfolioPayments(investorId, includeFarmDetails = false, userFarmId = null) {
    const include = [{
        model: Investment,
        as: 'InvestmentTemplate',
        required: true,
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
            'currency',
            'isActive',
            'createdAt',
            'updatedAt'
        ]
    }];

    if (includeFarmDetails) {
        include.unshift({
            model: UserFarm,
            as: 'Farm',
            required: true,
            include: [
                {
                    model: User,
                    as: 'User',
                    attributes: ['id', 'fullName', 'bio', 'profileImageUrl']
                },
                {
                    model: UserFarmInvestment,
                    as: 'Investment',
                    attributes: [
                        'id',
                        'farmCategoryId',
                        'investmentId',
                        'expectedInvestment',
                        'investmentReceived',
                        'investmentPending',
                        'currency',
                        'investmentStatus',
                        'notes',
                        'isActive',
                        'createdAt',
                        'updatedAt'
                    ],
                    include: [{
                        model: FarmCategory,
                        as: 'Category',
                        attributes: ['id', 'name', 'description', 'isActive', 'createdAt', 'updatedAt']
                    }]
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
                    ]
                },
                {
                    model: UserFarmMilestone,
                    as: 'SelectedMilestones',
                    attributes: [
                        'id',
                        'milestoneId',
                        'investmentMilestoneId',
                        'isCompleted',
                        'completedAt',
                        'amount',
                        'createdAt',
                        'updatedAt'
                    ],
                    include: [
                        {
                            model: Milestone,
                            as: 'Milestone',
                            attributes: ['id', 'name', 'order', 'isActive'],
                            required: false
                        },
                        {
                            model: InvestmentMilestone,
                            as: 'InvestmentMilestone',
                            attributes: [
                                'id',
                                'investmentId',
                                'name',
                                'fundReleasePercentage',
                                'order',
                                'isActive'
                            ],
                            required: false
                        }
                    ]
                }
            ]
        });
    }

    const where = {
        investorId,
        status: {
            [Op.in]: PORTFOLIO_PAYMENT_STATUSES
        }
    };

    if (userFarmId) {
        where.userFarmId = userFarmId;
    }

    return InvestmentPayment.findAll({
        where,
        attributes: [
            'id',
            'investorId',
            'userFarmId',
            'userFarmInvestmentId',
            'investmentId',
            'reference',
            'amount',
            'currency',
            'gateway',
            'gatewayReference',
            'status',
            'paidAt',
            'createdAt',
            'updatedAt'
        ],
        include,
        order: [['createdAt', 'DESC']]
    });
}

function buildPortfolioSummary(payments, asOf = new Date()) {
    const entries = payments.map(payment => formatPaymentForPortfolio(payment, asOf));
    const {
        currentMonthStart,
        currentMonthEnd,
        previousMonthStart,
        previousMonthEnd
    } = getMonthRanges(asOf);
    const currentInvestments = entries.filter(entry =>
        isWithinRange(entry.investedAt, currentMonthStart, currentMonthEnd)
    );
    const previousInvestments = entries.filter(entry =>
        isWithinRange(entry.investedAt, previousMonthStart, previousMonthEnd)
    );
    const currentEarnedReturns = entries.filter(entry =>
        entry.portfolioStatus === 'completed'
        && isWithinRange(entry.effectiveEndDate, currentMonthStart, currentMonthEnd)
    );
    const previousEarnedReturns = entries.filter(entry =>
        entry.portfolioStatus === 'completed'
        && isWithinRange(entry.effectiveEndDate, previousMonthStart, previousMonthEnd)
    );

    const firstInvestmentByFarm = new Map();
    entries.forEach(entry => {
        const currentFirst = firstInvestmentByFarm.get(entry.userFarmId);
        if (!currentFirst || entry.investedAt < currentFirst) {
            firstInvestmentByFarm.set(entry.userFarmId, entry.investedAt);
        }
    });

    const firstInvestmentDates = [...firstInvestmentByFarm.values()];
    const currentFarmCount = firstInvestmentDates.filter(date =>
        isWithinRange(date, currentMonthStart, currentMonthEnd)
    ).length;
    const previousFarmCount = firstInvestmentDates.filter(date =>
        isWithinRange(date, previousMonthStart, previousMonthEnd)
    ).length;

    return {
        asOf: asOf.toISOString(),
        summary: {
            totalInvested: buildMoneyMetric(
                entries,
                entry => entry.amountInCents,
                currentInvestments,
                previousInvestments
            ),
            totalFarmsInvested: {
                count: firstInvestmentByFarm.size,
                trend: buildTrend(currentFarmCount, previousFarmCount)
            },
            totalExpectedReturns: buildMoneyMetric(
                entries,
                entry => entry.expectedReturnInCents,
                currentInvestments,
                previousInvestments
            ),
            totalEarnedReturns: buildMoneyMetric(
                entries,
                entry => entry.earnedReturnInCents,
                currentEarnedReturns,
                previousEarnedReturns
            )
        }
    };
}

function formatDocument(req, document) {
    return {
        ...document,
        fileUrl: toBackendApiUrl(req, document.fileUrl)
    };
}

function formatMilestone(milestone) {
    const milestoneData = milestone.InvestmentMilestone || milestone.Milestone;

    return {
        id: milestone.id,
        milestoneId: milestone.investmentMilestoneId || milestone.milestoneId,
        milestoneType: milestone.investmentMilestoneId
            ? 'investment_template'
            : 'farm_category',
        name: milestoneData?.name || null,
        order: milestoneData?.order ?? null,
        fundReleasePercentage: milestoneData?.fundReleasePercentage === undefined
            ? null
            : toNumber(milestoneData.fundReleasePercentage),
        amount: toNumber(milestone.amount),
        isCompleted: !!milestone.isCompleted,
        status: milestone.isCompleted ? 'completed' : 'pending',
        completedAt: milestone.completedAt,
        createdAt: milestone.createdAt,
        updatedAt: milestone.updatedAt
    };
}

function formatTemplate(template) {
    if (!template) return null;

    return {
        id: template.id,
        farmCategoryId: template.farmCategoryId,
        name: template.name,
        description: template.description,
        startDate: template.startDate,
        endDate: template.endDate,
        roiPercentage: toNumber(template.roiPercentage),
        duration: {
            value: template.durationValue,
            unit: template.durationUnit,
            label: `${template.durationValue} ${template.durationUnit}`
        },
        riskLevel: template.riskLevel,
        fundingRules: {
            minGoal: toNumber(template.fundingMinGoal),
            maxGoal: toNumber(template.fundingMaxGoal),
            currency: template.currency
        },
        investmentLimit: {
            minGoal: toNumber(template.investmentMinGoal),
            maxGoal: toNumber(template.investmentMaxGoal),
            currency: template.currency
        },
        currency: template.currency,
        isActive: template.isActive,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt
    };
}

function buildUserInvestmentBreakdown(entries) {
    const currencies = [...new Set(entries.map(entry => entry.currency))].sort();

    return currencies.map(currency => {
        const currencyEntries = entries.filter(entry => entry.currency === currency);
        return {
            currency,
            amountInvested: fromMoneyCents(
                currencyEntries.reduce((sum, entry) => sum + entry.amountInCents, 0)
            ),
            expectedReturns: fromMoneyCents(
                currencyEntries.reduce((sum, entry) => sum + entry.expectedReturnInCents, 0)
            ),
            earnedReturns: fromMoneyCents(
                currencyEntries.reduce((sum, entry) => sum + entry.earnedReturnInCents, 0)
            )
        };
    });
}

function formatPortfolioFarm(req, entries) {
    const farm = entries[0].Farm || {};
    const funding = farm.Investment || {};
    const breakdown = buildUserInvestmentBreakdown(entries);
    const amountInCents = entries.reduce((sum, entry) => sum + entry.amountInCents, 0);
    const expectedReturnInCents = entries.reduce(
        (sum, entry) => sum + entry.expectedReturnInCents,
        0
    );
    const earnedReturnInCents = entries.reduce(
        (sum, entry) => sum + entry.earnedReturnInCents,
        0
    );
    const activeCount = entries.filter(entry => entry.portfolioStatus === 'active').length;
    const completedCount = entries.length - activeCount;
    const investmentDates = entries.map(entry => entry.investedAt).sort((left, right) => left - right);
    const templates = new Map();

    entries.forEach(entry => {
        const template = entry.InvestmentTemplate;
        const templateId = template.id;
        const templateEntries = templates.get(templateId) || [];
        templateEntries.push(entry);
        templates.set(templateId, templateEntries);
    });

    const documents = (farm.Documents || []).map(document => formatDocument(req, document));
    const pictures = documents.filter(document => document.documentType === 'picture');
    const milestones = (farm.SelectedMilestones || [])
        .map(formatMilestone)
        .sort((left, right) =>
            (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER)
        );
    const completedMilestones = milestones.filter(milestone => milestone.isCompleted).length;

    return {
        id: farm.id,
        farmId: farm.id,
        name: farm.name,
        location: farm.location,
        size: farm.size,
        currency: funding.currency || DEFAULT_CURRENCY,
        isActive: farm.isActive,
        verificationStatus: farm.verificationStatus,
        rejectionNote: farm.rejectionNote,
        createdAt: farm.createdAt,
        updatedAt: farm.updatedAt,
        category: funding.Category || null,
        owner: farm.User ? {
            id: farm.User.id,
            name: farm.User.fullName,
            bio: farm.User.bio,
            profileImageUrl: toBackendApiUrl(req, farm.User.profileImageUrl)
        } : null,
        image: pictures[0] || null,
        images: pictures,
        documents,
        funding: {
            id: funding.id || null,
            expectedInvestment: toNumber(funding.expectedInvestment),
            investmentReceived: toNumber(funding.investmentReceived),
            investmentPending: toNumber(funding.investmentPending),
            currency: funding.currency || DEFAULT_CURRENCY,
            status: funding.investmentStatus || null,
            notes: funding.notes || null,
            isActive: funding.isActive ?? null,
            createdAt: funding.createdAt || null,
            updatedAt: funding.updatedAt || null
        },
        milestones,
        milestoneStats: {
            total: milestones.length,
            completed: completedMilestones,
            pending: milestones.length - completedMilestones,
            completionPercentage: milestones.length > 0
                ? Number(((completedMilestones / milestones.length) * 100).toFixed(2))
                : 0
        },
        portfolioStatus: activeCount > 0 ? 'active' : 'completed',
        userInvestment: {
            amountInvested: fromMoneyCents(amountInCents),
            expectedReturns: fromMoneyCents(expectedReturnInCents),
            earnedReturns: fromMoneyCents(earnedReturnInCents),
            currency: breakdown.length <= 1
                ? (breakdown[0]?.currency || DEFAULT_CURRENCY)
                : 'MIXED',
            breakdown,
            transactionCount: entries.length,
            activeTransactionCount: activeCount,
            completedTransactionCount: completedCount,
            firstInvestedAt: investmentDates[0]?.toISOString() || null,
            lastInvestedAt: investmentDates[investmentDates.length - 1]?.toISOString() || null
        },
        investments: [...templates.values()].map(templateEntries => {
            const template = templateEntries[0].InvestmentTemplate;
            const templateAmount = templateEntries.reduce(
                (sum, entry) => sum + entry.amountInCents,
                0
            );
            const templateExpectedReturn = templateEntries.reduce(
                (sum, entry) => sum + entry.expectedReturnInCents,
                0
            );
            const templateEarnedReturn = templateEntries.reduce(
                (sum, entry) => sum + entry.earnedReturnInCents,
                0
            );

            return {
                ...formatTemplate(template),
                portfolioStatus: templateEntries.some(entry => entry.portfolioStatus === 'active')
                    ? 'active'
                    : 'completed',
                amountInvested: fromMoneyCents(templateAmount),
                expectedReturns: fromMoneyCents(templateExpectedReturn),
                earnedReturns: fromMoneyCents(templateEarnedReturn),
                transactions: templateEntries.map(entry => ({
                    id: entry.id,
                    reference: entry.reference,
                    amount: fromMoneyCents(entry.amountInCents),
                    currency: entry.currency,
                    gateway: entry.gateway,
                    gatewayReference: entry.gatewayReference,
                    paymentStatus: entry.status,
                    portfolioStatus: entry.portfolioStatus,
                    expectedReturn: fromMoneyCents(entry.expectedReturnInCents),
                    earnedReturn: fromMoneyCents(entry.earnedReturnInCents),
                    paidAt: entry.paidAt,
                    investedAt: entry.investedAt.toISOString(),
                    effectiveEndDate: entry.effectiveEndDate?.toISOString() || null,
                    createdAt: entry.createdAt,
                    updatedAt: entry.updatedAt
                }))
            };
        })
    };
}

async function getPortfolio(req, res) {
    try {
        const investorId = req.user?.id;

        if (!investorId) {
            return res.fail('User not authenticated', 401);
        }

        const payments = await findPortfolioPayments(investorId);
        return res.success(
            buildPortfolioSummary(payments),
            'Portfolio retrieved successfully'
        );
    } catch (error) {
        console.error('Get user portfolio error:', error);
        return res.fail('Failed to retrieve portfolio', 500);
    }
}

async function getPortfolioFarms(req, res) {
    try {
        const investorId = req.user?.id;
        const requestedStatus = req.query.status
            ? String(req.query.status).trim().toLowerCase()
            : null;

        if (!investorId) {
            return res.fail('User not authenticated', 401);
        }

        if (requestedStatus && !PORTFOLIO_STATUSES.includes(requestedStatus)) {
            return res.fail('status must be either active or completed', 400);
        }

        const asOf = new Date();
        const payments = await findPortfolioPayments(investorId, true);
        const entries = payments
            .map(payment => formatPaymentForPortfolio(payment, asOf))
            .filter(entry => !requestedStatus || entry.portfolioStatus === requestedStatus);
        const entriesByFarm = new Map();

        entries.forEach(entry => {
            const farmEntries = entriesByFarm.get(entry.userFarmId) || [];
            farmEntries.push(entry);
            entriesByFarm.set(entry.userFarmId, farmEntries);
        });

        const farms = [...entriesByFarm.values()]
            .map(farmEntries => formatPortfolioFarm(req, farmEntries))
            .sort((left, right) =>
                new Date(right.userInvestment.lastInvestedAt) - new Date(left.userInvestment.lastInvestedAt)
            );

        return res.success({
            status: requestedStatus || 'all',
            total: farms.length,
            farms
        }, 'Portfolio farms retrieved successfully');
    } catch (error) {
        console.error('Get user portfolio farms error:', error);
        return res.fail('Failed to retrieve portfolio farms', 500);
    }
}

async function getPortfolioFarmById(req, res) {
    try {
        const investorId = req.user?.id;
        const { farmId } = req.params;

        if (!investorId) {
            return res.fail('User not authenticated', 401);
        }

        if (!farmId) {
            return res.fail('Farm ID is required', 400);
        }

        const asOf = new Date();
        const payments = await findPortfolioPayments(investorId, true, farmId);

        if (payments.length === 0) {
            return res.fail('Invested farm not found', 404);
        }

        const entries = payments.map(payment => formatPaymentForPortfolio(payment, asOf));

        return res.success(
            formatPortfolioFarm(req, entries),
            'Portfolio farm details retrieved successfully'
        );
    } catch (error) {
        console.error('Get user portfolio farm details error:', error);
        return res.fail('Failed to retrieve portfolio farm details', 500);
    }
}

module.exports = {
    getPortfolio,
    getPortfolioFarms,
    getPortfolioFarmById
};
