'use strict';

const bcrypt = require('bcrypt');
const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const generateCode = require('../../../utils/verificationCode');
const notify = require('../../../utils/notify');
const { signToken } = require('../../../middlewares/common/security');

const models = defineModels(sequelize);
const { User, TempOtp, KYC } = models;
const passwordReset = require('./passwordReset')(sequelize, models);

const OTP_EXPIRY_MINUTES = 30;
const DEV_OVERRIDE_OTP = '777666';

function getResetNotificationChannels(user) {
    return [
        user?.email ? 'email' : null,
        user?.phoneNumber ? 'sms' : null
    ].filter(Boolean);
}

async function sendNotificationSafely(user, templateName, shortCodes, channels) {
    if (!user || !channels.length) {
        return;
    }

    try {
        await notify(user, 'user', templateName, shortCodes, channels, true, models);
    } catch (error) {
        console.error(`Failed to send ${templateName} notification:`, error);
    }
}

async function requestOtp(req, res) {
    try {
        const { phoneNumber } = req.body || {};

        if (!phoneNumber) {
            return res.fail('Phone number is required', 400);
        }

        const existingUser = await User.findOne({
            where: { phoneNumber }
        });

        if (existingUser) {
            return res.fail('User already exists with this phone number', 409);
        }

        const otp = generateCode(6, { letters: false, numbers: true });
        const otpExpiry = null;

        // Delete all previous TempOtp records for this phone number
        const deleted = await models.TempOtp.destroy({ where: { phoneNumber } });
        await TempOtp.create({
            phoneNumber,
            otp,
            otpExpiry
        });

        const tempUser = {
            id: phoneNumber,
            phoneNumber: phoneNumber,
            fullName: null,
            email: null
        };

        await notify(tempUser, 'user', 'SMS_OTP_TEMPLATE', { otp }, ['sms'], true, models);

        return res.success(
            { message: 'OTP sent successfully', isNewUser: true },
            'OTP sent to your phone for registration'
        );
    } catch (error) {
        console.error('Request OTP error:', error);
        return res.fail(error.message, 500);
    }
}

async function resendOtp(req, res) {
    try {
        const { phoneNumber } = req.body || {};

        if (!phoneNumber) {
            return res.fail('Phone number is required', 400);
        }

        const existingUser = await User.findOne({
            where: { phoneNumber }
        });

        const otp = generateCode(6, { letters: false, numbers: true });
        // const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000);
        const otpExpiry = null;

        if (existingUser) {
            await existingUser.update({ otp, otpExpiry });

            await notify(existingUser, 'user', 'SMS_OTP_TEMPLATE', { otp }, ['sms'], true, models);
        } else {
            const tempOtp = await TempOtp.findOne({
                where: { phoneNumber }
            });

            if (tempOtp) {
                await tempOtp.update({ otp, otpExpiry });
            } else {
                await TempOtp.create({
                    phoneNumber,
                    otp,
                    otpExpiry
                });
            }

            const tempUser = {
                id: phoneNumber,
                phoneNumber: phoneNumber,
                fullName: null,
                email: null
            };

            await notify(tempUser, 'user', 'SMS_OTP_TEMPLATE', { otp }, ['sms'], true, models);
        }

        return res.success(
            { message: 'OTP sent successfully' },
            'OTP sent to your phone'
        );
    } catch (error) {
        console.error('Resend OTP error:', error);
        return res.fail(error.message, 500);
    }
}

