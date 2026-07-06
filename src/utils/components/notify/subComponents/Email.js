const axios = require('axios');
const FormData = require('form-data');
const Mailgun = require('mailgun.js');
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
        this.receiverName = this.user.fullName || this.user.firstName;
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
            mailgun: 'sendMailgunEmail',
        };
        return methods[name] || 'sendTemiiEmail';
    }

    getPlainTextFromHtml(html) {
        return String(html || '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async sendMailgunEmail(emailConfig, message) {
        if (!this.email) {
            throw new Error('Recipient email is required');
        }

        if (!emailConfig.apiKey || !emailConfig.domain || !emailConfig.fromEmail) {
            throw new Error('Mailgun apiKey, domain, and fromEmail are required');
        }

        const mailgun = new Mailgun(FormData);
        const clientOptions = {
            username: emailConfig.username || 'api',
            key: emailConfig.apiKey
        };

        if (emailConfig.url) {
            clientOptions.url = emailConfig.url;
        }

        const mg = mailgun.client(clientOptions);
        const recipient = this.receiverName
            ? `${this.receiverName} <${this.email}>`
            : this.email;

        return mg.messages.create(emailConfig.domain, {
            from: `${emailConfig.fromName || 'Smile Agrimarket'} <${emailConfig.fromEmail}>`,
            to: [recipient],
            subject: this.subject || emailConfig.defaultSubject || 'Smile Agrimarket',
            text: this.getPlainTextFromHtml(message),
            html: message
        });
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
