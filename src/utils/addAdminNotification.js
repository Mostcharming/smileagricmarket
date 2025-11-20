'use strict';

const config = require('../config');

/**
 * Create an admin notification record
 * @param {object} models - Sequelize models object
 * @param {object} opts
 * @param {string} opts.title - Notification title (required)
 * @param {string|null} [opts.clickUrl=null] - Optional URL to open when notification is clicked. If a relative path (e.g. 'role' or '/role') it will be prefixed with the configured front-end URL.
 * @returns {Promise<object>} created AdminNotification instance
 */
async function addAdminNotification(models, { title, clickUrl = null } = {}) {
    if (!models || !models.AdminNotification) {
        throw new Error('models.AdminNotification is required');
    }

    if (!title || typeof title !== 'string') {
        throw new Error('`title` is required and must be a string');
    }

    let resolvedClickUrl = null;
    if (clickUrl != null) {
        if (typeof clickUrl !== 'string') {
            throw new Error('`clickUrl` must be a string when provided');
        }

        const trimmed = clickUrl.trim();
        if (trimmed === '') {
            resolvedClickUrl = null;
        } else if (/^https?:\/\//i.test(trimmed)) {
            // Absolute URL provided
            resolvedClickUrl = trimmed;
        } else {
            // Relative path: join with feUrl
            const fe = (config && config.feUrl) ? String(config.feUrl).replace(/\/+$/, '') : '';
            if (!fe) {
                // If no feUrl configured, store the relative path as-is (prepend '/').
                resolvedClickUrl = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
            } else {
                if (trimmed.startsWith('/')) {
                    resolvedClickUrl = `${fe}${trimmed}`;
                } else {
                    resolvedClickUrl = `${fe}/${trimmed}`;
                }
            }
        }
    }

    const payload = {
        title: title.trim(),
        clickUrl: resolvedClickUrl
    };

    // Allow caller to handle errors — bubble up any DB errors with context
    const notif = await models.AdminNotification.create(payload);
    return notif;
}

/**
 * Create an audit log record
 * @param {object} models - Sequelize models object
 * @param {object} opts
 * @param {string} opts.action - Action key (required)
 * @param {string} opts.message - Human readable message (required)
 * @param {string|null} [opts.userId=null]
 * @param {string|null} [opts.userType=null]
 * @param {object|null} [opts.meta=null]
 * @returns {Promise<object>} created AuditLog instance
 */
async function addAuditLog(models, { action, message, userId = null, userType = null, meta = null } = {}) {
    if (!models || !models.AuditLog) {
        throw new Error('models.AuditLog is required');
    }

    if (!action || typeof action !== 'string') {
        throw new Error('`action` is required and must be a string');
    }

    if (!message || typeof message !== 'string') {
        throw new Error('`message` is required and must be a string');
    }

    // Ensure meta is either null or a plain object
    if (meta != null && typeof meta !== 'object') {
        // coerce non-object meta into an object to avoid DB type issues
        meta = { value: meta };
    }

    const payload = {
        action: action.trim(),
        message: message.trim(),
        userId,
        userType,
        meta
    };

    const log = await models.AuditLog.create(payload);
    return log;
}

module.exports = {
    addAdminNotification,
    addAuditLog
};
