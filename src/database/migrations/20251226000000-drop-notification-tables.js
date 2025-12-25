'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Drop NotificationLog table first (has foreign key dependency)
        await queryInterface.dropTable('NotificationLogs', { force: true });

        // Drop NotificationTemplate table
        await queryInterface.dropTable('NotificationTemplates', { force: true });
    },

    down: async (queryInterface, Sequelize) => {
        // Recreate NotificationTemplate table
        await queryInterface.createTable('NotificationTemplates', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            name: {
                type: Sequelize.STRING,
                allowNull: false,
            },
            subject: {
                type: Sequelize.STRING,
            },
            template: {
                type: Sequelize.TEXT,
                allowNull: false,
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
            },
        });

        // Recreate NotificationLog table
        await queryInterface.createTable('NotificationLogs', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            userId: {
                type: Sequelize.INTEGER,
                references: {
                    model: 'Users',
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            templateId: {
                type: Sequelize.INTEGER,
                references: {
                    model: 'NotificationTemplates',
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL',
            },
            status: {
                type: Sequelize.STRING,
                defaultValue: 'pending',
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
            },
        });
    },
};
