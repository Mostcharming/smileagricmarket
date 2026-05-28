'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('users', 'profile_image_path', {
            type: Sequelize.STRING,
            allowNull: true,
            comment: 'Path to uploaded profile image'
        });

        await queryInterface.addColumn('users', 'profile_image_url', {
            type: Sequelize.STRING,
            allowNull: true,
            comment: 'URL to access the profile image'
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('users', 'profile_image_path');
        await queryInterface.removeColumn('users', 'profile_image_url');
    }
};
