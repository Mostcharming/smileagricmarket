'use strict';

module.exports = {
    up: async (queryInterface) => {
        await queryInterface.sequelize.query(
            'ALTER TYPE "enum_admins_role" ADD VALUE IF NOT EXISTS \'marketing_admin\''
        );
    },

    down: async (queryInterface) => {
        await queryInterface.sequelize.transaction(async (transaction) => {
            await queryInterface.sequelize.query(
                'UPDATE "admins" SET "role" = \'admin\' WHERE "role" = \'marketing_admin\'',
                { transaction }
            );
            await queryInterface.sequelize.query(
                'ALTER TABLE "admins" ALTER COLUMN "role" DROP DEFAULT',
                { transaction }
            );
            await queryInterface.sequelize.query(
                'CREATE TYPE "enum_admins_role_without_marketing" AS ENUM (\'super_admin\', \'admin\', \'moderator\')',
                { transaction }
            );
            await queryInterface.sequelize.query(
                'ALTER TABLE "admins" ALTER COLUMN "role" TYPE "enum_admins_role_without_marketing" USING ("role"::text::"enum_admins_role_without_marketing")',
                { transaction }
            );
            await queryInterface.sequelize.query(
                'DROP TYPE "enum_admins_role"',
                { transaction }
            );
            await queryInterface.sequelize.query(
                'ALTER TYPE "enum_admins_role_without_marketing" RENAME TO "enum_admins_role"',
                { transaction }
            );
            await queryInterface.sequelize.query(
                'ALTER TABLE "admins" ALTER COLUMN "role" SET DEFAULT \'admin\'::"enum_admins_role"',
                { transaction }
            );
        });
    }
};
