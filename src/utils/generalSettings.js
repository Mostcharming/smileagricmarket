'use strict';

const GeneralSetting = require("../database/models/GeneralSetting");


async function getGeneralSettings() {


    const instance = await GeneralSetting.findOne();
    return instance ? instance.get({ plain: true }) : null;
}

module.exports = { getGeneralSettings };