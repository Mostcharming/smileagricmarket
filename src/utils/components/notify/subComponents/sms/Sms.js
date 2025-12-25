const NotifyProcess = require('../NotifyProcess');
const SmsGateway = require('./SmsGateway');

class Sms extends NotifyProcess {
    constructor(config) {
        super();
        this.mobile = null;
        this.statusField = 'smsStatus';
        this.body = 'smsBody';
        this.globalTemplate = 'smsBody';
        this.notifyConfig = 'sms';
        this.config = config;

        if (this.user) {
            this.prevConfiguration();
        }
    }

    async send() {
        const message = await this.getMessage();

        if (message) {
            try {
                const smsConfig = this.config.sms;
                const gateway = smsConfig.provider || 'temii';

                if (this.mobile) {
                    const sendSms = new SmsGateway(
                        smsConfig,
                        this.stripTags(message),
                        this.mobile,
                        smsConfig.senderId
                    );

                    sendSms.to = this.mobile;
                    sendSms.sender = smsConfig.senderId;
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
