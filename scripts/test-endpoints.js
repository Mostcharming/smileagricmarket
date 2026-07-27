'use strict';

require('dotenv').config();

const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Op } = require('sequelize');
const { sequelize } = require('../src/database');
const defineModels = require('../src/database/models');

sequelize.options.logging = false;

const models = defineModels(sequelize);
const {
    Admin,
    AdminNotification,
    BetaSignup,
    FarmCategory,
    FarmDocument,
    Investment,
    InvestmentMilestone,
    InvestmentPayment,
    KYC,
    Milestone,
    TempOtp,
    User,
    UserFarm,
    UserFarmInvestment,
    UserFarmMilestone,
    UserNotification,
    Wallet
} = models;

const origin = (process.env.ENDPOINT_TEST_ORIGIN || `http://localhost:${process.env.PORT || 5011}`)
    .replace(/\/+$/, '');
const apiRoot = `${origin}/v1`;
const runId = `e2e-${Date.now()}`;
const betaSignupEmail = `beta-${runId}@example.test`;
const marketingAdminEmail = `marketing-${runId}@example.test`;
const marketingAdminPassword = 'EndpointMarketing123!';
const runDigits = Date.now().toString().slice(-7);
const coveredOperations = new Set();
const createdPhones = [];
const uploadedFilePaths = new Set();
let passedChecks = 0;

const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=',
    'base64'
);
const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

function operationKey(method, routeTemplate) {
    return `${method.toUpperCase()} ${routeTemplate}`;
}

function bearer(token) {
    return { Authorization: `Bearer ${token}` };
}

function makePhone(index) {
    const phone = `080${runDigits}${String(index).padStart(1, '0')}`.slice(0, 11);
    createdPhones.push(phone);
    return phone;
}

function multipart(fields, files = []) {
    const form = new FormData();

    for (const [name, value] of Object.entries(fields)) {
        form.append(name, typeof value === 'string' ? value : JSON.stringify(value));
    }

    for (const file of files) {
        form.append(
            file.field,
            new Blob([file.bytes], { type: file.type }),
            file.name
        );
    }

    return form;
}

async function httpCheck(name, method, routeTemplate, options = {}) {
    const {
        actualPath = routeTemplate,
        body,
        headers = {},
        expectedStatus = 200,
        expectError = false,
        absoluteUrl = null,
        cover = true
    } = options;
    const requestHeaders = { ...headers };
    const requestOptions = {
        method,
        headers: requestHeaders
    };

    if (body !== undefined) {
        if (body instanceof FormData) {
            requestOptions.body = body;
        } else {
            requestHeaders['Content-Type'] = 'application/json';
            requestOptions.body = JSON.stringify(body);
        }
    }

    const response = await fetch(absoluteUrl || `${apiRoot}${actualPath}`, requestOptions);
    const contentType = response.headers.get('content-type') || '';
    const responseBody = contentType.includes('application/json')
        ? await response.json()
        : await response.text();
    const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];

    assert.ok(
        expectedStatuses.includes(response.status),
        `${name}: expected HTTP ${expectedStatuses.join('/')} but received ${response.status}: ${JSON.stringify(responseBody)}`
    );

    if (contentType.includes('application/json') && responseBody && 'error' in responseBody) {
        assert.equal(
            responseBody.error,
            expectError,
            `${name}: unexpected API error state: ${JSON.stringify(responseBody)}`
        );
    }

    if (cover) {
        coveredOperations.add(operationKey(method, routeTemplate));
    }

    passedChecks++;
    console.log(`PASS ${method.toUpperCase().padEnd(6)} ${actualPath} - ${name}`);
    return { status: response.status, body: responseBody, headers: response.headers };
}

async function assertPublicFile(name, url) {
    const response = await fetch(url);
    assert.equal(response.status, 200, `${name}: uploaded file URL returned HTTP ${response.status}: ${url}`);
    assert.ok((await response.arrayBuffer()).byteLength > 0, `${name}: uploaded file was empty`);

    const match = new URL(url).pathname.match(/\/upload\/(kyc|profiles|farm-documents)\/([^/]+)$/);
    if (match) {
        uploadedFilePaths.add(
            path.resolve(__dirname, '..', 'uploads', match[1], decodeURIComponent(match[2]))
        );
    }

    passedChecks++;
    console.log(`PASS GET    ${new URL(url).pathname} - ${name}`);
}

async function readResetToken(phoneNumber) {
    const user = await User.findOne({ where: { phoneNumber } });
    assert.ok(user?.resetToken, `No reset token was stored for ${phoneNumber}`);
    return user.resetToken;
}

