'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface) => {
        await queryInterface.addColumn('beta_signups', 'user_type', {
            type: DataTypes.ENUM('investor', 'farm_owner'),
            allowNull: true,
            comment: 'Null is permitted only for beta signups created before user type was collected'
        });

        await queryInterface.addIndex('beta_signups', ['user_type'], {
            name: 'beta_signups_user_type_idx'
        });
    },

    down: async (queryInterface) => {
        await queryInterface.removeIndex('beta_signups', 'beta_signups_user_type_idx');
        await queryInterface.removeColumn('beta_signups', 'user_type');
        await queryInterface.sequelize.query(
            'DROP TYPE IF EXISTS "enum_beta_signups_user_type";'
        );
    }
};
