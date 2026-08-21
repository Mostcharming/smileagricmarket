'use strict';

module.exports = (sequelize) => {
    const models = {
        User: require('./User')(sequelize),
        Admin: require('./Admin')(sequelize),
        TempOtp: require('./TempOtp')(sequelize),
        KYC: require('./KYC')(sequelize),
        Wallet: require('./Wallet')(sequelize),
        GeneralSetting: require('./GeneralSetting')(sequelize),
        FarmCategory: require('./FarmCategory')(sequelize),
        Milestone: require('./Milestone')(sequelize),
        UserNotification: require('./UserNotification')(sequelize),
        AdminNotification: require('./AdminNotification')(sequelize),
        UserFarm: require('./UserFarm')(sequelize),
        UserFarmMilestone: require('./UserFarmMilestone')(sequelize),
        UserFarmInvestment: require('./UserFarmInvestment')(sequelize),
        FarmDocument: require('./FarmDocument')(sequelize),
        MilestoneFundingEvidence: require('./MilestoneFundingEvidence')(sequelize),
        MilestoneVerificationChecklist: require('./MilestoneVerificationChecklist')(sequelize),
        MilestoneReviewAudit: require('./MilestoneReviewAudit')(sequelize),
        Investment: require('./Investment')(sequelize),
        InvestmentMilestone: require('./InvestmentMilestone')(sequelize),
        InvestmentPayment: require('./InvestmentPayment')(sequelize),
        BetaSignup: require('./BetaSignup')(sequelize),
    };

    // Define associations
    models.FarmCategory.hasMany(models.Milestone, {
        foreignKey: 'farmCategoryId',
        as: 'Milestones',
        onDelete: 'CASCADE'
    });

    models.Milestone.belongsTo(models.FarmCategory, {
        foreignKey: 'farmCategoryId',
        as: 'FarmCategory'
    });

    // Investment product associations
    models.FarmCategory.hasMany(models.Investment, {
        foreignKey: 'farmCategoryId',
        as: 'Investments',
        onDelete: 'RESTRICT'
    });

    models.Investment.belongsTo(models.FarmCategory, {
        foreignKey: 'farmCategoryId',
        as: 'FarmCategory'
    });

    models.FarmCategory.hasMany(models.UserFarmInvestment, {
        foreignKey: 'farmCategoryId',
        as: 'InvestmentProjects',
        onDelete: 'RESTRICT'
    });

    models.UserFarmInvestment.belongsTo(models.FarmCategory, {
        foreignKey: 'farmCategoryId',
        as: 'Category'
    });

    models.Investment.hasMany(models.UserFarmInvestment, {
        foreignKey: 'investmentId',
        as: 'InvestmentProjects',
        onDelete: 'RESTRICT'
    });

    models.UserFarmInvestment.belongsTo(models.Investment, {
        foreignKey: 'investmentId',
        as: 'InvestmentTemplate'
    });

    models.Investment.hasMany(models.InvestmentMilestone, {
        foreignKey: 'investmentId',
        as: 'Milestones',
        onDelete: 'CASCADE'
    });

    models.InvestmentMilestone.belongsTo(models.Investment, {
        foreignKey: 'investmentId',
        as: 'Investment'
    });

    // User Notifications associations
    models.User.hasMany(models.UserNotification, {
        foreignKey: 'userId',
        as: 'Notifications',
        onDelete: 'CASCADE'
    });

    models.UserNotification.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'User'
    });

    // Admin Notifications associations
    models.Admin.hasMany(models.AdminNotification, {
        foreignKey: 'adminId',
        as: 'Notifications',
        onDelete: 'CASCADE'
    });

    models.AdminNotification.belongsTo(models.Admin, {
        foreignKey: 'adminId',
        as: 'Admin'
    });

    // User Wallet associations
    models.User.hasOne(models.Wallet, {
        foreignKey: 'userId',
        as: 'Wallet',
        onDelete: 'CASCADE'
    });

    models.Wallet.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'User'
    });

    // User KYC associations
    models.User.hasMany(models.KYC, {
        foreignKey: 'userId',
        as: 'KYCs',
        onDelete: 'CASCADE'
    });

    models.KYC.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'User'
    });

    // User Farms associations
    models.User.hasMany(models.UserFarm, {
        foreignKey: 'userId',
        as: 'Farms',
        onDelete: 'CASCADE'
    });

    models.UserFarm.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'User'
    });

    // User Farm Milestones associations (Many-to-Many through UserFarmMilestone)
    models.UserFarm.hasMany(models.UserFarmMilestone, {
        foreignKey: 'userFarmId',
        as: 'SelectedMilestones',
        onDelete: 'CASCADE'
    });

    models.UserFarmMilestone.belongsTo(models.UserFarm, {
        foreignKey: 'userFarmId',
        as: 'Farm'
    });

    models.Milestone.hasMany(models.UserFarmMilestone, {
        foreignKey: 'milestoneId',
        as: 'FarmAssignments',
        onDelete: 'CASCADE'
    });

    models.UserFarmMilestone.belongsTo(models.Milestone, {
        foreignKey: 'milestoneId',
        as: 'Milestone'
    });

    models.InvestmentMilestone.hasMany(models.UserFarmMilestone, {
        foreignKey: 'investmentMilestoneId',
        as: 'FarmAssignments',
        onDelete: 'RESTRICT'
    });

    models.UserFarmMilestone.belongsTo(models.InvestmentMilestone, {
        foreignKey: 'investmentMilestoneId',
        as: 'InvestmentMilestone'
    });

    // Many-to-Many association through UserFarmMilestone
    models.UserFarm.belongsToMany(models.Milestone, {
        through: models.UserFarmMilestone,
        foreignKey: 'userFarmId',
        otherKey: 'milestoneId',
        as: 'Milestones'
    });

    models.Milestone.belongsToMany(models.UserFarm, {
        through: models.UserFarmMilestone,
        foreignKey: 'milestoneId',
        otherKey: 'userFarmId',
        as: 'UserFarms'
    });

    // User Farm Investments associations
    models.UserFarm.hasMany(models.UserFarmInvestment, {
        foreignKey: 'userFarmId',
        as: 'InvestmentProjects',
        onDelete: 'CASCADE'
    });

    models.UserFarmInvestment.belongsTo(models.UserFarm, {
        foreignKey: 'userFarmId',
        as: 'Farm'
    });

    models.UserFarmInvestment.hasMany(models.UserFarmMilestone, {
        foreignKey: 'userFarmInvestmentId',
        as: 'ProjectMilestones',
        onDelete: 'CASCADE'
    });

    models.UserFarmMilestone.belongsTo(models.UserFarmInvestment, {
        foreignKey: 'userFarmInvestmentId',
        as: 'InvestmentProject'
    });

    models.Admin.hasMany(models.UserFarmMilestone, {
        foreignKey: 'reviewedBy',
        as: 'ReviewedFarmMilestones',
        onDelete: 'SET NULL'
    });

    models.UserFarmMilestone.belongsTo(models.Admin, {
        foreignKey: 'reviewedBy',
        as: 'Reviewer'
    });

    models.UserFarmMilestone.hasMany(models.MilestoneVerificationChecklist, {
        foreignKey: 'userFarmMilestoneId',
        as: 'VerificationChecklist',
        onDelete: 'CASCADE'
    });

    models.MilestoneVerificationChecklist.belongsTo(models.UserFarmMilestone, {
        foreignKey: 'userFarmMilestoneId',
        as: 'Milestone'
    });

    models.Admin.hasMany(models.MilestoneVerificationChecklist, {
        foreignKey: 'reviewedBy',
        as: 'MilestoneChecklistReviews',
        onDelete: 'SET NULL'
    });

    models.MilestoneVerificationChecklist.belongsTo(models.Admin, {
        foreignKey: 'reviewedBy',
        as: 'Reviewer'
    });

    models.UserFarmMilestone.hasMany(models.MilestoneReviewAudit, {
        foreignKey: 'userFarmMilestoneId',
        as: 'ReviewAuditTrail',
        onDelete: 'CASCADE'
    });

    models.MilestoneReviewAudit.belongsTo(models.UserFarmMilestone, {
        foreignKey: 'userFarmMilestoneId',
        as: 'Milestone'
    });

    models.Admin.hasMany(models.MilestoneReviewAudit, {
        foreignKey: 'adminId',
        as: 'MilestoneReviewActions',
        onDelete: 'SET NULL'
    });

    models.MilestoneReviewAudit.belongsTo(models.Admin, {
        foreignKey: 'adminId',
        as: 'Admin'
    });

    // Evidence supplied by a farm owner when requesting milestone funding
    models.UserFarmMilestone.hasMany(models.MilestoneFundingEvidence, {
        foreignKey: 'userFarmMilestoneId',
        as: 'FundingEvidence',
        onDelete: 'CASCADE'
    });

    models.MilestoneFundingEvidence.belongsTo(models.UserFarmMilestone, {
        foreignKey: 'userFarmMilestoneId',
        as: 'Milestone'
    });

    // Payments made by users into investable farms
    models.User.hasMany(models.InvestmentPayment, {
        foreignKey: 'investorId',
        as: 'InvestmentPayments',
        onDelete: 'RESTRICT'
    });

    models.InvestmentPayment.belongsTo(models.User, {
        foreignKey: 'investorId',
        as: 'Investor'
    });

    models.UserFarm.hasMany(models.InvestmentPayment, {
        foreignKey: 'userFarmId',
        as: 'Payments',
        onDelete: 'RESTRICT'
    });

    models.InvestmentPayment.belongsTo(models.UserFarm, {
        foreignKey: 'userFarmId',
        as: 'Farm'
    });

    models.UserFarmInvestment.hasMany(models.InvestmentPayment, {
        foreignKey: 'userFarmInvestmentId',
        as: 'Payments',
        onDelete: 'RESTRICT'
    });

    models.InvestmentPayment.belongsTo(models.UserFarmInvestment, {
        foreignKey: 'userFarmInvestmentId',
        as: 'FarmInvestment'
    });

    models.Investment.hasMany(models.InvestmentPayment, {
        foreignKey: 'investmentId',
        as: 'Payments',
        onDelete: 'RESTRICT'
    });

    models.InvestmentPayment.belongsTo(models.Investment, {
        foreignKey: 'investmentId',
        as: 'InvestmentTemplate'
    });

    // Farm Documents associations
    models.UserFarm.hasMany(models.FarmDocument, {
        foreignKey: 'userFarmId',
        as: 'Documents',
        onDelete: 'CASCADE'
    });

    models.FarmDocument.belongsTo(models.UserFarm, {
        foreignKey: 'userFarmId',
        as: 'Farm'
    });

    return models;
};
