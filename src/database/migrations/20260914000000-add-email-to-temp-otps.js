'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async transaction => {
            await queryInterface.changeColumn('temp_otps', 'phone_number', {
                type: Sequelize.STRING, allowNull: true
            }, { transaction });
            await queryInterface.addColumn('temp_otps', 'email', {
                type: Sequelize.STRING, allowNull: true
            }, { transaction });
            await queryInterface.addIndex('temp_otps', ['email'], { transaction });
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async transaction => {
            // Email-only challenges cannot be represented by the old schema.
            await queryInterface.bulkDelete('temp_otps', { phone_number: null }, { transaction });
            await queryInterface.removeIndex('temp_otps', ['email'], { transaction });
            await queryInterface.removeColumn('temp_otps', 'email', { transaction });
            await queryInterface.changeColumn('temp_otps', 'phone_number', {
                type: Sequelize.STRING, allowNull: false
            }, { transaction });
        });
    }
};
