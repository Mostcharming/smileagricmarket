'use strict';

const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const { Op } = require('sequelize');

const models = defineModels(sequelize);
const { FarmCategory, Investment, InvestmentMilestone } = models;

const DURATION_UNITS = ['weeks', 'months', 'years'];
const RISK_LEVELS = ['low', 'medium', 'high'];

function firstDefined(...values) {
    return values.find(value => value !== undefined);
}

function toNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseMoney(value, fieldName, errors, options = {}) {
    const { required = false } = options;

    if (value === undefined || value === null || value === '') {
        if (required) errors.push(`${fieldName} is required`);
        return undefined;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        errors.push(`${fieldName} must be a valid non-negative amount`);
        return undefined;
    }

    return parsed;
}

function parsePercentage(value, fieldName, errors, options = {}) {
    const { required = false, max = null } = options;

    if (value === undefined || value === null || value === '') {
        if (required) errors.push(`${fieldName} is required`);
        return undefined;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        errors.push(`${fieldName} must be a valid non-negative percentage`);
        return undefined;
    }

    if (max !== null && parsed > max) {
        errors.push(`${fieldName} cannot be greater than ${max}`);
        return undefined;
    }

    return parsed;
}

function parsePositiveInteger(value, fieldName, errors, options = {}) {
    const { required = false } = options;

    if (value === undefined || value === null || value === '') {
        if (required) errors.push(`${fieldName} is required`);
        return undefined;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        errors.push(`${fieldName} must be a positive integer`);
        return undefined;
    }

    return parsed;
}

function parseOptionalInteger(value, fieldName, errors) {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
        errors.push(`${fieldName} must be a non-negative integer`);
        return undefined;
    }

    return parsed;
}

function parseBoolean(value, fieldName, errors) {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
    }

    errors.push(`${fieldName} must be a boolean`);
    return undefined;
}

function parseCurrency(value, errors) {
    if (value === undefined || value === null || value === '') {
        return 'NGN';
    }

    const currency = String(value).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
        errors.push('currency must be a 3-letter currency code');
        return undefined;
    }

    return currency;
}

