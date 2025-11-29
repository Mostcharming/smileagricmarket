'use strict';

module.exports = (sequelize) => {
    const models = {
        User: require('./User')(sequelize),
        TempOtp: require('./TempOtp')(sequelize),
        GeneralSetting: require('./GeneralSetting')(sequelize),
        NotificationTemplate: require('./NotificationTemplate')(sequelize),
        NotificationLog: require('./NotificationLog')(sequelize),
    };

    return models;
};
