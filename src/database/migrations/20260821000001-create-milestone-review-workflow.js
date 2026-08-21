'use strict';

const { DataTypes } = require('sequelize');

const REVIEW_STATUSES = [
    'pending',
    'approved',
    'rejected',
    'more_evidence_required'
];

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async transaction => {
            await queryInterface.addColumn('user_farm_milestones', 'review_status', {
                type: DataTypes.ENUM(...REVIEW_STATUSES),
                allowNull: false,
                defaultValue: 'pending',
                comment: 'Current admin decision for the milestone funding request'
            }, { transaction });

            await queryInterface.addColumn('user_farm_milestones', 'funding_requested_at', {
                type: DataTypes.DATE,
                allowNull: true,
                comment: 'Most recent time the user submitted this milestone for funding'
            }, { transaction });

            await queryInterface.addColumn('user_farm_milestones', 'reviewed_by', {
                type: DataTypes.UUID,
                allowNull: true,
                references: {
                    model: 'admins',
                    key: 'id'
                },
                onDelete: 'SET NULL',
                onUpdate: 'CASCADE'
            }, { transaction });

            await queryInterface.addColumn('user_farm_milestones', 'reviewed_at', {
                type: DataTypes.DATE,
                allowNull: true
            }, { transaction });

            await queryInterface.sequelize.query(`
                UPDATE "user_farm_milestones" AS milestone
                SET "funding_requested_at" = evidence."requested_at"
                FROM (
                    SELECT
                        "user_farm_milestone_id",
                        MIN("created_at") AS "requested_at"
                    FROM "milestone_funding_evidence"
                    GROUP BY "user_farm_milestone_id"
                ) AS evidence
                WHERE milestone."id" = evidence."user_farm_milestone_id"
            `, { transaction });

            await queryInterface.sequelize.query(`
                UPDATE "user_farm_milestones"
                SET
                    "review_status" = 'approved'::"enum_user_farm_milestones_review_status",
                    "reviewed_at" = COALESCE("completed_at", "updated_at"),
                    "funding_requested_at" = COALESCE("funding_requested_at", "created_at")
                WHERE "funding_status" = 'completed'
            `, { transaction });

            await queryInterface.sequelize.query(`
                ALTER TABLE "user_farm_milestones"
                ADD CONSTRAINT "user_farm_milestone_review_completion_check"
                CHECK (
                    (
                        "review_status" = 'approved'
                        AND "funding_status" = 'completed'
                        AND "is_completed" = TRUE
                    )
                    OR
                    (
                        "review_status" <> 'approved'
                        AND "funding_status" <> 'completed'
                        AND "is_completed" = FALSE
                    )
                )
            `, { transaction });

            await queryInterface.addIndex('user_farm_milestones', ['review_status'], {
                name: 'user_farm_milestones_review_status_idx',
                transaction
            });
            await queryInterface.addIndex('user_farm_milestones', ['funding_requested_at'], {
                name: 'user_farm_milestones_funding_requested_at_idx',
                transaction
            });
            await queryInterface.addIndex('user_farm_milestones', ['reviewed_at'], {
                name: 'user_farm_milestones_reviewed_at_idx',
                transaction
            });

            await queryInterface.createTable('milestone_verification_checklists', {
                id: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    primaryKey: true,
                    defaultValue: DataTypes.UUIDV4
                },
                user_farm_milestone_id: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: 'user_farm_milestones',
                        key: 'id'
                    },
                    onDelete: 'CASCADE',
                    onUpdate: 'CASCADE'
                },
                name: {
                    type: DataTypes.STRING(200),
                    allowNull: false
                },
                status: {
                    type: DataTypes.ENUM('verified', 'needs_clarification', 'rejected'),
                    allowNull: false
                },
                notes: {
                    type: DataTypes.TEXT,
                    allowNull: true
                },
                reviewed_by: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    references: {
                        model: 'admins',
                        key: 'id'
                    },
                    onDelete: 'SET NULL',
                    onUpdate: 'CASCADE'
                },
                reviewed_at: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                },
                created_at: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                },
                updated_at: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                }
            }, { transaction });

            await queryInterface.addIndex(
                'milestone_verification_checklists',
                ['user_farm_milestone_id'],
                {
                    name: 'milestone_checklists_milestone_id_idx',
                    transaction
                }
            );
            await queryInterface.addIndex(
                'milestone_verification_checklists',
                ['status'],
                {
                    name: 'milestone_checklists_status_idx',
                    transaction
                }
            );
            await queryInterface.sequelize.query(`
                CREATE UNIQUE INDEX "milestone_checklists_name_unique_idx"
                ON "milestone_verification_checklists"
                ("user_farm_milestone_id", LOWER("name"))
            `, { transaction });

            await queryInterface.createTable('milestone_review_audits', {
                id: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    primaryKey: true,
                    defaultValue: DataTypes.UUIDV4
                },
                user_farm_milestone_id: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: 'user_farm_milestones',
                        key: 'id'
                    },
                    onDelete: 'CASCADE',
                    onUpdate: 'CASCADE'
                },
                admin_id: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    references: {
                        model: 'admins',
                        key: 'id'
                    },
                    onDelete: 'SET NULL',
                    onUpdate: 'CASCADE'
                },
                action: {
                    type: DataTypes.ENUM(
                        'approve',
                        'reject',
                        'request_more_evidence',
                        'evidence_resubmitted',
                        'checklist_updated'
                    ),
                    allowNull: false
                },
                from_review_status: {
                    type: DataTypes.ENUM(...REVIEW_STATUSES),
                    allowNull: false
                },
                to_review_status: {
                    type: DataTypes.ENUM(...REVIEW_STATUSES),
                    allowNull: false
                },
                internal_notes: {
                    type: DataTypes.TEXT,
                    allowNull: true
                },
                checklist_snapshot: {
                    type: DataTypes.JSONB,
                    allowNull: false,
                    defaultValue: []
                },
                created_at: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                }
            }, { transaction });

            await queryInterface.addIndex('milestone_review_audits', ['user_farm_milestone_id'], {
                name: 'milestone_review_audits_milestone_id_idx',
                transaction
            });
            await queryInterface.addIndex('milestone_review_audits', ['admin_id'], {
                name: 'milestone_review_audits_admin_id_idx',
                transaction
            });
            await queryInterface.addIndex('milestone_review_audits', ['created_at'], {
                name: 'milestone_review_audits_created_at_idx',
                transaction
            });
        });
    },

    async down(queryInterface) {
        await queryInterface.sequelize.transaction(async transaction => {
            await queryInterface.dropTable('milestone_review_audits', { transaction });
            await queryInterface.dropTable('milestone_verification_checklists', { transaction });

            await queryInterface.removeIndex(
                'user_farm_milestones',
                'user_farm_milestones_reviewed_at_idx',
                { transaction }
            );
            await queryInterface.removeIndex(
                'user_farm_milestones',
                'user_farm_milestones_funding_requested_at_idx',
                { transaction }
            );
            await queryInterface.removeIndex(
                'user_farm_milestones',
                'user_farm_milestones_review_status_idx',
                { transaction }
            );

            await queryInterface.sequelize.query(`
                ALTER TABLE "user_farm_milestones"
                DROP CONSTRAINT IF EXISTS "user_farm_milestone_review_completion_check"
            `, { transaction });

            await queryInterface.removeColumn('user_farm_milestones', 'reviewed_at', { transaction });
            await queryInterface.removeColumn('user_farm_milestones', 'reviewed_by', { transaction });
            await queryInterface.removeColumn(
                'user_farm_milestones',
                'funding_requested_at',
                { transaction }
            );
            await queryInterface.removeColumn(
                'user_farm_milestones',
                'review_status',
                { transaction }
            );

            await queryInterface.sequelize.query(`
                DROP TYPE IF EXISTS "enum_milestone_review_audits_action";
                DROP TYPE IF EXISTS "enum_milestone_review_audits_from_review_status";
                DROP TYPE IF EXISTS "enum_milestone_review_audits_to_review_status";
                DROP TYPE IF EXISTS "enum_milestone_verification_checklists_status";
                DROP TYPE IF EXISTS "enum_user_farm_milestones_review_status";
            `, { transaction });
        });
    }
};
