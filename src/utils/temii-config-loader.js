const path = require('path');
const fs = require('fs');

let cachedConfig = null;

function getTemiiConfig() {
    if (cachedConfig) {
        return cachedConfig;
    }

    const configPath = path.join(__dirname, 'temii-config.json');
    const configData = fs.readFileSync(configPath, 'utf-8');
    cachedConfig = JSON.parse(configData);

    return cachedConfig;
}

module.exports = { getTemiiConfig };
