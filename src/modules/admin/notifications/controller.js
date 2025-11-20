const { Op } = require('sequelize');

async function listNotifications(req, res, next) {
    try {
        const { AdminNotification } = req.models;
        const { userId, limit = 50, page = 1, isRead } = req.query;

        const where = {};
        if (userId) where.userId = userId;
        if (typeof isRead !== 'undefined') {
            // accept ?isRead=true or ?isRead=1
            where.isRead = isRead === '1' || String(isRead).toLowerCase() === 'true';
        }

        const offset = (Number(page) - 1) * Number(limit);

        const notifications = await AdminNotification.findAll({
            where,
            order: [['created_at', 'DESC']],
            limit: Number(limit),
            offset: Number(offset)
        });

        return res.success(notifications);
    } catch (err) {
        return next(err);
    }
}

async function updateNotificationStatus(req, res, next) {
    try {
        const { AdminNotification } = req.models;
        const { id, ids, isRead } = req.body;

        if (!id && !ids) {
            return res.fail('`id` or `ids` is required in request body', 400);
        }

        const readValue = typeof isRead === 'undefined' ? true : !!isRead;

        const where = {};
        if (ids && Array.isArray(ids) && ids.length) {
            where.id = { [Op.in]: ids };
        } else if (id) {
            where.id = id;
        }

        const result = await AdminNotification.update({ isRead: readValue }, { where });
        const affected = Array.isArray(result) ? result[0] : result;

        const updated = await AdminNotification.findAll({ where });

        return res.success({ updatedCount: affected, updated }, `${affected} notification(s) updated`);
    } catch (err) {
        return next(err);
    }
}

module.exports = {
    listNotifications,
    updateNotificationStatus
};
