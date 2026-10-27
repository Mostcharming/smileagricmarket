'use strict';

const { settings } = require('../../utils/paypetal');

const customerIdentity = user => ({
    fullname: user.fullName?.trim() || null,
    ...(user.email?.trim() ? { email: user.email.trim().toLowerCase() } : {}),
    ...(user.phoneNumber?.trim() ? { phoneNumber: user.phoneNumber.trim() } : {})
});
const completeIdentity = identity => typeof identity?.fullname === 'string' && identity.fullname.trim().length > 0;

function createCustomerRegistration({ sequelize, models, getSettings = settings }) {
    const { User, PaymentProfile, PaymentJob } = models;

    // The caller holds the user lock (or has just inserted the user) in this transaction.
    async function queueCustomer(user, transaction) {
        const config = getSettings();
        if (config.provider !== 'paypetal' || !config.enabled) return;
        const identity = customerIdentity(user);
        const [savedProfile] = await PaymentProfile.findOrCreate({ where: { userId: user.id },
            defaults: { identity }, transaction });
        const profile = await PaymentProfile.findByPk(savedProfile.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (profile.customerId || profile.creationAttemptedAt) return;
        await profile.update({ identity }, { transaction });
        if (!completeIdentity(identity)) return;
        await PaymentJob.findOrCreate({ where: { key: `create_customer:${profile.id}` },
            defaults: { action: 'create_customer', entityId: profile.id }, transaction });
    }

    async function registerUser(values) {
        return sequelize.transaction(async transaction => {
            const user = await User.create(values, { transaction });
            await queueCustomer(user, transaction);
            return user;
        });
    }

    async function updateUser(userId, values) {
        return sequelize.transaction(async transaction => {
            const user = await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!user) return null;
            await user.update(values, { transaction });
            await queueCustomer(user, transaction);
            return user;
        });
    }

    return { registerUser, updateUser, queueCustomer };
}

module.exports = { createCustomerRegistration, customerIdentity, completeIdentity };
