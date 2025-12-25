'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Drop NotificationLogs table
        await queryInterface.dropTable('NotificationLogs', { force: true });
    },

    down: async (queryInterface, Sequelize) => {
        // Recreate NotificationLogs table if rollback is needed
        await queryInterface.createTable('NotificationLogs', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            notificationType: {
                type: Sequelize.STRING,
                allowNull: false,
            },
            sender: {
                type: Sequelize.STRING,
            },
            sentFrom: {
                type: Sequelize.STRING,
            },
            sentTo: {
                type: Sequelize.STRING,
            },
            subject: {
                type: Sequelize.STRING,
            },
            message: {
                type: Sequelize.TEXT,
            },
            userId: {
                type: Sequelize.UUID,
            },
            userType: {
                type: Sequelize.STRING,
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
