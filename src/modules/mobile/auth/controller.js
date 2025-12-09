
'use strict';

const bcrypt = require('bcrypt');
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
        const isOtpValid = otp === storedOtp || (otp === DEV_OVERRIDE_OTP);

        if (!isOtpValid) {
            return res.fail('Invalid OTP', 400);
        }

        // Check if OTP has expired
        if (new Date() > otpExpiry) {
            return res.fail('OTP has expired', 400);
        }

        if (isNewUser) {
            // For new users, don't create user yet - just return a token for signup flow
            // Clear temp OTP
            await TempOtp.destroy({
                where: { phoneNumber }
            });

            // Generate a temporary signup token (contains only phoneNumber, no user ID)
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
 * Complete signup profile - Form 1
 * Body: { fullName, gender, email }
 * Header: Authorization token from verifyOtp
 */
async function completeProfile(req, res) {
    try {
        const { fullName, gender, email } = req.body;
        const phoneNumber = req.user?.phoneNumber;

        if (!phoneNumber) {
            return res.fail('Invalid or missing signup token', 401);
        }

        // Check if phone number is already registered (shouldn't happen, but safety check)
        const existingUser = await User.findOne({
            where: { phoneNumber }
        });

        if (existingUser) {
            return res.fail('User already registered with this phone number', 409);
        }

        // Check if email already exists (if provided)
        if (email) {
            const existingEmail = await User.findOne({
                where: { email }
            });
            if (existingEmail) {
                return res.fail('User with this email already exists', 409);
            }
        }

        // Store profile data in session/temp storage (in production, you might use Redis)
        // For now, we'll store it temporarily - the client needs to submit password form next
        // We'll create the user when password is submitted

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

/**
 * Set password - Form 2
 * Body: { password, passwordConfirmation, fullName, gender, email }
 * Header: Authorization token from verifyOtp
 */
async function setPassword(req, res) {
    try {
        const { password, passwordConfirmation, fullName, gender, email } = req.body;
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

        // Check if user already exists (shouldn't happen, but safety check)
        const existingUser = await User.findOne({
            where: { phoneNumber }
        });

        if (existingUser) {
            return res.fail('User already registered with this phone number', 409);
        }

        // Check if email already exists (if provided)
        if (email) {
            const existingEmail = await User.findOne({
                where: { email }
            });
            if (existingEmail) {
                return res.fail('User with this email already exists', 409);
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const newUser = await User.create({
            phoneNumber,
            email: email || null,
            fullName: fullName || null,
            password: hashedPassword,
            gender: gender || null,
            isPhoneVerified: true
        });

        // Generate JWT token for the new user
        const token = signToken(newUser);

        return res.success(
            {
                token,
                user: {
                    id: newUser.id,
                    phoneNumber: newUser.phoneNumber,
                    fullName: newUser.fullName,
                    email: newUser.email,
                    gender: newUser.gender
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
    // TODO: Implement forgot password
    return res.fail('Not implemented', 501);
}

async function reset(req, res) {
    // TODO: Implement reset password
    return res.fail('Not implemented', 501);
}

/**
 * Signup with password
 * Body: { phoneNumber, email, fullName, password, gender }
 */
async function signupWithPassword(req, res) {
    try {
        const { phoneNumber, email, fullName, password, gender } = req.body;

        if (!phoneNumber || !password) {
            return res.fail('Phone number and password are required', 400);
        }

        // Check if user already exists
        const existingUser = await User.findOne({
            where: { phoneNumber }
        });

        if (existingUser) {
            return res.fail('User with this phone number already exists', 409);
        }

        // Check if email already exists (if provided)
        if (email) {
            const existingEmail = await User.findOne({
                where: { email }
            });
            if (existingEmail) {
                return res.fail('User with this email already exists', 409);
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const newUser = await User.create({
            phoneNumber,
            email: email || null,
            fullName: fullName || null,
            password: hashedPassword,
            gender: gender || null,
            isPhoneVerified: true
        });

        // Generate JWT token
        const token = signToken(newUser);

        return res.success(
            {
                token,
                user: {
                    id: newUser.id,
                    phoneNumber: newUser.phoneNumber,
                    fullName: newUser.fullName,
                    email: newUser.email,
                    gender: newUser.gender
                }
            },
            'User registered successfully'
        );
    } catch (error) {
        console.error('Signup with password error:', error);
        return res.fail(error.message, 500);
    }
}

/**
 * Login with password
 * Body: { phoneNumber, password }
 */
async function loginWithPassword(req, res) {
    try {
        const { phoneNumber, password } = req.body;

        if (!phoneNumber || !password) {
            return res.fail('Phone number and password are required', 400);
        }

        const user = await User.findOne({
            where: { phoneNumber }
        });

        if (!user) {
            return res.fail('Invalid phone number or password', 401);
        }

        // Compare passwords
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.fail('Invalid phone number or password', 401);
        }

        // Generate JWT token
        const token = signToken(user);

        return res.success(
            {
                token,
                user: {
                    id: user.id,
                    phoneNumber: user.phoneNumber,
                    fullName: user.fullName,
                    email: user.email,
                    gender: user.gender
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
    verifyOtp,
    completeProfile,
    setPassword,
    signupWithPassword,
    loginWithPassword,
    forgot,
    reset,
};