'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('users', 'bio', {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: 'User biography or profile description'
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('users', 'bio');
    }
};