async function exerciseAuthSurface(surface, indexBase) {
    const primaryPhone = makePhone(indexBase);
    const signupPhone = makePhone(indexBase + 1);
    const primaryEmail = `${surface.slice(1)}-otp-${runId}@example.test`;
    const signupEmail = `${surface.slice(1)}-signup-${runId}@example.test`;
    const initialPassword = 'EndpointTest123!';
    const resetPassword = 'EndpointReset456!';

    await httpCheck(`${surface} request OTP`, 'POST', `${surface}/auth/request-otp`, {
        body: { phoneNumber: primaryPhone }
    });
    await httpCheck(`${surface} resend OTP`, 'POST', `${surface}/auth/resend-otp`, {
        body: { phoneNumber: primaryPhone }
    });
    const verified = await httpCheck(`${surface} verify OTP`, 'POST', `${surface}/auth/verify-otp`, {
        body: { phoneNumber: primaryPhone, otp: '777666' }
    });
    const signupToken = verified.body.data.token;
    assert.ok(signupToken, `${surface} verify OTP did not return a signup token`);

    await httpCheck(`${surface} complete profile`, 'POST', `${surface}/auth/complete-profile`, {
        headers: bearer(signupToken),
        body: {
            fullName: `OTP User ${runId}`,
            gender: 'female',
            email: primaryEmail
        }
    });
    const setPassword = await httpCheck(`${surface} set password`, 'POST', `${surface}/auth/set-password`, {
        headers: bearer(signupToken),
        body: {
            password: initialPassword,
            passwordConfirmation: initialPassword,
            fullName: `OTP User ${runId}`,
            gender: 'female',
            email: primaryEmail
        }
    });
    const primary = {
        id: setPassword.body.data.user.id,
        phone: primaryPhone,
        email: primaryEmail,
        token: setPassword.body.data.token,
        password: initialPassword
    };

    const signup = await httpCheck(`${surface} password signup`, 'POST', `${surface}/auth/signup`, {
        body: {
            phoneNumber: signupPhone,
            email: signupEmail,
            fullName: `Signup User ${runId}`,
            password: initialPassword,
            gender: 'male'
        }
    });
    const secondary = {
        id: signup.body.data.user.id,
        phone: signupPhone,
        email: signupEmail,
        token: signup.body.data.token,
        password: initialPassword
    };

    await httpCheck(`${surface} forgot password`, 'POST', `${surface}/auth/forgot-password`, {
        body: { phoneNumber: signupPhone }
    });
    const firstResetToken = await readResetToken(signupPhone);
    await httpCheck(`${surface} verify reset token`, 'POST', `${surface}/auth/verify-reset-token`, {
        body: { resetToken: firstResetToken }
    });

    await httpCheck(`${surface} resend reset token`, 'POST', `${surface}/auth/resend-reset-token`, {
        body: { email: signupEmail }
    });
    const secondResetToken = await readResetToken(signupPhone);
    assert.notEqual(firstResetToken, secondResetToken, `${surface} reset token was not rotated`);

    const reset = await httpCheck(`${surface} reset password`, 'POST', `${surface}/auth/reset-password`, {
        body: {
            resetToken: secondResetToken,
            password: resetPassword,
            passwordConfirmation: resetPassword
        }
    });
    secondary.token = reset.body.data.token;
    secondary.password = resetPassword;

    const login = await httpCheck(`${surface} password login`, 'POST', `${surface}/auth/login`, {
        body: { email: signupEmail, password: resetPassword }
    });
    assert.equal(login.body.data.user.id, secondary.id, `${surface} login returned the wrong user`);
    secondary.token = login.body.data.token;

    return { primary, secondary };
}

async function submitKyc(surface, token, identificationNumber, suffix) {
    return httpCheck(`${surface} submit KYC`, 'POST', `${surface}/kyc/submit`, {
        headers: bearer(token),
        body: multipart(
            {
                identificationType: 'national_id',
                identificationNumber,
                dateOfBirth: '1992-04-15'
            },
            [{
                field: 'selfie',
                bytes: pngBytes,
                type: 'image/png',
                name: `${runId}-${suffix}.png`
            }]
        ),
        expectedStatus: 200
    });
}

async function updateKyc(surface, token, identificationNumber, suffix) {
    return httpCheck(`${surface} update KYC`, 'PUT', `${surface}/kyc/update`, {
        headers: bearer(token),
        body: multipart(
            {
                identificationType: 'passport',
                identificationNumber,
                dateOfBirth: '1992-04-16'
            },
            [{
                field: 'selfie',
                bytes: pngBytes,
                type: 'image/png',
                name: `${runId}-${suffix}.png`
            }]
        )
    });
}

async function createCategory(adminToken, nameSuffix) {
    return httpCheck('admin create farm category', 'POST', '/web/admin/farm-categories', {
        headers: bearer(adminToken),
        body: {
            name: `Endpoint ${runId} ${nameSuffix}`,
            description: `Endpoint test category ${nameSuffix}`
        }
    });
}

async function createMilestone(adminToken, categoryId, name, order) {
    return httpCheck('admin create category milestone', 'POST', '/web/admin/farm-categories/{categoryId}/milestones', {
        actualPath: `/web/admin/farm-categories/${categoryId}/milestones`,
        headers: bearer(adminToken),
        body: { name, order }
    });
}

