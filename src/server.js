const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const dbSelector = require('./middlewares/common/dbSelector');
const adminRouter = require('./modules/admin/route');

require('./database');
require('dotenv').config();

const config = require('./config');
const { responseFormatter } = require('./middlewares/common/responseFormatter');

const app = express();

app.use(helmet());
app.use(cors({
  origin: ['https://smileagrimarket.com', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(responseFormatter);


// serve uploaded files at /upload so stored URLs like /upload/<filename> are accessible
if (config && config.uploads && config.uploads.profileDir) {
  app.use('/upload', express.static(config.uploads.profileDir));
}

app.use(`/api/${config.apiVersion}/admin`, adminRouter);

app.get('/', (req, res) => {
  res.json({
    message: 'Altu Health ERP API',
    apiVersion: config.apiVersion,
    status: 'running'
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5022;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV}`);
});

module.exports = app;
