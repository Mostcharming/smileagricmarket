'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const InvestmentPayment = sequelize.define('InvestmentPayment', {
        id: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            field: 'id'
        },
        investorId: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'investor_id'
        },
        userFarmId: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'user_farm_id'
        },
        userFarmInvestmentId: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'user_farm_investment_id'
        },
        investmentId: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'investment_id'
        },
        reference: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
            field: 'reference'
        },
        idempotencyKey: {
            type: DataTypes.STRING(100),
            allowNull: true,
            field: 'idempotency_key'
        },
        amount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            field: 'amount'
        },
        currency: {
            type: DataTypes.STRING(3),
            allowNull: false,
            defaultValue: 'NGN',
            field: 'currency'
        },
        gateway: {
            type: DataTypes.STRING(30),
            allowNull: false,
            defaultValue: 'paystack',
            field: 'gateway'
        },
        gatewayReference: {
            type: DataTypes.STRING(100),
            allowNull: true,
            unique: true,
            field: 'gateway_reference'
        },
        authorizationUrl: {
            type: DataTypes.TEXT,
            allowNull: true,
            field: 'authorization_url'
        },
        status: {
            type: DataTypes.ENUM('recorded', 'pending', 'successful', 'failed', 'cancelled'),
            allowNull: false,
            defaultValue: 'recorded',
            field: 'status'
        },
        paidAt: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'paid_at'
        },
        gatewayResponse: {
            type: DataTypes.JSONB,
            allowNull: true,
            field: 'gateway_response'
        }
    }, {
        tableName: 'investment_payments',
        timestamps: true,
        underscored: true,
        indexes: [
            { fields: ['investor_id'] },
            { fields: ['user_farm_id'] },
            { fields: ['user_farm_investment_id'] },
            { fields: ['investment_id'] },
            { fields: ['status'] },
            {
                unique: true,
                fields: ['investor_id', 'idempotency_key'],
                name: 'investment_payments_investor_id_idempotency_key_unique'
            }
        ]
    });

    return InvestmentPayment;
};
