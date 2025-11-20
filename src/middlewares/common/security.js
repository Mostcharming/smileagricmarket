'use strict';



const jwtLib = (() => {
    try {
        return require('jsonwebtoken');
    } catch (e) {
        return null;
    }
})();

function ensureJwtAvailable() {
    if (!jwtLib) throw new Error('Missing dependency: jsonwebtoken. Run `npm install jsonwebtoken`');
    const secret = require('../../config').jwtSecret
    if (!secret) throw new Error('Missing configuration: JWT_SECRET environment variable is not set');
    return secret;
}

function signToken(user, expiresIn = require('../../config').jwtExpiresIn) {
    const secret = ensureJwtAvailable();
    return jwtLib.sign({ sub: user.id, user }, secret, { expiresIn });
}

function verifyToken(token) {
    const secret = ensureJwtAvailable();
    return jwtLib.verify(token, secret);
}

function securityMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization || req.headers['x-access-token'] || req.query.token;
        if (!authHeader) return res.fail('Authentication token required', 401);

        let token = authHeader;
        if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
            token = authHeader.slice(7).trim();
        }

        let payload;
        try {
            payload = verifyToken(token);
        } catch (err) {
            return res.fail('Invalid or expired token', 401);
        }

        req.user = payload.user;
        req.admin = req.user;

        next();
    } catch (err) {
        if (err && err.message && (err.message.includes('Missing dependency') || err.message.includes('Missing configuration'))) {
            return res.fail(err.message, 500);
        }
        return next(err);
    }
}

module.exports = {
    securityMiddleware,
    signToken,
    verifyToken,
};
