'use strict';

const bcrypt = require('bcrypt');
const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const generateCode = require('../../../utils/verificationCode');
const notify = require('../../../utils/notify');
const { signToken } = require('../../../middlewares/common/security');
const { getTemplate } = require('../../../utils/templateLoader');

const models = defineModels(sequelize);
const { User, TempOtp, KYC } = models;

const OTP_EXPIRY_MINUTES = 30;
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
        // const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000);
        const otpExpiry = null; // OTP never expires

        if (existingUser) {
            // Existing user - store OTP in user table
            await existingUser.update({ otp, otpExpiry });
            
            // Send OTP via SMS
            await notify(existingUser, 'user', 'SMS_OTP_TEMPLATE', { otp }, ['sms']);
        } else {
            // New user - store OTP in temp table
            await TempOtp.create({
                phoneNumber,
                otp,
                otpExpiry
            });
            
            // Create temporary user object for notification
            const tempUser = {
                id: phoneNumber,
                phoneNumber: phoneNumber,
                fullName: null,
                email: null
            };
            
            // Send OTP via SMS
            await notify(tempUser, 'user', 'SMS_OTP_TEMPLATE', { otp }, ['sms']);
        }

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
 * Resend OTP - Resend OTP to phone number (for signup or login)
 * Body: { phoneNumber }
 */
async function resendOtp(req, res) {
    try {
        const { phoneNumber } = req.body;

        if (!phoneNumber) {
            return res.fail('Phone number is required', 400);
        }

        // Check if user already exists
        const existingUser = await User.findOne({
            where: { phoneNumber }
        });

        // Generate new OTP
        const otp = generateCode(6, { letters: false, numbers: true });
        // const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000);
        const otpExpiry = null; // OTP never expires

        if (existingUser) {
            // Existing user - update OTP in user table
            await existingUser.update({ otp, otpExpiry });
            
            // Send OTP via SMS
            await notify(existingUser, 'user', 'SMS_OTP_TEMPLATE', { otp }, ['sms']);
        } else {
            // New user - update or create OTP in temp table
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
            
            // Create temporary user object for notification
            const tempUser = {
                id: phoneNumber,
                phoneNumber: phoneNumber,
                fullName: null,
                email: null
            };
            
            // Send OTP via SMS
            await notify(tempUser, 'user', 'SMS_OTP_TEMPLATE', { otp }, ['sms']);
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
        // if (new Date() > otpExpiry) {
        //     return res.fail('OTP has expired', 400);
        // }

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

        // Check if user has approved KYC
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
        )
    } catch (error) {
        console.error('Set password error:', error);
        return res.fail(error.message, 500);
    }
}

/**
 * Forgot Password - Request password reset
 * Body: { phoneNumber } or { email }
 */
async function forgot(req, res) {
    try {
        const { phoneNumber, email } = req.body;

        if (!phoneNumber && !email) {
            return res.fail('Phone number or email is required', 400);
        }

        // Find user by phone or email
        const user = await User.findOne({
            where: phoneNumber ? { phoneNumber } : { email }
        });

        if (!user) {
            // Don't reveal if user exists or not (security best practice)
            return res.success(
                { message: 'If an account exists, a reset link will be sent' },
                'If an account exists, a reset link will be sent'
            );
        }

        // Generate reset token (valid for 1 hour)
        const resetToken = generateCode(32, { letters: true, numbers: true });
        const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        // Store reset token in user record
        await user.update({
            resetToken,
            resetTokenExpiry
        });

        // Generate reset link
        const resetLink = `${process.env.FE_URL || "https://smileagrimarket.com"}/reset-password/${resetToken}`;

        // Send reset link via SMS or Email
        await notify(user, 'user', 'PASSWORD_RESET_TEMPLATE', { resetLink }, ['sms', 'email']);

        return res.success(
            { message: 'Password reset link sent' },
            'If an account exists, a reset link will be sent'
        );
    } catch (error) {
        console.error('Forgot password error:', error);
        return res.fail(error.message, 500);
    }
}

