const path = require('path');

const config = {
    development: {
        feUrl: "https://app.smileagrimarket.com",
        db: {
            master: {
                host: "192.168.1.165",
                port: 5432,
                username: "postgres",
                password: "Spartan920",
                database: "smileagric",
                dialect: "postgres",
            },

        },
        uploads: {
            profileDir: path.resolve(__dirname, '..', '..', 'uploads', 'profiles'),
            kycDir: path.resolve(__dirname, '..', '..', 'uploads', 'kyc'),
            milestoneFundingEvidenceDir: path.resolve(
                __dirname,
                '..',
                '..',
                'uploads',
                'milestone-funding-evidence'
            )
        },
        apiVersion: "v1",
        jwtSecret: "jwt-secret",
        jwtExpiresIn: "1d",
    },
    production: {
        feUrl: "https://app.smileagrimarket.com",
        db: {
            master: {
                host: "127.0.0.1",
                port: 5432,
                username: "postgres",
                password: "agrimarket",
                database: "smileagric",
                dialect: "postgres",
            },

        },
        uploads: {
            profileDir: path.resolve(__dirname, '..', '..', 'uploads', 'profiles'),
            kycDir: path.resolve(__dirname, '..', '..', 'uploads', 'kyc'),
            milestoneFundingEvidenceDir: path.resolve(
                __dirname,
                '..',
                '..',
                'uploads',
                'milestone-funding-evidence'
            )
        },
        apiVersion: "v1",
        jwtSecret: "jwt-secret",
        jwtExpiresIn: "1d",


    },
};

const currentConfig =
    process.env.NODE_ENV === "production"
        ? config.production
        : config.development;

currentConfig.paystack = {
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    baseUrl: (process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co').replace(/\/+$/, ''),
    callbackUrl: process.env.PAYSTACK_CALLBACK_URL
        || `${process.env.FE_URL || currentConfig.feUrl}/investments/payment/callback`,
    timeoutMs: Math.max(Number(process.env.PAYSTACK_TIMEOUT_MS) || 15000, 1000)
};

module.exports = currentConfig;
