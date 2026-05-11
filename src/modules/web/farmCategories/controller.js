'use strict';

const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');

const models = defineModels(sequelize);
const { FarmCategory, Milestone } = models;

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
            order: [['name', 'ASC']]
        });

        return res.success(
            { categories },
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

        // Check if category exists and is active
        const category = await FarmCategory.findOne({
            where: {
                id: categoryId,
                isActive: true
            },
            attributes: ['id', 'name', 'description']
        });

        if (!category) {
            return res.fail('Category not found', 404);
        }

        // Get all active milestones for the category
        const milestones = await Milestone.findAll({
            where: {
                farmCategoryId: categoryId,
                isActive: true
            },
            attributes: ['id', 'name', 'order'],
            order: [['order', 'ASC'], ['name', 'ASC']]
        });

        return res.success(
            {
                category,
                milestones
            },
            'Milestones retrieved successfully'
        );
    } catch (error) {
        console.error('Error fetching milestones:', error);
        return res.fail('Failed to retrieve milestones', 500);
    }
}

module.exports = {
    getCategories,
    getMilestonesByCategory
};
