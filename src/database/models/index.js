'use strict';

module.exports = (sequelize) => {
    const models = {
        User: require('./User')(sequelize),
        Admin: require('./Admin')(sequelize),
        TempOtp: require('./TempOtp')(sequelize),
        KYC: require('./KYC')(sequelize),
        GeneralSetting: require('./GeneralSetting')(sequelize),
        FarmCategory: require('./FarmCategory')(sequelize),
        Milestone: require('./Milestone')(sequelize),
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

    return models;
};
