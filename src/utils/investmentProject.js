'use strict';

const INVESTMENT_PROJECT_STATUSES = [
    'not_started',
    'funding_started',
    'active',
    'completed'
];

function formatDateOnly(date) {
    return date.toISOString().slice(0, 10);
}

function toUtcDate(dateValue) {
    const dateOnly = dateValue instanceof Date
        ? formatDateOnly(dateValue)
        : String(dateValue || '').slice(0, 10);
    const match = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
        throw new Error('startDate must be a valid date');
    }

    const date = new Date(Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3])
    ));

    if (formatDateOnly(date) !== dateOnly) {
        throw new Error('startDate must be a valid date');
    }

    return date;
}

function addCalendarMonths(date, months) {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    const lastDayOfTargetMonth = new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        0
    )).getUTCDate();
    date.setUTCDate(Math.min(day, lastDayOfTargetMonth));
}

function calculateInvestmentProjectEndDate(startDate, durationValue, durationUnit) {
    const parsedDuration = Number(durationValue);
    if (!Number.isInteger(parsedDuration) || parsedDuration <= 0) {
        throw new Error('Investment template duration must be a positive integer');
    }

    const endDate = toUtcDate(startDate);
    if (durationUnit === 'weeks') {
        endDate.setUTCDate(endDate.getUTCDate() + (parsedDuration * 7));
    } else if (durationUnit === 'months') {
        addCalendarMonths(endDate, parsedDuration);
    } else if (durationUnit === 'years') {
        addCalendarMonths(endDate, parsedDuration * 12);
    } else {
        throw new Error('Investment template duration unit must be weeks, months, or years');
    }

    return formatDateOnly(endDate);
}

function resolveInvestmentProjectStatus(project, today = new Date()) {
    const rawStatus = project?.investmentStatus;
    const fundingReceived = Number(project?.investmentReceived || 0);
    const expectedInvestment = Number(project?.expectedInvestment || 0);
    const todayDate = formatDateOnly(today);
    const endDate = project?.endDate instanceof Date
        ? formatDateOnly(project.endDate)
        : String(project?.endDate || '').slice(0, 10);

    if (rawStatus === 'completed' || (endDate && todayDate >= endDate)) {
        return 'completed';
    }
    if (rawStatus === 'active' || (expectedInvestment > 0 && fundingReceived >= expectedInvestment)) {
        return 'active';
    }
    if (rawStatus === 'funding_started' || fundingReceived > 0) {
        return 'funding_started';
    }
    return 'not_started';
}

module.exports = {
    INVESTMENT_PROJECT_STATUSES,
    calculateInvestmentProjectEndDate,
    resolveInvestmentProjectStatus
};
