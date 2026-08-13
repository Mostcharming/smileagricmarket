'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async transaction => {
            await queryInterface.createTable('milestone_funding_evidence', {
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
                    onUpdate: 'CASCADE',
                    comment: 'Funding request milestone to which this prior-milestone evidence belongs'
                },
                evidence_type: {
                    type: DataTypes.ENUM('photo', 'file'),
                    allowNull: false
                },
                file_name: {
                    type: DataTypes.STRING,
                    allowNull: false
                },
                file_url: {
                    type: DataTypes.STRING,
                    allowNull: false
                },
                file_size: {
                    type: DataTypes.INTEGER,
                    allowNull: false
                },
                mime_type: {
                    type: DataTypes.STRING,
                    allowNull: false
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
                'milestone_funding_evidence',
                ['user_farm_milestone_id'],
                {
                    name: 'milestone_funding_evidence_milestone_id_idx',
                    transaction
                }
            );
            await queryInterface.addIndex(
                'milestone_funding_evidence',
                ['evidence_type'],
                {
                    name: 'milestone_funding_evidence_type_idx',
                    transaction
                }
            );
        });
    },

    async down(queryInterface) {
        await queryInterface.sequelize.transaction(async transaction => {
            await queryInterface.dropTable('milestone_funding_evidence', { transaction });
            await queryInterface.sequelize.query(
                'DROP TYPE IF EXISTS "enum_milestone_funding_evidence_evidence_type"',
                { transaction }
            );
        });
    }
};
