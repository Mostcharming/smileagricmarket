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

const PICTURE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DOCUMENT_MIME_TYPES = ['application/pdf'];

function fileFilter(req, file, cb) {
    if (
        ['photos', 'pictures'].includes(file.fieldname)
        && PICTURE_MIME_TYPES.includes(file.mimetype)
    ) {
        return cb(null, true);
    }

    if (
        file.fieldname === 'documents'
        && DOCUMENT_MIME_TYPES.includes(file.mimetype)
    ) {
        return cb(null, true);
    }

    if (['photos', 'pictures'].includes(file.fieldname)) {
        return cb(new Error('Invalid photo type. Only JPEG/PNG/WEBP images are allowed'));
    }

    if (file.fieldname === 'documents') {
        return cb(new Error('Invalid document type. Only PDF files are allowed'));
    }

    return cb(new Error(`Unexpected file field: ${file.fieldname}`));
}

const upload = multer ? multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024,
        files: 20
    }
}) : null;

function removeUploadedFiles(req) {
    if (!req.files) return;

    Object.values(req.files)
        .flat()
        .forEach(file => {
            try {
                if (file?.path && fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            } catch (error) {
                console.error('Failed to remove rejected farm upload:', error);
            }
        });
}

function uploadFarmDocuments(req, res, next) {
    ensureMulterAvailable();

    return upload.fields([
        { name: 'photos', maxCount: 10 },
        { name: 'pictures', maxCount: 10 },
        { name: 'documents', maxCount: 10 }
    ])(req, res, function (err) {
        if (err) {
            removeUploadedFiles(req);
            if (err.code === 'LIMIT_FILE_SIZE') return res.fail('File too large (max 50MB)', 400);
            if (err.code === 'LIMIT_FILE_COUNT') return res.fail('Too many files (max 20)', 400);
            return res.fail(err.message || 'File upload error', 400);
        }

        req.farmFiles = {
            pictures: [],
            documents: []
        };

        // "photos" is the new UX field; "pictures" remains accepted for compatibility.
        const uploadedPictures = [
            ...(req.files?.photos || []),
            ...(req.files?.pictures || [])
        ];

        uploadedPictures.forEach(file => {
            req.farmFiles.pictures.push({
                    filename: file.filename,
                    path: file.path,
                    url: `/upload/farm-documents/${file.filename}`,
                    mimeType: file.mimetype,
                    size: file.size,
                    originalName: file.originalname
                });
        });

        // Process documents
        if (req.files && req.files.documents && Array.isArray(req.files.documents)) {
            req.files.documents.forEach(file => {
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
