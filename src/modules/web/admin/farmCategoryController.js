'use strict';

const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const { Op } = require('sequelize');

const models = defineModels(sequelize);
const { FarmCategory, Milestone } = models;

// ==================== FARM CATEGORY FUNCTIONS ====================

async function createFarmCategory(req, res) {
    try {
        const { name, description } = req.body;

        if (!name || name.trim() === '') {
            return res.fail('Farm category name is required', 400);
        }

        // Check if category already exists
        const existingCategory = await FarmCategory.findOne({
            where: { name: name.trim() }
        });

        if (existingCategory) {
            return res.fail('Farm category with this name already exists', 409);
        }

        const category = await FarmCategory.create({
            name: name.trim(),
            description: description?.trim() || null
        });

        return res.success(
            {
                id: category.id,
                name: category.name,
                description: category.description,
                isActive: category.isActive,
                createdAt: category.createdAt
            },
            'Farm category created successfully'
        );
    } catch (error) {
        console.error('Create farm category error:', error);
        return res.fail(error.message, 500);
    }
}

async function getAllFarmCategories(req, res) {
    try {
        const { activeOnly = true } = req.query;

        const whereClause = activeOnly === 'true' ? { isActive: true } : {};

        const categories = await FarmCategory.findAll({
            where: whereClause,
            attributes: ['id', 'name', 'description', 'isActive', 'createdAt', 'updatedAt'],
            order: [['createdAt', 'DESC']],
            include: [
                {
                    model: Milestone,
                    attributes: ['id', 'name', 'order', 'isActive'],
                    as: 'Milestones'
                }
            ]
        });

        // Add milestone count to each category
        const categoriesWithCount = categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            description: cat.description,
            isActive: cat.isActive,
            milestoneCount: cat.Milestones?.length || 0,
            createdAt: cat.createdAt,
            updatedAt: cat.updatedAt
        }));

        return res.success(
            categoriesWithCount,
            'Farm categories retrieved successfully'
        );
    } catch (error) {
        console.error('Get all farm categories error:', error);
        return res.fail(error.message, 500);
    }
}

async function getFarmCategoryById(req, res) {
    try {
        const { categoryId } = req.params;

        if (!categoryId) {
            return res.fail('Category ID is required', 400);
        }

        const category = await FarmCategory.findByPk(categoryId, {
            attributes: ['id', 'name', 'description', 'isActive', 'createdAt', 'updatedAt'],
            include: [
                {
                    model: Milestone,
                    attributes: ['id', 'name', 'order', 'isActive', 'createdAt'],
                    as: 'Milestones',
                    order: [['order', 'ASC']]
                }
            ]
        });

        if (!category) {
            return res.fail('Farm category not found', 404);
        }

        return res.success(
            {
                id: category.id,
                name: category.name,
                description: category.description,
                isActive: category.isActive,
                milestones: category.Milestones || [],
                createdAt: category.createdAt,
                updatedAt: category.updatedAt
            },
            'Farm category retrieved successfully'
        );
    } catch (error) {
        console.error('Get farm category error:', error);
        return res.fail(error.message, 500);
    }
}

async function updateFarmCategory(req, res) {
    try {
        const { categoryId } = req.params;
        const { name, description } = req.body;

        if (!categoryId) {
            return res.fail('Category ID is required', 400);
        }

        if (!name || name.trim() === '') {
            return res.fail('Farm category name is required', 400);
        }

        const category = await FarmCategory.findByPk(categoryId);

        if (!category) {
            return res.fail('Farm category not found', 404);
        }

        // Check if another category with the same name exists
        if (name.trim() !== category.name) {
            const existingCategory = await FarmCategory.findOne({
                where: { name: name.trim() }
            });

            if (existingCategory) {
                return res.fail('Farm category with this name already exists', 409);
            }
        }

        await category.update({
            name: name.trim(),
            description: description?.trim() || null
        });

        return res.success(
            {
                id: category.id,
                name: category.name,
                description: category.description,
                isActive: category.isActive,
                updatedAt: category.updatedAt
            },
            'Farm category updated successfully'
        );
    } catch (error) {
        console.error('Update farm category error:', error);
        return res.fail(error.message, 500);
    }
}

async function deleteFarmCategory(req, res) {
    try {
        const { categoryId } = req.params;

        if (!categoryId) {
            return res.fail('Category ID is required', 400);
        }

        const category = await FarmCategory.findByPk(categoryId);

        if (!category) {
            return res.fail('Farm category not found', 404);
        }

        // Check if category has any milestones
        const milestoneCount = await Milestone.count({
            where: { farmCategoryId: categoryId }
        });

        if (milestoneCount > 0) {
            return res.fail('Cannot delete a category that has milestones. Please delete all milestones first.', 409);
        }

        await category.destroy();

        return res.success(
            { id: categoryId },
            'Farm category deleted successfully'
        );
    } catch (error) {
        console.error('Delete farm category error:', error);
        return res.fail(error.message, 500);
    }
}

// ==================== MILESTONE FUNCTIONS ====================

