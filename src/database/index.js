'use strict';
const { Sequelize } = require('sequelize');

const config = require('./config/config')[process.env.NODE_ENV || 'development'];

const sequelize = new Sequelize({
    database: config.database,
    username: config.username,
    password: config.password,
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    pool: config.pool,
    logging: config.logging
});

async function createDatabaseIfNotExists() {
    const cfg = config;

    if (!cfg) return;

    const tempSequelize = new Sequelize({
        database: 'postgres',
        username: cfg.username,
        password: cfg.password,
        host: cfg.host,
        port: cfg.port,
        dialect: cfg.dialect || config.dialect,
        logging: false
    });

    try {
        const [results] = await tempSequelize.query(
            `SELECT 1 FROM pg_database WHERE datname = '${cfg.database}'`
        );

        if (results.length === 0) {
            await tempSequelize.query(`CREATE DATABASE "${cfg.database}"`);
            console.log(`✅ Database '${cfg.database}' created successfully on ${cfg.host}:${cfg.port}.`);
        } else {
            console.log(`ℹ️  Database '${cfg.database}' already exists on ${cfg.host}:${cfg.port}.`);
        }
    } catch (error) {
        console.error(`❌ Error creating database '${cfg.database}' on ${cfg.host}:${cfg.port}:`, error.message);
        throw error;
    } finally {
        await tempSequelize.close();
    }
}

async function initializeDatabase() {
    try {
        await createDatabaseIfNotExists();

        await sequelize.authenticate();
        console.log('✅ Database connected successfully.');

        console.log('🎉 Database initialization complete!');
    } catch (error) {
        console.error('❌ Database initialization failed:', error.message);
        process.exit(1);
    }
}

initializeDatabase();

module.exports = {
    sequelize,
    createDatabase: createDatabaseIfNotExists,
};
