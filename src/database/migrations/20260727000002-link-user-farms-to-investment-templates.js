'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface) => {
        await queryInterface.addColumn('user_farms', 'investment_id', {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'investments',
                key: 'id'
            },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
            comment: 'Admin investment template selected when the farm was created'
        });

        await queryInterface.addIndex('user_farms', ['investment_id'], {
            name: 'user_farms_investment_id_idx'
        });

        await queryInterface.sequelize.query(`
            ALTER TABLE "user_farm_milestones"
            ALTER COLUMN "milestone_id" DROP NOT NULL
        `);

        await queryInterface.addColumn('user_farm_milestones', 'investment_milestone_id', {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'investment_milestones',
                key: 'id'
            },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
            comment: 'Investment-template milestone selected for the farm funding request'
        });

        await queryInterface.addIndex('user_farm_milestones', ['investment_milestone_id'], {
            name: 'user_farm_milestones_investment_milestone_id_idx'
        });

        await queryInterface.addIndex(
            'user_farm_milestones',
            ['user_farm_id', 'investment_milestone_id'],
            {
                name: 'user_farm_investment_milestones_unique_idx',
                unique: true
            }
        );

        await queryInterface.sequelize.query(`
            ALTER TABLE "user_farm_milestones"
            ADD CONSTRAINT "user_farm_milestones_exactly_one_source_check"
            CHECK (
                ("milestone_id" IS NOT NULL AND "investment_milestone_id" IS NULL)
                OR
                ("milestone_id" IS NULL AND "investment_milestone_id" IS NOT NULL)
            )
        `);
    },

    down: async (queryInterface) => {
        await queryInterface.sequelize.query(`
            ALTER TABLE "user_farm_milestones"
            DROP CONSTRAINT IF EXISTS "user_farm_milestones_exactly_one_source_check"
        `);

        await queryInterface.removeIndex(
            'user_farm_milestones',
            'user_farm_investment_milestones_unique_idx'
        );
        await queryInterface.removeIndex(
            'user_farm_milestones',
            'user_farm_milestones_investment_milestone_id_idx'
        );
        await queryInterface.sequelize.query(`
            DELETE FROM "user_farm_milestones"
            WHERE "milestone_id" IS NULL
        `);
        await queryInterface.removeColumn('user_farm_milestones', 'investment_milestone_id');

        await queryInterface.sequelize.query(`
            ALTER TABLE "user_farm_milestones"
            ALTER COLUMN "milestone_id" SET NOT NULL
        `);

        await queryInterface.removeIndex('user_farms', 'user_farms_investment_id_idx');
        await queryInterface.removeColumn('user_farms', 'investment_id');
    }
};