function investmentPayload(categoryId, suffix) {
    return {
        name: `Investment ${runId} ${suffix}`,
        description: 'Endpoint test investment',
        farmCategoryId: categoryId,
        startDate: '2026-08-01',
        endDate: '2027-07-31',
        roiPercentage: 18.5,
        durationValue: 12,
        durationUnit: 'months',
        riskLevel: 'medium',
        fundingMinGoal: 100000,
        fundingMaxGoal: 500000,
        investmentMinGoal: 50000,
        investmentMaxGoal: 200000,
        currency: 'NGN'
    };
}

async function createFarm(token, categoryId, name, selectedMilestones = [], includeFiles = false) {
    const files = includeFiles
        ? [
            {
                field: 'pictures',
                bytes: pngBytes,
                type: 'image/png',
                name: `${runId}-farm.png`
            },
            {
                field: 'documents',
                bytes: pdfBytes,
                type: 'application/pdf',
                name: `${runId}-farm.pdf`
            }
        ]
        : [];

    return httpCheck('web create farm', 'POST', '/web/farms', {
        headers: bearer(token),
        body: multipart({
            farmCategoryId: categoryId,
            name,
            description: 'Endpoint test farm',
            location: 'Lagos',
            size: '12.5',
            investmentAmount: '500000',
            currency: 'NGN',
            selectedMilestones
        }, files),
        expectedStatus: 201
    });
}

async function cleanup() {
    const users = await User.findAll({
        where: {
            [Op.or]: [
                { email: { [Op.like]: `%${runId}%` } },
                { phoneNumber: { [Op.in]: createdPhones.length ? createdPhones : [''] } }
            ]
        }
    });
    const userIds = users.map(user => user.id);
    const categories = await FarmCategory.findAll({
        where: { name: { [Op.like]: `%${runId}%` } }
    });
    const categoryIds = categories.map(category => category.id);
    const farms = userIds.length
        ? await UserFarm.findAll({ where: { userId: { [Op.in]: userIds } } })
        : [];
    const farmIds = farms.map(farm => farm.id);
    const investments = categoryIds.length
        ? await Investment.findAll({ where: { farmCategoryId: { [Op.in]: categoryIds } } })
        : [];
    const investmentIds = investments.map(investment => investment.id);
    const filesToDelete = [];

    if (userIds.length) {
        const kycs = await KYC.findAll({ where: { userId: { [Op.in]: userIds } } });
        filesToDelete.push(...kycs.flatMap(kyc => [kyc.selfieImagePath, kyc.idDocumentPath]).filter(Boolean));
        filesToDelete.push(...users.map(user => user.profileImagePath).filter(Boolean));
    }

    if (farmIds.length) {
        const documents = await FarmDocument.findAll({ where: { userFarmId: { [Op.in]: farmIds } } });
        for (const document of documents) {
            const filename = document.fileUrl.replace('/upload/farm-documents/', '');
            filesToDelete.push(path.resolve(__dirname, '..', 'uploads', 'farm-documents', filename));
        }
    }

    const paymentWhere = [];
    if (userIds.length) paymentWhere.push({ investorId: { [Op.in]: userIds } });
    if (farmIds.length) paymentWhere.push({ userFarmId: { [Op.in]: farmIds } });
    if (investmentIds.length) paymentWhere.push({ investmentId: { [Op.in]: investmentIds } });
    if (paymentWhere.length) {
        await InvestmentPayment.destroy({ where: { [Op.or]: paymentWhere } });
    }

    if (farmIds.length) {
        await FarmDocument.destroy({ where: { userFarmId: { [Op.in]: farmIds } } });
        await UserFarmMilestone.destroy({ where: { userFarmId: { [Op.in]: farmIds } } });
        await UserFarmInvestment.destroy({ where: { userFarmId: { [Op.in]: farmIds } } });
        await UserFarm.destroy({ where: { id: { [Op.in]: farmIds } } });
    }

    if (userIds.length) {
        await Wallet.destroy({ where: { userId: { [Op.in]: userIds } } });
        await KYC.destroy({ where: { userId: { [Op.in]: userIds } } });
        await UserNotification.destroy({ where: { userId: { [Op.in]: userIds } } });
        await User.destroy({ where: { id: { [Op.in]: userIds } } });
    }

    if (createdPhones.length) {
        await TempOtp.destroy({ where: { phoneNumber: { [Op.in]: createdPhones } } });
    }

    if (investmentIds.length) {
        await InvestmentMilestone.destroy({ where: { investmentId: { [Op.in]: investmentIds } } });
        await Investment.destroy({ where: { id: { [Op.in]: investmentIds } } });
    }

    if (categoryIds.length) {
        await Milestone.destroy({ where: { farmCategoryId: { [Op.in]: categoryIds } } });
        await FarmCategory.destroy({ where: { id: { [Op.in]: categoryIds } } });
    }

    for (const file of new Set([...filesToDelete, ...uploadedFilePaths])) {
        try {
            await fs.unlink(file);
        } catch (error) {
            if (error.code !== 'ENOENT') console.warn(`Cleanup could not remove ${file}: ${error.message}`);
        }
    }

    // The current notification implementation does not create these records, but
    // keep the cleanup scoped if that behavior changes later.
    await AdminNotification.destroy({
        where: { title: { [Op.like]: `%${runId}%` } }
    }).catch(() => {});
    await BetaSignup.destroy({
        where: { email: betaSignupEmail }
    }).catch(() => {});
    await Admin.destroy({
        where: {
            email: marketingAdminEmail,
            role: 'marketing_admin'
        }
    }).catch(() => {});
}

