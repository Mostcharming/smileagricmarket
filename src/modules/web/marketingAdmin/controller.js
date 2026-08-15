'use strict';

const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const { sequelize } = require('../../../database');
const defineModels = require('../../../database/models');
const { signToken } = require('../../../middlewares/common/security');

const models = defineModels(sequelize);
const { Admin, BetaSignup } = models;

const MARKETING_ADMIN_ROLE = 'marketing_admin';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function normalizeEmail(email) {
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function normalizeQuery(query) {
    return typeof query === 'string' ? query.trim() : '';
}

function escapeLikePattern(value) {
    return value.replace(/[\\%_]/g, '\\$&');
}

function buildSignupWhere(query) {
    if (!query) {
        return {};
    }

    const pattern = `%${escapeLikePattern(query)}%`;
    const normalizedUserType = query.toLowerCase().replace(/[\s-]+/g, '_');
    const searchableFields = [
        { email: { [Op.iLike]: pattern } },
        { firstName: { [Op.iLike]: pattern } },
        { source: { [Op.iLike]: pattern } }
    ];

    if (['investor', 'farm_owner'].includes(normalizedUserType)) {
        searchableFields.push({ userType: normalizedUserType });
    }

    return {
        [Op.or]: searchableFields
    };
}

function parsePagination(query) {
    const parsedPage = Number.parseInt(query.page, 10);
    const parsedLimit = Number.parseInt(query.limit, 10);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const requestedLimit = Number.isInteger(parsedLimit) && parsedLimit > 0
        ? parsedLimit
        : DEFAULT_PAGE_SIZE;

    return {
        page,
        limit: Math.min(requestedLimit, MAX_PAGE_SIZE)
    };
}

function formatSignup(signup) {
    return {
        id: signup.id,
        email: signup.email,
        firstName: signup.firstName,
        type: signup.userType,
        source: signup.source,
        confirmationEmailSentAt: signup.confirmationEmailSentAt,
        createdAt: signup.createdAt
    };
}

function csvValue(value) {
    if (value === null || value === undefined) {
        return '';
    }

    let normalized = value instanceof Date ? value.toISOString() : String(value);

    // Prevent spreadsheet applications from treating user-controlled values as formulas.
    if (/^[=+\-@]/.test(normalized)) {
        normalized = `'${normalized}`;
    }

    return `"${normalized.replace(/"/g, '""')}"`;
}

function toCsv(signups) {
    const header = [
        'email',
        'first_name',
        'user_type',
        'source',
        'confirmation_email_sent_at',
        'created_at'
    ].join(',');

    const rows = signups.map(signup => [
        signup.email,
        signup.firstName,
        signup.userType,
        signup.source,
        signup.confirmationEmailSentAt,
        signup.createdAt
    ].map(csvValue).join(','));

    return `\uFEFF${[header, ...rows].join('\r\n')}\r\n`;
}

async function login(req, res) {
    try {
        const email = normalizeEmail(req.body?.email);
        const password = req.body?.password;

        if (!email || typeof password !== 'string' || !password) {
            return res.fail('Email and password are required', 400);
        }

        const marketingAdmin = await Admin.findOne({
            where: {
                email,
                role: MARKETING_ADMIN_ROLE
            }
        });

        if (!marketingAdmin) {
            return res.fail('Invalid email or password', 401);
        }

        if (!marketingAdmin.isActive) {
            return res.fail('Your account has been deactivated. Please contact support.', 403);
        }

        const isPasswordValid = await bcrypt.compare(password, marketingAdmin.password);
        if (!isPasswordValid) {
            return res.fail('Invalid email or password', 401);
        }

        await marketingAdmin.update({ lastLoginAt: new Date() });

        const token = signToken({
            marketingAdmin: {
                id: marketingAdmin.id,
                email: marketingAdmin.email,
                role: marketingAdmin.role,
                fullName: marketingAdmin.fullName
            }
        });

        return res.success(
            {
                token,
                marketingAdmin: {
                    id: marketingAdmin.id,
                    fullName: marketingAdmin.fullName,
                    email: marketingAdmin.email,
                    role: marketingAdmin.role,
                    lastLoginAt: marketingAdmin.lastLoginAt
                }
            },
            'Login successful'
        );
    } catch (error) {
        console.error('Marketing admin login error:', error);
        return res.fail('Unable to login right now. Please try again later.', 500);
    }
}

async function listBetaSignups(req, res) {
    try {
        const query = normalizeQuery(req.query?.query ?? req.query?.search);

        if (query.length > 254) {
            return res.fail('Query must not exceed 254 characters', 400);
        }

        const { page, limit } = parsePagination(req.query || {});
        const offset = (page - 1) * limit;
        const { count, rows } = await BetaSignup.findAndCountAll({
            where: buildSignupWhere(query),
            attributes: [
                'id',
                'email',
                'firstName',
                'userType',
                'source',
                'confirmationEmailSentAt',
                'createdAt'
            ],
            order: [['createdAt', 'DESC']],
            limit,
            offset
        });
        const totalPages = count === 0 ? 0 : Math.ceil(count / limit);

        return res.success(
            {
                signups: rows.map(formatSignup),
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalItems: count,
                    limit,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1
                }
            },
            'Beta signups retrieved successfully'
        );
    } catch (error) {
        console.error('List beta signups error:', error);
        return res.fail('Unable to retrieve beta signups right now.', 500);
    }
}

async function downloadBetaSignups(req, res) {
    try {
        const query = normalizeQuery(req.query?.query ?? req.query?.search);

        if (query.length > 254) {
            return res.fail('Query must not exceed 254 characters', 400);
        }

        const signups = await BetaSignup.findAll({
            where: buildSignupWhere(query),
            attributes: [
                'email',
                'firstName',
                'userType',
                'source',
                'confirmationEmailSentAt',
                'createdAt'
            ],
            order: [['createdAt', 'DESC']]
        });
        const date = new Date().toISOString().slice(0, 10);

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="beta-signups-${date}.csv"`
        );
        res.setHeader('Cache-Control', 'no-store');

        return res.status(200).send(toCsv(signups));
    } catch (error) {
        console.error('Download beta signups error:', error);
        return res.fail('Unable to download beta signups right now.', 500);
    }
}

module.exports = {
    downloadBetaSignups,
    listBetaSignups,
    login
};
