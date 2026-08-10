'use strict';

const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const { Op } = require('sequelize');
const { resolveInvestmentProjectStatus } = require('../../../utils/investmentProject');

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

        // Farm verification is independent from investment project lifecycle.
        const farms = await UserFarm.findAll({
            where: { userId, isActive: true },
            attributes: ['id']
        });
        const userFarmIds = farms.map(farm => farm.id);

        const totalInvestmentProjects = await UserFarmInvestment.count({
            where: {
                userFarmId: { [Op.in]: userFarmIds },
                isActive: true
            }
        });
        const completedInvestmentProjects = await UserFarmInvestment.count({
            where: {
                userFarmId: { [Op.in]: userFarmIds },
                isActive: true,
                [Op.or]: [
                    { investmentStatus: 'completed' },
                    { endDate: { [Op.lte]: new Date().toISOString().slice(0, 10) } }
                ]
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
                    [Op.in]: userFarmIds
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
                    model: models.UserFarmInvestment,
                    as: 'InvestmentProjects',
                    attributes: [
                        'id',
                        'farmCategoryId',
                        'investmentId',
                        'expectedInvestment',
                        'investmentReceived',
                        'investmentStatus',
                        'startDate',
                        'endDate',
                        'currency'
                    ],
                    include: [
                        {
                            model: models.FarmCategory,
                            as: 'Category',
                            attributes: ['id', 'name']
                        },
                        {
                            model: models.Investment,
                            as: 'InvestmentTemplate',
                            attributes: ['id', 'name']
                        }
                    ]
                },
                {
                    model: models.UserFarmMilestone,
                    as: 'SelectedMilestones',
                    attributes: [
                        'id',
                        'userFarmInvestmentId',
                        'milestoneId',
                        'investmentMilestoneId',
                        'name',
                        'fundReleasePercentage',
                        'order',
                        'fundingStatus',
                        'isCompleted',
                        'completedAt',
                        'amount'
                    ],
                    include: [
                        {
                            model: models.Milestone,
                            as: 'Milestone',
                            attributes: ['id', 'name'],
                            required: false
                        },
                        {
                            model: models.InvestmentMilestone,
                            as: 'InvestmentMilestone',
                            attributes: ['id', 'investmentId', 'name', 'fundReleasePercentage'],
                            required: false
                        }
                    ]
                }
            ],
            attributes: ['id', 'name', 'location', 'size', 'createdAt']
        });

        return res.success({
            summary: {
                totalFarmsListed,
                totalInvestmentProjects,
                completedInvestmentProjects,
                completedFarmProjects: completedInvestmentProjects,
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
        const activeFarms = await UserFarm.findAll({
            where: { userId, isActive: true },
            attributes: ['id'],
            raw: true
        });
        const activeFarmIds = activeFarms.map(farm => farm.id);

        // Get investment statistics
        const investmentProjects = await UserFarmInvestment.findAll({
            where: {
                userFarmId: { [Op.in]: activeFarmIds },
                isActive: true
            },
            attributes: ['investmentStatus', 'investmentReceived', 'expectedInvestment', 'endDate'],
            raw: true
        });
        const investmentStatsByStatus = investmentProjects.reduce((stats, project) => {
            const status = resolveInvestmentProjectStatus(project);
            const current = stats.get(status) || { investmentStatus: status, count: 0, totalReceived: 0 };
            current.count += 1;
            current.totalReceived += Number(project.investmentReceived || 0);
            stats.set(status, current);
            return stats;
        }, new Map());
        const investmentStats = [...investmentStatsByStatus.values()];

        // Get milestone completion rate
        const milestoneStats = await UserFarmMilestone.findAll({
            attributes: [
                'fundingStatus',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            where: {
                userFarmId: {
                    [Op.in]: activeFarmIds
                }
            },
            group: ['fundingStatus'],
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
