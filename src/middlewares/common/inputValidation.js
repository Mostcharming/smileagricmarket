/**
 * Input validation and sanitization utilities
 */

const PHONE_REGEX = /^[\d\s\-\+\(\)]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_STRING_REGEX = /^[a-zA-Z0-9\s\-_.,!?&'()]*$/;

/**
 * Validate phone number format
 */
function validatePhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') return false;
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
}

/**
 * Validate email format
 */
function validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    return EMAIL_REGEX.test(email) && email.length <= 254;
}

/**
 * Validate OTP (must be numeric, 4-6 digits)
 */
function validateOTP(otp) {
    if (!otp || typeof otp !== 'string') return false;
    return /^\d{4,6}$/.test(otp);
}

/**
 * Sanitize string input - remove potential XSS vectors
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return str;

    return str
        .replace(/[<>]/g, '') // Remove angle brackets
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/on\w+\s*=/gi, '') // Remove event handlers
        .trim();
}

/**
 * Sanitize object - recursively sanitizes string properties
 */
function sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    const sanitized = Array.isArray(obj) ? [] : {};

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            if (typeof value === 'string') {
                sanitized[key] = sanitizeString(value);
            } else if (typeof value === 'object' && value !== null) {
                sanitized[key] = sanitizeObject(value);
            } else {
                sanitized[key] = value;
            }
        }
    }

    return sanitized;
}

/**
 * Validate request body has required fields
 */
function validateRequiredFields(obj, fields = []) {
    const missing = [];
    for (const field of fields) {
        if (!obj || obj[field] === undefined || obj[field] === null || obj[field] === '') {
            missing.push(field);
        }
    }
    return {
        valid: missing.length === 0,
        missing
    };
}

/**
 * Express middleware for input validation and sanitization
 */
function inputValidationMiddleware(req, res, next) {
    // Sanitize all input
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body);
    }
    if (req.query && typeof req.query === 'object') {
        req.query = sanitizeObject(req.query);
    }
    if (req.params && typeof req.params === 'object') {
        req.params = sanitizeObject(req.params);
    }

    next();
}

module.exports = {
    validatePhoneNumber,
    validateEmail,
    validateOTP,
    sanitizeString,
    sanitizeObject,
    validateRequiredFields,
    inputValidationMiddleware
};
