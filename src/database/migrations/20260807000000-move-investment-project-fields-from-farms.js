'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
    async up(queryInterface) {
        await queryInterface.sequelize.transaction(async transaction => {
            await queryInterface.addColumn('user_farm_investments', 'farm_category_id', {
                type: DataTypes.UUID,
                allowNull: true,
                references: {
                    model: 'farm_categories',
                    key: 'id'
                },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE',
                comment: 'Farm category selected for this investment project'
            }, { transaction });

            await queryInterface.addColumn('user_farm_investments', 'investment_id', {
                type: DataTypes.UUID,
                allowNull: true,
                references: {
                    model: 'investments',
                    key: 'id'
                },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE',
                comment: 'Admin template resolved from the selected farm category'
            }, { transaction });

            await queryInterface.sequelize.query(`
                UPDATE "user_farm_investments" AS project
                SET
                    "farm_category_id" = farm."farm_category_id",
                    "investment_id" = farm."investment_id",
                    "notes" = COALESCE(project."notes", farm."description")
                FROM "user_farms" AS farm
                WHERE project."user_farm_id" = farm."id"
            `, { transaction });

            await queryInterface.changeColumn('user_farm_investments', 'farm_category_id', {
                type: DataTypes.UUID,
                allowNull: false,
                references: {
                    model: 'farm_categories',
                    key: 'id'
                },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE'
            }, { transaction });

            await queryInterface.addIndex('user_farm_investments', ['farm_category_id'], {
                name: 'user_farm_investments_farm_category_id_idx',
                transaction
            });
            await queryInterface.addIndex('user_farm_investments', ['investment_id'], {
                name: 'user_farm_investments_investment_id_idx',
                transaction
            });
            await queryInterface.addIndex('user_farm_investments', ['user_farm_id'], {
                name: 'user_farm_investments_user_farm_id_unique_idx',
                unique: true,
                transaction
            });

            await queryInterface.removeIndex(
                'user_farms',
                'user_farms_investment_id_idx',
                { transaction }
            );
            await queryInterface.removeIndex(
                'user_farms',
                'user_farms_farm_category_id_idx',
                { transaction }
            );
            await queryInterface.removeIndex(
                'user_farms',
                'user_farms_currency_idx',
                { transaction }
            );
            await queryInterface.removeColumn('user_farms', 'investment_id', { transaction });
            await queryInterface.removeColumn('user_farms', 'farm_category_id', { transaction });
            await queryInterface.removeColumn('user_farms', 'investment_amount', { transaction });
            await queryInterface.removeColumn('user_farms', 'currency', { transaction });
            await queryInterface.removeColumn('user_farms', 'description', { transaction });
        });
    },

    async down(queryInterface) {
        await queryInterface.sequelize.transaction(async transaction => {
            await queryInterface.addColumn('user_farms', 'description', {
                type: DataTypes.TEXT,
                allowNull: true
            }, { transaction });
            await queryInterface.addColumn('user_farms', 'farm_category_id', {
                type: DataTypes.UUID,
                allowNull: true,
                references: { model: 'farm_categories', key: 'id' },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE'
            }, { transaction });
            await queryInterface.addColumn('user_farms', 'investment_id', {
                type: DataTypes.UUID,
                allowNull: true,
                references: { model: 'investments', key: 'id' },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE'
            }, { transaction });
            await queryInterface.addColumn('user_farms', 'investment_amount', {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: true
            }, { transaction });
            await queryInterface.addColumn('user_farms', 'currency', {
                type: DataTypes.STRING(3),
                allowNull: false,
                defaultValue: 'USD'
            }, { transaction });

            await queryInterface.sequelize.query(`
                UPDATE "user_farms" AS farm
                SET
                    "farm_category_id" = COALESCE(farm."farm_category_id", project."farm_category_id"),
                    "investment_id" = COALESCE(farm."investment_id", project."investment_id"),
                    "investment_amount" = COALESCE(farm."investment_amount", project."expected_investment"),
                    "currency" = COALESCE(farm."currency", project."currency"),
                    "description" = COALESCE(farm."description", project."notes")
                FROM "user_farm_investments" AS project
                WHERE project."user_farm_id" = farm."id"
            `, { transaction });

            await queryInterface.addIndex('user_farms', ['farm_category_id'], {
                name: 'user_farms_farm_category_id_idx',
                transaction
            });
            await queryInterface.addIndex('user_farms', ['investment_id'], {
                name: 'user_farms_investment_id_idx',
                transaction
            });
            await queryInterface.addIndex('user_farms', ['currency'], {
                name: 'user_farms_currency_idx',
                transaction
            });

            await queryInterface.removeIndex(
                'user_farm_investments',
                'user_farm_investments_investment_id_idx',
                { transaction }
            );
            await queryInterface.removeIndex(
                'user_farm_investments',
                'user_farm_investments_user_farm_id_unique_idx',
                { transaction }
            );
            await queryInterface.removeIndex(
                'user_farm_investments',
                'user_farm_investments_farm_category_id_idx',
                { transaction }
            );
            await queryInterface.removeColumn('user_farm_investments', 'investment_id', { transaction });
            await queryInterface.removeColumn('user_farm_investments', 'farm_category_id', { transaction });
        });
    }
};
