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

    return cachedConfig;
}

module.exports = { getTemiiConfig };
