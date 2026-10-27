'use strict';

const { randomInt } = require('node:crypto');

function createProjectReference() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let reference;
    do {
        reference = Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join('');
    } while (!/[A-Z]/.test(reference) || !/\d/.test(reference));
    return reference;
}

function projectWalletName(farmName, projectId, suffixLength = 6) {
    const name = String(farmName || '').replace(/\s+/gu, '');
    const uuid = String(projectId).replace(/-/g, '').toLowerCase();
    if (!name || !/^[a-f0-9]{32}$/.test(uuid)) throw new Error('A farm name and investment project UUID are required');
    return `${name.slice(0, 220)}-${uuid.slice(0, suffixLength)}`;
}

module.exports = { createProjectReference, projectWalletName };
