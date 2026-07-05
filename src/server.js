const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const path = require('path');

require('./database');
require('dotenv').config();

const config = require('./config');
const swaggerSpec = require('./config/swagger');
const { responseFormatter } = require('./middlewares/common/responseFormatter');
const { inputValidationMiddleware } = require('./middlewares/common/inputValidation');
const { createRateLimitMiddleware } = require('./middlewares/common/rateLimiter');
const mobileRouter = require('./modules/mobile/route');
const webRouter = require('./modules/web/route');

const app = express();

app.use((req, res, next) => {
  if (req.path.startsWith('/api-docs') || req.path.includes('/api-docs')) {
    return next();
  }

  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  })(req, res, next);
});

app.use(cors({
  origin: ['https://app.smileagrimarket.com', 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:5011'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 600
}));

app.use(compression());

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use(createRateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  maxRequests: 1000,
  message: 'Too many requests from this IP, please try again later'
}));

app.use(responseFormatter);

app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

app.get(`/${config.apiVersion}/api-docs.json`, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

app.get(`/api/${config.apiVersion}/api-docs.json`, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

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

app.use(`/${config.apiVersion}/api-docs`,
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    swaggerOptions: {
      url: `/${config.apiVersion}/api-docs.json`,
      deepLinking: true,
      displayOperationId: true,
    },
    customCss: '.swagger-ui { background-color: #fafafa; }',
    customSiteTitle: 'Smile Agric API Docs',
  })
);

app.use(`/api/${config.apiVersion}/api-docs`,
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    swaggerOptions: {
      url: `/api/${config.apiVersion}/api-docs.json`,
      deepLinking: true,
      displayOperationId: true,
    },
    customCss: '.swagger-ui { background-color: #fafafa; }',
    customSiteTitle: 'Smile Agric API Docs',
  })
);

const farmDocumentsDir = path.resolve(__dirname, '..', 'uploads', 'farm-documents');

if (config && config.uploads && config.uploads.profileDir) {
  app.use('/upload/profiles', express.static(config.uploads.profileDir));
  app.use(`/${config.apiVersion}/upload/profiles`, express.static(config.uploads.profileDir));
  app.use(`/api/${config.apiVersion}/upload/profiles`, express.static(config.uploads.profileDir));
}

if (config && config.uploads && config.uploads.kycDir) {
  app.use('/upload/kyc', express.static(config.uploads.kycDir));
  app.use(`/${config.apiVersion}/upload/kyc`, express.static(config.uploads.kycDir));
  app.use(`/api/${config.apiVersion}/upload/kyc`, express.static(config.uploads.kycDir));
}

app.use('/upload/farm-documents', express.static(farmDocumentsDir));
app.use(`/${config.apiVersion}/upload/farm-documents`, express.static(farmDocumentsDir));
app.use(`/api/${config.apiVersion}/upload/farm-documents`, express.static(farmDocumentsDir));

app.use(`/${config.apiVersion}/mobile`, mobileRouter);
app.use(`/${config.apiVersion}/web`, webRouter);
app.use(`/api/${config.apiVersion}/mobile`, mobileRouter);
app.use(`/api/${config.apiVersion}/web`, webRouter);

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
const HOST = '0.0.0.0';

// Get local IP address for network access
const os = require('os');
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIP = getLocalIP();

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV}`);
  console.log(`📚 Local access: http://localhost:${PORT}/api-docs`);
  console.log(`🌐 Network access: http://${localIP}:${PORT}/api-docs`);
});

module.exports = app;
