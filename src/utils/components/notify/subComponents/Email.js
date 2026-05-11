const axios = require('axios');
const NotifyProcess = require('./NotifyProcess');

class Email extends NotifyProcess {
    constructor(config, user = null) {
        super();
        this.config = config;
        this.user = user;
        this.statusField = 'emailStatus';
        this.body = 'emailBody';
        this.globalTemplate = 'emailTemplate';
        this.notifyConfig = 'email';
        this.email = null;
        this.receiverName = null;

        if (this.user) {
            this.prevConfiguration();
        }
    }

    prevConfiguration() {
        this.email = this.user.email;
        this.receiverName = this.user.firstName;
    }

    async send() {
        const message = await this.getMessage();

        if (message) {
            const emailConfig = this.config.email;

            const methodName = emailConfig.provider || 'temii';
            const method = this.emailMethods(methodName);

            try {
                await this[method](emailConfig, message);
            } catch (error) {
                await this.createErrorLog(error.message);
                throw error;
            }
        } else {
            throw new Error('Failed to generate message from template');
        }
    }

    emailMethods(name) {
        const methods = {
            temii: 'sendTemiiEmail',
        };
        return methods[name] || 'sendTemiiEmail';
    }

    async sendTemiiEmail(emailConfig, message) {
        try {
            const response = await axios.post(emailConfig.baseUrl, {
                to: this.email,
                from: emailConfig.fromEmail,
                sender_name: emailConfig.fromName,
                subject: this.subject,
                html: message,
                api_key: emailConfig.apiKey
            });

            if (!response.data || response.data.code !== '100') {
                throw new Error(response.data?.message || 'Failed to send email via Temii');
            }

            return response.data;
        } catch (error) {
            await this.createErrorLog(error.message);
            throw error;
        }
    }
}

module.exports = Email;
