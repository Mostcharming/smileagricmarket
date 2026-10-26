'use strict';

const fs = require('node:fs');
const path = require('node:path');

function redact(value) {
    if (Array.isArray(value)) return value.map(redact);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
        /token|secret|password|authorization|base64hashed|api.?key/i.test(key) ? '[REDACTED]' : redact(item)
    ]));
}

function logPaypetalEvent(event) {
    if (process.env.PAYPETAL_LOG_RESPONSES !== 'true') return;
    const entry = redact({ timestamp: new Date().toISOString(), ...event });
    if (event.url?.endsWith('/api/auth/login') && 'responseBody' in entry) {
        entry.responseBody = '[Authentication response redacted]';
    }
    const line = JSON.stringify(entry);
    console.log('[PayPetal]', line);
    try {
        const file = path.resolve(process.env.PAYPETAL_LOG_FILE || 'logs/paypetal.log');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.appendFileSync(file, line + '\n', { mode: 0o600 });
    } catch (error) {
        console.error('PayPetal response log could not be written:', error.code);
    }
}

module.exports = { logPaypetalEvent };
