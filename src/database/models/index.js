'use strict';

module.exports = (sequelize) => {
    const models = {
        User: require('./User')(sequelize),
        TempOtp: require('./TempOtp')(sequelize),
        KYC: require('./KYC')(sequelize),
        GeneralSetting: require('./GeneralSetting')(sequelize),
    };

    return models;
};
