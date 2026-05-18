'use strict';

const config = require('../config');

function getOrigin(req) {
    const configuredBaseUrl = (process.env.BACKEND_URL || '').trim().replace(/\/+$/, '');
    if (configuredBaseUrl) {
        return configuredBaseUrl;
    }

    return `${req.protocol}://${req.get('host')}`;
}

function toBackendApiUrl(req, resourcePath) {
    if (!resourcePath) {
        return resourcePath;
    }

    if (/^https?:\/\//i.test(resourcePath)) {
        return resourcePath;
    }

    const apiPrefix = `/api/${config.apiVersion}`;
    const origin = getOrigin(req);
    const originWithoutApiPrefix = origin.endsWith(apiPrefix)
        ? origin.slice(0, -apiPrefix.length)
        : origin;

    const normalizedPath = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;

    if (normalizedPath.startsWith(apiPrefix)) {
        return `${originWithoutApiPrefix}${normalizedPath}`;
    }

    return `${originWithoutApiPrefix}${apiPrefix}${normalizedPath}`;
}

module.exports = {
    toBackendApiUrl
};
