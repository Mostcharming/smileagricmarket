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

const uploadDir = (config && config.uploads && config.uploads.profileDir)
    ? config.uploads.profileDir
    : path.resolve(__dirname, '..', '..', 'uploads', 'profiles');

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
    limits: { fileSize: 5 * 1024 * 1024 }
}) : null;

function uploadProfileImage(fieldName = 'picture') {
    ensureMulterAvailable();

    return function (req, res, next) {
        const handler = upload.single(fieldName);
        handler(req, res, function (err) {
            if (err) {
                if (err.code === 'LIMIT_FILE_SIZE') return res.fail('File too large (max 5MB)', 400);
                return res.fail(err.message || 'File upload error', 400);
            }

            if (req.file) {
                req.profileImage = {
                    filename: req.file.filename,
                    path: req.file.path,
                    url: `/upload/${req.file.filename}`
                };
            }

            return next();
        });
    };
}

module.exports = uploadProfileImage;
