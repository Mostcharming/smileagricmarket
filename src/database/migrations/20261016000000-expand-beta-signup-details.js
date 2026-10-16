'use strict';

const { DataTypes } = require('sequelize');

const columns = {
    name: DataTypes.STRING(200),
    location: DataTypes.STRING(254),
    phone_number: DataTypes.STRING(30),
    produce: DataTypes.STRING(1000),
    investment_timeline: DataTypes.STRING(254)
};

module.exports = {
    async up(queryInterface) {
        await queryInterface.sequelize.transaction(async transaction => {
            for (const [name, type] of Object.entries(columns)) {
                await queryInterface.addColumn('beta_signups', name, {
                    type, allowNull: true
                }, { transaction });
            }
            await queryInterface.sequelize.query(
                'UPDATE "beta_signups" SET "name" = "first_name" WHERE "name" IS NULL',
                { transaction }
            );
        });
    },

    async down(queryInterface) {
        await queryInterface.sequelize.transaction(async transaction => {
            for (const name of Object.keys(columns).reverse()) {
                await queryInterface.removeColumn('beta_signups', name, { transaction });
            }
        });
    }
};
