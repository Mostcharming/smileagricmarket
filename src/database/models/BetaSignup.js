'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const BetaSignup = sequelize.define('BetaSignup', {
        id: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            field: 'id'
        },
        email: {
            type: DataTypes.STRING(254),
            allowNull: false,
            unique: true,
            field: 'email',
            validate: {
                isEmail: true
            }
        },
        firstName: {
            type: DataTypes.STRING(100),
            allowNull: true,
            field: 'first_name'
        },
        source: {
            type: DataTypes.STRING(50),
            allowNull: false,
            defaultValue: 'landing_page',
            field: 'source'
        },
        confirmationEmailSentAt: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'confirmation_email_sent_at'
        }
    }, {
        tableName: 'beta_signups',
        timestamps: true,
        underscored: true
    });

    return BetaSignup;
};
