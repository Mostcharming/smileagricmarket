'use strict';

module.exports = {
    async up(queryInterface) {
        // PostgreSQL must commit a new enum value before it can be used.
        await queryInterface.sequelize.query(`
            ALTER TYPE "enum_user_farm_milestones_funding_status"
            ADD VALUE IF NOT EXISTS 'not_requested'
        `);
        await queryInterface.sequelize.transaction(async transaction => {
            await queryInterface.sequelize.query(`
                ALTER TABLE "user_farm_milestones"
                ALTER COLUMN "funding_status" SET DEFAULT 'not_requested'
            `, { transaction });
            // Preserve submitted requests, evidence, and all admin review activity.
            await queryInterface.sequelize.query(`
                UPDATE "user_farm_milestones" AS milestone
                SET "funding_status" = 'not_requested'
                WHERE "funding_status" = 'request_for_funding'
                    AND "funding_requested_at" IS NULL
                    AND "review_status" = 'pending'
                    AND "reviewed_by" IS NULL
                    AND "reviewed_at" IS NULL
                    AND "is_completed" = FALSE
                    AND NOT EXISTS (
                        SELECT 1 FROM "milestone_funding_evidence" evidence
                        WHERE evidence."user_farm_milestone_id" = milestone."id"
                    )
                    AND NOT EXISTS (
                        SELECT 1 FROM "milestone_review_audits" audit
                        WHERE audit."user_farm_milestone_id" = milestone."id"
                    )
                    AND NOT EXISTS (
                        SELECT 1 FROM "milestone_verification_checklists" checklist
                        WHERE checklist."user_farm_milestone_id" = milestone."id"
                    )
            `, { transaction });
        });
    },

    async down(queryInterface) {
        await queryInterface.sequelize.transaction(async transaction => {
            await queryInterface.sequelize.query(`
                UPDATE "user_farm_milestones"
                SET "funding_status" = 'request_for_funding'
                WHERE "funding_status" = 'not_requested'
            `, { transaction });
            await queryInterface.sequelize.query(`
                ALTER TABLE "user_farm_milestones"
                ALTER COLUMN "funding_status" SET DEFAULT 'request_for_funding'
            `, { transaction });
        });
        // Leave the unused enum label in place; PostgreSQL cannot drop one value.
    }
};
