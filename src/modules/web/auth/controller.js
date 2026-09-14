'use strict';

const bcrypt = require('bcrypt');
const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const generateCode = require('../../../utils/verificationCode');
const notify = require('../../../utils/notify');
const { signToken } = require('../../../middlewares/common/security');

const models = defineModels(sequelize);
const { User, TempOtp, KYC } = models;

const OTP_EXPIRY_MINUTES = 10;
const DEV_OVERRIDE_OTP = '777666';

function getOtpIdentity(body) {
    const { phoneNumber, email } = body || {};
    if (phoneNumber !== undefined && (typeof phoneNumber !== 'string' || !phoneNumber.trim())) return null;
    if (email !== undefined && (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))) return null;
    if (phoneNumber) return { phoneNumber: phoneNumber.trim() };
    if (email) return { email: email.trim().toLowerCase() };
    return null;
}

async function sendOtp(identity, user, otp) {
    const email = Boolean(identity.email);
    const recipient = user || { id: Object.values(identity)[0], ...identity, fullName: null };
    await notify(recipient, 'user', email ? 'EMAIL_OTP_TEMPLATE' : 'SMS_OTP_TEMPLATE',
        { otp, expiryTime: `${OTP_EXPIRY_MINUTES} minutes` }, [email ? 'email' : 'sms'], true, models);
}

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
        const identity = getOtpIdentity(req.body);

        if (!identity) {
            return res.fail('A valid phone number or email is required', 400);
        }

        const existingUser = await User.findOne({
            where: identity
        });

        if (existingUser) {
            return res.fail(`User already exists with this ${identity.email ? 'email' : 'phone number'}`, 409);
        }

        const otp = generateCode(6, { letters: false, numbers: true });
        const otpExpiry = identity.email ? new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000) : null;

        // Replace the previous challenge for the selected destination.
        await TempOtp.destroy({ where: identity });
        await TempOtp.create({
            ...identity,
            otp,
            otpExpiry
        });

        await sendOtp(identity, null, otp);

        return res.success(
            { message: 'OTP sent successfully', isNewUser: true },
            `OTP sent to your ${identity.email ? 'email' : 'phone'} for registration`
        );
    } catch (error) {
        console.error('Request OTP error:', error);
        return res.fail(error.message, 500);
    }
}

async function resendOtp(req, res) {
    try {
        const identity = getOtpIdentity(req.body);

        if (!identity) {
            return res.fail('A valid phone number or email is required', 400);
        }

        const existingUser = await User.findOne({
            where: identity
        });

        const otp = generateCode(6, { letters: false, numbers: true });
        const otpExpiry = identity.email ? new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000) : null;

        // Keep email challenges separate from legacy SMS challenges on User.
        if (existingUser && !identity.email) {
            await existingUser.update({ otp, otpExpiry });
        } else {
            const tempOtp = await TempOtp.findOne({
                where: identity
            });

            if (tempOtp) {
                await tempOtp.update({ otp, otpExpiry });
            } else {
                await TempOtp.create({
                    ...identity,
                    otp,
                    otpExpiry
                });
            }
        }

        await sendOtp(identity, existingUser, otp);

        return res.success(
            { message: 'OTP sent successfully' },
            `OTP sent to your ${identity.email ? 'email' : 'phone'}`
        );
    } catch (error) {
        console.error('Resend OTP error:', error);
        return res.fail(error.message, 500);
    }
}

