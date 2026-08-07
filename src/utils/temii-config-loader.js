const path = require('path');
const fs = require('fs');

let cachedConfig = null;

function mergeConfig(baseConfig, overrideConfig) {
    return {
        ...baseConfig,
        ...overrideConfig,
        sms: {
            ...(baseConfig.sms || {}),
            ...(overrideConfig.sms || {})
        },
        email: {
            ...(baseConfig.email || {}),
            ...(overrideConfig.email || {})
        }
    };
}

function getTemiiConfig() {
    if (cachedConfig) {
        return cachedConfig;
    }

    const configPath = path.join(__dirname, 'temii-config.json');
    const configData = fs.readFileSync(configPath, 'utf-8');
    cachedConfig = JSON.parse(configData);

    const localConfigPath = path.join(__dirname, 'temii-config.local.json');
    if (fs.existsSync(localConfigPath)) {
        const localConfigData = fs.readFileSync(localConfigPath, 'utf-8');
        cachedConfig = mergeConfig(cachedConfig, JSON.parse(localConfigData));
    }

    cachedConfig = mergeConfig(cachedConfig, {
        email: {
            provider: process.env.EMAIL_PROVIDER || cachedConfig.email?.provider,
            host: process.env.SMTP_HOST || cachedConfig.email?.host,
            port: process.env.SMTP_PORT || cachedConfig.email?.port,
            secure: process.env.SMTP_SECURE === undefined
                ? cachedConfig.email?.secure
                : process.env.SMTP_SECURE === 'true',
            username: process.env.SMTP_USERNAME
                || process.env.MAILGUN_USERNAME
                || cachedConfig.email?.username,
            password: process.env.SMTP_PASSWORD || cachedConfig.email?.password,
            apiKey: process.env.MAILGUN_API_KEY || cachedConfig.email?.apiKey,
            domain: process.env.MAILGUN_DOMAIN || cachedConfig.email?.domain,
            fromEmail: process.env.EMAIL_FROM || cachedConfig.email?.fromEmail,
            fromName: process.env.EMAIL_FROM_NAME || cachedConfig.email?.fromName,
            url: process.env.MAILGUN_URL || cachedConfig.email?.url
        }
    });

    return cachedConfig;
}

module.exports = { getTemiiConfig };
