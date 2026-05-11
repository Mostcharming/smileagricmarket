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

const uploadDir = (config && config.uploads && config.uploads.farmDocumentsDir)
    ? config.uploads.farmDocumentsDir
    : path.resolve(__dirname, '..', '..', 'uploads', 'farm-documents');

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

function fileFilterPictures(req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid picture type. Only JPEG/PNG/WEBP images are allowed'));
}

function fileFilterDocuments(req, file, cb) {
    const allowed = ['application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid document type. Only PDF files are allowed'));
}

const upload = multer ? multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
}) : null;

function uploadFarmDocuments(req, res, next) {
    ensureMulterAvailable();

    return upload.fields([
        { name: 'pictures', maxCount: 10 },
        { name: 'documents', maxCount: 10 }
    ])(req, res, function (err) {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') return res.fail('File too large (max 50MB)', 400);
            return res.fail(err.message || 'File upload error', 400);
        }

        req.farmFiles = {
            pictures: [],
            documents: []
        };

        // Process pictures
        if (req.files && req.files.pictures && Array.isArray(req.files.pictures)) {
            req.files.pictures.forEach(file => {
                if (!fileFilterPictures(null, file, (err, success) => success)) {
                    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
                    if (!allowed.includes(file.mimetype)) {
                        throw new Error('Invalid picture type');
                    }
                }
                req.farmFiles.pictures.push({
                    filename: file.filename,
                    path: file.path,
                    url: `/upload/farm-documents/${file.filename}`,
                    mimeType: file.mimetype,
                    size: file.size,
                    originalName: file.originalname
                });
            });
        }

        // Process documents
        if (req.files && req.files.documents && Array.isArray(req.files.documents)) {
            req.files.documents.forEach(file => {
                if (file.mimetype !== 'application/pdf') {
                    throw new Error('Invalid document type. Only PDF is allowed');
                }
                req.farmFiles.documents.push({
                    filename: file.filename,
                    path: file.path,
                    url: `/upload/farm-documents/${file.filename}`,
                    mimeType: file.mimetype,
                    size: file.size,
                    originalName: file.originalname
                });
            });
        }

        return next();
    });
}

module.exports = uploadFarmDocuments;
