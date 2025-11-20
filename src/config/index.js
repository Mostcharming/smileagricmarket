const path = require('path');

const config = {
    development: {
        feUrl: "http://localhost:3001",
        db: {
            master: {
                host: "192.168.1.165",
                port: 5432,
                username: "postgres",
                password: "Spartan920",
                database: "altuhealth_master",
                dialect: "postgres",
            },
            slave: {
                host: "192.168.1.165",
                port: 5432,
                username: "postgres",
                password: "Spartan920",
                database: "altuhealth_master",
                dialect: "postgres",
            },
        },
        uploads: {
            profileDir: path.resolve(__dirname, '..', 'uploads', 'profiles')
        },
        apiVersion: "v1",
        jwtSecret: "jwt-secret",
        jwtExpiresIn: "1d",
    },
    production: {
        feUrl: "https://api.altuhealth.com",
        db: {
            master: {
                host: "127.0.0.1",
                port: 5432,
                username: "altuhealth",
                password: "altuhealth2025Tayo",
                database: "altuhealth",
                dialect: "postgres",
            },
            slave: {
                host: "127.0.0.1",
                port: 5432,
                username: "altuhealth",
                password: "altuhealth2025Tayo",
                database: "altuhealth",
                dialect: "postgres",
            },
        },
        uploads: {
            profileDir: path.resolve(__dirname, '..', 'uploads', 'profiles')
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
