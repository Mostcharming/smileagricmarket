'use strict';

const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');

const models = defineModels(sequelize);
const { FarmCategory, Investment, InvestmentMilestone } = models;

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatInvestmentTemplate(investment) {
    const data = investment?.toJSON ? investment.toJSON() : investment;
    if (!data) return null;

    return {
        id: data.id,
        farmCategoryId: data.farmCategoryId,
        name: data.name,
        description: data.description,
        startDate: data.startDate,
        endDate: data.endDate,
        roiPercentage: toNumber(data.roiPercentage),
        duration: {
            value: data.durationValue,
            unit: data.durationUnit,
            label: `${data.durationValue} ${data.durationUnit}`
        },
        riskLevel: data.riskLevel,
        fundingRules: {
            minGoal: toNumber(data.fundingMinGoal),
            maxGoal: toNumber(data.fundingMaxGoal),
            currency: data.currency
        },
        investmentLimit: {
            minGoal: toNumber(data.investmentMinGoal),
            maxGoal: toNumber(data.investmentMaxGoal),
            currency: data.currency
        },
        currency: data.currency,
        milestones: (data.Milestones || []).map(milestone => ({
            id: milestone.id,
            investmentId: milestone.investmentId,
            name: milestone.name,
            fundReleasePercentage: toNumber(milestone.fundReleasePercentage),
            order: milestone.order
        }))
    };
}

function getActiveInvestmentInclude() {
    return {
        model: Investment,
        as: 'Investments',
        required: true,
        where: { isActive: true },
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
            'createdAt'
        ],
        include: [{
            model: InvestmentMilestone,
            as: 'Milestones',
            required: false,
            where: { isActive: true },
            attributes: [
                'id',
                'investmentId',
                'name',
                'fundReleasePercentage',
                'order'
            ]
        }]
    };
}

async function findCategoryWithInvestmentTemplates(categoryId) {
    return FarmCategory.findOne({
        where: {
            id: categoryId,
            isActive: true
        },
        attributes: ['id', 'name', 'description'],
        include: [getActiveInvestmentInclude()],
        order: [
            [{ model: Investment, as: 'Investments' }, 'createdAt', 'DESC'],
            [
                { model: Investment, as: 'Investments' },
                { model: InvestmentMilestone, as: 'Milestones' },
                'order',
                'ASC'
            ]
        ]
    });
}

/**
 * Get all farm categories
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getCategories(req, res) {
    try {
        const categories = await FarmCategory.findAll({
            where: { isActive: true },
            attributes: ['id', 'name', 'description'],
            include: [getActiveInvestmentInclude()],
            order: [
                ['name', 'ASC'],
                [{ model: Investment, as: 'Investments' }, 'createdAt', 'DESC'],
                [
                    { model: Investment, as: 'Investments' },
                    { model: InvestmentMilestone, as: 'Milestones' },
                    'order',
                    'ASC'
                ]
            ]
        });

        const formattedCategories = categories.map(category => {
            const data = category.toJSON();
            const investmentTemplates = (data.Investments || []).map(formatInvestmentTemplate);

            return {
                id: data.id,
                name: data.name,
                description: data.description,
                investmentTemplate: investmentTemplates[0] || null,
                investmentTemplates
            };
        });

        return res.success(
            { categories: formattedCategories },
            'Categories retrieved successfully'
        );
    } catch (error) {
        console.error('Error fetching categories:', error);
        return res.fail('Failed to retrieve categories', 500);
    }
}

/**
 * Get milestones by category ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getMilestonesByCategory(req, res) {
    try {
        const { categoryId } = req.params;

        if (!categoryId) {
            return res.fail('Category ID is required', 400);
        }

        const category = await findCategoryWithInvestmentTemplates(categoryId);
        if (!category) {
            return res.fail(
                'Active category with an investment template and milestones not found',
                404
            );
        }

        const data = category.toJSON();
        const investmentTemplates = (data.Investments || []).map(formatInvestmentTemplate);
        const investmentTemplate = investmentTemplates[0];

        return res.success(
            {
                category: {
                    id: data.id,
                    name: data.name,
                    description: data.description
                },
                investmentTemplate,
                investmentTemplates,
                milestones: investmentTemplate?.milestones || []
            },
            'Investment template milestones retrieved successfully'
        );
    } catch (error) {
        console.error('Error fetching milestones:', error);
        return res.fail('Failed to retrieve milestones', 500);
    }
}

module.exports = {
    getCategories,
    getMilestonesByCategory,
    getInvestmentTemplate: getMilestonesByCategory
};