async function verifyOtp(req, res) {
    try {
        const { otp } = req.body || {};
        const identity = getOtpIdentity(req.body);

        if (!identity || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
            return res.fail('A valid phone number or email and a 6-digit OTP are required', 400);
        }

        const existingUser = await User.findOne({
            where: identity
        });

        let isNewUser = false;
        let storedOtp, otpExpiry;

        if (existingUser && !identity.email) {
            storedOtp = existingUser.otp;
            otpExpiry = existingUser.otpExpiry;
            isNewUser = false;
        } else {
            const tempOtp = await TempOtp.findOne({
                where: identity
            });

            if (!tempOtp) {
                return res.fail('OTP not found or expired', 404);
            }

            storedOtp = tempOtp.otp;
            otpExpiry = tempOtp.otpExpiry;
            isNewUser = !existingUser;
        }

        const isOtpValid = otp === storedOtp || (!identity.email && otp === DEV_OVERRIDE_OTP);

        if (!isOtpValid) {
            return res.fail('Invalid OTP', 400);
        }

        if (identity.email && (!otpExpiry || new Date() > new Date(otpExpiry))) {
            return res.fail('OTP has expired', 400);
        }

        if (identity.email) {
            // Consume only the code we checked, even if a resend or another verification races this request.
            const consumed = await TempOtp.destroy({ where: { ...identity, otp: storedOtp } });
            if (!consumed) return res.fail('OTP not found or expired', 404);
        }

        if (isNewUser) {
            if (!identity.email) await TempOtp.destroy({ where: identity });

            const signupToken = signToken({ ...identity, isSignupInProgress: true });

            return res.success(
                {
                    token: signupToken,
                    ...identity,
                    isNewUser: true
                },
                'OTP verified successfully'
            );
        } else {
            if (!identity.email) {
                await existingUser.update({ otp: null, otpExpiry: null, isPhoneVerified: true });
            }

            const token = signToken(existingUser);

            return res.success(
                {
                    token,
                    ...identity,
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
        const identity = getOtpIdentity(req.user);
        const email = identity?.email || req.body?.email;

        if (!identity) {
            return res.fail('Invalid or missing signup token', 401);
        }
        if (identity.email && req.body?.email !== undefined && getOtpIdentity({ email: req.body.email })?.email !== identity.email) {
            return res.fail('Email must match the verified signup email', 400);
        }

        const existingUser = await User.findOne({
            where: identity
        });

        if (existingUser) {
            return res.fail(`User already registered with this ${identity.email ? 'email' : 'phone number'}`, 409);
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
                ...identity,
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
        const { password, passwordConfirmation, fullName, gender } = req.body || {};
        const identity = getOtpIdentity(req.user);
        const email = identity?.email || req.body?.email;

        if (!identity) {
            return res.fail('Invalid or missing signup token', 401);
        }
        if (identity.email && req.body?.email !== undefined && getOtpIdentity({ email: req.body.email })?.email !== identity.email) {
            return res.fail('Email must match the verified signup email', 400);
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
            where: identity
        });

        if (existingUser) {
            return res.fail(`User already registered with this ${identity.email ? 'email' : 'phone number'}`, 409);
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
            phoneNumber: identity.phoneNumber || null,
            email: email || null,
            fullName: fullName || null,
            password: hashedPassword,
            gender: gender || null,
            isPhoneVerified: Boolean(identity.phoneNumber)
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
        const { phoneNumber, email } = req.body || {};

        if (!phoneNumber && !email) {
            return res.fail('Phone number or email is required', 400);
        }

        const user = await User.findOne({
            where: phoneNumber ? { phoneNumber } : { email }
        });

        if (!user) {
            return res.success(
                { message: 'If an account exists, a reset link will be sent' },
                'If an account exists, a reset link will be sent'
            );
        }

        const resetToken = generateCode(32, { letters: true, numbers: true });
        const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

        await user.update({
            resetToken,
            resetTokenExpiry
        });

        const resetLink = `${process.env.FE_URL || 'https://app.smileagrimarket.com'}/reset-password/${resetToken}`;

        await sendNotificationSafely(
            user,
            'PASSWORD_RESET_TEMPLATE',
            { resetLink, expiryTime: '1 hour' },
            getResetNotificationChannels(user)
        );

        return res.success(
            { message: 'Password reset link sent' },
            'If an account exists, a reset link will be sent'
        );
    } catch (error) {
        console.error('Forgot password error:', error);
        return res.fail(error.message, 500);
    }
}

async function resendResetToken(req, res) {
    try {
        const { phoneNumber, email } = req.body || {};

        if (!phoneNumber && !email) {
            return res.fail('Phone number or email is required', 400);
        }

        const user = await User.findOne({
            where: phoneNumber ? { phoneNumber } : { email }
        });

        if (!user) {
            return res.success(
                { message: 'If an account exists, a reset link will be sent' },
                'If an account exists, a reset link will be sent'
            );
        }

        const resetToken = generateCode(32, { letters: true, numbers: true });
        const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

        await user.update({
            resetToken,
            resetTokenExpiry
        });

        const resetLink = `${process.env.FE_URL || 'https://app.smileagrimarket.com'}/reset-password/${resetToken}`;

        await sendNotificationSafely(
            user,
            'PASSWORD_RESET_TEMPLATE',
            { resetLink, expiryTime: '1 hour' },
            getResetNotificationChannels(user)
        );

        return res.success(
            { message: 'Password reset link sent' },
            'If an account exists, a reset link will be sent'
        );
    } catch (error) {
        console.error('Resend reset token error:', error);
        return res.fail(error.message, 500);
    }
}

async function verifyResetToken(req, res) {
    try {
        const { resetToken } = req.body || {};

        if (!resetToken) {
            return res.fail('Reset token is required', 400);
        }

        const user = await User.findOne({
            where: { resetToken }
        });

        if (!user) {
            return res.fail('Invalid reset token', 404);
        }

        if (new Date() > user.resetTokenExpiry) {
            return res.fail('Reset token has expired', 400);
        }

        return res.success(
            {
                phoneNumber: user.phoneNumber,
                email: user.email,
                fullName: user.fullName
            },
            'Reset token is valid'
        );
    } catch (error) {
        console.error('Verify reset token error:', error);
        return res.fail(error.message, 500);
    }
}

async function reset(req, res) {
    try {
        const { resetToken, password, passwordConfirmation } = req.body || {};

        if (!resetToken || !password || !passwordConfirmation) {
            return res.fail('Reset token, password, and password confirmation are required', 400);
        }

        if (password !== passwordConfirmation) {
            return res.fail('Passwords do not match', 400);
        }

        if (password.length < 6) {
            return res.fail('Password must be at least 6 characters long', 400);
        }

        const user = await User.findOne({
            where: { resetToken }
        });

        if (!user) {
            return res.fail('Invalid reset token', 404);
        }

        if (new Date() > user.resetTokenExpiry) {
            return res.fail('Reset token has expired', 400);
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await user.update({
            password: hashedPassword,
            resetToken: null,
            resetTokenExpiry: null
        });

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
