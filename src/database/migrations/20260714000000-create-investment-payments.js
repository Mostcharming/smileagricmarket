'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('investment_payments', {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: Sequelize.UUIDV4
            },
            investor_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id'
                },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE'
            },
            user_farm_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'user_farms',
                    key: 'id'
                },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE'
            },
            user_farm_investment_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'user_farm_investments',
                    key: 'id'
                },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE'
            },
            investment_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'investments',
                    key: 'id'
                },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE'
            },
            reference: {
                type: Sequelize.STRING(100),
                allowNull: false,
                unique: true
            },
            idempotency_key: {
                type: Sequelize.STRING(100),
                allowNull: true
            },
            amount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false
            },
            currency: {
                type: Sequelize.STRING(3),
                allowNull: false,
                defaultValue: 'NGN'
            },
            gateway: {
                type: Sequelize.STRING(30),
                allowNull: false,
                defaultValue: 'paystack'
            },
            gateway_reference: {
                type: Sequelize.STRING(100),
                allowNull: true,
                unique: true
            },
            authorization_url: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            status: {
                type: Sequelize.ENUM('recorded', 'pending', 'successful', 'failed', 'cancelled'),
                allowNull: false,
                defaultValue: 'recorded'
            },
            paid_at: {
                type: Sequelize.DATE,
                allowNull: true
            },
            gateway_response: {
                type: Sequelize.JSONB,
                allowNull: true
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        });

        await queryInterface.addIndex('investment_payments', ['investor_id'], {
            name: 'investment_payments_investor_id_idx'
        });
        await queryInterface.addIndex('investment_payments', ['user_farm_id'], {
            name: 'investment_payments_user_farm_id_idx'
        });
        await queryInterface.addIndex('investment_payments', ['user_farm_investment_id'], {
            name: 'investment_payments_user_farm_investment_id_idx'
        });
        await queryInterface.addIndex('investment_payments', ['investment_id'], {
            name: 'investment_payments_investment_id_idx'
        });
        await queryInterface.addIndex('investment_payments', ['status'], {
            name: 'investment_payments_status_idx'
        });
        await queryInterface.addIndex('investment_payments', ['investor_id', 'idempotency_key'], {
            name: 'investment_payments_investor_id_idempotency_key_unique',
            unique: true
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('investment_payments');
        await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_investment_payments_status";');
    }
};