function normalizeInvestmentPayload(body, options = {}) {
    const { requireAll = false, currentInvestment = null } = options;
    const errors = [];
    const payload = {};

    const name = firstDefined(body.name, body.title);
    if (name !== undefined || requireAll) {
        if (!name || String(name).trim() === '') {
            errors.push('name is required');
        } else {
            payload.name = String(name).trim();
        }
    }

    const description = firstDefined(body.description);
    if (description !== undefined) {
        payload.description = description === null ? null : String(description).trim() || null;
    }

    const farmCategoryId = firstDefined(body.farmCategoryId, body.categoryId);
    if (farmCategoryId !== undefined || requireAll) {
        if (!farmCategoryId || String(farmCategoryId).trim() === '') {
            errors.push('farmCategoryId is required');
        } else {
            payload.farmCategoryId = String(farmCategoryId).trim();
        }
    }

    const roiPercentage = firstDefined(
        body.roiPercentage,
        body.expectedReturnPercentage,
        body.roiConfiguration?.percentage,
        body.roi?.percentage
    );
    const parsedRoiPercentage = parsePercentage(roiPercentage, 'roiPercentage', errors, { required: requireAll });
    if (parsedRoiPercentage !== undefined) payload.roiPercentage = parsedRoiPercentage;

    const durationValue = firstDefined(body.durationValue, body.duration?.value);
    const parsedDurationValue = parsePositiveInteger(durationValue, 'durationValue', errors, { required: requireAll });
    if (parsedDurationValue !== undefined) payload.durationValue = parsedDurationValue;

    const durationUnit = firstDefined(body.durationUnit, body.duration?.unit);
    if (durationUnit !== undefined || requireAll) {
        const normalizedDurationUnit = String(durationUnit || '').trim().toLowerCase();
        if (!DURATION_UNITS.includes(normalizedDurationUnit)) {
            errors.push('durationUnit must be one of weeks, months, years');
        } else {
            payload.durationUnit = normalizedDurationUnit;
        }
    }

    const riskLevel = firstDefined(body.riskLevel, body.risk?.level);
    if (riskLevel !== undefined) {
        const normalizedRiskLevel = String(riskLevel || '').trim().toLowerCase();
        if (!RISK_LEVELS.includes(normalizedRiskLevel)) {
            errors.push('riskLevel must be one of low, medium, high');
        } else {
            payload.riskLevel = normalizedRiskLevel;
        }
    }

    const fundingMinGoal = firstDefined(body.fundingMinGoal, body.fundingRules?.minGoal);
    const fundingMaxGoal = firstDefined(body.fundingMaxGoal, body.fundingRules?.maxGoal);
    const parsedFundingMinGoal = parseMoney(fundingMinGoal, 'fundingMinGoal', errors, { required: requireAll });
    const parsedFundingMaxGoal = parseMoney(fundingMaxGoal, 'fundingMaxGoal', errors, { required: requireAll });
    if (parsedFundingMinGoal !== undefined) payload.fundingMinGoal = parsedFundingMinGoal;
    if (parsedFundingMaxGoal !== undefined) payload.fundingMaxGoal = parsedFundingMaxGoal;

    const investmentMinGoal = firstDefined(body.investmentMinGoal, body.investmentLimit?.minGoal);
    const investmentMaxGoal = firstDefined(body.investmentMaxGoal, body.investmentLimit?.maxGoal);
    const parsedInvestmentMinGoal = parseMoney(investmentMinGoal, 'investmentMinGoal', errors, { required: requireAll });
    const parsedInvestmentMaxGoal = parseMoney(investmentMaxGoal, 'investmentMaxGoal', errors, { required: requireAll });
    if (parsedInvestmentMinGoal !== undefined) payload.investmentMinGoal = parsedInvestmentMinGoal;
    if (parsedInvestmentMaxGoal !== undefined) payload.investmentMaxGoal = parsedInvestmentMaxGoal;

    const currency = firstDefined(body.currency);
    if (currency !== undefined || requireAll) {
        const parsedCurrency = parseCurrency(currency, errors);
        if (parsedCurrency !== undefined) payload.currency = parsedCurrency;
    }

    const isActive = parseBoolean(body.isActive, 'isActive', errors);
    if (isActive !== undefined) payload.isActive = isActive;

    const nextFundingMin = payload.fundingMinGoal !== undefined
        ? payload.fundingMinGoal
        : toNumber(currentInvestment?.fundingMinGoal);
    const nextFundingMax = payload.fundingMaxGoal !== undefined
        ? payload.fundingMaxGoal
        : toNumber(currentInvestment?.fundingMaxGoal);

    if (nextFundingMin !== null && nextFundingMax !== null && nextFundingMax < nextFundingMin) {
        errors.push('fundingMaxGoal must be greater than or equal to fundingMinGoal');
    }

    const nextInvestmentMin = payload.investmentMinGoal !== undefined
        ? payload.investmentMinGoal
        : toNumber(currentInvestment?.investmentMinGoal);
    const nextInvestmentMax = payload.investmentMaxGoal !== undefined
        ? payload.investmentMaxGoal
        : toNumber(currentInvestment?.investmentMaxGoal);

    if (nextInvestmentMin !== null && nextInvestmentMax !== null && nextInvestmentMax < nextInvestmentMin) {
        errors.push('investmentMaxGoal must be greater than or equal to investmentMinGoal');
    }

    if (
        nextInvestmentMax !== null &&
        nextFundingMax !== null &&
        nextInvestmentMax > nextFundingMax
    ) {
        errors.push('investmentMaxGoal cannot be greater than fundingMaxGoal');
    }

    return { payload, errors };
}

function normalizeMilestonesInput(input, options = {}) {
    const { required = false } = options;
    const errors = [];

    if (input === undefined || input === null || input === '') {
        if (required) errors.push('milestones is required');
        return { milestones: null, errors };
    }

    let parsedInput = input;
    if (typeof input === 'string') {
        try {
            parsedInput = JSON.parse(input);
        } catch (error) {
            return { milestones: null, errors: ['milestones must be a valid JSON array'] };
        }
    }

    if (!Array.isArray(parsedInput)) {
        return { milestones: null, errors: ['milestones must be an array'] };
    }

    const milestones = parsedInput.map((milestone, index) => {
        if (!milestone || typeof milestone !== 'object' || Array.isArray(milestone)) {
            errors.push(`milestones[${index}] must be an object`);
            return null;
        }

        const name = milestone.name;
        if (!name || String(name).trim() === '') {
            errors.push(`milestones[${index}].name is required`);
        }

        const fundReleasePercentage = firstDefined(
            milestone.fundReleasePercentage,
            milestone.releasePercentage,
            milestone.percentage
        );
        const parsedFundReleasePercentage = parsePercentage(
            fundReleasePercentage,
            `milestones[${index}].fundReleasePercentage`,
            errors,
            { required: true, max: 100 }
        );

        const order = parseOptionalInteger(milestone.order, `milestones[${index}].order`, errors);
        const isActive = parseBoolean(milestone.isActive, `milestones[${index}].isActive`, errors);

        return {
            name: name ? String(name).trim() : '',
            fundReleasePercentage: parsedFundReleasePercentage,
            order,
            isActive: isActive === undefined ? true : isActive
        };
    }).filter(Boolean);

    const totalFundReleasePercentage = milestones.reduce((sum, milestone) => {
        return sum + (Number(milestone.fundReleasePercentage) || 0);
    }, 0);

    if (totalFundReleasePercentage > 100) {
        errors.push('Total milestone fund release percentage cannot be greater than 100');
    }

    return { milestones, errors };
}

