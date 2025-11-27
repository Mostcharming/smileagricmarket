const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');

require('./database');
require('dotenv').config();

const config = require('./config');
const swaggerSpec = require('./config/swagger');
const { responseFormatter } = require('./middlewares/common/responseFormatter');
const mobileRouter = require('./modules/mobile/route');
const webRouter = require('./modules/web/route');

const app = express();


app.use(cors({
  origin: ['https://smileagrimarket.com', 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:5011'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(responseFormatter);

// Swagger UI setup
console.log('🔍 Swagger spec keys:', Object.keys(swaggerSpec));
console.log('🔍 Swagger spec paths:', Object.keys(swaggerSpec.paths || {}));

// Serve Swagger JSON
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Serve Swagger UI
app.use('/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    swaggerOptions: {
      url: '/api-docs.json',
      deepLinking: true,
      displayOperationId: true,
    },
    customCss: '.swagger-ui { background-color: #fafafa; }',
    customSiteTitle: 'Smile Agric API Docs',
  })
);

if (config && config.uploads && config.uploads.profileDir) {
  app.use('/upload', express.static(config.uploads.profileDir));
}

app.use(`/${config.apiVersion}/mobile`, mobileRouter);
app.use(`/${config.apiVersion}/web`, webRouter);

app.get('/', (req, res) => {
  res.json({
    message: 'Smile Agri Market API is running',
    apiVersion: config.apiVersion,
    status: 'running',
    docs: '/api-docs'
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5011;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV}`);
  console.log(`📚 Swagger Docs: http://localhost:${PORT}/api-docs`);
});

module.exports = app;
