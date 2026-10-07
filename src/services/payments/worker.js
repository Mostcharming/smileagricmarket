'use strict';

const { requireEnabled } = require('../../utils/paypetal');
const { getPaymentService } = require('./service');

function startPaymentWorker({ service = getPaymentService(), intervalMs = 10000, logger = console } = {}) {
    requireEnabled();
    let running = false;
    let stopped = false;
    async function tick() {
        if (running || stopped) return;
        running = true;
        try {
            for (let count = 0; count < 20 && !stopped; count++) {
                if (!await service.runNextJob()) break;
            }
        } catch (_) { logger.error('Payment worker storage unavailable; check migration and database connectivity'); }
        finally { running = false; }
    }
    const timer = setInterval(tick, intervalMs);
    timer.unref();
    tick();
    return { stop: () => { stopped = true; clearInterval(timer); }, tick };
}

module.exports = { startPaymentWorker };
