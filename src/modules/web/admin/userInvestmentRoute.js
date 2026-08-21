'use strict';

const express = require('express');
const { verifyToken } = require('../../../middlewares/common/security');
const {
    listUserInvestments,
    listUserInvestmentMilestones,
    downloadUserInvestmentMilestones,
    getUserInvestmentMilestone,
    updateMilestoneChecklist,
    reviewUserInvestmentMilestone
} = require('./userInvestmentController');

const router = express.Router();

function verifyAdminToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization
            || req.headers['x-access-token']
            || req.query.token;
        if (!authHeader) return res.fail('Authentication token required', 401);

        const token = typeof authHeader === 'string'
            && authHeader.toLowerCase().startsWith('bearer ')
            ? authHeader.slice(7).trim()
            : authHeader;
        let payload;
        try {
            payload = verifyToken(token);
        } catch (error) {
            return res.fail('Invalid or expired token', 401);
        }
        if (!payload.user?.admin) {
            return res.fail('Admin authentication required', 403);
        }
        req.admin = payload.user.admin;
        return next();
    } catch (error) {
        return res.fail(error.message, 500);
    }
}

/**
 * @swagger
 * /web/admin/user-investments:
 *   get:
 *     tags: [Web Admin User Investments]
 *     summary: List user-created investment projects
 *     description: Returns paginated projects with user, farm, template, funding, maturity, and lifecycle data.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 100 } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: status, schema: { type: string, enum: [not_started, funding_started, active, completed] } }
 *       - { in: query, name: investmentId, schema: { type: string, format: uuid } }
 *       - { in: query, name: farmCategoryId, schema: { type: string, format: uuid } }
 *       - { in: query, name: farmId, schema: { type: string, format: uuid } }
 *       - { in: query, name: userId, schema: { type: string, format: uuid } }
 *       - { in: query, name: maturityFrom, schema: { type: string, format: date } }
 *       - { in: query, name: maturityTo, schema: { type: string, format: date } }
 *       - { in: query, name: minAmount, schema: { type: number } }
 *       - { in: query, name: maxAmount, schema: { type: number } }
 *       - { in: query, name: sortBy, schema: { type: string } }
 *       - { in: query, name: sortOrder, schema: { type: string, enum: [ASC, DESC] } }
 *     responses:
 *       200: { description: User-created investments retrieved successfully }
 *       400: { description: Invalid filter or pagination value }
 *       401: { description: Admin authentication required }
 */
router.get('/user-investments', verifyAdminToken, listUserInvestments);

/**
 * @swagger
 * /web/admin/user-investment-milestones:
 *   get:
 *     tags: [Web Admin User Investments]
 *     summary: List milestone funding requests with summary metrics
 *     description: The response includes paginated milestone rows and yearly trends for pending requests, disbursed funds, and escrow.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 100 } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: reviewStatus, schema: { type: string, enum: [pending, approved, rejected, more_evidence_required] } }
 *       - { in: query, name: fundingStatus, schema: { type: string, enum: [request_for_funding, processing_funding, completed] } }
 *       - { in: query, name: investmentStatus, schema: { type: string, enum: [not_started, funding_started, active, completed] } }
 *       - { in: query, name: checklistStatus, schema: { type: string, enum: [verified, needs_clarification, rejected] } }
 *       - { in: query, name: investmentId, schema: { type: string, format: uuid } }
 *       - { in: query, name: investmentProjectId, schema: { type: string, format: uuid } }
 *       - { in: query, name: milestoneId, schema: { type: string, format: uuid } }
 *       - { in: query, name: farmCategoryId, schema: { type: string, format: uuid } }
 *       - { in: query, name: farmId, schema: { type: string, format: uuid } }
 *       - { in: query, name: userId, schema: { type: string, format: uuid } }
 *       - { in: query, name: dateFrom, schema: { type: string, format: date } }
 *       - { in: query, name: dateTo, schema: { type: string, format: date } }
 *       - { in: query, name: minAmountRequested, schema: { type: number } }
 *       - { in: query, name: maxAmountRequested, schema: { type: number } }
 *       - { in: query, name: sortBy, schema: { type: string } }
 *       - { in: query, name: sortOrder, schema: { type: string, enum: [ASC, DESC] } }
 *     responses:
 *       200: { description: Milestones and summary retrieved successfully }
 *       400: { description: Invalid filter or pagination value }
 *       401: { description: Admin authentication required }
 */
router.get(
    '/user-investment-milestones',
    verifyAdminToken,
    listUserInvestmentMilestones
);

/**
 * @swagger
 * /web/admin/user-investment-milestones/download:
 *   get:
 *     tags: [Web Admin User Investments]
 *     summary: Download filtered milestone funding requests as CSV
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: UTF-8 CSV export
 *         content: { text/csv: {} }
 *       401: { description: Admin authentication required }
 */
router.get(
    '/user-investment-milestones/download',
    verifyAdminToken,
    downloadUserInvestmentMilestones
);

/**
 * @swagger
 * /web/admin/user-investment-milestones/{milestoneId}:
 *   get:
 *     tags: [Web Admin User Investments]
 *     summary: Get a milestone review workspace
 *     description: Includes the user, farm, documents, investment, evidence, checklist, other project milestones, current reviewer, and audit trail.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Milestone review workspace retrieved successfully }
 *       404: { description: Milestone not found }
 */
router.get(
    '/user-investment-milestones/:milestoneId',
    verifyAdminToken,
    getUserInvestmentMilestone
);

/**
 * @swagger
 * /web/admin/user-investment-milestones/{milestoneId}/checklist:
 *   put:
 *     tags: [Web Admin User Investments]
 *     summary: Add or update milestone verification checklist items
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [checklist]
 *             properties:
 *               checklist:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [name, status]
 *                   properties:
 *                     name: { type: string }
 *                     status: { type: string, enum: [verified, needs_clarification, rejected] }
 *                     notes: { type: string, nullable: true }
 *               internalNotes: { type: string, nullable: true }
 *     responses:
 *       200: { description: Checklist updated and audited }
 *       409: { description: Approved milestones are immutable }
 */
router.put(
    '/user-investment-milestones/:milestoneId/checklist',
    verifyAdminToken,
    updateMilestoneChecklist
);

/**
 * @swagger
 * /web/admin/user-investment-milestones/{milestoneId}/review:
 *   post:
 *     tags: [Web Admin User Investments]
 *     summary: Approve, reject, or request more milestone evidence
 *     description: Approval marks the requested amount as released/completed. Approval requires evidence and a fully verified checklist. Every action is audited.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action: { type: string, enum: [approve, reject, request_more_evidence] }
 *               internalNotes: { type: string, nullable: true }
 *               checklist:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [name, status]
 *                   properties:
 *                     name: { type: string }
 *                     status: { type: string, enum: [verified, needs_clarification, rejected] }
 *                     notes: { type: string, nullable: true }
 *     responses:
 *       200: { description: Review action completed and audited }
 *       400: { description: Invalid review input }
 *       409: { description: Evidence or checklist requirement was not met }
 */
router.post(
    '/user-investment-milestones/:milestoneId/review',
    verifyAdminToken,
    reviewUserInvestmentMilestone
);

module.exports = router;