async function createMilestone(req, res) {
    try {
        const { categoryId } = req.params;
        const { name, order } = req.body;

        if (!categoryId) {
            return res.fail('Category ID is required', 400);
        }

        if (!name || name.trim() === '') {
            return res.fail('Milestone name is required', 400);
        }

        // Check if category exists
        const category = await FarmCategory.findByPk(categoryId);

        if (!category) {
            return res.fail('Farm category not found', 404);
        }

        const milestone = await Milestone.create({
            farmCategoryId: categoryId,
            name: name.trim(),
            order: order || null
        });

        return res.success(
            {
                id: milestone.id,
                farmCategoryId: milestone.farmCategoryId,
                name: milestone.name,
                order: milestone.order,
                isActive: milestone.isActive,
                createdAt: milestone.createdAt
            },
            'Milestone created successfully'
        );
    } catch (error) {
        console.error('Create milestone error:', error);
        return res.fail(error.message, 500);
    }
}

async function getAllMilestones(req, res) {
    try {
        const { activeOnly = true } = req.query;

        const whereClause = activeOnly === 'true' ? { isActive: true } : {};

        const milestones = await Milestone.findAll({
            where: whereClause,
            attributes: ['id', 'farmCategoryId', 'name', 'order', 'isActive', 'createdAt', 'updatedAt'],
            order: [['farmCategoryId', 'ASC'], ['order', 'ASC'], ['createdAt', 'ASC']],
            include: [
                {
                    model: FarmCategory,
                    attributes: ['id', 'name'],
                    as: 'FarmCategory'
                }
            ]
        });

        const formattedMilestones = milestones.map(milestone => ({
            id: milestone.id,
            farmCategoryId: milestone.farmCategoryId,
            farmCategoryName: milestone.FarmCategory?.name || null,
            name: milestone.name,
            order: milestone.order,
            isActive: milestone.isActive,
            createdAt: milestone.createdAt,
            updatedAt: milestone.updatedAt
        }));

        return res.success(
            formattedMilestones,
            'Milestones retrieved successfully'
        );
    } catch (error) {
        console.error('Get all milestones error:', error);
        return res.fail(error.message, 500);
    }
}

async function getMilestonesByCategory(req, res) {
    try {
        const { categoryId } = req.params;
        const { activeOnly = true } = req.query;

        if (!categoryId) {
            return res.fail('Category ID is required', 400);
        }

        // Check if category exists
        const category = await FarmCategory.findByPk(categoryId);

        if (!category) {
            return res.fail('Farm category not found', 404);
        }

        const whereClause = {
            farmCategoryId: categoryId,
            ...(activeOnly === 'true' && { isActive: true })
        };

        const milestones = await Milestone.findAll({
            where: whereClause,
            attributes: ['id', 'name', 'order', 'isActive', 'createdAt', 'updatedAt'],
            order: [['order', 'ASC'], ['createdAt', 'ASC']]
        });

        return res.success(
            {
                categoryId: category.id,
                categoryName: category.name,
                milestones: milestones
            },
            'Milestones retrieved successfully'
        );
    } catch (error) {
        console.error('Get milestones by category error:', error);
        return res.fail(error.message, 500);
    }
}

async function updateMilestone(req, res) {
    try {
        const { milestoneId } = req.params;
        const { name, order } = req.body;

        if (!milestoneId) {
            return res.fail('Milestone ID is required', 400);
        }

        if (!name || name.trim() === '') {
            return res.fail('Milestone name is required', 400);
        }

        const milestone = await Milestone.findByPk(milestoneId);

        if (!milestone) {
            return res.fail('Milestone not found', 404);
        }

        await milestone.update({
            name: name.trim(),
            order: order !== undefined ? order : milestone.order
        });

        return res.success(
            {
                id: milestone.id,
                farmCategoryId: milestone.farmCategoryId,
                name: milestone.name,
                order: milestone.order,
                isActive: milestone.isActive,
                updatedAt: milestone.updatedAt
            },
            'Milestone updated successfully'
        );
    } catch (error) {
        console.error('Update milestone error:', error);
        return res.fail(error.message, 500);
    }
}

async function deleteMilestone(req, res) {
    try {
        const { milestoneId } = req.params;

        if (!milestoneId) {
            return res.fail('Milestone ID is required', 400);
        }

        const milestone = await Milestone.findByPk(milestoneId);

        if (!milestone) {
            return res.fail('Milestone not found', 404);
        }

        await milestone.destroy();

        return res.success(
            { id: milestoneId },
            'Milestone deleted successfully'
        );
    } catch (error) {
        console.error('Delete milestone error:', error);
        return res.fail(error.message, 500);
    }
}

async function deleteMilestonesByCategory(req, res) {
    try {
        const { categoryId } = req.params;

        if (!categoryId) {
            return res.fail('Category ID is required', 400);
        }

        // Check if category exists
        const category = await FarmCategory.findByPk(categoryId);

        if (!category) {
            return res.fail('Farm category not found', 404);
        }

        const result = await Milestone.destroy({
            where: { farmCategoryId: categoryId }
        });

        return res.success(
            {
                categoryId: categoryId,
                deletedCount: result
            },
            `${result} milestone(s) deleted successfully`
        );
    } catch (error) {
        console.error('Delete milestones by category error:', error);
        return res.fail(error.message, 500);
    }
}

module.exports = {
    // Farm Category
    createFarmCategory,
    getAllFarmCategories,
    getFarmCategoryById,
    updateFarmCategory,
    deleteFarmCategory,
    // Milestones
    createMilestone,
    getAllMilestones,
    getMilestonesByCategory,
    updateMilestone,
    deleteMilestone,
    deleteMilestonesByCategory
};
