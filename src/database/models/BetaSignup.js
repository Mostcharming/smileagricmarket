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
        // Nullable for signups collected before the expanded beta form.
        name: {
            type: DataTypes.STRING(200),
            allowNull: true,
            field: 'name'
        },
        location: {
            type: DataTypes.STRING(254),
            allowNull: true,
            field: 'location'
        },
        phoneNumber: {
            type: DataTypes.STRING(30),
            allowNull: true,
            field: 'phone_number'
        },
        produce: {
            type: DataTypes.STRING(1000),
            allowNull: true,
            field: 'produce'
        },
        investmentTimeline: {
            type: DataTypes.STRING(254),
            allowNull: true,
            field: 'investment_timeline'
        },
        userType: {
            type: DataTypes.ENUM('investor', 'farm_owner'),
            allowNull: false,
            field: 'user_type',
            validate: {
                isIn: [['investor', 'farm_owner']]
            }
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
