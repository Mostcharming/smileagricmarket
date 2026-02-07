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
        } else if (number.startsWith('234')) {
            return number;
        } else if (number.startsWith('+234')) {
            number = number.substring(1);
        } else if (number.startsWith('+')) {
            number = number.substring(1);
        } else if (!number.startsWith('234')) {
            number = '234' + number;
        }

        return number;
    }

    async temii() {
        try {
            let phoneNumber = this._normalizeNumber(this.to);
            const response = await axios.post(this.config.baseUrl, {
                to: phoneNumber,
                from: this.sender,
                sms: this.message,
                type: 'plain',
                api_key: this.config.apiKey,
                channel: 'dnd'
            });
            console.log('Temii Response:', response);

            if (!response.data || response.data.code !== '100') {
                throw new Error(response.data?.message || 'Failed to send SMS via Temii');
            }

            return response.data;
        } catch (error) {
            throw new Error(`Temii SMS Error: ${error.message}`);
        }
    }
}

module.exports = SmsGateway;