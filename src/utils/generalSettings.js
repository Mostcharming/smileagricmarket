'use strict';

const defineModels = require('../database/models');
const { slaveSequelize, masterSequelize } = require('../database');


async function getGeneralSettings() {
    const sequelizeInstance = slaveSequelize || masterSequelize;
    if (!sequelizeInstance) {
        throw new Error('Sequelize instance not available');
    }

    const models = defineModels(sequelizeInstance);
    const { GeneralSetting } = models;
    if (!GeneralSetting) throw new Error('GeneralSetting model not found');

    const instance = await GeneralSetting.findOne();
    return instance ? instance.get({ plain: true }) : null;
}

module.exports = { getGeneralSettings };