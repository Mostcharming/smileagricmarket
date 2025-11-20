const { Op } = require('sequelize');

const ALLOWED_ACCOUNT_TYPES = ['admin', 'enrollee', 'provider', 'corporate'];

async function createUnit(req, res, next) {
    try {
        const { Unit } = req.models;
        const { name, accountType } = req.body || {};

        if (!name) return res.fail('`name` is required', 400);
        if (!accountType) return res.fail('`accountType` is required', 400);
        if (!ALLOWED_ACCOUNT_TYPES.includes(accountType)) return res.fail('Invalid `accountType`', 400);

        const unit = await Unit.create({ name, accountType });

        return res.success({ unit: unit.toJSON() }, 'Unit created', 201);
    } catch (err) {
        return next(err);
    }
}

async function updateUnit(req, res, next) {
    try {
        const { Unit } = req.models;
        const { id } = req.params;
        const { name, accountType } = req.body || {};

        const unit = await Unit.findByPk(id);
        if (!unit) return res.fail('Unit not found', 404);

        const updates = {};
        if (name !== undefined) updates.name = name;
        if (accountType !== undefined) {
            if (!ALLOWED_ACCOUNT_TYPES.includes(accountType)) return res.fail('Invalid `accountType`', 400);
            updates.accountType = accountType;
        }

        await unit.update(updates);

        return res.success({ unit }, 'Unit updated');
    } catch (err) {
        return next(err);
    }
}

async function deleteUnit(req, res, next) {
    try {
        const { Unit, UserUnit } = req.models;
        const { id } = req.params;

        const unit = await Unit.findByPk(id);
        if (!unit) return res.fail('Unit not found', 404);

        const attachedCount = await UserUnit.count({ where: { unitId: id } });
        if (attachedCount > 0) {
            return res.fail('Unit is attached to a user and cannot be deleted', 400);
        }

        await unit.destroy();

        return res.success(null, 'Unit deleted');
    } catch (err) {
        return next(err);
    }
}

async function listUnits(req, res, next) {
    try {
        const { Unit } = req.models;
        const { limit = 10, page = 1, q } = req.query;

        const isAll = String(limit).toLowerCase() === 'all';
        const limitNum = isAll ? 0 : Number(limit);
        const pageNum = isAll ? 1 : (Number(page) || 1);
        const offset = isAll ? 0 : (pageNum - 1) * limitNum;

        const where = {};
        if (q) {
            where.name = { [Op.iLike || Op.like]: `%${q}%` };
        }

        const total = await Unit.count({ where });

        const findOptions = {
            where,
            order: [['created_at', 'DESC']]
        };

        if (!isAll) {
            findOptions.limit = limitNum;
            findOptions.offset = Number(offset);
        }

        const units = await Unit.findAll(findOptions);
        const data = units.map(u => u.toJSON());

        const hasPrevPage = !isAll && pageNum > 1;
        const hasNextPage = !isAll && (offset + units.length < total);
        const totalPages = isAll ? 1 : (limitNum > 0 ? Math.ceil(total / limitNum) : 1);

        return res.success({ list: data, count: total, page: pageNum, limit: isAll ? 'all' : limitNum, totalPages, hasNextPage, hasPrevPage });
    } catch (err) {
        return next(err);
    }
}

async function getUnit(req, res, next) {
    try {
        const { Unit } = req.models;
        const { id } = req.params;

        const unit = await Unit.findByPk(id);
        if (!unit) return res.fail('Unit not found', 404);

        return res.success(unit.toJSON());
    } catch (err) {
        return next(err);
    }
}

module.exports = {
    createUnit,
    updateUnit,
    deleteUnit,
    listUnits,
    getUnit
};