/**
 * Resend Reset Token - Resend password reset token
 * Body: { phoneNumber } or { email }
 */
async function resendResetToken(req, res) {
    try {
        const { phoneNumber, email } = req.body;

        if (!phoneNumber && !email) {
            return res.fail('Phone number or email is required', 400);
        }

        // Find user by phone or email
        const user = await User.findOne({
            where: phoneNumber ? { phoneNumber } : { email }
        });

        if (!user) {
            // Don't reveal if user exists or not (security best practice)
            return res.success(
                { message: 'If an account exists, a reset link will be sent' },
                'If an account exists, a reset link will be sent'
            );
        }

        // Generate new reset token (valid for 1 hour)
        const resetToken = generateCode(32, { letters: true, numbers: true });
        const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        // Store new reset token in user record
        await user.update({
            resetToken,
            resetTokenExpiry
        });

        // Generate reset link
        const resetLink = `${process.env.FE_URL || "https://smileagrimarket.com"}/reset-password/${resetToken}`;

        // Send reset link via SMS or Email
        await notify(user, 'user', 'PASSWORD_RESET_TEMPLATE', { resetLink }, ['sms', 'email']);

        return res.success(
            { message: 'Password reset link sent' },
            'If an account exists, a reset link will be sent'
        );
    } catch (error) {
        console.error('Resend reset token error:', error);
        return res.fail(error.message, 500);
    }
}

/**
 * Verify Reset Token - Get user info for password reset form
 * Body: { resetToken }
 */
async function verifyResetToken(req, res) {
    try {
        const { resetToken } = req.body;

        if (!resetToken) {
            return res.fail('Reset token is required', 400);
        }

        // Find user with valid reset token
        const user = await User.findOne({
            where: { resetToken }
        });

        if (!user) {
            return res.fail('Invalid reset token', 404);
        }

        // Check if token has expired
        if (new Date() > user.resetTokenExpiry) {
            return res.fail('Reset token has expired', 400);
        }

        // Return user info (masked for security)
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

/**
 * Reset Password - Complete password reset
 * Body: { resetToken, password, passwordConfirmation }
 */
async function reset(req, res) {
    try {
        const { resetToken, password, passwordConfirmation } = req.body;

        if (!resetToken || !password || !passwordConfirmation) {
            return res.fail('Reset token, password, and password confirmation are required', 400);
        }

        if (password !== passwordConfirmation) {
            return res.fail('Passwords do not match', 400);
        }

        if (password.length < 6) {
            return res.fail('Password must be at least 6 characters long', 400);
        }

        // Find user with valid reset token
        const user = await User.findOne({
            where: { resetToken }
        });

        if (!user) {
            return res.fail('Invalid reset token', 404);
        }

        // Check if token has expired
        if (new Date() > user.resetTokenExpiry) {
            return res.fail('Reset token has expired', 400);
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update user password and clear reset token
        await user.update({
            password: hashedPassword,
            resetToken: null,
            resetTokenExpiry: null
        });

        // Generate auth token for automatic login
        const token = signToken(user);

        // Check if user has approved KYC
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

        // Check if user has approved KYC
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

/**
 * Login with password
 * Body: { phoneNumber or email, password }
 */
async function loginWithPassword(req, res) {
    try {
        const { phoneNumber, email, password } = req.body;

        if ((!phoneNumber && !email) || !password) {
            return res.fail('Phone number or email and password are required', 400);
        }

        // Find user by phone number or email
        const user = await User.findOne({
            where: phoneNumber ? { phoneNumber } : { email }
        });

        if (!user) {
            return res.fail('Invalid phone number, email or password', 401);
        }

        // Compare passwords
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.fail('Invalid phone number, email or password', 401);
        }

        // Generate JWT token
        const token = signToken(user);

        // Check if user has approved KYC
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