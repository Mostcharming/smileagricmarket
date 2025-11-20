const axios = require('axios');

class SmsGateway {
    constructor(config, message, to, sender) {
        this.config = config;
        this.message = message;
        this.sender = sender;
        this.to = this._normalizeNumber(to);
    }

    _normalizeNumber(number) {
        number = String(number).trim();

        if (number.startsWith('0')) {
            number = '234' + number.substring(1);
        } else if (number.startsWith('+234')) {
            number = number.substring(1);
        } else if (!number.startsWith('234')) {
            number = '234' + number;
        }

        return number;
    }

    async custom() {
        const credential = this.config.custom;
        const method = (credential.method || 'post').toLowerCase();

        const shortCodes = {
            '{{message}}': this.message,
            '{{number}}': this._normalizeNumber(this.to),
            '{{from}}': this.sender,
        };

        const bodyNames = credential.body?.name || [];
        const bodyValues = credential.body?.value || [];
        const body = {};

        for (let i = 0; i < bodyNames.length; i++) {
            const name = bodyNames[i];
            const value = bodyValues[i];
            body[name] = shortCodes[value] || value;
        }

        const headerNames = credential.headers?.name || [];
        const headerValues = credential.headers?.value || [];
        const headers = {};

        for (let i = 0; i < headerNames.length; i++) {
            headers[headerNames[i]] = headerValues[i];
        }

        const url = credential.url || '';

        try {
            let response;
            if (method === 'get') {
                response = await axios.get(url, {
                    params: body,
                    headers: headers
                });
            } else {
                response = await axios.post(url, body, {
                    headers: headers
                });
            }

            return response.data;
        } catch (error) {
            throw new Error(`SMS Gateway Error: ${error.message}`);
        }
    }
}

module.exports = SmsGateway;