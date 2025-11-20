const NotifyProcess = require('../NotifyProcess');
const SmsGateway = require('./SmsGateway');

class Sms extends NotifyProcess {
    constructor(settings) {
        super();
        this.mobile = null;
        this.statusField = 'smsStatus';
        this.body = 'smsBody';
        this.globalTemplate = 'smsBody';
        this.notifyConfig = 'smsConfig';
        this.setting = settings;
    }

    async send() {
        const message = await this.getMessage();

        if (this.setting.smsNotification && message) {
            try {
                const fixedJson = this.setting.smsConfig.replace(/\\\//g, '/');
                const smsConfig = JSON.parse(fixedJson);

                const gateway = smsConfig.name;

                if (this.mobile) {
                    const sendSms = new SmsGateway(
                        smsConfig,
                        this.stripTags(message),
                        this.mobile,
                        this.setting.smsFrom
                    );

                    sendSms.to = this.mobile;
                    sendSms.sender = this.setting.smsFrom;
                    sendSms.message = this.stripTags(message);
                    sendSms.config = smsConfig;

                    await sendSms[gateway]();

                    await this.createLogEntry('sms');
                }
            } catch (error) {
                await this.createErrorLog(`SMS Error: ${error.message}`);
                console.error(`API Error: ${error.message}`);
            }
        }
    }

    prevConfiguration() {
        if (this.user) {
            this.mobile = this.user.phoneNumber;
            this.receiverName = this.user.firstName;
            this.toAddress = this.mobile;
        }
    }

    stripTags(text) {
        return text.replace(/<[^>]*>/g, '');
    }
}

module.exports = Sms;