function formatMoney(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatMilestone(milestone) {
    const data = milestone.toJSON ? milestone.toJSON() : milestone;

    return {
        id: data.id,
        investmentId: data.investmentId,
        name: data.name,
        fundReleasePercentage: formatMoney(data.fundReleasePercentage),
        order: data.order,
        isActive: data.isActive,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
    };
}

function formatInvestment(investment) {
    const data = investment.toJSON ? investment.toJSON() : investment;
    const milestones = data.Milestones || data.milestones || [];
    const farmCategory = data.FarmCategory || data.farmCategory || null;

    return {
        id: data.id,
        farmCategoryId: data.farmCategoryId,
        farmCategory: farmCategory ? {
            id: farmCategory.id,
            name: farmCategory.name,
            description: farmCategory.description
        } : null,
        name: data.name,
        description: data.description,
        roiPercentage: formatMoney(data.roiPercentage),
        durationValue: data.durationValue,
        durationUnit: data.durationUnit,
        duration: {
            value: data.durationValue,
            unit: data.durationUnit,
            label: `${data.durationValue} ${data.durationUnit}`
        },
        riskLevel: data.riskLevel || 'medium',
        fundingRules: {
            minGoal: formatMoney(data.fundingMinGoal),
            maxGoal: formatMoney(data.fundingMaxGoal),
            currency: data.currency
        },
        investmentLimit: {
            minGoal: formatMoney(data.investmentMinGoal),
            maxGoal: formatMoney(data.investmentMaxGoal),
            currency: data.currency
        },
        currency: data.currency,
        isActive: data.isActive,
        milestones: milestones.map(formatMilestone),
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
    };
}

function getInvestmentInclude() {
    return [
        {
            model: FarmCategory,
            as: 'FarmCategory',
            attributes: ['id', 'name', 'description', 'isActive']
        },
        {
            model: InvestmentMilestone,
            as: 'Milestones',
            attributes: ['id', 'investmentId', 'name', 'fundReleasePercentage', 'order', 'isActive', 'createdAt', 'updatedAt']
        }
    ];
}

async function ensureFarmCategoryExists(farmCategoryId) {
    if (!farmCategoryId) return null;
    return FarmCategory.findByPk(farmCategoryId);
}

async function getMilestoneTotalForInvestment(investmentId, options = {}) {
    const { excludeMilestoneId = null } = options;
    const whereClause = { investmentId };

    if (excludeMilestoneId) {
        whereClause.id = { [Op.ne]: excludeMilestoneId };
    }

    const milestones = await InvestmentMilestone.findAll({
        where: whereClause,
        attributes: ['fundReleasePercentage']
    });

    return milestones.reduce((sum, milestone) => {
        return sum + (Number(milestone.fundReleasePercentage) || 0);
    }, 0);
}

async function fetchInvestmentById(investmentId) {
    return Investment.findByPk(investmentId, {
        include: getInvestmentInclude(),
        order: [[{ model: InvestmentMilestone, as: 'Milestones' }, 'order', 'ASC']]
    });
}

async function createInvestment(req, res) {
    let transaction;

    try {
        const { payload, errors } = normalizeInvestmentPayload(req.body, { requireAll: true });
        const { milestones, errors: milestoneErrors } = normalizeMilestonesInput(req.body.milestones);
        const validationErrors = [...errors, ...milestoneErrors];

        if (validationErrors.length > 0) {
            return res.fail(validationErrors.join(', '), 400);
        }

        const category = await ensureFarmCategoryExists(payload.farmCategoryId);
        if (!category) {
            return res.fail('Farm category not found', 404);
        }

        transaction = await sequelize.transaction();
        const investment = await Investment.create(payload, { transaction });

        if (milestones && milestones.length > 0) {
            await InvestmentMilestone.bulkCreate(
                milestones.map(milestone => ({
                    ...milestone,
                    investmentId: investment.id
                })),
                { transaction }
            );
        }

        await transaction.commit();
        transaction = null;

        const createdInvestment = await fetchInvestmentById(investment.id);
        return res.success(formatInvestment(createdInvestment), 'Investment created successfully', 201);
    } catch (error) {
        if (transaction) await transaction.rollback();
        console.error('Create investment error:', error);
        return res.fail(error.message, 500);
    }
}

async function getAllInvestments(req, res) {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
        const offset = (page - 1) * limit;
        const search = req.query.search ? req.query.search.trim() : '';
        const activeOnly = req.query.activeOnly === undefined ? 'true' : String(req.query.activeOnly);

        const whereClause = {};
        if (activeOnly === 'true') whereClause.isActive = true;
        if (req.query.farmCategoryId) whereClause.farmCategoryId = req.query.farmCategoryId;
        if (search) {
            whereClause[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { description: { [Op.iLike]: `%${search}%` } }
            ];
        }

        const total = await Investment.count({ where: whereClause });
        const investments = await Investment.findAll({
            where: whereClause,
            include: getInvestmentInclude(),
            order: [
                ['createdAt', 'DESC'],
                [{ model: InvestmentMilestone, as: 'Milestones' }, 'order', 'ASC'],
                [{ model: InvestmentMilestone, as: 'Milestones' }, 'createdAt', 'ASC']
            ],
            limit,
            offset
        });

        const totalPages = Math.ceil(total / limit);

        return res.success({
            investments: investments.map(formatInvestment),
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
                startIndex: total === 0 ? 0 : offset + 1,
                endIndex: Math.min(offset + limit, total)
            }
        }, 'Investments retrieved successfully');
    } catch (error) {
        console.error('Get all investments error:', error);
        return res.fail(error.message, 500);
    }
}

