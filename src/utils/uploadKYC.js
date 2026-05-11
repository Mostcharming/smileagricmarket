'use strict';

const fs = require('fs');
const path = require('path');

const multer = (() => {
    try {
        return require('multer');
    } catch (e) {
        return null;
    }
})();

function ensureMulterAvailable() {
    if (!multer) throw new Error('Missing dependency: multer. Run `npm install multer`');
}

const config = require('../config');

const uploadDir = (config && config.uploads && config.uploads.kycDir)
    ? config.uploads.kycDir
    : path.resolve(__dirname, '..', '..', 'uploads', 'kyc');

try {
    fs.mkdirSync(uploadDir, { recursive: true });
} catch (e) {
}

const storage = multer ? multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname) || '';
        const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        cb(null, name);
    }
}) : null;

function fileFilter(req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only JPEG/PNG/GIF/WEBP images are allowed'));
}

const upload = multer ? multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }
}) : null;

function uploadKYC(req, res, next) {
    ensureMulterAvailable();

    return upload.fields([
        { name: 'idDocument', maxCount: 1 },
        { name: 'selfie', maxCount: 1 }
    ])(req, res, function (err) {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') return res.fail('File too large (max 10MB)', 400);
            return res.fail(err.message || 'File upload error', 400);
        }

        req.kycFiles = {};

        if (req.files && req.files.idDocument && req.files.idDocument[0]) {
            req.kycFiles.idDocument = {
                filename: req.files.idDocument[0].filename,
                path: req.files.idDocument[0].path,
                url: `/upload/kyc/${req.files.idDocument[0].filename}`,
                mimeType: req.files.idDocument[0].mimetype
            };
        }

        if (req.files && req.files.selfie && req.files.selfie[0]) {
            req.kycFiles.selfie = {
                filename: req.files.selfie[0].filename,
                path: req.files.selfie[0].path,
                url: `/upload/kyc/${req.files.selfie[0].filename}`,
                mimeType: req.files.selfie[0].mimetype
            };
        }

        return next();
    });
}

module.exports = uploadKYC;