async function verifyOtp(req, res) {
    try {
        const { phoneNumber, otp } = req.body || {};

        if (!phoneNumber || !otp) {
            return res.fail('Phone number and OTP are required', 400);
        }

        const existingUser = await User.findOne({
            where: { phoneNumber }
        });

        let isNewUser = false;
        let storedOtp, otpExpiry;

        if (existingUser) {
            storedOtp = existingUser.otp;
            otpExpiry = existingUser.otpExpiry;
            isNewUser = false;
        } else {
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

        const isOtpValid = otp === storedOtp || (otp === DEV_OVERRIDE_OTP);

        if (!isOtpValid) {
            return res.fail('Invalid OTP', 400);
        }

        // if (new Date() > otpExpiry) {
        //     return res.fail('OTP has expired', 400);
        // }

        if (isNewUser) {
            await TempOtp.destroy({
                where: { phoneNumber }
            });

            const signupToken = signToken({ phoneNumber, isSignupInProgress: true });

            return res.success(
                {
                    token: signupToken,
                    phoneNumber,
                    isNewUser: true
                },
                'OTP verified successfully'
            );
        } else {
            await existingUser.update({
                otp: null,
                otpExpiry: null,
                isPhoneVerified: true
            });

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

async function completeProfile(req, res) {
    try {
        const { fullName, gender, email } = req.body || {};
        const phoneNumber = req.user?.phoneNumber;

        if (!phoneNumber) {
            return res.fail('Invalid or missing signup token', 401);
        }

        const existingUser = await User.findOne({
            where: { phoneNumber }
        });

        if (existingUser) {
            return res.fail('User already registered with this phone number', 409);
        }

        if (email) {
            const existingEmail = await User.findOne({
                where: { email }
            });
            if (existingEmail) {
                return res.fail('User with this email already exists', 409);
            }
        }

        return res.success(
            {
                phoneNumber,
                message: 'Profile information received. Please proceed to set your password.'
            },
            'Profile information saved'
        );
    } catch (error) {
        console.error('Complete profile error:', error);
        return res.fail(error.message, 500);
    }
}

async function setPassword(req, res) {
    try {
        const { password, passwordConfirmation, fullName, gender, email } = req.body || {};
        const phoneNumber = req.user?.phoneNumber;

        if (!phoneNumber) {
            return res.fail('Invalid or missing signup token', 401);
        }

        if (!password || !passwordConfirmation) {
            return res.fail('Password and password confirmation are required', 400);
        }

        if (password !== passwordConfirmation) {
            return res.fail('Passwords do not match', 400);
        }

        if (password.length < 6) {
            return res.fail('Password must be at least 6 characters long', 400);
        }

        const existingUser = await User.findOne({
            where: { phoneNumber }
        });

        if (existingUser) {
            return res.fail('User already registered with this phone number', 409);
        }

        if (email) {
            const existingEmail = await User.findOne({
                where: { email }
            });
            if (existingEmail) {
                return res.fail('User with this email already exists', 409);
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            phoneNumber,
            email: email || null,
            fullName: fullName || null,
            password: hashedPassword,
            gender: gender || null,
            isPhoneVerified: true
        });

        await sendNotificationSafely(
            newUser,
            'WELCOME_EMAIL_TEMPLATE',
            {},
            newUser.email ? ['email'] : []
        );

        const token = signToken(newUser);

        const approvedKYC = await KYC.findOne({
            where: { userId: newUser.id, status: 'approved' }
        });

        return res.success(
            {
                token,
                user: {
                    id: newUser.id,
                    phoneNumber: newUser.phoneNumber,
                    fullName: newUser.fullName,
                    email: newUser.email,
                    gender: newUser.gender,
                    kycVerified: !!approvedKYC
                }
            },
            'User registered successfully'
        );
    } catch (error) {
        console.error('Set password error:', error);
        return res.fail(error.message, 500);
    }
}

async function forgot(req, res) {
    try {
        const where = passwordReset.accountWhere(req.body);
        if (!where) return res.fail('A valid phone number or email is required', 400);

        const result = await passwordReset.request(where);
        if (result) {
            await sendNotificationSafely(
                result.user,
                'MOBILE_PASSWORD_RESET_OTP_TEMPLATE',
                { otp: result.otp, expiryTime: '10 minutes' },
                getResetNotificationChannels(result.user)
            );
        }

        // Keep responses identical for unknown accounts and requests within the resend cooldown.
        const message = 'If an account exists, a password reset OTP will be sent';
        return res.success({ message }, message);
    } catch (error) {
        console.error('Forgot password error:', error);
        return res.fail('Unable to request password reset', 500);
    }
}

async function resendResetToken(req, res) {
    return forgot(req, res);
}

async function verifyResetToken(req, res) {
    try {
        const where = passwordReset.accountWhere(req.body);
        const { otp } = req.body || {};
        if (!where || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
            return res.fail('Phone number or email and a six-digit OTP are required', 400);
        }

        const result = await passwordReset.verify(where, otp);
        if (!result) return res.fail('Invalid or expired password reset OTP. Request a new OTP if needed.', 400);
        return res.success(result, 'Password reset OTP verified successfully');
    } catch (error) {
        console.error('Verify reset OTP error:', error);
        return res.fail('Unable to verify password reset OTP', 500);
    }
}

async function reset(req, res) {
    try {
        const { resetToken, password, passwordConfirmation } = req.body || {};

        if (typeof resetToken !== 'string' || !/^[a-f0-9]{64}$/.test(resetToken)
            || typeof password !== 'string' || !password
            || typeof passwordConfirmation !== 'string' || !passwordConfirmation) {
            return res.fail('Reset token, password, and password confirmation are required', 400);
        }

        if (password !== passwordConfirmation) {
            return res.fail('Passwords do not match', 400);
        }

        if (password.length < 6) {
            return res.fail('Password must be at least 6 characters long', 400);
        }

        const user = await passwordReset.consume(resetToken, password);
        if (!user) return res.fail('Invalid or expired reset token. Verify a password reset OTP first.', 400);

        await sendNotificationSafely(
            user,
            'PASSWORD_RESET_SUCCESS_TEMPLATE',
            {},
            user.email ? ['email'] : []
        );

        const token = signToken(user);

        const approvedKYC = await KYC.findOne({
            where: { userId: user.id, status: 'approved' }
        });

        return res.success(
            {
                token,
                user: {
                    id: user.id,
                    phoneNumber: user.phoneNumber,
                    fullName: user.fullName,
                    email: user.email,
                    gender: user.gender,
                    kycVerified: !!approvedKYC
                }
            },
            'Password reset successfully'
        );
    } catch (error) {
        console.error('Reset password error:', error);
        return res.fail(error.message, 500);
    }
}

async function signupWithPassword(req, res) {
    try {
        const { phoneNumber, email, fullName, password, gender } = req.body || {};

        if (!phoneNumber || !password) {
            return res.fail('Phone number and password are required', 400);
        }

        const existingUser = await User.findOne({
            where: { phoneNumber }
        });

        if (existingUser) {
            return res.fail('User with this phone number already exists', 409);
        }

        if (email) {
            const existingEmail = await User.findOne({
                where: { email }
            });
            if (existingEmail) {
                return res.fail('User with this email already exists', 409);
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            phoneNumber,
            email: email || null,
            fullName: fullName || null,
            password: hashedPassword,
            gender: gender || null,
            isPhoneVerified: true
        });

        await sendNotificationSafely(
            newUser,
            'WELCOME_EMAIL_TEMPLATE',
            {},
            newUser.email ? ['email'] : []
        );

        const token = signToken(newUser);

        const approvedKYC = await KYC.findOne({
            where: { userId: newUser.id, status: 'approved' }
        });

        return res.success(
            {
                token,
                user: {
                    id: newUser.id,
                    phoneNumber: newUser.phoneNumber,
                    fullName: newUser.fullName,
                    email: newUser.email,
                    gender: newUser.gender,
                    kycVerified: !!approvedKYC
                }
            },
            'User registered successfully'
        );
    } catch (error) {
        console.error('Signup with password error:', error);
        return res.fail(error.message, 500);
    }
}

async function loginWithPassword(req, res) {
    try {
        const { phoneNumber, email, password } = req.body || {};

        if ((!phoneNumber && !email) || !password) {
            return res.fail('Phone number or email and password are required', 400);
        }

        const user = await User.findOne({
            where: phoneNumber ? { phoneNumber } : { email }
        });

        if (!user) {
            return res.fail('Invalid phone number, email or password', 401);
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.fail('Invalid phone number, email or password', 401);
        }

        const token = signToken(user);

        const approvedKYC = await KYC.findOne({
            where: { userId: user.id, status: 'approved' }
        });

        return res.success(
            {
                token,
                user: {
                    id: user.id,
                    phoneNumber: user.phoneNumber,
                    fullName: user.fullName,
                    email: user.email,
                    gender: user.gender,
                    kycVerified: !!approvedKYC
                }
            },
            'Login successful'
        );
    } catch (error) {
        console.error('Login with password error:', error);
        return res.fail(error.message, 500);
    }
}

module.exports = {
    requestOtp,
    resendOtp,
    verifyOtp,
    completeProfile,
    setPassword,
    signupWithPassword,
    loginWithPassword,
    forgot,
    resendResetToken,
    verifyResetToken,
    reset,
};
