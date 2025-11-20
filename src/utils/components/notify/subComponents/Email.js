const nodemailer = require('nodemailer');
const NotifyProcess = require('./NotifyProcess');

class Email extends NotifyProcess {
    constructor(settings, user = null) {
        super();
        this.settings = settings;
        this.user = user;
        this.statusField = 'emailStatus';
        this.body = 'emailBody';
        this.globalTemplate = 'emailTemplate';
        this.notifyConfig = 'mailConfig';
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

        if (this.settings.emailNotification && message) {
            const mailConfig = typeof this.settings.mailConfig === 'string'
                ? JSON.parse(this.settings.mailConfig)
                : this.settings.mailConfig;

            const methodName = mailConfig.name;
            const method = this.mailMethods(methodName);

            try {
                await this[method]();
                await this.createLogEntry('email');
            } catch (error) {
                await this.createErrorLog(error.message);
            }
        }
    }

    mailMethods(name) {
        const methods = {
            smtp: 'sendSmtpMail',
        };
        return methods[name];
    }

    async sendSmtpMail() {
        const config = typeof this.settings.mailConfig === 'string'
            ? JSON.parse(this.settings.mailConfig)
            : this.settings.mailConfig;

        const general = this.settings;

        const transportConfig = {
            host: config.host,
            port: config.port,
            secure: config.enc === 'ssl',
            auth: {
                user: config.username,
                pass: config.password
            }
        };

        if (config.enc === 'tls') {
            transportConfig.secure = false;
            transportConfig.requireTLS = true;
        }

        try {
            const transporter = nodemailer.createTransport(transportConfig);

            const mailOptions = {
                from: general.emailFrom,
                to: this.email,
                subject: this.subject,
                html: this.finalMessage
            };

            await transporter.sendMail(mailOptions);
        } catch (error) {
            await this.createErrorLog(error.message);
            throw error;
        }
    }
}

module.exports = Email;
