'use strict';

require('dotenv').config({ quiet: true });
const bcrypt = require('bcrypt');
const { Sequelize } = require('sequelize');
const config = require('../src/config').db.master;
const defineModels = require('../src/database/models');

if (process.env.NODE_ENV === 'production' || !['127.0.0.1', 'localhost', '::1'].includes(config.host)) {
    throw new Error('Test accounts can only be seeded into a local development database.');
}

if (!process.env.LOCAL_TEST_PASSWORD) {
    throw new Error('Set LOCAL_TEST_PASSWORD in .env before seeding local accounts.');
}

const sequelize = new Sequelize({ ...config, logging: false });
const { User, Admin, KYC, Wallet } = defineModels(sequelize);

async function seed() {
    try {
        await sequelize.authenticate();
        const password = await bcrypt.hash(process.env.LOCAL_TEST_PASSWORD, 10);
        const accounts = await sequelize.transaction(async transaction => {
            const [admin, adminCreated] = await Admin.findOrCreate({
                where: { email: 'admin.test@example.com' },
                defaults: { fullName: 'Local Test Admin', password, role: 'super_admin', isActive: true },
                transaction
            });
            const results = [{ email: admin.email, role: admin.role, created: adminCreated }];
            for (const profile of [
                { email: 'farmer.test@example.com', fullName: 'Local Test Farmer', phoneNumber: '08000000001' },
                { email: 'investor.test@example.com', fullName: 'Local Test Investor', phoneNumber: '08000000002' }
            ]) {
                const [user, created] = await User.findOrCreate({
                    where: { email: profile.email },
                    defaults: { ...profile, password, isPhoneVerified: true },
                    transaction
                });
                if (created) {
                    await KYC.create({
                        userId: user.id,
                        identificationType: 'national_id',
                        identificationNumber: `LOCAL-TEST-${user.id}`,
                        status: 'approved',
                        verifiedBy: admin.id,
                        verifiedAt: new Date(),
                        submittedAt: new Date()
                    }, { transaction });
                    await Wallet.create({ userId: user.id }, { transaction });
                }
                results.push({ email: user.email, role: 'user', created });
            }
            return results;
        });
        console.log(`Local test accounts in ${config.database} at ${config.host}:${config.port}:`);
        console.table(accounts);
    } finally {
        await sequelize.close();
    }
}

seed().catch(error => {
    console.error('Local test user setup failed:', error.message);
    process.exitCode = 1;
});
