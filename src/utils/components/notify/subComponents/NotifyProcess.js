const templateLoader = require("../../../notificationTemplateLoader");

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
        this.NotificationLog = null; // Will be set by subclasses or callers
    }

    async getMessage() {
        if (this.prevConfiguration) {
            this.prevConfiguration();
        }

        if (!this.templateName) {
            console.error('Template name is not set');
            return false;
        }

        try {
            // Verify templateLoader is available and has getTemplate method
            if (!templateLoader || typeof templateLoader.getTemplate !== 'function') {
                console.error('Template loader is not properly initialized or getTemplate method is not available');
                return false;
            }

            const template = templateLoader.getTemplate(this.templateName);

            if (!template) {
                console.error(`Template not found: ${this.templateName}`);
                return false;
            }

            this.template = template;

            let message = template[this.body] || '';

            if (this.shortCodes) {
                for (const [code, value] of Object.entries(this.shortCodes)) {
                    message = message.replace(new RegExp(`{{${code}}}`, 'g'), String(value));
                }
            }

            // Replace firstName if available
            if (this.user && this.user.firstName) {
                message = message.replace(/{{firstName}}/g, this.user.firstName);
            }

            this.getSubject();
            this.finalMessage = message;
            return message;
        } catch (error) {
            console.error('Error in getMessage:', error.message);
            return false;
        }
    }

    getSubject() {
        if (this.template) {
            let subject = this.template.emailSubject || '';
            if (this.shortCodes) {
                for (const [code, value] of Object.entries(this.shortCodes)) {
                    subject = subject.replace(new RegExp(`{{${code}}}`, 'g'), String(value));
                }
            }
            if (this.user && this.user.firstName) {
                subject = subject.replace(/{{firstName}}/g, this.user.firstName);
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
        if (this.user && this.createLog && this.NotificationLog) {
            const config = this.config[notificationType] || {};

            await this.NotificationLog.create({
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