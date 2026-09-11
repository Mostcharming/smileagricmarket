'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('mobile_password_resets', {
            user_id: {
                type: Sequelize.UUID, allowNull: false, primaryKey: true,
                references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE'
            },
            otp_hash: { type: Sequelize.STRING, allowNull: true },
            otp_expires_at: { type: Sequelize.DATE, allowNull: true },
            attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
            last_sent_at: { type: Sequelize.DATE, allowNull: false },
            token_hash: { type: Sequelize.STRING, allowNull: true, unique: true },
            token_expires_at: { type: Sequelize.DATE, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false }
        });
    },
    async down(queryInterface) {
        await queryInterface.dropTable('mobile_password_resets');
    }
};
