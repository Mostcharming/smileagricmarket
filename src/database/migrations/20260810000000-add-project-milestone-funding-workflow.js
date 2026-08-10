'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    async up(queryInterface) {
        await queryInterface.sequelize.transaction(async transaction => {
            await queryInterface.addColumn('user_farm_milestones', 'name', {
                type: DataTypes.STRING,
                allowNull: true,
                comment: 'Snapshot of the template milestone name'
            }, { transaction });

            await queryInterface.addColumn('user_farm_milestones', 'fund_release_percentage', {
                type: DataTypes.DECIMAL(5, 2),
                allowNull: true,
                comment: 'Snapshot of the template milestone funding percentage'
            }, { transaction });

            await queryInterface.addColumn('user_farm_milestones', 'order', {
                type: DataTypes.INTEGER,
                allowNull: true,
                comment: 'Snapshot of the template milestone order'
            }, { transaction });

            await queryInterface.addColumn('user_farm_milestones', 'funding_status', {
                type: DataTypes.ENUM(
                    'request_for_funding',
                    'processing_funding',
                    'completed'
                ),
                allowNull: false,
                defaultValue: 'request_for_funding',
                comment: 'Funding workflow status for this project milestone'
            }, { transaction });

            await queryInterface.sequelize.query(`
                UPDATE "user_farm_milestones" AS assignment
                SET
                    "name" = template_milestone."name",
                    "fund_release_percentage" = template_milestone."fund_release_percentage",
                    "order" = template_milestone."order"
                FROM "investment_milestones" AS template_milestone
                WHERE assignment."investment_milestone_id" = template_milestone."id"
            `, { transaction });

            await queryInterface.sequelize.query(`
                UPDATE "user_farm_milestones" AS assignment
                SET
                    "name" = category_milestone."name",
                    "order" = category_milestone."order"
                FROM "milestones" AS category_milestone
                WHERE assignment."milestone_id" = category_milestone."id"
            `, { transaction });

            await queryInterface.sequelize.query(`
                UPDATE "user_farm_milestones"
                SET "funding_status" = (
                    CASE
                        WHEN "is_completed" THEN 'completed'
                        ELSE 'request_for_funding'
                    END
                )::"enum_user_farm_milestones_funding_status"
            `, { transaction });

            await queryInterface.sequelize.query(`
                UPDATE "user_farm_milestones" AS milestone
                SET "amount" = ROUND(
                    project."expected_investment"
                    * milestone."fund_release_percentage"
                    / 100,
                    2
                )
                FROM "user_farm_investments" AS project
                WHERE milestone."user_farm_investment_id" = project."id"
                    AND milestone."fund_release_percentage" IS NOT NULL
                    AND project."expected_investment" IS NOT NULL
            `, { transaction });

            await queryInterface.sequelize.query(`
                ALTER TABLE "user_farm_milestones"
                ADD CONSTRAINT "user_farm_project_milestone_snapshot_check"
                CHECK (
                    "investment_milestone_id" IS NULL
                    OR (
                        "name" IS NOT NULL
                        AND "fund_release_percentage" IS NOT NULL
                    )
                )
            `, { transaction });

            await queryInterface.sequelize.query(`
                ALTER TABLE "user_farm_milestones"
                ADD CONSTRAINT "user_farm_milestone_funding_completion_check"
                CHECK (
                    ("funding_status" = 'completed' AND "is_completed" = TRUE)
                    OR
                    ("funding_status" <> 'completed' AND "is_completed" = FALSE)
                )
            `, { transaction });

            await queryInterface.addIndex('user_farm_milestones', ['funding_status'], {
                name: 'user_farm_milestones_funding_status_idx',
                transaction
            });
        });
    },

    async down(queryInterface) {
        await queryInterface.sequelize.transaction(async transaction => {
            await queryInterface.removeIndex(
                'user_farm_milestones',
                'user_farm_milestones_funding_status_idx',
                { transaction }
            );
            await queryInterface.sequelize.query(`
                ALTER TABLE "user_farm_milestones"
                DROP CONSTRAINT IF EXISTS "user_farm_project_milestone_snapshot_check"
            `, { transaction });
            await queryInterface.sequelize.query(`
                ALTER TABLE "user_farm_milestones"
                DROP CONSTRAINT IF EXISTS "user_farm_milestone_funding_completion_check"
            `, { transaction });
            await queryInterface.removeColumn(
                'user_farm_milestones',
                'funding_status',
                { transaction }
            );
            await queryInterface.sequelize.query(
                'DROP TYPE IF EXISTS "enum_user_farm_milestones_funding_status"',
                { transaction }
            );
            await queryInterface.removeColumn('user_farm_milestones', 'order', { transaction });
            await queryInterface.removeColumn(
                'user_farm_milestones',
                'fund_release_percentage',
                { transaction }
            );
            await queryInterface.removeColumn('user_farm_milestones', 'name', { transaction });
        });
    }
};
