'use strict';

const { UniqueConstraintError } = require('sequelize');
const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const { validateEmail } = require('../../../middlewares/common/inputValidation');
const notify = require('../../../utils/notify');

const models = defineModels(sequelize);
const { BetaSignup } = models;

function normalizeEmail(email) {
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function normalizeFirstName(firstName) {
    if (typeof firstName !== 'string') {
        return null;
    }

    const normalized = firstName.trim().replace(/\s+/g, ' ');
    return normalized ? normalized.slice(0, 100) : null;
}

function normalizeUserType(userType) {
    if (typeof userType !== 'string') {
        return null;
    }

    const normalized = userType.trim().toLowerCase().replace(/[\s-]+/g, '_');
    const aliases = {
        investor: 'investor',
        investors: 'investor',
        farm_owner: 'farm_owner',
        farm_owners: 'farm_owner'
    };

    return aliases[normalized] || null;
}

async function sendConfirmationEmail(signup) {
    try {
        const notificationResult = await notify(
            {
                id: signup.id,
                email: signup.email,
                firstName: signup.firstName,
                fullName: signup.firstName
            },
            'beta_signup',
            'BETA_SIGNUP_TEMPLATE',
            {},
            ['email'],
            false,
            models
        );

        if (notificationResult?.sent === false) {
            return false;
        }

        await signup.update({ confirmationEmailSentAt: new Date() });
        return true;
    } catch (error) {
        // The signup is still valid if the email provider is temporarily unavailable.
        console.error('Failed to send beta signup confirmation email:', error);
    }
}

async function createBetaSignup(req, res) {
    const email = normalizeEmail(req.body?.email);
    const firstName = normalizeFirstName(
        req.body?.firstName || req.body?.first_name || req.body?.name
    );
    const userType = normalizeUserType(
        req.body?.type || req.body?.userType || req.body?.user_type
    );

    if (!validateEmail(email)) {
        return res.fail('A valid email address is required', 400);
    }

    if (!userType) {
        return res.fail('Type must be either investor or farm_owner', 400);
    }

    try {
        const [signup, created] = await BetaSignup.findOrCreate({
            where: { email },
            defaults: {
                email,
                firstName,
                userType,
                source: 'landing_page'
            }
        });

        if (!created) {
            if (!signup.userType) {
                await signup.update({ userType });
            }

            if (!signup.confirmationEmailSentAt) {
                await sendConfirmationEmail(signup);
            }

            return res.success(
                {
                    email: signup.email,
                    type: signup.userType,
                    alreadyRegistered: true
                },
                'This email is already registered for the AgriMarket beta'
            );
        }

        await sendConfirmationEmail(signup);

        return res.success(
            {
                email: signup.email,
                type: signup.userType,
                alreadyRegistered: false
            },
            'You have successfully joined the AgriMarket beta',
            201
        );
    } catch (error) {
        if (error instanceof UniqueConstraintError) {
            return res.success(
                {
                    email,
                    type: userType,
                    alreadyRegistered: true
                },
                'This email is already registered for the AgriMarket beta'
            );
        }

        console.error('Create beta signup error:', error);
        return res.fail('Unable to join the beta right now. Please try again later.', 500);
    }
}

module.exports = {
    createBetaSignup
};
