'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Sequelize } = require('sequelize');
const {
    classifyEvidenceFile,
    cleanupMilestoneFundingEvidenceFiles
} = require('../src/utils/uploadMilestoneFundingEvidence');

test('classifies supported funding evidence fields and MIME types', () => {
    assert.equal(classifyEvidenceFile('photos', 'image/jpeg'), 'photo');
    assert.equal(classifyEvidenceFile('pictures', 'image/webp'), 'photo');
    assert.equal(classifyEvidenceFile('files', 'application/pdf'), 'file');
    assert.equal(classifyEvidenceFile('documents', 'application/pdf'), 'file');
});

test('rejects mismatched or unsupported funding evidence types', () => {
    assert.equal(classifyEvidenceFile('photos', 'application/pdf'), null);
    assert.equal(classifyEvidenceFile('files', 'image/png'), null);
    assert.equal(classifyEvidenceFile('files', 'application/zip'), null);
    assert.equal(classifyEvidenceFile('unexpected', 'image/jpeg'), null);
});

test('removes uploaded evidence when a funding request is rejected', () => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'funding-evidence-'));
    const uploadedFile = path.join(temporaryDirectory, 'evidence.pdf');
    fs.writeFileSync(uploadedFile, 'test evidence');

    cleanupMilestoneFundingEvidenceFiles({
        files: {
            files: [{ path: uploadedFile }]
        }
    });

    assert.equal(fs.existsSync(uploadedFile), false);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('registers milestone funding evidence with the expected association', async () => {
    const sequelize = new Sequelize('postgres://test:test@localhost:5432/test', {
        logging: false
    });
    const models = require('../src/database/models')(sequelize);

    assert.equal(models.MilestoneFundingEvidence.getTableName(), 'milestone_funding_evidence');
    assert.equal(
        models.UserFarmMilestone.associations.FundingEvidence.target,
        models.MilestoneFundingEvidence
    );
    assert.equal(
        models.MilestoneFundingEvidence.associations.Milestone.target,
        models.UserFarmMilestone
    );

    await sequelize.close();
});
