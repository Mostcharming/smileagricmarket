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
    }

    async getMessage() {
        if (this.prevConfiguration) {
            this.prevConfiguration();
        }

        if (!this.templateName) {
            throw new Error('Template name is not set');
        }

        try {
            // Verify templateLoader is available and has getTemplate method
            if (!templateLoader || typeof templateLoader.getTemplate !== 'function') {
                throw new Error('Template loader is not properly initialized or getTemplate method is not available');
            }

            const template = templateLoader.getTemplate(this.templateName);

            if (!template) {
                throw new Error(`Template not found: ${this.templateName}`);
            }

            this.template = template;

            let message = template[this.body] || '';

            if (this.shortCodes) {
                for (const [code, value] of Object.entries(this.shortCodes)) {
                    // Replace both {{code}} and {code}
                    message = message.replace(new RegExp(`{{${code}}}`, 'g'), String(value));
                    message = message.replace(new RegExp(`{${code}}`, 'g'), String(value));
                }
            }

            // Replace firstName if available
            if (this.user && this.user.firstName) {
                message = message.replace(/{{firstName}}/g, this.user.firstName);
                message = message.replace(/{firstName}/g, this.user.firstName);
            }

            this.getSubject();
            this.finalMessage = message;
            return message;
        } catch (error) {
            throw new Error(`Failed to get message: ${error.message}`);
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
}

module.exports = NotifyProcess;