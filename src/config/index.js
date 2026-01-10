const path = require('path');

const config = {
    development: {
        feUrl: "https://smileagrimarket.com",
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
            profileDir: path.resolve(__dirname, '..', 'uploads', 'profiles'),
            kycDir: path.resolve(__dirname, '..', 'uploads', 'kyc')
        },
        apiVersion: "v1",
        jwtSecret: "jwt-secret",
        jwtExpiresIn: "1d",
    },
    production: {
        feUrl: "https://smileagrimarket.com",
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
            profileDir: path.resolve(__dirname, '..', 'uploads', 'profiles'),
            kycDir: path.resolve(__dirname, '..', 'uploads', 'kyc')
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

module.exports = currentConfig;
