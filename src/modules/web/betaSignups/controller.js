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

function normalizeText(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
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
        farm_owners: 'farm_owner',
        farmer: 'farm_owner',
        farmers: 'farm_owner'
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
                fullName: signup.name || signup.firstName
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
        console.error('Failed to send beta signup confirmation email:', error);
    }
}

async function createBetaSignup(req, res) {
    const email = normalizeEmail(req.body?.email);
    const name = normalizeText(
        req.body?.name ?? req.body?.fullName ?? req.body?.firstName ?? req.body?.first_name
    );
    const location = normalizeText(req.body?.location);
    const phoneNumber = normalizeText(req.body?.phoneNumber ?? req.body?.phone);
    const produce = normalizeText(req.body?.produce);
    const investmentTimeline = normalizeText(req.body?.investmentTimeline);
    const userType = normalizeUserType(
        req.body?.type || req.body?.userType || req.body?.user_type
    );

    if (!validateEmail(email)) {
        return res.fail('A valid email address is required', 400);
    }

    if (!userType) {
        return res.fail('Type must be either investor or farm_owner', 400);
    }

    if (!name || name.length > 200) {
        return res.fail('Name is required and must not exceed 200 characters', 400);
    }
    if (!location || location.length > 254) {
        return res.fail('Location is required and must not exceed 254 characters', 400);
    }
    if (!/^\+?[\d\s().-]+$/.test(phoneNumber)
        || phoneNumber.length > 30 || !/^\d{10,15}$/.test(phoneNumber.replace(/\D/g, ''))) {
        return res.fail('A valid phone number with 10 to 15 digits is required', 400);
    }
    if (userType === 'farm_owner' && (!produce || produce.length > 1000)) {
        return res.fail('What do you produce? Provide an answer of up to 1000 characters', 400);
    }
    if (userType === 'investor' && (!investmentTimeline || investmentTimeline.length > 254)) {
        return res.fail('How soon do you want to invest? Provide an answer of up to 254 characters', 400);
    }

    const details = {
        name,
        firstName: name.split(' ')[0].slice(0, 100),
        location,
        phoneNumber,
        produce: userType === 'farm_owner' ? produce : null,
        investmentTimeline: userType === 'investor' ? investmentTimeline : null
    };

    try {
        const [signup, created] = await BetaSignup.findOrCreate({
            where: { email },
            defaults: {
                email,
                ...details,
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
