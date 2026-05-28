'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('wallets', {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: Sequelize.UUIDV4
            },
            user_id: {
                type: Sequelize.UUID,
                allowNull: false,
                unique: true,
                references: {
                    model: 'users',
                    key: 'id'
                },
                onDelete: 'CASCADE',
                comment: 'User ID for wallet ownership'
            },
            bank_name: {
                type: Sequelize.STRING,
                allowNull: true,
                comment: 'Name of the bank'
            },
            account_number: {
                type: Sequelize.STRING,
                allowNull: true,
                comment: 'Bank account number'
            },
            account_name: {
                type: Sequelize.STRING,
                allowNull: true,
                comment: 'Account holder name'
            },
            is_verified: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                comment: 'Whether the wallet account is verified'
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW
            }
        }, {
            indexes: [
                {
                    fields: ['user_id']
                }
            ]
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('wallets');
    }
};
