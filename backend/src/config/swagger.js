'use strict';

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.3',
        info: {
            title: 'STOKVA API',
            version: '1.0.0',
            description: 'API REST pour la gestion des dépôts de stockage — by NETPROCESS',
            contact: { name: 'NETPROCESS' },
            license: { name: 'MIT' },
        },
        servers: [
            { url: 'http://localhost:3000', description: 'Développement' },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        security: [{ bearerAuth: [] }],
    },
    apis: ['./src/modules/**/*.routes.js'],
};

module.exports = swaggerJsdoc(options);
