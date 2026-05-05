'use strict';

const router = require('express').Router();
const ctrl = require('./auth.controller');
const { authenticate } = require('../../middleware/auth');

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Connexion utilisateur
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string }
 *               password: { type: string }
 *     responses:
 *       200: { description: Tokens + user profile }
 *       401: { description: Identifiants incorrects }
 */
router.post('/login', ctrl.login);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Renouveler un access token
 *     tags: [Auth]
 */
router.post('/refresh', ctrl.refresh);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Déconnexion (invalide le refresh token)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.post('/logout', authenticate, ctrl.logout);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Profil utilisateur courant
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.get('/me', authenticate, ctrl.me);

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Changer son mot de passe
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.post('/change-password', authenticate, ctrl.changePassword);

module.exports = router;