async function getInvestmentById(req, res) {
    try {
        const { investmentId } = req.params;

        if (!investmentId) {
            return res.fail('Investment ID is required', 400);
        }

        const investment = await fetchInvestmentById(investmentId);
        if (!investment) {
            return res.fail('Investment not found', 404);
        }

        return res.success(formatInvestment(investment), 'Investment retrieved successfully');
    } catch (error) {
        console.error('Get investment error:', error);
        return res.fail(error.message, 500);
    }
}

async function updateInvestment(req, res) {
    let transaction;

    try {
        const { investmentId } = req.params;

        if (!investmentId) {
            return res.fail('Investment ID is required', 400);
        }

        const investment = await Investment.findByPk(investmentId);
        if (!investment) {
            return res.fail('Investment not found', 404);
        }

        const { payload, errors } = normalizeInvestmentPayload(req.body, {
            requireAll: false,
            currentInvestment: investment
        });
        const { milestones, errors: milestoneErrors } = normalizeMilestonesInput(req.body.milestones);
        const validationErrors = [...errors, ...milestoneErrors];

        if (validationErrors.length > 0) {
            return res.fail(validationErrors.join(', '), 400);
        }

        if (payload.farmCategoryId) {
            const category = await ensureFarmCategoryExists(payload.farmCategoryId);
            if (!category) {
                return res.fail('Farm category not found', 404);
            }
        }

        transaction = await sequelize.transaction();
        await investment.update(payload, { transaction });

        if (milestones) {
            await InvestmentMilestone.destroy({
                where: { investmentId },
                transaction
            });

            if (milestones.length > 0) {
                await InvestmentMilestone.bulkCreate(
                    milestones.map(milestone => ({
                        ...milestone,
                        investmentId
                    })),
                    { transaction }
                );
            }
        }

        await transaction.commit();
        transaction = null;

        const updatedInvestment = await fetchInvestmentById(investmentId);
        return res.success(formatInvestment(updatedInvestment), 'Investment updated successfully');
    } catch (error) {
        if (transaction) await transaction.rollback();
        console.error('Update investment error:', error);
        return res.fail(error.message, 500);
    }
}

