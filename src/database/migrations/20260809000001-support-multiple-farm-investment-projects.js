'use strict';

const { DataTypes } = require('sequelize');

const PROJECT_STATUS_TYPE = 'enum_user_farm_investments_investment_status';

module.exports = {
    async up(queryInterface) {
        await queryInterface.sequelize.transaction(async transaction => {
            await queryInterface.removeIndex(
                'user_farm_investments',
                'user_farm_investments_user_farm_id_unique_idx',
                { transaction }
            );

            await queryInterface.addColumn('user_farm_investments', 'start_date', {
                type: DataTypes.DATEONLY,
                allowNull: true,
                comment: 'Date the user investment project was created'
            }, { transaction });

            await queryInterface.addColumn('user_farm_investments', 'end_date', {
                type: DataTypes.DATEONLY,
                allowNull: true,
                comment: 'Project start date plus the selected investment template duration'
            }, { transaction });

            await queryInterface.sequelize.query(`
                UPDATE "user_farm_investments" AS project
                SET
                    "start_date" = project."created_at"::date,
                    "end_date" = COALESCE(
                        (
                            project."created_at"::date
                            + CASE template."duration_unit"
                                WHEN 'weeks' THEN template."duration_value" * INTERVAL '1 week'
                                WHEN 'months' THEN template."duration_value" * INTERVAL '1 month'
                                WHEN 'years' THEN template."duration_value" * INTERVAL '1 year'
                            END
                        )::date,
                        project."created_at"::date
                    )
                FROM "investments" AS template
                WHERE project."investment_id" = template."id"
            `, { transaction });

            await queryInterface.sequelize.query(`
                UPDATE "user_farm_investments"
                SET
                    "start_date" = COALESCE("start_date", "created_at"::date),
                    "end_date" = COALESCE("end_date", "created_at"::date)
            `, { transaction });

            await queryInterface.changeColumn('user_farm_investments', 'start_date', {
                type: DataTypes.DATEONLY,
                allowNull: false
            }, { transaction });

            await queryInterface.changeColumn('user_farm_investments', 'end_date', {
                type: DataTypes.DATEONLY,
                allowNull: false
            }, { transaction });

            await queryInterface.sequelize.query(`
                ALTER TABLE "user_farm_investments"
                ALTER COLUMN "investment_status" DROP DEFAULT;

                ALTER TYPE "${PROJECT_STATUS_TYPE}"
                RENAME TO "${PROJECT_STATUS_TYPE}_legacy";

                CREATE TYPE "${PROJECT_STATUS_TYPE}"
                AS ENUM ('not_started', 'funding_started', 'active', 'completed');

                ALTER TABLE "user_farm_investments"
                ALTER COLUMN "investment_status"
                TYPE "${PROJECT_STATUS_TYPE}"
                USING (
                    CASE
                        WHEN "end_date" <= CURRENT_DATE THEN 'completed'
                        WHEN "investment_received" >= "expected_investment"
                            AND "expected_investment" > 0 THEN 'active'
                        WHEN "investment_received" > 0 THEN 'funding_started'
                        ELSE 'not_started'
                    END
                )::"${PROJECT_STATUS_TYPE}";

                ALTER TABLE "user_farm_investments"
                ALTER COLUMN "investment_status"
                SET DEFAULT 'not_started'::"${PROJECT_STATUS_TYPE}";

                DROP TYPE "${PROJECT_STATUS_TYPE}_legacy";
            `, { transaction });

            await queryInterface.addColumn('user_farm_milestones', 'user_farm_investment_id', {
                type: DataTypes.UUID,
                allowNull: true,
                references: {
                    model: 'user_farm_investments',
                    key: 'id'
                },
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                comment: 'Investment project that owns this template milestone'
            }, { transaction });

            await queryInterface.sequelize.query(`
                UPDATE "user_farm_milestones" AS milestone
                SET "user_farm_investment_id" = project."id"
                FROM "user_farm_investments" AS project
                WHERE milestone."user_farm_id" = project."user_farm_id"
                    AND milestone."investment_milestone_id" IS NOT NULL
            `, { transaction });

            await queryInterface.removeIndex(
                'user_farm_milestones',
                'user_farm_investment_milestones_unique_idx',
                { transaction }
            );

            await queryInterface.addIndex('user_farm_milestones', ['user_farm_investment_id'], {
                name: 'user_farm_milestones_project_id_idx',
                transaction
            });

            await queryInterface.addIndex(
                'user_farm_milestones',
                ['user_farm_investment_id', 'investment_milestone_id'],
                {
                    name: 'user_farm_project_investment_milestones_unique_idx',
                    unique: true,
                    transaction
                }
            );

            await queryInterface.sequelize.query(`
                ALTER TABLE "user_farm_milestones"
                ADD CONSTRAINT "user_farm_milestones_project_scope_check"
                CHECK (
                    ("investment_milestone_id" IS NULL AND "user_farm_investment_id" IS NULL)
                    OR
                    ("investment_milestone_id" IS NOT NULL AND "user_farm_investment_id" IS NOT NULL)
                )
            `, { transaction });

            await queryInterface.addIndex('user_farm_investments', ['start_date'], {
                name: 'user_farm_investments_start_date_idx',
                transaction
            });

            await queryInterface.addIndex('user_farm_investments', ['end_date'], {
                name: 'user_farm_investments_end_date_idx',
                transaction
            });
        });
    },

    async down(queryInterface) {
        await queryInterface.sequelize.transaction(async transaction => {
            await queryInterface.sequelize.query(`
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM "user_farm_investments"
                        GROUP BY "user_farm_id"
                        HAVING COUNT(*) > 1
                    ) THEN
                        RAISE EXCEPTION 'Cannot roll back: one or more farms have multiple investment projects';
                    END IF;
                END $$
            `, { transaction });

            await queryInterface.removeIndex(
                'user_farm_investments',
                'user_farm_investments_end_date_idx',
                { transaction }
            );
            await queryInterface.removeIndex(
                'user_farm_investments',
                'user_farm_investments_start_date_idx',
                { transaction }
            );

            await queryInterface.sequelize.query(`
                ALTER TABLE "user_farm_milestones"
                DROP CONSTRAINT IF EXISTS "user_farm_milestones_project_scope_check"
            `, { transaction });
            await queryInterface.removeIndex(
                'user_farm_milestones',
                'user_farm_project_investment_milestones_unique_idx',
                { transaction }
            );
            await queryInterface.removeIndex(
                'user_farm_milestones',
                'user_farm_milestones_project_id_idx',
                { transaction }
            );
            await queryInterface.addIndex(
                'user_farm_milestones',
                ['user_farm_id', 'investment_milestone_id'],
                {
                    name: 'user_farm_investment_milestones_unique_idx',
                    unique: true,
                    transaction
                }
            );
            await queryInterface.removeColumn(
                'user_farm_milestones',
                'user_farm_investment_id',
                { transaction }
            );

            await queryInterface.sequelize.query(`
                ALTER TABLE "user_farm_investments"
                ALTER COLUMN "investment_status" DROP DEFAULT;

                ALTER TYPE "${PROJECT_STATUS_TYPE}"
                RENAME TO "${PROJECT_STATUS_TYPE}_project";

                CREATE TYPE "${PROJECT_STATUS_TYPE}"
                AS ENUM ('pending', 'partial', 'completed', 'cancelled');

                ALTER TABLE "user_farm_investments"
                ALTER COLUMN "investment_status"
                TYPE "${PROJECT_STATUS_TYPE}"
                USING (
                    CASE "investment_status"::text
                        WHEN 'not_started' THEN 'pending'
                        WHEN 'funding_started' THEN 'partial'
                        WHEN 'active' THEN 'completed'
                        WHEN 'completed' THEN 'completed'
                    END
                )::"${PROJECT_STATUS_TYPE}";

                ALTER TABLE "user_farm_investments"
                ALTER COLUMN "investment_status"
                SET DEFAULT 'pending'::"${PROJECT_STATUS_TYPE}";

                DROP TYPE "${PROJECT_STATUS_TYPE}_project";
            `, { transaction });

            await queryInterface.removeColumn('user_farm_investments', 'end_date', { transaction });
            await queryInterface.removeColumn('user_farm_investments', 'start_date', { transaction });

            await queryInterface.addIndex('user_farm_investments', ['user_farm_id'], {
                name: 'user_farm_investments_user_farm_id_unique_idx',
                unique: true,
                transaction
            });
        });
    }
};
