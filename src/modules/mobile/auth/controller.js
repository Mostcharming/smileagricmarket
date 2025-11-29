
'use strict';

const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const generateCode = require('../../../utils/verificationCode');
const notify = require('../../../utils/notify');
const { signToken } = require('../../../middlewares/common/security');

const models = defineModels(sequelize);
const { User, TempOtp } = models;

const OTP_EXPIRY_MINUTES = 10;
const DEV_OVERRIDE_OTP = '777666';

/**
 * Request OTP - Unified endpoint for both signup and login
 * Body: { phoneNumber }
 */
async function requestOtp(req, res) {
    try {
        const { phoneNumber } = req.body;

        if (!phoneNumber) {
            return res.fail('Phone number is required', 400);
        }

        // Check if user already exists
        const existingUser = await User.findOne({
            where: { phoneNumber }
        });

        // Generate OTP
        const otp = generateCode(6, { letters: false, numbers: true });
        const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000);

        if (existingUser) {
            // Existing user - store OTP in user table
            await existingUser.update({ otp, otpExpiry });
        } else {
            // New user - store OTP in temp table
            await TempOtp.create({
                phoneNumber,
                otp,
                otpExpiry
            });
        }

        // Send OTP via SMS (commented for now)
        // await notify(user, 'user', 'SMS_OTP_TEMPLATE', { otp }, ['sms']);

        return res.success(
            { message: 'OTP sent successfully' },
            'OTP sent to your phone'
        );
    } catch (error) {
        console.error('Request OTP error:', error);
        return res.fail(error.message, 500);
    }
}

/**
 * Verify OTP - Unified endpoint for both signup and login
 * Body: { phoneNumber, otp }
 */
async function verifyOtp(req, res) {
    try {
        const { phoneNumber, otp } = req.body;

        if (!phoneNumber || !otp) {
            return res.fail('Phone number and OTP are required', 400);
        }

        // Check if it's an existing user
        const existingUser = await User.findOne({
            where: { phoneNumber }
        });

        let isNewUser = false;
        let storedOtp, otpExpiry;

        if (existingUser) {
            // Existing user
            storedOtp = existingUser.otp;
            otpExpiry = existingUser.otpExpiry;
            isNewUser = false;
        } else {
            // New user - check temp OTP table
            const tempOtp = await TempOtp.findOne({
                where: { phoneNumber }
            });

            if (!tempOtp) {
                return res.fail('OTP not found or expired', 404);
            }

            storedOtp = tempOtp.otp;
            otpExpiry = tempOtp.otpExpiry;
            isNewUser = true;
        }

        // Check if OTP is correct (with dev override)
        const isOtpValid = otp === storedOtp || (process.env.NODE_ENV === 'development' && otp === DEV_OVERRIDE_OTP);

        if (!isOtpValid) {
            return res.fail('Invalid OTP', 400);
        }

        // Check if OTP has expired
        if (new Date() > otpExpiry) {
            return res.fail('OTP has expired', 400);
        }

        if (isNewUser) {
            // Create new user for new phone numbers
            const newUser = await User.create({
                phoneNumber,
                otp: null,
                otpExpiry: null,
                isPhoneVerified: false
            });

            // Clear temp OTP
            await TempOtp.destroy({
                where: { phoneNumber }
            });

            return res.success(
                { phoneNumber, userId: newUser.id, isNewUser: true },
                'OTP verified successfully'
            );
        } else {
            // For existing users, mark as verified and authenticate
            await existingUser.update({
                otp: null,
                otpExpiry: null,
                isPhoneVerified: true
            });

            // Generate JWT token for authentication
            const token = signToken(existingUser);

            return res.success(
                {
                    token,
                    phoneNumber,
                    userId: existingUser.id,
                    isNewUser: false,
                    user: {
                        id: existingUser.id,
                        phoneNumber: existingUser.phoneNumber,
                        fullName: existingUser.fullName,
                        email: existingUser.email,
                        gender: existingUser.gender
                    }
                },
                'OTP verified successfully'
            );
        }
    } catch (error) {
        console.error('Verify OTP error:', error);
        return res.fail(error.message, 500);
    }
}

/**
 * Complete signup profile
 * Body: { phoneNumber, fullName, gender, email }
 */
async function completeProfile(req, res) {
    try {
        const { phoneNumber, fullName, gender, email } = req.body;

        if (!phoneNumber) {
            return res.fail('Phone number is required', 400);
        }

        const user = await User.findOne({
            where: { phoneNumber }
        });

        if (!user) {
            return res.fail('User not found', 404);
        }

        // Update user profile
        await user.update({
            fullName: fullName || user.fullName,
            gender: gender || user.gender,
            email: email || user.email,
            isPhoneVerified: true
        });

        // Generate JWT token
        const token = signToken(user);

        return res.success(
            { token, user: { id: user.id, phoneNumber: user.phoneNumber, fullName: user.fullName, email: user.email, gender: user.gender } },
            'Profile completed successfully'
        );
    } catch (error) {
        console.error('Complete profile error:', error);
        return res.fail(error.message, 500);
    }
}

async function forgot(req, res) {
    // TODO: Implement forgot password
    return res.fail('Not implemented', 501);
}

async function reset(req, res) {
    // TODO: Implement reset password
    return res.fail('Not implemented', 501);
}

module.exports = {
    requestOtp,
    verifyOtp,
    completeProfile,
    forgot,
    reset,
};