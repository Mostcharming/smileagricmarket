const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Smile Agric Market API',
            version: '1.0.0',
            description: 'API documentation for Smile Agric Market mobile and web applications',
            contact: {
                name: 'Smile Agric Support',
                email: 'support@smileagric.com',
            },
        },
        servers: [
            {
                url: 'http://localhost:5011/v1',
                description: 'Development server',
            },
            {
                url: 'https://smileagrimarket.com/api/v1',
                description: 'Production server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'JWT Authorization header using the Bearer scheme',
                },
            },
            schemas: {
                User: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'User unique identifier',
                        },
                        phoneNumber: {
                            type: 'string',
                            description: 'User phone number',
                        },
                        fullName: {
                            type: 'string',
                            description: 'User full name',
                        },
                        email: {
                            type: 'string',
                            format: 'email',
                            description: 'User email address',
                        },
                        gender: {
                            type: 'string',
                            enum: ['male', 'female', 'other'],
                            description: 'User gender',
                        },
                        isPhoneVerified: {
                            type: 'boolean',
                            description: 'Whether phone number is verified',
                        },
                        createdAt: {
                            type: 'string',
                            format: 'date-time',
                        },
                        updatedAt: {
                            type: 'string',
                            format: 'date-time',
                        },
                    },
                },
                Error: {
                    type: 'object',
                    properties: {
                        error: {
                            type: 'boolean',
                        },
                        message: {
                            type: 'string',
                        },
                        data: {
                            type: 'object',
                        },
                    },
                },
                Success: {
                    type: 'object',
                    properties: {
                        error: {
                            type: 'boolean',
                        },
                        message: {
                            type: 'string',
                        },
                        data: {
                            type: 'object',
                        },
                    },
                },
            },
        },
    },
    apis: [
        './src/modules/mobile/auth/route.js',
        './src/modules/mobile/kyc/route.js',
        './src/modules/web/auth/route.js',
        './src/modules/web/kyc/route.js',
        './src/modules/mobile/route.js',
        './src/modules/web/route.js',
    ],
};

const specs = swaggerJsdoc(options);

module.exports = specs;
