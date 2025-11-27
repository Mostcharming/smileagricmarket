'use strict';

const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const generateCode = require('../../../utils/verificationCode');
const notify = require('../../../utils/notify');
const { signToken } = require('../../../middlewares/common/security');

const models = defineModels(sequelize);
const { User } = models;

const OTP_EXPIRY_MINUTES = 10;
const DEV_OVERRIDE_OTP = '777666';

/**
 * Send OTP for signup
 * Body: { phoneNumber }
 */
async function signupSendOtp(req, res) {
    try {
        const { phoneNumber } = req.body;

        if (!phoneNumber) {
            return res.fail('Phone number is required', 400);
        }

        // Check if user already exists and is verified
        const existingUser = await User.findOne({
            where: { phoneNumber }
        });

        if (existingUser && existingUser.isPhoneVerified) {
            return res.fail('Phone number already registered', 400);
        }

        // Generate OTP
        const otp = generateCode(6, { letters: false, numbers: true });
        const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000);

        // Create or update user with OTP
        if (existingUser) {
            await existingUser.update({ otp, otpExpiry });
        } else {
            await User.create({
                phoneNumber,
                otp,
                otpExpiry,
                isPhoneVerified: false
            });
        }

        // Send OTP via SMS (you can implement this based on your notification system)
        // For now, we'll just return success
        // await notify(user, 'user', 'SMS_OTP_TEMPLATE', { otp }, ['sms']);

        return res.success({ message: 'OTP sent successfully' }, 'OTP sent to your phone');
    } catch (error) {
        console.error('Signup OTP error:', error);
        return res.fail(error.message, 500);
    }
}

/**
 * Verify OTP for signup
 * Body: { phoneNumber, otp }
 */
async function signupVerifyOtp(req, res) {
    try {
        const { phoneNumber, otp } = req.body;

        if (!phoneNumber || !otp) {
            return res.fail('Phone number and OTP are required', 400);
        }

        const user = await User.findOne({
            where: { phoneNumber }
        });

        if (!user) {
            return res.fail('User not found', 404);
        }

        // Check if OTP is correct (with dev override)
        const isOtpValid = otp === user.otp || (process.env.NODE_ENV === 'development' && otp === DEV_OVERRIDE_OTP);

        if (!isOtpValid) {
            return res.fail('Invalid OTP', 400);
        }

        // Check if OTP has expired
        if (new Date() > user.otpExpiry) {
            return res.fail('OTP has expired', 400);
        }

        // Mark phone as verified (but user still needs to complete profile)
        await user.update({
            otp: null,
            otpExpiry: null,
            isPhoneVerified: true
        });

        return res.success({ phoneNumber, userId: user.id }, 'OTP verified successfully');
    } catch (error) {
        console.error('Signup OTP verification error:', error);
        return res.fail(error.message, 500);
    }
}

/**
 * Complete signup profile
 * Body: { phoneNumber, fullName, gender, email }
 */
async function signupCompleteProfile(req, res) {
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

        if (!user.isPhoneVerified) {
            return res.fail('Phone number not verified', 400);
        }

        // Update user profile
        await user.update({
            fullName: fullName || user.fullName,
            gender: gender || user.gender,
            email: email || user.email
        });

        // Generate JWT token
        const token = signToken(user);

        return res.success(
            { token, user: { id: user.id, phoneNumber: user.phoneNumber, fullName: user.fullName, email: user.email, gender: user.gender } },
            'Profile completed successfully'
        );
    } catch (error) {
        console.error('Signup complete profile error:', error);
        return res.fail(error.message, 500);
    }
}

/**
 * Login - Send OTP
 * Body: { phoneNumber }
 */
async function loginSendOtp(req, res) {
    try {
        const { phoneNumber } = req.body;

        if (!phoneNumber) {
            return res.fail('Phone number is required', 400);
        }

        const user = await User.findOne({
            where: { phoneNumber }
        });

        if (!user) {
            return res.fail('User not registered', 404);
        }

        if (!user.isPhoneVerified) {
            return res.fail('Phone number not verified', 400);
        }

        // Generate OTP
        const otp = generateCode(6, { letters: false, numbers: true });
        const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000);

        await user.update({ otp, otpExpiry });

        // Send OTP via SMS
        // await notify(user, 'user', 'SMS_LOGIN_OTP_TEMPLATE', { otp }, ['sms']);

        return res.success({ message: 'OTP sent successfully' }, 'OTP sent to your phone');
    } catch (error) {
        console.error('Login OTP error:', error);
        return res.fail(error.message, 500);
    }
}

/**
 * Login - Verify OTP
 * Body: { phoneNumber, otp }
 */
async function loginVerifyOtp(req, res) {
    try {
        const { phoneNumber, otp } = req.body;

        if (!phoneNumber || !otp) {
            return res.fail('Phone number and OTP are required', 400);
        }

        const user = await User.findOne({
            where: { phoneNumber }
        });

        if (!user) {
            return res.fail('User not found', 404);
        }

        // Check if OTP is correct (with dev override)
        const isOtpValid = otp === user.otp || (process.env.NODE_ENV === 'development' && otp === DEV_OVERRIDE_OTP);

        if (!isOtpValid) {
            return res.fail('Invalid OTP', 400);
        }

        // Check if OTP has expired
        if (new Date() > user.otpExpiry) {
            return res.fail('OTP has expired', 400);
        }

        // Clear OTP
        await user.update({
            otp: null,
            otpExpiry: null
        });

        // Generate JWT token
        const token = signToken(user);

        return res.success(
            { token, user: { id: user.id, phoneNumber: user.phoneNumber, fullName: user.fullName, email: user.email, gender: user.gender } },
            'Login successful'
        );
    } catch (error) {
        console.error('Login OTP verification error:', error);
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
    signupSendOtp,
    signupVerifyOtp,
    signupCompleteProfile,
    loginSendOtp,
    loginVerifyOtp,
    login: loginSendOtp,
    forgot,
    reset,
};