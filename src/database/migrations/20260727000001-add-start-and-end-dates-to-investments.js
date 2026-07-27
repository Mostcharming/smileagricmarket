'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface) => {
        await queryInterface.addColumn('investments', 'start_date', {
            type: DataTypes.DATEONLY,
            allowNull: true,
            comment: 'Date the investment template starts'
        });

        await queryInterface.addColumn('investments', 'end_date', {
            type: DataTypes.DATEONLY,
            allowNull: true,
            comment: 'Date the investment template ends'
        });

        await queryInterface.sequelize.query(`
            ALTER TABLE "investments"
            ADD CONSTRAINT "investments_valid_date_range"
            CHECK (
                ("start_date" IS NULL AND "end_date" IS NULL)
                OR (
                    "start_date" IS NOT NULL
                    AND "end_date" IS NOT NULL
                    AND "end_date" >= "start_date"
                )
            )
        `);
    },

    down: async (queryInterface) => {
        await queryInterface.removeConstraint(
            'investments',
            'investments_valid_date_range'
        );
        await queryInterface.removeColumn('investments', 'end_date');
        await queryInterface.removeColumn('investments', 'start_date');
    }
};
