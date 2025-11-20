const Notify = require("./components/notify/Notify");

async function notify(user, userType, templateName, shortCodes = null, sendVia = null, createLog = true) {


    const notifyInstance = new Notify(sendVia);
    notifyInstance.templateName = templateName;
    notifyInstance.shortCodes = shortCodes;
    notifyInstance.user = user;
    notifyInstance.userType = userType;
    notifyInstance.createLog = createLog;
    notifyInstance.userColumn = user.id;

    await notifyInstance.send();
}

module.exports = notify;