async function deleteInvestment(req, res) {
    try {
        const { investmentId } = req.params;

        if (!investmentId) {
            return res.fail('Investment ID is required', 400);
        }

        const investment = await Investment.findByPk(investmentId);
        if (!investment) {
            return res.fail('Investment not found', 404);
        }

        await investment.destroy();

        return res.success({ id: investmentId }, 'Investment deleted successfully');
    } catch (error) {
        console.error('Delete investment error:', error);
        return res.fail(error.message, 500);
    }
}

async function createInvestmentMilestone(req, res) {
    try {
        const { investmentId } = req.params;

        if (!investmentId) {
            return res.fail('Investment ID is required', 400);
        }

        const investment = await Investment.findByPk(investmentId);
        if (!investment) {
            return res.fail('Investment not found', 404);
        }

        const { milestones, errors } = normalizeMilestonesInput([req.body], { required: true });
        if (errors.length > 0) {
            return res.fail(errors.join(', '), 400);
        }

        const existingTotal = await getMilestoneTotalForInvestment(investmentId);
        const nextTotal = existingTotal + Number(milestones[0].fundReleasePercentage);
        if (nextTotal > 100) {
            return res.fail('Total milestone fund release percentage cannot be greater than 100', 400);
        }

        const milestone = await InvestmentMilestone.create({
            ...milestones[0],
            investmentId
        });

        return res.success(formatMilestone(milestone), 'Investment milestone created successfully', 201);
    } catch (error) {
        console.error('Create investment milestone error:', error);
        return res.fail(error.message, 500);
    }
}

async function updateInvestmentMilestone(req, res) {
    try {
        const { milestoneId } = req.params;

        if (!milestoneId) {
            return res.fail('Milestone ID is required', 400);
        }

        const milestone = await InvestmentMilestone.findByPk(milestoneId);
        if (!milestone) {
            return res.fail('Investment milestone not found', 404);
        }

        const errors = [];
        const payload = {};

        if (req.body.name !== undefined) {
            if (!req.body.name || String(req.body.name).trim() === '') {
                errors.push('name is required');
            } else {
                payload.name = String(req.body.name).trim();
            }
        }

        const percentage = firstDefined(
            req.body.fundReleasePercentage,
            req.body.releasePercentage,
            req.body.percentage
        );
        const parsedPercentage = parsePercentage(percentage, 'fundReleasePercentage', errors, { max: 100 });
        if (parsedPercentage !== undefined) payload.fundReleasePercentage = parsedPercentage;

        if (req.body.order !== undefined) {
            const parsedOrder = parseOptionalInteger(req.body.order, 'order', errors);
            if (parsedOrder !== undefined) payload.order = parsedOrder;
        }

        const isActive = parseBoolean(req.body.isActive, 'isActive', errors);
        if (isActive !== undefined) payload.isActive = isActive;

        if (errors.length > 0) {
            return res.fail(errors.join(', '), 400);
        }

        if (payload.fundReleasePercentage !== undefined) {
            const existingTotal = await getMilestoneTotalForInvestment(milestone.investmentId, {
                excludeMilestoneId: milestone.id
            });
            const nextTotal = existingTotal + Number(payload.fundReleasePercentage);

            if (nextTotal > 100) {
                return res.fail('Total milestone fund release percentage cannot be greater than 100', 400);
            }
        }

        await milestone.update(payload);

        return res.success(formatMilestone(milestone), 'Investment milestone updated successfully');
    } catch (error) {
        console.error('Update investment milestone error:', error);
        return res.fail(error.message, 500);
    }
}

async function deleteInvestmentMilestone(req, res) {
    try {
        const { milestoneId } = req.params;

        if (!milestoneId) {
            return res.fail('Milestone ID is required', 400);
        }

        const milestone = await InvestmentMilestone.findByPk(milestoneId);
        if (!milestone) {
            return res.fail('Investment milestone not found', 404);
        }

        await milestone.destroy();

        return res.success({ id: milestoneId }, 'Investment milestone deleted successfully');
    } catch (error) {
        console.error('Delete investment milestone error:', error);
        return res.fail(error.message, 500);
    }
}

module.exports = {
    createInvestment,
    getAllInvestments,
    getInvestmentById,
    updateInvestment,
    deleteInvestment,
    createInvestmentMilestone,
    updateInvestmentMilestone,
    deleteInvestmentMilestone
};
