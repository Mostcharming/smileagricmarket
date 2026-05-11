require('dotenv').config();


const dbconfig = require('../../config').db;


module.exports = {
  development: {
    username: dbconfig.master.username,
    password: dbconfig.master.password,
    database: dbconfig.master.database,
    host: dbconfig.master.host,
    port: dbconfig.master.port,
    dialect: dbconfig.master.dialect || 'postgres',
    pool: {
      max: 20,
      min: 0,
      acquire: 60000,
      idle: 10000
    },
    logging: console.log
  },
  production: {
    username: dbconfig.master.username,
    password: dbconfig.master.password,
    database: dbconfig.master.database,
    host: dbconfig.master.host,
    port: dbconfig.master.port,
    dialect: dbconfig.master.dialect || 'postgres',
    pool: {
      max: 20,
      min: 0,
      acquire: 60000,
      idle: 10000
    },
    logging: false
  }
};
