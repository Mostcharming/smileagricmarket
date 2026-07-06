'use strict';

const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const { Op } = require('sequelize');

const models = defineModels(sequelize);
const { Investment, FarmCategory, UserFarm, UserFarmInvestment, User } = models;

const DURATION_UNITS = ['weeks', 'months', 'years'];
const RISK_LEVELS = ['low', 'medium', 'high'];

function firstDefined(...values) {
    return values.find(value => value !== undefined);
}

function toMoney(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
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

function formatInvestmentFarm(farm, template) {
    const data = farm.toJSON ? farm.toJSON() : farm;
    const farmInvestment = data.Investment || {};
    const fundingReceived = toMoney(farmInvestment.investmentReceived);
    const totalExpectedFunding = farmInvestment.expectedInvestment !== null && farmInvestment.expectedInvestment !== undefined
        ? toMoney(farmInvestment.expectedInvestment)
        : toMoney(template.fundingMaxGoal);

    return {
        id: data.id,
        farmId: data.id,
        farmName: data.name,
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
                return template ? formatInvestmentFarm(farm, template) : null;
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

module.exports = {
    getInvestments
};
