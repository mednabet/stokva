'use strict';

require('dotenv').config();

const config = {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',

    db: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'stokva',
        user: process.env.DB_USER || 'stokva',
        password: process.env.DB_PASSWORD || 'stokva',
        max: parseInt(process.env.DB_POOL_MAX || '20', 10),
        idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000', 10),
    },

    jwt: {
        secret: process.env.JWT_SECRET || 'dev_secret_change_me',
        expiresIn: process.env.JWT_EXPIRES_IN || '12h',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },

    cors: {
        origin: (process.env.CORS_ORIGIN || '*').split(',').map(s => s.trim()),
    },

    ws: {
        path: process.env.WS_PATH || '/ws',
    },

    weighbridge: {
        enabled: process.env.WEIGHBRIDGE_ENABLED === 'true',
        port: process.env.WEIGHBRIDGE_PORT || 'COM3',
        baudRate: parseInt(process.env.WEIGHBRIDGE_BAUDRATE || '9600', 10),
        parity: process.env.WEIGHBRIDGE_PARITY || 'none',
        dataBits: parseInt(process.env.WEIGHBRIDGE_DATABITS || '8', 10),
        stopBits: parseInt(process.env.WEIGHBRIDGE_STOPBITS || '1', 10),
    },

    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
        max: parseInt(process.env.RATE_LIMIT_MAX || '300', 10),
    },

    logLevel: process.env.LOG_LEVEL || 'combined',
};

module.exports = config;
