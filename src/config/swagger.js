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
                url: 'https://app.smileagrimarket.com/api/v1',
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
                Admin: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Admin unique identifier',
                        },
                        fullName: {
                            type: 'string',
                            description: 'Admin full name',
                        },
                        email: {
                            type: 'string',
                            format: 'email',
                            description: 'Admin email address',
                        },
                        role: {
                            type: 'string',
                            enum: ['super_admin', 'admin', 'moderator'],
                            description: 'Admin role',
                        },
                        isActive: {
                            type: 'boolean',
                            description: 'Whether admin account is active',
                        },
                        lastLoginAt: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Last login timestamp',
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
                KYC: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'KYC unique identifier',
                        },
                        userId: {
                            type: 'string',
                            format: 'uuid',
                            description: 'User ID',
                        },
                        identificationType: {
                            type: 'string',
                            enum: ['national_id', 'passport', 'driver_license', 'tin', 'voter_card'],
                            description: 'Type of identification',
                        },
                        identificationNumber: {
                            type: 'string',
                            description: 'Identification number',
                        },
                        status: {
                            type: 'string',
                            enum: ['pending', 'approved', 'rejected'],
                            description: 'KYC verification status',
                        },
                        submittedAt: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Submission timestamp',
                        },
                        verifiedAt: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Verification timestamp',
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
                FarmCategory: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Farm category unique identifier',
                        },
                        name: {
                            type: 'string',
                            description: 'Farm category name',
                        },
                        description: {
                            type: 'string',
                            description: 'Farm category description',
                        },
                        isActive: {
                            type: 'boolean',
                            description: 'Whether category is active',
                        },
                        milestoneCount: {
                            type: 'integer',
                            description: 'Number of milestones in the category',
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
                Milestone: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Milestone unique identifier',
                        },
                        farmCategoryId: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Related farm category ID',
                        },
                        farmCategoryName: {
                            type: 'string',
                            description: 'Related farm category name',
                        },
                        name: {
                            type: 'string',
                            description: 'Milestone name/description',
                        },
                        order: {
                            type: 'integer',
                            description: 'Milestone order/sequence',
                        },
                        isActive: {
                            type: 'boolean',
                            description: 'Whether milestone is active',
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
            },
        },
    },
    apis: [
        './src/modules/mobile/auth/route.js',
        './src/modules/mobile/kyc/route.js',
        './src/modules/web/auth/route.js',
        './src/modules/web/kyc/route.js',
        './src/modules/web/admin/route.js',
        './src/modules/web/admin/farmCategoryRoute.js',
        './src/modules/web/dashboard/route.js',
        './src/modules/web/farms/route.js',
        './src/modules/mobile/route.js',
        './src/modules/web/route.js',
    ],
};

const specs = swaggerJsdoc(options);

module.exports = specs;
