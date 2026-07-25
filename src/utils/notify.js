const Notify = require("./components/notify/Notify");

async function notify(user, userType, templateName, shortCodes = null, sendVia = null, createLog = true, models = null) {
    if (String(process.env.NOTIFICATIONS_ENABLED).toLowerCase() === 'false') {
        return { sent: false, reason: 'notifications_disabled' };
    }

    const notifyInstance = new Notify(sendVia, models);
    notifyInstance.templateName = templateName;
    notifyInstance.shortCodes = shortCodes;
    notifyInstance.user = user;
    notifyInstance.userType = userType;
    notifyInstance.createLog = createLog;
    notifyInstance.userColumn = user.id;

    await notifyInstance.send();
    return { sent: true };
}

module.exports = notify;
