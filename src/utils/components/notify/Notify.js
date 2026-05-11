const { getTemiiConfig } = require("../../temii-config-loader");
const Email = require("./subComponents/Email");
const Sms = require("./subComponents/sms/Sms");

class Notify {
    constructor(sendVia = null, models = null) {
        this.templateName = '';
        this.shortCodes = {};
        this.sendVia = sendVia;
        this.user = null;
        this.createLog = false;
        this.config = null;
        this.userColumn = '';
        this.userType = null;
        this.models = models;
    }

    async send() {
        if (!this.config) {
            this.config = getTemiiConfig();
        }

        let methods = {};

        if (this.sendVia) {
            for (const method of this.sendVia) {
                const MethodClass = this.notifyMethods(method);
                if (MethodClass) {
                    methods[method] = MethodClass;
                }
            }
        } else {
            methods = this.notifyMethods();
        }

        const errors = [];

        for (const [methodName, MethodClass] of Object.entries(methods)) {
            const notifyInstance = new MethodClass(this.config);
            notifyInstance.templateName = this.templateName;
            notifyInstance.shortCodes = this.shortCodes;
            notifyInstance.user = this.user;
            notifyInstance.config = this.config;
            notifyInstance.createLog = this.createLog;
            notifyInstance.userColumn = this.userColumn;
            notifyInstance.userType = this.userType;

            try {
                await notifyInstance.send();
            } catch (error) {
                errors.push({
                    method: methodName,
                    error: error.message
                });
            }
        }

        if (errors.length > 0) {
            const errorMessage = errors.map(e => `${e.method}: ${e.error}`).join('; ');
            throw new Error(`Notification failed - ${errorMessage}`);
        }
    }

    notifyMethods(sendVia = null) {
        const methods = {
            email: Email,
            sms: Sms,
        };

        if (sendVia) {
            return methods[sendVia];
        }

        return methods;
    }
}

module.exports = Notify;