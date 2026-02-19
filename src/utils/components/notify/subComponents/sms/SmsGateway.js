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
            const payload = {
                api_key: this.config.apiKey,
                to: phoneNumber,
                from: this.sender,
                sms: this.message,
                channel: 'dnd',
                type: 'plain'
            };

            const response = await axios.post('https://v3.api.termii.com/api/sms/send', payload);
            console.log('Temii Response:', response);



            return response.data;
        } catch (error) {
            throw new Error(`Termii SMS Error: ${error.message}`);
        }
    }
}

module.exports = SmsGateway;