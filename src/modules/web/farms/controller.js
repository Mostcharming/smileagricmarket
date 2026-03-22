'use strict';

const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');

const models = defineModels(sequelize);
const { UserFarm, FarmCategory, UserFarmInvestment, UserFarmMilestone, FarmDocument } = models;

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
                { description: { [Op.iLike]: `%${search}%` } },
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
                {
                    model: FarmCategory,
                    as: 'Category',
                    attributes: ['id', 'name']
                },
                {
                    model: UserFarmInvestment,
                    as: 'Investment',
                    attributes: ['id', 'expectedInvestment', 'investmentReceived', 'investmentStatus', 'currency']
                },
                {
                    model: UserFarmMilestone,
                    as: 'SelectedMilestones',
                    attributes: ['id', 'isCompleted'],
                    include: [{
                        model: models.Milestone,
                        as: 'Milestone',
                        attributes: ['id', 'name']
                    }]
                },
                {
                    model: FarmDocument,
                    as: 'Documents',
                    attributes: ['id', 'documentType', 'fileName', 'fileUrl', 'fileSize']
                }
            ],
            attributes: ['id', 'name', 'description', 'location', 'size', 'verificationStatus', 'createdAt', 'updatedAt'],
            order: [['createdAt', 'DESC']],
            limit,
            offset
        });

        // Calculate pagination metadata
        const totalPages = Math.ceil(total / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        return res.success({
            farms,
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
                {
                    model: FarmCategory,
                    as: 'Category',
                    attributes: ['id', 'name', 'description']
                },
                {
                    model: UserFarmInvestment,
                    as: 'Investment',
                    attributes: ['id', 'expectedInvestment', 'investmentReceived', 'investmentPending', 'investmentStatus', 'currency', 'notes']
                },
                {
                    model: UserFarmMilestone,
                    as: 'SelectedMilestones',
                    attributes: ['id', 'isCompleted', 'completedAt'],
                    include: [{
                        model: models.Milestone,
                        as: 'Milestone',
                        attributes: ['id', 'name', 'order']
                    }]
                },
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

        // Calculate completion percentage
        const totalMilestones = farm.SelectedMilestones.length;
        const completedMilestones = farm.SelectedMilestones.filter(m => m.isCompleted).length;
        const completionPercentage = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

        return res.success({
            ...farm.toJSON(),
            stats: {
                totalMilestones,
                completedMilestones,
                completionPercentage
            }
        }, 'Farm details retrieved successfully');
    } catch (error) {
        console.error('Get farm by ID error:', error);
        return res.fail('Failed to retrieve farm details', 500);
    }
}

async function createFarm(req, res) {
    try {
        const userId = req.user?.id;
        const { farmCategoryId, name, description, location, size, selectedMilestones } = req.body;

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        // Validate required fields
        if (!farmCategoryId || !name) {
            return res.fail('Farm category ID and name are required', 400);
        }

        // Check if farm category exists
        const category = await FarmCategory.findByPk(farmCategoryId);
        if (!category) {
            return res.fail('Farm category not found', 404);
        }

        // Create the farm with pending verification status
        const farm = await UserFarm.create({
            userId,
            farmCategoryId,
            name,
            description,
            location,
            size: size ? parseFloat(size) : null,
            isActive: true,
            verificationStatus: 'pending'
        });

        // Create associated investment record
        await UserFarmInvestment.create({
            userFarmId: farm.id,
            currency: 'USD'
        });

        // Add selected milestones if provided
        if (selectedMilestones && Array.isArray(selectedMilestones) && selectedMilestones.length > 0) {
            const milestonesToAdd = selectedMilestones.map(milestoneId => ({
                userFarmId: farm.id,
                milestoneId,
                isCompleted: false
            }));
            await models.UserFarmMilestone.bulkCreate(milestonesToAdd);
        }

        // Upload farm documents (pictures and documents)
        if (req.farmFiles) {
            const documentsToCreate = [];

            // Add pictures
            if (req.farmFiles.pictures && req.farmFiles.pictures.length > 0) {
                req.farmFiles.pictures.forEach(picture => {
                    documentsToCreate.push({
                        userFarmId: farm.id,
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
                        userFarmId: farm.id,
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
        }

        // Fetch the created farm with all associations
        const createdFarm = await UserFarm.findByPk(farm.id, {
            include: [
                {
                    model: FarmCategory,
                    as: 'Category',
                    attributes: ['id', 'name']
                },
                {
                    model: UserFarmInvestment,
                    as: 'Investment',
                    attributes: ['id', 'expectedInvestment', 'investmentReceived', 'investmentStatus', 'currency']
                },
                {
                    model: models.UserFarmMilestone,
                    as: 'SelectedMilestones',
                    attributes: ['id', 'isCompleted'],
                    include: [{
                        model: models.Milestone,
                        as: 'Milestone',
                        attributes: ['id', 'name']
                    }]
                },
                {
                    model: models.FarmDocument,
                    as: 'Documents',
                    attributes: ['id', 'documentType', 'fileName', 'fileUrl', 'fileSize', 'mimeType']
                }
            ]
        });

        return res.success(createdFarm, 'Farm created successfully', 201);
    } catch (error) {
        console.error('Create farm error:', error);
        return res.fail('Failed to create farm', 500);
    }
}

async function updateFarm(req, res) {
    try {
        const userId = req.user?.id;
        const { farmId } = req.params;
        const { name, description, location, size, isActive } = req.body;

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

        // Update fields
        if (name !== undefined) farm.name = name;
        if (description !== undefined) farm.description = description;
        if (location !== undefined) farm.location = location;
        if (size !== undefined) farm.size = size ? parseFloat(size) : null;
        if (isActive !== undefined) farm.isActive = isActive;

        await farm.save();

        const updatedFarm = await UserFarm.findByPk(farm.id, {
            include: [
                {
                    model: FarmCategory,
                    as: 'Category',
                    attributes: ['id', 'name']
                },
                {
                    model: UserFarmInvestment,
                    as: 'Investment',
                    attributes: ['id', 'expectedInvestment', 'investmentReceived', 'investmentStatus', 'currency']
                }
            ]
        });

        return res.success(updatedFarm, 'Farm updated successfully');
    } catch (error) {
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
        const { milestones } = req.body;

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        if (!farmId) {
            return res.fail('Farm ID is required', 400);
        }

        if (!milestones || !Array.isArray(milestones) || milestones.length === 0) {
            return res.fail('Milestones array is required', 400);
        }

        // Verify farm ownership
        const farm = await UserFarm.findOne({
            where: { id: farmId, userId }
        });

        if (!farm) {
            return res.fail('Farm not found', 404);
        }

        // Create milestone associations
        const milestonesToAdd = milestones.map(milestoneId => ({
            userFarmId: farmId,
            milestoneId,
            isCompleted: false
        }));

        await models.UserFarmMilestone.bulkCreate(milestonesToAdd, {
            ignoreDuplicates: true // In case of duplicate entries
        });

        const updatedFarm = await UserFarm.findByPk(farmId, {
            include: [{
                model: models.UserFarmMilestone,
                as: 'SelectedMilestones',
                attributes: ['id', 'isCompleted'],
                include: [{
                    model: models.Milestone,
                    as: 'Milestone',
                    attributes: ['id', 'name']
                }]
            }]
        });

        return res.success(updatedFarm, 'Milestones added to farm successfully');
    } catch (error) {
        console.error('Add milestones error:', error);
        return res.fail('Failed to add milestones', 500);
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

        return res.success(updatedFarm, 'Documents uploaded successfully');
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

        // Remove milestone
        await models.UserFarmMilestone.destroy({
            where: {
                userFarmId: farmId,
                milestoneId
            }
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
    updateFarm,
    deleteFarm,
    addMilestonesToFarm,
    uploadFarmDocumentsToFarm,
    deleteFarmDocument,
    removeMilestoneFromFarm
};