async function run() {
    await sequelize.authenticate();

    const root = await httpCheck('API health', 'GET', '/', {
        absoluteUrl: `${origin}/`,
        cover: false
    });
    assert.equal(root.body.status, 'running');

    for (const docsPath of ['/api-docs.json', '/v1/api-docs.json', '/api/v1/api-docs.json']) {
        const docs = await httpCheck(`OpenAPI document ${docsPath}`, 'GET', docsPath, {
            absoluteUrl: `${origin}${docsPath}`,
            cover: false
        });
        assert.equal(docs.body.openapi, '3.0.0');
    }

    const docsUi = await httpCheck('Swagger UI', 'GET', '/api-docs/', {
        absoluteUrl: `${origin}/api-docs/`,
        cover: false
    });
    assert.match(docsUi.body, /swagger-ui/i);

    await httpCheck('web auth guard', 'GET', '/web/dashboard', {
        expectedStatus: 401,
        expectError: true
    });
    await httpCheck('mobile auth guard', 'GET', '/mobile/kyc/status', {
        expectedStatus: 401,
        expectError: true
    });
    await httpCheck('admin auth guard', 'GET', '/web/admin/users', {
        expectedStatus: 401,
        expectError: true
    });
    await httpCheck('marketing admin auth guard', 'GET', '/web/marketing-admin/beta-signups', {
        expectedStatus: 401,
        expectError: true,
        cover: false
    });

    const adminLogin = await httpCheck('admin login', 'POST', '/web/admin/login', {
        body: {
            email: process.env.ENDPOINT_TEST_ADMIN_EMAIL || 'admin@smileagric.com',
            password: process.env.ENDPOINT_TEST_ADMIN_PASSWORD || 'Admin@123'
        }
    });
    const adminToken = adminLogin.body.data.token;
    assert.ok(adminToken, 'Admin login did not return a token');

    await Admin.create({
        fullName: `Marketing Admin ${runId}`,
        email: marketingAdminEmail,
        password: await bcrypt.hash(marketingAdminPassword, 10),
        role: 'marketing_admin',
        isActive: true
    });

    await httpCheck('public beta signup', 'POST', '/web/beta-signups', {
        body: {
            email: betaSignupEmail,
            firstName: `Beta ${runId}`
        },
        expectedStatus: 201
    });

    await httpCheck('marketing admin rejected by regular admin login', 'POST', '/web/admin/login', {
        body: {
            email: marketingAdminEmail,
            password: marketingAdminPassword
        },
        expectedStatus: 401,
        expectError: true,
        cover: false
    });

    const marketingLogin = await httpCheck(
        'marketing admin login',
        'POST',
        '/web/marketing-admin/login',
        {
            body: {
                email: marketingAdminEmail,
                password: marketingAdminPassword
            }
        }
    );
    const marketingToken = marketingLogin.body.data.token;
    assert.ok(marketingToken, 'Marketing admin login did not return a token');

    await httpCheck(
        'regular admin rejected from marketing routes',
        'GET',
        '/web/marketing-admin/beta-signups',
        {
            headers: bearer(adminToken),
            expectedStatus: 403,
            expectError: true,
            cover: false
        }
    );

    const betaSignups = await httpCheck(
        'marketing admin lists beta signups',
        'GET',
        '/web/marketing-admin/beta-signups',
        {
            actualPath: `/web/marketing-admin/beta-signups?query=${encodeURIComponent(runId)}&page=1&limit=20`,
            headers: bearer(marketingToken)
        }
    );
    assert.ok(
        betaSignups.body.data.signups.some(signup => signup.email === betaSignupEmail),
        'Created beta signup was missing from the marketing admin list'
    );

    const betaExport = await httpCheck(
        'marketing admin downloads all beta signups',
        'GET',
        '/web/marketing-admin/beta-signups/download',
        {
            actualPath: `/web/marketing-admin/beta-signups/download?query=${encodeURIComponent(runId)}`,
            headers: bearer(marketingToken)
        }
    );
    assert.match(betaExport.body, new RegExp(betaSignupEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(betaExport.headers.get('content-disposition') || '', /attachment; filename="beta-signups-\d{4}-\d{2}-\d{2}\.csv"/);

    const webUsers = await exerciseAuthSurface('/web', 1);
    const mobileUsers = await exerciseAuthSurface('/mobile', 3);

    const categoryCreated = await createCategory(adminToken, 'primary');
    const categoryId = categoryCreated.body.data.id;
    await httpCheck('admin list farm categories', 'GET', '/web/admin/farm-categories', {
        actualPath: '/web/admin/farm-categories?activeOnly=false',
        headers: bearer(adminToken)
    });
    await httpCheck('admin get farm category', 'GET', '/web/admin/farm-categories/{categoryId}', {
        actualPath: `/web/admin/farm-categories/${categoryId}`,
        headers: bearer(adminToken)
    });
    await httpCheck('admin update farm category', 'PUT', '/web/admin/farm-categories/{categoryId}', {
        actualPath: `/web/admin/farm-categories/${categoryId}`,
        headers: bearer(adminToken),
        body: {
            name: `Endpoint ${runId} primary updated`,
            description: 'Updated by endpoint test'
        }
    });

    const milestoneOne = await createMilestone(adminToken, categoryId, `Plant ${runId}`, 1);
    const milestoneTwo = await createMilestone(adminToken, categoryId, `Harvest ${runId}`, 2);
    const milestoneOneId = milestoneOne.body.data.id;
    const milestoneTwoId = milestoneTwo.body.data.id;

    await httpCheck('admin list all milestones', 'GET', '/web/admin/milestones', {
        actualPath: '/web/admin/milestones?activeOnly=false',
        headers: bearer(adminToken)
    });
    await httpCheck('admin list category milestones', 'GET', '/web/admin/farm-categories/{categoryId}/milestones', {
        actualPath: `/web/admin/farm-categories/${categoryId}/milestones?activeOnly=false`,
        headers: bearer(adminToken)
    });
    await httpCheck('admin update milestone', 'PUT', '/web/admin/milestones/{milestoneId}', {
        actualPath: `/web/admin/milestones/${milestoneOneId}`,
        headers: bearer(adminToken),
        body: { name: `Planting ${runId}`, order: 1 }
    });

    const disposableMilestone = await createMilestone(adminToken, categoryId, `Disposable ${runId}`, 99);
    await httpCheck('admin delete milestone', 'DELETE', '/web/admin/milestones/{milestoneId}', {
        actualPath: `/web/admin/milestones/${disposableMilestone.body.data.id}`,
        headers: bearer(adminToken)
    });

    const disposableCategory = await createCategory(adminToken, 'disposable');
    const disposableCategoryId = disposableCategory.body.data.id;
    await createMilestone(adminToken, disposableCategoryId, `Delete all ${runId}`, 1);
    await httpCheck('admin delete category milestones', 'DELETE', '/web/admin/farm-categories/{categoryId}/milestones/delete-all', {
        actualPath: `/web/admin/farm-categories/${disposableCategoryId}/milestones/delete-all`,
        headers: bearer(adminToken)
    });
    await httpCheck('admin delete farm category', 'DELETE', '/web/admin/farm-categories/{categoryId}', {
        actualPath: `/web/admin/farm-categories/${disposableCategoryId}`,
        headers: bearer(adminToken)
    });

    const investmentCreated = await httpCheck('admin create investment', 'POST', '/web/admin/investments', {
        headers: bearer(adminToken),
        body: investmentPayload(categoryId, 'primary'),
        expectedStatus: 201
    });
    assert.equal(investmentCreated.body.data.startDate, '2026-08-01');
    assert.equal(investmentCreated.body.data.endDate, '2027-07-31');
    const investmentId = investmentCreated.body.data.id;
    await httpCheck('admin list investments', 'GET', '/web/admin/investments', {
        actualPath: `/web/admin/investments?farmCategoryId=${categoryId}&activeOnly=true`,
        headers: bearer(adminToken)
    });
    await httpCheck('admin get investment', 'GET', '/web/admin/investments/{investmentId}', {
        actualPath: `/web/admin/investments/${investmentId}`,
        headers: bearer(adminToken)
    });
    const investmentUpdated = await httpCheck('admin update investment', 'PUT', '/web/admin/investments/{investmentId}', {
        actualPath: `/web/admin/investments/${investmentId}`,
        headers: bearer(adminToken),
        body: {
            description: 'Updated endpoint investment',
            riskLevel: 'low',
            endDate: '2027-08-31'
        }
    });
    assert.equal(investmentUpdated.body.data.startDate, '2026-08-01');
    assert.equal(investmentUpdated.body.data.endDate, '2027-08-31');

    const investmentMilestone = await httpCheck(
        'admin create investment milestone',
        'POST',
        '/web/admin/investments/{investmentId}/milestones',
        {
            actualPath: `/web/admin/investments/${investmentId}/milestones`,
            headers: bearer(adminToken),
            body: { name: `Release ${runId}`, fundReleasePercentage: 25, order: 1 },
            expectedStatus: 201
        }
    );
    const investmentMilestoneId = investmentMilestone.body.data.id;
    await httpCheck('admin update investment milestone', 'PUT', '/web/admin/investment-milestones/{milestoneId}', {
        actualPath: `/web/admin/investment-milestones/${investmentMilestoneId}`,
        headers: bearer(adminToken),
        body: { name: `Release updated ${runId}`, fundReleasePercentage: 30, order: 2 }
    });
    await httpCheck('admin delete investment milestone', 'DELETE', '/web/admin/investment-milestones/{milestoneId}', {
        actualPath: `/web/admin/investment-milestones/${investmentMilestoneId}`,
        headers: bearer(adminToken)
    });

    const disposableInvestment = await httpCheck('admin create disposable investment', 'POST', '/web/admin/investments', {
        headers: bearer(adminToken),
        body: investmentPayload(categoryId, 'disposable'),
        expectedStatus: 201
    });
    await httpCheck('admin delete investment', 'DELETE', '/web/admin/investments/{investmentId}', {
        actualPath: `/web/admin/investments/${disposableInvestment.body.data.id}`,
        headers: bearer(adminToken)
    });

    const webKyc = await submitKyc('/web', webUsers.primary.token, `WEB-${runDigits}`, 'web-kyc');
    const webKycId = webKyc.body.data.kycId;
    await assertPublicFile('web KYC selfie is publicly accessible', webKyc.body.data.selfie);
    await httpCheck('web get KYC status', 'GET', '/web/kyc/status', {
        headers: bearer(webUsers.primary.token)
    });
    await httpCheck('web list KYC records', 'GET', '/web/kyc/list', {
        actualPath: '/web/kyc/list?status=pending&page=1&limit=20',
        headers: bearer(webUsers.primary.token)
    });

    const mobileKyc = await submitKyc('/mobile', mobileUsers.primary.token, `MOB-${runDigits}`, 'mobile-kyc');
    const mobileKycId = mobileKyc.body.data.kycId;
    await assertPublicFile('mobile KYC selfie is publicly accessible', mobileKyc.body.data.selfie);
    await httpCheck('mobile get KYC status', 'GET', '/mobile/kyc/status', {
        headers: bearer(mobileUsers.primary.token)
    });
    await httpCheck('mobile list KYC records', 'GET', '/mobile/kyc/list', {
        actualPath: '/mobile/kyc/list?status=pending&page=1&limit=20',
        headers: bearer(mobileUsers.primary.token)
    });
    await updateKyc('/mobile', mobileUsers.primary.token, `MOB-UPD-${runDigits}`, 'mobile-kyc-update');

    await httpCheck('admin list users', 'GET', '/web/admin/users', {
        actualPath: `/web/admin/users?search=${encodeURIComponent(runId)}&page=1&limit=20`,
        headers: bearer(adminToken)
    });
    await httpCheck('admin get user KYC', 'GET', '/web/admin/users/{userId}/kyc', {
        actualPath: `/web/admin/users/${webUsers.primary.id}/kyc`,
        headers: bearer(adminToken)
    });
    await httpCheck('admin reject KYC', 'POST', '/web/admin/kyc/reject', {
        headers: bearer(adminToken),
        body: { kycId: webKycId, rejectionReason: 'Endpoint test resubmission' }
    });
    await updateKyc('/web', webUsers.primary.token, `WEB-UPD-${runDigits}`, 'web-kyc-update');
    await httpCheck('admin approve web KYC', 'POST', '/web/admin/kyc/approve', {
        headers: bearer(adminToken),
        body: { kycId: webKycId }
    });
    await httpCheck('admin approve mobile KYC', 'POST', '/web/admin/kyc/approve', {
        headers: bearer(adminToken),
        body: { kycId: mobileKycId }
    });

    await httpCheck('web update profile', 'PUT', '/web/profile/update', {
        headers: bearer(webUsers.primary.token),
        body: { bio: `Endpoint profile ${runId}`, fullName: `Farm Owner ${runId}` }
    });
    const profilePicture = await httpCheck('web upload profile picture', 'POST', '/web/profile/upload-picture', {
        headers: bearer(webUsers.primary.token),
        body: multipart({}, [{
            field: 'picture',
            bytes: pngBytes,
            type: 'image/png',
            name: `${runId}-profile.png`
        }])
    });
    await assertPublicFile('profile picture is publicly accessible', profilePicture.body.data.profileImageUrl);
    await httpCheck('web get profile', 'GET', '/web/profile/get', {
        headers: bearer(webUsers.primary.token)
    });
    await httpCheck('web profile completion', 'GET', '/web/profile/completion-status', {
        headers: bearer(webUsers.primary.token)
    });
    await httpCheck('web setup wallet', 'POST', '/web/profile/wallet/setup', {
        headers: bearer(webUsers.primary.token),
        body: {
            bankName: 'Endpoint Bank',
            accountNumber: '1234567890',
            accountName: `Farm Owner ${runId}`
        }
    });
    await httpCheck('web get wallet', 'GET', '/web/profile/wallet/get', {
        headers: bearer(webUsers.primary.token)
    });

    await httpCheck('web list farm categories', 'GET', '/web/farm-categories', {
        headers: bearer(webUsers.primary.token)
    });
    await httpCheck('web list farm category milestones', 'GET', '/web/farm-categories/{categoryId}/milestones', {
        actualPath: `/web/farm-categories/${categoryId}/milestones`,
        headers: bearer(webUsers.primary.token)
    });

    const mainFarm = await createFarm(
        webUsers.primary.token,
        categoryId,
        `Primary Farm ${runId}`,
        [{ milestoneId: milestoneOneId, amount: 150000 }],
        true
    );
    const farmId = mainFarm.body.data.id;
    const initialPicture = mainFarm.body.data.Documents.find(document => document.documentType === 'picture');
    assert.ok(initialPicture, 'Farm create did not return its uploaded picture');
    await assertPublicFile('farm picture is publicly accessible', initialPicture.fileUrl);

    const disposableFarm = await createFarm(
        webUsers.primary.token,
        categoryId,
        `Disposable Farm ${runId}`
    );
    await httpCheck('web delete farm', 'DELETE', '/web/farms/{farmId}', {
        actualPath: `/web/farms/${disposableFarm.body.data.id}`,
        headers: bearer(webUsers.primary.token)
    });
    await httpCheck('web list farms', 'GET', '/web/farms', {
        actualPath: `/web/farms?search=${encodeURIComponent(runId)}&page=1&limit=20`,
        headers: bearer(webUsers.primary.token)
    });
    await httpCheck('web get farm', 'GET', '/web/farms/{farmId}', {
        actualPath: `/web/farms/${farmId}`,
        headers: bearer(webUsers.primary.token)
    });
    await httpCheck('web update farm', 'PUT', '/web/farms/{farmId}', {
        actualPath: `/web/farms/${farmId}`,
        headers: bearer(webUsers.primary.token),
        body: { description: 'Updated endpoint farm', location: 'Ibadan', size: 14 }
    });
    await httpCheck('web add farm milestones', 'POST', '/web/farms/{farmId}/milestones', {
        actualPath: `/web/farms/${farmId}/milestones`,
        headers: bearer(webUsers.primary.token),
        body: { milestones: [{ milestoneId: milestoneTwoId, amount: 100000 }] }
    });
    await httpCheck('web remove farm milestone', 'DELETE', '/web/farms/{farmId}/milestones/{milestoneId}', {
        actualPath: `/web/farms/${farmId}/milestones/${milestoneTwoId}`,
        headers: bearer(webUsers.primary.token)
    });

    const uploadedDocuments = await httpCheck('web upload farm documents', 'POST', '/web/farms/{farmId}/documents', {
        actualPath: `/web/farms/${farmId}/documents`,
        headers: bearer(webUsers.primary.token),
        body: multipart({}, [{
            field: 'documents',
            bytes: pdfBytes,
            type: 'application/pdf',
            name: `${runId}-extra.pdf`
        }])
    });
    const extraDocument = uploadedDocuments.body.data.Documents
        .find(document => document.fileName === `${runId}-extra.pdf`);
    assert.ok(extraDocument, 'Farm document upload did not return the new document');
    await assertPublicFile('farm PDF is publicly accessible', extraDocument.fileUrl);
    await httpCheck('web delete farm document', 'DELETE', '/web/farms/documents/{documentId}', {
        actualPath: `/web/farms/documents/${extraDocument.id}`,
        headers: bearer(webUsers.primary.token)
    });

    await httpCheck('admin list user farms', 'GET', '/web/admin/user-farms', {
        actualPath: `/web/admin/user-farms?search=${encodeURIComponent(runId)}&page=1&limit=20`,
        headers: bearer(adminToken)
    });
    await httpCheck('admin get user farm', 'GET', '/web/admin/user-farms/{farmId}', {
        actualPath: `/web/admin/user-farms/${farmId}`,
        headers: bearer(adminToken)
    });
    await httpCheck('admin reject user farm', 'POST', '/web/admin/user-farms/reject', {
        headers: bearer(adminToken),
        body: { farmId, note: 'Endpoint test review' }
    });
    await httpCheck('admin approve user farm', 'POST', '/web/admin/user-farms/approve', {
        headers: bearer(adminToken),
        body: { farmId }
    });

    const investments = await httpCheck('web list investments', 'GET', '/web/investments', {
        actualPath: `/web/investments?farmCategoryId=${categoryId}&riskLevel=low&durationValue=12&durationUnit=months&location=Ibadan`,
        headers: bearer(mobileUsers.primary.token)
    });
    const listedInvestment = investments.body.data.investments
        .find(investment => investment.id === farmId);
    assert.ok(listedInvestment, 'Approved farm was missing from the web investment list');
    assert.equal(listedInvestment.startDate, '2026-08-01');
    assert.equal(listedInvestment.endDate, '2027-08-31');

    const investmentDetails = await httpCheck('web get investment details', 'GET', '/web/investments/{farmId}', {
        actualPath: `/web/investments/${farmId}`,
        headers: bearer(mobileUsers.primary.token)
    });
    assert.equal(investmentDetails.body.data.startDate, '2026-08-01');
    assert.equal(investmentDetails.body.data.endDate, '2027-08-31');

    const idempotencyKey = `${runId}-investment`;
    const investmentPayment = await httpCheck('web invest in farm', 'POST', '/web/investments/{farmId}/invest', {
        actualPath: `/web/investments/${farmId}/invest`,
        headers: {
            ...bearer(mobileUsers.primary.token),
            'Idempotency-Key': idempotencyKey
        },
        body: { amount: 50000, currency: 'NGN' },
        expectedStatus: 201
    });
    const repeatedPayment = await httpCheck('web investment idempotency replay', 'POST', '/web/investments/{farmId}/invest', {
        actualPath: `/web/investments/${farmId}/invest`,
        headers: {
            ...bearer(mobileUsers.primary.token),
            'Idempotency-Key': idempotencyKey
        },
        body: { amount: 50000, currency: 'NGN' }
    });
    assert.equal(
        repeatedPayment.body.data.payment.id,
        investmentPayment.body.data.payment.id,
        'Idempotency replay created a second payment'
    );

    const portfolio = await httpCheck('web portfolio summary', 'GET', '/web/portfolio', {
        headers: bearer(mobileUsers.primary.token)
    });
    assert.equal(portfolio.body.data.summary.totalInvested.amount, 50000);
    assert.equal(portfolio.body.data.summary.totalFarmsInvested.count, 1);
    assert.equal(portfolio.body.data.summary.totalExpectedReturns.amount, 9250);
    assert.equal(portfolio.body.data.summary.totalEarnedReturns.amount, 0);

    const activePortfolioFarms = await httpCheck('web active portfolio farms', 'GET', '/web/portfolio/farms', {
        actualPath: '/web/portfolio/farms?status=active',
        headers: bearer(mobileUsers.primary.token)
    });
    assert.equal(activePortfolioFarms.body.data.total, 1);
    assert.equal(activePortfolioFarms.body.data.farms[0].farmId, farmId);
    assert.equal(activePortfolioFarms.body.data.farms[0].userInvestment.amountInvested, 50000);

    const portfolioFarmDetails = await httpCheck(
        'web portfolio farm details',
        'GET',
        '/web/portfolio/farms/{farmId}',
        {
            actualPath: `/web/portfolio/farms/${farmId}`,
            headers: bearer(mobileUsers.primary.token)
        }
    );
    assert.equal(portfolioFarmDetails.body.data.farmId, farmId);
    assert.ok(Array.isArray(portfolioFarmDetails.body.data.images));
    assert.ok(Array.isArray(portfolioFarmDetails.body.data.documents));
    assert.ok(Array.isArray(portfolioFarmDetails.body.data.milestones));
    assert.equal(portfolioFarmDetails.body.data.userInvestment.amountInvested, 50000);
    assert.equal(
        portfolioFarmDetails.body.data.milestoneStats.total,
        portfolioFarmDetails.body.data.milestones.length
    );

    const completedPortfolioFarms = await httpCheck('web completed portfolio farms', 'GET', '/web/portfolio/farms', {
        actualPath: '/web/portfolio/farms?status=completed',
        headers: bearer(mobileUsers.primary.token)
    });
    assert.equal(completedPortfolioFarms.body.data.total, 0);

    await httpCheck('web dashboard overview', 'GET', '/web/dashboard', {
        headers: bearer(webUsers.primary.token)
    });
    await httpCheck('web dashboard stats', 'GET', '/web/dashboard/stats', {
        headers: bearer(webUsers.primary.token)
    });

    const swaggerResponse = await fetch(`${origin}/api-docs.json`);
    const swagger = await swaggerResponse.json();
    const documentedOperations = [];

    for (const [route, pathItem] of Object.entries(swagger.paths)) {
        for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
            if (pathItem[method]) documentedOperations.push(operationKey(method, route));
        }
    }

    const missingOperations = documentedOperations.filter(operation => !coveredOperations.has(operation));
    assert.deepEqual(
        missingOperations,
        [],
        `Documented endpoints were not exercised: ${missingOperations.join(', ')}`
    );

    const placeholderId = '00000000-0000-4000-8000-000000000000';
    for (const operation of documentedOperations) {
        const separator = operation.indexOf(' ');
        const method = operation.slice(0, separator);
        const route = operation.slice(separator + 1);
        const concreteRoute = route.replace(/\{[^}]+\}/g, placeholderId);
        const response = await fetch(`${origin}/api/v1${concreteRoute}`, { method });

        assert.notEqual(
            response.status,
            404,
            `${method} /api/v1${concreteRoute} is not registered`
        );
        passedChecks++;
    }
    console.log(`PASS alias  /api/v1 - ${documentedOperations.length} documented operations are registered`);

    console.log('');
    console.log(`All endpoint checks passed: ${passedChecks} HTTP checks.`);
    console.log(`Swagger coverage: ${coveredOperations.size}/${documentedOperations.length} documented operations.`);
}

let runError = null;

run()
    .catch(error => {
        runError = error;
        console.error('');
        console.error(`FAILED: ${error.stack || error.message}`);
    })
    .finally(async () => {
        try {
            await cleanup();
            console.log(`Cleanup complete for ${runId}.`);
        } catch (error) {
            runError = runError || error;
            console.error(`Cleanup failed: ${error.stack || error.message}`);
        }

        await sequelize.close();
        process.exitCode = runError ? 1 : 0;
    });
