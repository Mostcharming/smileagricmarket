'use strict';

const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const { Op } = require('sequelize');

const models = defineModels(sequelize);
const { User, UserFarm, UserFarmInvestment, UserFarmMilestone, Milestone } = models;

async function getUserDashboard(req, res) {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.fail('User not found', 404);
        }

        // Get total farms listed
        const totalFarmsListed = await UserFarm.count({
            where: { userId, isActive: true }
        });

        // Get completed farm projects (all milestones completed)
        const farms = await UserFarm.findAll({
            where: { userId, isActive: true },
            include: [{
                model: models.UserFarmMilestone,
                as: 'SelectedMilestones',
                attributes: ['id', 'isCompleted']
            }],
            attributes: ['id']
        });

        let completedFarmProjects = 0;
        farms.forEach(farm => {
            if (farm.SelectedMilestones.length > 0) {
                const allCompleted = farm.SelectedMilestones.every(m => m.isCompleted === true);
                if (allCompleted) {
                    completedFarmProjects++;
                }
            }
        });

        // Get expected investments and investments received
        const investmentData = await UserFarmInvestment.findOne({
            attributes: [
                [sequelize.fn('SUM', sequelize.col('expected_investment')), 'totalExpectedInvestment'],
                [sequelize.fn('SUM', sequelize.col('investment_received')), 'totalInvestmentReceived']
            ],
            where: {
                userFarmId: {
                    [Op.in]: farms.map(f => f.id)
                },
                isActive: true
            },
            raw: true
        });

        const totalExpectedInvestment = investmentData?.totalExpectedInvestment || 0;
        const totalInvestmentReceived = investmentData?.totalInvestmentReceived || 0;
        const investmentPending = totalExpectedInvestment - totalInvestmentReceived;

        // Get detailed farm breakdown
        const farmBreakdown = await UserFarm.findAll({
            where: { userId, isActive: true },
            include: [
                {
                    model: models.FarmCategory,
                    as: 'Category',
                    attributes: ['id', 'name']
                },
                {
                    model: models.UserFarmInvestment,
                    as: 'Investment',
                    attributes: ['id', 'expectedInvestment', 'investmentReceived', 'investmentStatus', 'currency']
                },
                {
                    model: models.UserFarmMilestone,
                    as: 'SelectedMilestones',
                    attributes: ['id', 'isCompleted', 'completedAt'],
                    include: [{
                        model: models.Milestone,
                        as: 'Milestone',
                        attributes: ['id', 'name']
                    }]
                }
            ],
            attributes: ['id', 'name', 'description', 'location', 'size', 'createdAt']
        });

        return res.success({
            summary: {
                totalFarmsListed,
                completedFarmProjects,
                totalExpectedInvestment: parseFloat(totalExpectedInvestment) || 0,
                totalInvestmentReceived: parseFloat(totalInvestmentReceived) || 0,
                investmentPending: parseFloat(investmentPending) || 0
            },
            farms: farmBreakdown
        }, 'Dashboard data retrieved successfully');
    } catch (error) {
        console.error('Get user dashboard error:', error);
        return res.fail('Failed to retrieve dashboard data', 500);
    }
}

async function getDashboardStats(req, res) {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.fail('User not authenticated', 401);
        }

        // Get farms count by status
        const farmsCount = await UserFarm.count({
            where: { userId, isActive: true }
        });

        // Get investment statistics
        const investmentStats = await UserFarmInvestment.findAll({
            where: { isActive: true },
            attributes: [
                'investmentStatus',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                [sequelize.fn('SUM', sequelize.col('investment_received')), 'totalReceived']
            ],
            group: ['investmentStatus'],
            raw: true
        });

        // Get milestone completion rate
        const milestoneStats = await UserFarmMilestone.findAll({
            attributes: [
                'isCompleted',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            where: {
                userFarmId: {
                    [Op.in]: sequelize.literal(`(SELECT id FROM user_farms WHERE user_id = '${userId}' AND is_active = true)`)
                }
            },
            group: ['isCompleted'],
            raw: true
        });

        return res.success({
            farmsCount,
            investmentStats,
            milestoneStats
        }, 'Dashboard statistics retrieved successfully');
    } catch (error) {
        console.error('Get dashboard stats error:', error);
        return res.fail('Failed to retrieve dashboard statistics', 500);
    }
}

module.exports = {
    getUserDashboard,
    getDashboardStats
};
