/**
 * In-memory rate limiter for basic protection against brute force attacks
 * For production, consider using redis-based rate limiter
 */

class RateLimiter {
    constructor() {
        this.attempts = new Map();
    }

    /**
     * Check if a request should be allowed
     * @param {string} key - Unique identifier (IP, email, phone, etc.)
     * @param {number} maxAttempts - Maximum attempts allowed
     * @param {number} windowMs - Time window in milliseconds
     * @returns {boolean} - True if request should be allowed
     */
    isAllowed(key, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
        const now = Date.now();
        const userData = this.attempts.get(key) || { attempts: 0, resetTime: now + windowMs };

        // Reset if window expired
        if (now > userData.resetTime) {
            userData.attempts = 0;
            userData.resetTime = now + windowMs;
        }

        userData.attempts++;
        this.attempts.set(key, userData);

        return userData.attempts <= maxAttempts;
    }

    /**
     * Get remaining attempts
     */
    getRemainingAttempts(key, maxAttempts = 5) {
        const userData = this.attempts.get(key);
        if (!userData) return maxAttempts;
        return Math.max(0, maxAttempts - userData.attempts);
    }

    /**
     * Get reset time for a key
     */
    getResetTime(key) {
        const userData = this.attempts.get(key);
        return userData ? userData.resetTime : null;
    }

    /**
     * Clear rate limit for a key
     */
    clear(key) {
        this.attempts.delete(key);
    }
}

const globalRateLimiter = new RateLimiter();

/**
 * Express middleware for rate limiting
 */
function createRateLimitMiddleware(options = {}) {
    const {
        windowMs = 15 * 60 * 1000, // 15 minutes
        maxRequests = 100,
        keyGenerator = (req) => req.ip || req.connection.remoteAddress,
        skipSuccessfulRequests = false,
        message = 'Too many requests, please try again later'
    } = options;

    return (req, res, next) => {
        const key = keyGenerator(req);

        if (!globalRateLimiter.isAllowed(key, maxRequests, windowMs)) {
            const resetTime = globalRateLimiter.getResetTime(key);
            res.set('Retry-After', Math.ceil((resetTime - Date.now()) / 1000));
            return res.fail(message, 429);
        }

        next();
    };
}

/**
 * Rate limiting specifically for authentication endpoints
 */
function createAuthRateLimitMiddleware(maxAttempts = 5) {
    return (req, res, next) => {
        const identifier = req.body.phoneNumber || req.body.email || req.ip;
        const windowMs = 15 * 60 * 1000; // 15 minutes

        if (!globalRateLimiter.isAllowed(identifier, maxAttempts, windowMs)) {
            const resetTime = globalRateLimiter.getResetTime(identifier);
            const waitTime = Math.ceil((resetTime - Date.now()) / 1000);
            res.set('Retry-After', waitTime);
            return res.fail(`Too many attempts. Please try again in ${Math.ceil(waitTime / 60)} minutes`, 429);
        }

        next();
    };
}

module.exports = {
    RateLimiter,
    globalRateLimiter,
    createRateLimitMiddleware,
    createAuthRateLimitMiddleware
};
