const NotificationLog = require("../../../../database/models/NotificationLog");
const NotificationTemplate = require("../../../../database/models/NotificationTemplate");


// const { AdminNotification, NotificationLog, NotificationTemplate } = models;

class NotifyProcess {
    constructor() {
        this.templateName = null;
        this.shortCodes = {};
        this.user = null;
        this.config = null;
        this.statusField = null;
        this.globalTemplate = null;
        this.body = null;
        this.template = null;
        this.message = null;
        this.createLog = false;
        this.notifyConfig = null;
        this.subject = null;
        this.receiverName = null;
        this.userColumn = null;
        this.toAddress = null;
        this.finalMessage = null;
    }

    async getMessage() {
        if (this.prevConfiguration) {
            this.prevConfiguration();
        }

        const body = this.body;
        const user = this.user;
        const globalTemplate = this.globalTemplate;

        const template = await NotificationTemplate.findOne({
            where: { act: this.templateName }
        });
        this.template = template;

        let message;

        if (user && template) {
            const statusField = this.statusField;
            const statusValue = template ? template[statusField] : undefined;
            const enabled = (
                statusValue === true ||
                statusValue === 1 ||
                statusValue === '1' ||
                (typeof statusValue === 'string' && statusValue.toLowerCase() === 'true')
            );
            if (!enabled) {
                return false;
            }
            message = this.replaceShortCode(
                user.firstName,
                '',
                template[this.body]
            );
            if (!message) {
                message = template[this.body];
            }
        } else {
            this.toAddress = user.email;
            message = this.replaceShortCode(
                this.receiverName,
                this.toAddress,
                '',
                this.message
            );
        }

        if (this.shortCodes) {
            for (const [code, value] of Object.entries(this.shortCodes)) {
                message = message.replace(new RegExp(`{{${code}}}`, 'g'), String(value));
            }
        }

        if (!this.template && this.templateName) {
            return false;
        }

        this.getSubject();
        this.finalMessage = message;
        return message;
    }

    replaceShortCode(name, template, body) {
        let message = template.replace(/{{firstName}}/g, name);
        message = message.replace(/{{message}}/g, body);
        return message;
    }

    getSubject() {
        if (this.template) {
            let subject = this.template.subj;
            if (this.shortCodes) {
                for (const [code, value] of Object.entries(this.shortCodes)) {
                    subject = subject.replace(new RegExp(`{{${code}}}`, 'g'), String(value));
                }
            }
            this.subject = subject;
        }
    }

    async createErrorLog(message) {
        // await AdminNotification.create({
        //     title: message,
        //     clickUrl: '#'
        // });
    }

    async createLogEntry(notificationType) {
        if (this.user && this.createLog) {
            const config = this.config[notificationType] || {};

            await NotificationLog.create({
                notificationType: notificationType,
                sender: config.provider || 'temii',
                sentFrom: config.fromEmail || config.senderId || '',
                sentTo: this[notificationType === 'email' ? 'email' : 'mobile'] || null,
                subject: this.subject,
                userId: this.user.id,
                userType: this.userType,
                message: notificationType === 'email'
                    ? this.finalMessage
                    : this.finalMessage.trim()
            });
        }
    }
}

module.exports = NotifyProcess;