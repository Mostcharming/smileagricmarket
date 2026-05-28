'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Wallet = sequelize.define('Wallet', {
        id: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            field: 'id'
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
            unique: true,
            field: 'user_id',
            references: {
                model: 'users',
                key: 'id'
            },
            onDelete: 'CASCADE'
        },
        bankName: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'bank_name',
            comment: 'Name of the bank'
        },
        accountNumber: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'account_number',
            comment: 'Bank account number'
        },
        accountName: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'account_name',
            comment: 'Account holder name'
        },
        isVerified: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            field: 'is_verified',
            comment: 'Whether the wallet account is verified'
        }
    }, {
        tableName: 'wallets',
        timestamps: true,
        underscored: true,
        indexes: [
            {
                fields: ['user_id']
            }
        ]
    });

    return Wallet;
};
