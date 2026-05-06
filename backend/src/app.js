'use strict';

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');

const config = require('./config');
const swaggerSpec = require('./config/swagger');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

// Routes
const authRoutes = require('./modules/auth/auth.routes');
const partnersRoutes = require('./modules/partners/partners.routes');
const articlesRoutes = require('./modules/articles/articles.routes');
const depotsRoutes = require('./modules/depots/depots.routes');
const vehiclesRoutes = require('./modules/vehicles/vehicles.routes');
const receptionsRoutes = require('./modules/receptions/receptions.routes');
const expeditionsRoutes = require('./modules/expeditions/expeditions.routes');
const transfersRoutes = require('./modules/transfers/transfers.routes');
const weighbridgeRoutes = require('./modules/weighbridge/weighbridge.routes');
const reportsRoutes = require('./modules/reports/reports.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const configRoutes = require('./modules/config/config.routes');

const app = express();

// Security & infra
app.set('trust proxy', 1);
app.use(helmet({
    contentSecurityPolicy: false, // disabled for swagger UI
}));
app.use(cors({
    origin: config.cors.origin.includes('*') ? true : config.cors.origin,
    credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(config.logLevel));

// Rate limit on auth endpoints
const authLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: 30, // 30 attempts per 15 min
    standardHeaders: true,
    legacyHeaders: false,
});

// Health
app.get('/health', (req, res) => {
    res.json({
        ok: true,
        service: 'stokva-backend',
        version: '1.0.0',
        env: config.env,
        time: new Date().toISOString(),
    });
});

// Docs
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'STOKVA API — NETPROCESS',
}));
app.get('/api/openapi.json', (req, res) => res.json(swaggerSpec));

// API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/partners', partnersRoutes);
app.use('/api/articles', articlesRoutes);
app.use('/api/depots', depotsRoutes);
app.use('/api/vehicles', vehiclesRoutes);
app.use('/api/receptions', receptionsRoutes);
app.use('/api/expeditions', expeditionsRoutes);
app.use('/api/transfers', transfersRoutes);
app.use('/api/weighbridge', weighbridgeRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/config', configRoutes);

// =====================================================================
// Frontend statique
// Le backend sert le frontend (index.html + js/ + css/ + assets/)
// situe a la racine du repo, c'est-a-dire deux niveaux au-dessus de /src/.
// Resultat : l'utilisateur ouvre http://localhost:3000/ et obtient l'app.
// =====================================================================
const FRONTEND_DIR = path.join(__dirname, '..', '..');
app.use(express.static(FRONTEND_DIR, {
    index: 'index.html',
    extensions: ['html'],
    setHeaders: (res, filePath) => {
        // Pas de cache sur l'HTML pour avoir les MAJ tout de suite
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    },
}));

// SPA fallback : toute route non-API et non-statique renvoie index.html
// (utile si on ajoute un router cote client). Exclut /api/* et /ws.
app.get(/^\/(?!api|ws|health).*$/, (req, res, next) => {
    const indexFile = path.join(FRONTEND_DIR, 'index.html');
    res.sendFile(indexFile, (err) => {
        if (err) next();
    });
});

// 404 + error handlers
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
