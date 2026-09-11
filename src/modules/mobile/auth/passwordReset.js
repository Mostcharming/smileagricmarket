'use strict';

const bcrypt = require('bcrypt');
const { randomInt, randomBytes, createHash } = require('node:crypto');

const EXPIRY_MS = 10 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const hashToken = token => createHash('sha256').update(token).digest('hex');
const active = expiry => expiry && new Date(expiry).getTime() > Date.now();

function accountWhere(body = {}) {
    const { phoneNumber, email } = body || {};
    if (phoneNumber !== undefined && (typeof phoneNumber !== 'string' || !phoneNumber.trim())) return null;
    if (email !== undefined && (typeof email !== 'string' || !email.trim())) return null;
    if (phoneNumber) return { phoneNumber: phoneNumber.trim() };
    if (email) return { email: email.trim() };
    return null;
}

// All changes lock the account first, serializing requests even before a reset row exists.
module.exports = (sequelize, { User, MobilePasswordReset }) => ({
    accountWhere,
    async request(where) {
        return sequelize.transaction(async transaction => {
            const user = await User.findOne({ where, transaction, lock: transaction.LOCK.UPDATE });
            if (!user) return null;
            const previous = await MobilePasswordReset.findByPk(user.id, { transaction });
            if (previous && Date.now() - new Date(previous.lastSentAt).getTime() < RESEND_MS) return null;
            const otp = String(randomInt(0, 1000000)).padStart(6, '0');
            const values = {
                userId: user.id, otpHash: await bcrypt.hash(otp, 10),
                otpExpiresAt: new Date(Date.now() + EXPIRY_MS), attempts: 0,
                lastSentAt: new Date(), tokenHash: null, tokenExpiresAt: null
            };
            if (previous) await previous.update(values, { transaction });
            else await MobilePasswordReset.create(values, { transaction });
            return { user, otp };
        });
    },
    async verify(where, otp) {
        return sequelize.transaction(async transaction => {
            const user = await User.findOne({ where, transaction, lock: transaction.LOCK.UPDATE });
            if (!user) return null;
            const challenge = await MobilePasswordReset.findByPk(user.id, { transaction });
            if (!challenge?.otpHash || !active(challenge.otpExpiresAt) || challenge.attempts >= MAX_ATTEMPTS) return null;
            if (!await bcrypt.compare(otp, challenge.otpHash)) {
                await challenge.update({ attempts: challenge.attempts + 1 }, { transaction });
                return null;
            }
            const resetToken = randomBytes(32).toString('hex');
            await challenge.update({
                otpHash: null, otpExpiresAt: null,
                tokenHash: hashToken(resetToken), tokenExpiresAt: new Date(Date.now() + EXPIRY_MS)
            }, { transaction });
            return { resetToken, expiresIn: EXPIRY_MS / 1000 };
        });
    },
    async consume(resetToken, password) {
        const tokenHash = hashToken(resetToken);
        return sequelize.transaction(async transaction => {
            const candidate = await MobilePasswordReset.findOne({ where: { tokenHash }, transaction });
            if (!candidate) return null;
            const user = await User.findOne({ where: { id: candidate.userId }, transaction, lock: transaction.LOCK.UPDATE });
            if (!user) return null;
            const challenge = await MobilePasswordReset.findByPk(user.id, { transaction });
            if (!challenge || challenge.tokenHash !== tokenHash || !active(challenge.tokenExpiresAt)) return null;
            await user.update({ password: await bcrypt.hash(password, 10) }, { transaction });
            await challenge.update({ tokenHash: null, tokenExpiresAt: null }, { transaction });
            return user;
        });
    }
});
