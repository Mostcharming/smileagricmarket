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

    models.FarmCategory.hasMany(models.UserFarm, {
        foreignKey: 'farmCategoryId',
        as: 'UserFarms',
        onDelete: 'RESTRICT'
    });

    models.UserFarm.belongsTo(models.FarmCategory, {
        foreignKey: 'farmCategoryId',
        as: 'Category'
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
    models.UserFarm.hasOne(models.UserFarmInvestment, {
        foreignKey: 'userFarmId',
        as: 'Investment',
        onDelete: 'CASCADE'
    });

    models.UserFarmInvestment.belongsTo(models.UserFarm, {
        foreignKey: 'userFarmId',
        as: 'Farm'
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
