const { getGeneralSettings } = require("../../generalSettings");
const Email = require("./subComponents/Email");
const Sms = require("./subComponents/sms/Sms");


class Notify {
    constructor(sendVia = null) {
        this.templateName = '';
        this.shortCodes = {};
        this.sendVia = sendVia;
        this.user = null;
        this.createLog = false;
        this.setting = null;
        this.userColumn = '';
        this.userType = null;
    }

    async send() {
        if (!this.setting) {
            this.setting = await getGeneralSettings();
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

        for (const [methodName, MethodClass] of Object.entries(methods)) {
            const notifyInstance = new MethodClass(this.setting);
            notifyInstance.templateName = this.templateName;
            notifyInstance.shortCodes = this.shortCodes;
            notifyInstance.user = this.user;
            notifyInstance.setting = this.setting;
            notifyInstance.createLog = this.createLog;
            notifyInstance.userColumn = this.userColumn;
            notifyInstance.userType = this.userType;

            await notifyInstance.send();
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