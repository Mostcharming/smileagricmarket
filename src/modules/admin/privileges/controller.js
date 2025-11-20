const { Op } = require('sequelize');

async function listPrivileges(req, res, next) {
    try {
        const { Privilege } = req.models;
        const { q } = req.query;

        const where = {};
        if (q) {
            // postgres iLike for case-insensitive search; fallback to like if not supported
            where.name = { [Op.iLike || Op.like]: `%${q}%` };
        }

        const privileges = await Privilege.findAll({ where, order: [['created_at', 'DESC']] });

        const data = (privileges || []).map(p => p.toJSON());

        return res.success({ list: data, count: data.length });
    } catch (err) {
        return next(err);
    }
}

module.exports = {
    listPrivileges
};
