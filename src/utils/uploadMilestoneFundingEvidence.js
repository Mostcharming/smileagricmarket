'use strict';

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const config = require('../config');

const uploadDir = config?.uploads?.milestoneFundingEvidenceDir
    || path.resolve(__dirname, '..', '..', 'uploads', 'milestone-funding-evidence');

fs.mkdirSync(uploadDir, { recursive: true });

const PHOTO_FIELDS = ['photos', 'pictures'];
const FILE_FIELDS = ['files', 'documents'];
const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const FILE_MIME_TYPES = ['application/pdf'];
const EXTENSIONS_BY_MIME_TYPE = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf'
};

function classifyEvidenceFile(fieldName, mimeType) {
    if (PHOTO_FIELDS.includes(fieldName) && PHOTO_MIME_TYPES.includes(mimeType)) {
        return 'photo';
    }
    if (FILE_FIELDS.includes(fieldName) && FILE_MIME_TYPES.includes(mimeType)) {
        return 'file';
    }
    return null;
}

const storage = multer.diskStorage({
    destination(req, file, cb) {
        cb(null, uploadDir);
    },
    filename(req, file, cb) {
        const extension = EXTENSIONS_BY_MIME_TYPE[file.mimetype] || '';
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
    }
});

function fileFilter(req, file, cb) {
    if (classifyEvidenceFile(file.fieldname, file.mimetype)) {
        return cb(null, true);
    }
    if (PHOTO_FIELDS.includes(file.fieldname)) {
        return cb(new Error('Invalid photo type. Only JPEG/PNG/WEBP images are allowed'));
    }
    if (FILE_FIELDS.includes(file.fieldname)) {
        return cb(new Error('Invalid evidence file type. Only PDF files are allowed'));
    }
    return cb(new Error(`Unexpected evidence field: ${file.fieldname}`));
}

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024,
        files: 20
    }
});

function getRawUploadedFiles(req) {
    return Object.values(req.files || {}).flat();
}

function cleanupMilestoneFundingEvidenceFiles(req) {
    getRawUploadedFiles(req).forEach(file => {
        try {
            if (file?.path && fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
        } catch (error) {
            console.error('Failed to remove rejected milestone evidence upload:', error);
        }
    });
}

function mapEvidenceFile(file) {
    return {
        evidenceType: classifyEvidenceFile(file.fieldname, file.mimetype),
        fileName: file.originalname,
        fileUrl: `/upload/milestone-funding-evidence/${file.filename}`,
        fileSize: file.size,
        mimeType: file.mimetype,
        path: file.path
    };
}

function uploadMilestoneFundingEvidence(req, res, next) {
    return upload.fields([
        { name: 'photos', maxCount: 10 },
        { name: 'pictures', maxCount: 10 },
        { name: 'files', maxCount: 10 },
        { name: 'documents', maxCount: 10 }
    ])(req, res, error => {
        if (error) {
            cleanupMilestoneFundingEvidenceFiles(req);
            if (error.code === 'LIMIT_FILE_SIZE') {
                return res.fail('Evidence file too large (max 50MB)', 400);
            }
            if (error.code === 'LIMIT_FILE_COUNT') {
                return res.fail('Too many evidence files (max 20)', 400);
            }
            return res.fail(error.message || 'Evidence upload error', 400);
        }

        req.milestoneFundingEvidence = getRawUploadedFiles(req).map(mapEvidenceFile);
        return next();
    });
}

module.exports = uploadMilestoneFundingEvidence;
module.exports.classifyEvidenceFile = classifyEvidenceFile;
module.exports.cleanupMilestoneFundingEvidenceFiles = cleanupMilestoneFundingEvidenceFiles;
