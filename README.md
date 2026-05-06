<div align="center">

<img src="assets/logos/stokva-logo-full.svg" alt="STOKVA" width="500"/>

# Gestion des Dépôts de Stockage

**Application web pour le suivi complet de vos opérations de dépôt** — réceptions, expéditions, transferts inter-dépôts, pont-bascule, registre G0, multi-utilisateurs temps réel.

[![Version](https://img.shields.io/badge/version-2.0.0-312e81?style=for-the-badge)](https://github.com/mednabet/stokva/releases)
[![License](https://img.shields.io/badge/license-MIT-06b6d4?style=for-the-badge)](LICENSE)
[![Stack](https://img.shields.io/badge/stack-Node.js%20%2B%20PostgreSQL-6366f1?style=for-the-badge)]()
[![By](https://img.shields.io/badge/by-NETPROCESS-1e1b4b?style=for-the-badge)](https://github.com/mednabet)

[Installation](#installation-windows) · [Architecture](#architecture) · [Fonctionnalités](#fonctionnalités) · [Charte graphique](assets/brand/BRAND-GUIDELINES.md)

</div>

---

## Installation Windows

Une seule commande, **toutes les dépendances sont installées automatiquement** (Node.js, PostgreSQL, NSSM).

```cmd
git clone https://github.com/mednabet/stokva.git
cd stokva\backend
install-windows.bat
```

L'installer :

1. Demande l'élévation UAC (cliquer Oui)
2. Installe Node.js 20 LTS si absent (via `winget` ou MSI direct)
3. Installe PostgreSQL 16 si absent (via `winget` ou EnterpriseDB)
4. Crée la base + utilisateur + permissions avec mots de passe aléatoires
5. Applique les migrations + seed les données initiales
6. Crée le service Windows STOKVA (démarrage auto au boot)
7. Ouvre l'application dans le navigateur

**Durée** : 5-10 min selon connexion (~300 Mo téléchargés si Node + PostgreSQL absents).

Une fois terminé, l'application est accessible sur **http://localhost:3000** :
- **Identifiants par défaut** : `admin` / `admin` (à changer immédiatement)
- **API REST** : http://localhost:3000/api/docs (Swagger UI)

Voir [`backend/README.md`](backend/README.md) pour les détails (Docker, Linux/VPS, configuration avancée).

---

## Architecture

Une seule URL, un seul port, un seul service Windows :

```
                http://localhost:3000
                         │
                         ▼
        ┌────────────────────────────────────┐
        │     Backend Node.js (Express)      │
        │                                    │
        │  ┌─────────────┐ ┌──────────────┐  │
        │  │  Frontend   │ │  API REST    │  │
        │  │  statique   │ │  /api/*      │  │
        │  │  (HTML/JS)  │ │  + WebSocket │  │
        │  └─────────────┘ └──────────────┘  │
        └────────────────────────────────────┘
                         │
                         ▼
                ┌─────────────────┐
                │   PostgreSQL    │
                │   (port 5432)   │
                └─────────────────┘
```

Le backend Express sert :
- À la racine (`/`, `/index.html`, `/js/...`, `/css/...`, `/assets/...`) : le **frontend HTML/JS**
- Sous `/api/*` : l'**API REST** (auth JWT, CRUD, exports, rapports)
- Sous `/ws` : le **WebSocket** pour les notifications temps réel
- Sous `/api/docs` : **Swagger UI** pour explorer l'API

---

## Fonctionnalités

### Modules métier

- **Tableau de bord** avec KPIs temps réel et graphiques
- **Réceptions** avec génération auto des BR + impression
- **Expéditions** avec génération auto des BL + impression
- **Pont-bascule** série RS232/USB (Toledo, Mettler, génériques)
  - 4 modes : `simple`, `manuel`, `tare_enregistree`, `2_passes`
  - Simulateur intégré pour test sans matériel
- **Stock multi-dépôts** avec alertes seuil minimum
- **Transferts inter-dépôts** (envoi → en transit → réception)
- **Partenaires** (fournisseurs / clients / mixtes)
- **Véhicules** avec tare et chauffeur
- **Registre G0** mensuel conforme **EN 07-O04**
- **6 rapports** avec exports Excel et PDF

### Multi-utilisateurs

- **4 rôles** : Administrateur / Responsable / Opérateur / Consultation
- **Authentification JWT** avec refresh tokens
- **WebSocket** pour notifications instantanées entre postes
- **Audit log** complet (qui / quoi / quand / IP)
- **Rate limiting** sur les endpoints sensibles

### Paramétrage modulaire

- **3 niveaux avec cascade** : Article > Dépôt > Société
- **25+ paramètres** modifiables en live (sans redéploiement)
- **Champs personnalisés** validés (regex, min/max, requis conditionnel)
- API REST `/api/config/*` pour tout piloter

---

## Structure du projet

```
stokva/
├── index.html                  # Page d'accueil (servie par le backend)
├── css/                        # Feuilles de style
├── js/                         # Logique frontend
│   ├── app.js                  # Bootstrap
│   ├── auth.js                 # Auth + permissions
│   ├── components.js           # Composants UI
│   ├── pages/                  # Pages (dashboard, réception, etc.)
│   ├── storage.js              # Wrapper persistance
│   └── utils.js                # Utilitaires
├── assets/                     # Logos, icônes, charte graphique
├── backend/                    # Backend Node.js + PostgreSQL
│   ├── install-windows.bat     # Installer Windows automatique
│   ├── install-windows.ps1     # Installer PowerShell sous-jacent
│   ├── install-vps.sh          # Installer Linux/VPS
│   ├── install-docker.sh       # Installer Docker
│   ├── package.json
│   ├── README.md               # Documentation détaillée
│   ├── docker/                 # Dockerfile + compose + nginx
│   ├── docs/index.html         # Page de présentation NETPROCESS
│   ├── frontend-bridge/        # Client JavaScript pour l'API REST
│   │   ├── auth.js
│   │   └── api-client.js
│   ├── migrations/             # 5 migrations SQL versionnées
│   ├── scripts/                # migrate.js, seed.js, reset-db.js
│   └── src/                    # Code Node.js
│       ├── server.js           # Entry point + WebSocket hub
│       ├── app.js              # Express app (sert frontend + API)
│       ├── modules/            # 12 modules métier
│       ├── middleware/         # Auth, audit, errors
│       ├── utils/              # Settings, custom fields, stock
│       └── websocket/          # Hub temps réel
├── manifest.webmanifest        # Manifest PWA
├── CHANGELOG.md
├── LICENSE                     # MIT
└── README.md
```

---

## Service Windows

Après installation, un service `STOKVA` est créé :

```cmd
sc query STOKVA              REM Statut
net start STOKVA             REM Démarrer
net stop STOKVA              REM Arrêter
```

**Logs** : `backend/logs/stokva.log` et `stokva-error.log`
**Configuration** : `backend/.env` (mots de passe + ports)

---

## Identité graphique

- **Palette** : indigo profond `#312E81` + cyan électrique `#06B6D4` + violet `#6366F1`
- **Typo** : Outfit (titres) + Inter (texte)
- **Logo** : cube isométrique abstrait (cf. `assets/logos/`)
- **Charte complète** : [`assets/brand/BRAND-GUIDELINES.md`](assets/brand/BRAND-GUIDELINES.md)

---

## Compatibilité

- **Navigateurs** : Chrome 90+, Edge 90+, Firefox 88+, Safari 14+
- **Serveur** : Windows 10/11, Linux (Ubuntu/Debian), Docker
- **Base** : PostgreSQL 14, 15 ou 16
- **Node.js** : 18+ (20 LTS recommandé)
- ⚠️ **Internet Explorer non supporté**

---

## Documentation

- **Backend** : [`backend/README.md`](backend/README.md) — installation, API, déploiement
- **Charte graphique** : [`assets/brand/BRAND-GUIDELINES.md`](assets/brand/BRAND-GUIDELINES.md)
- **Changelog** : [`CHANGELOG.md`](CHANGELOG.md)
- **API REST** : http://localhost:3000/api/docs (après installation)

---

## Licence

[MIT](LICENSE) — Utilisez librement, modifiez, distribuez. Mentionnez **NETPROCESS** comme auteur original.

---

<div align="center">

**STOKVA** — par **NETPROCESS** — 2026

[GitHub](https://github.com/mednabet/stokva) · [Issues](https://github.com/mednabet/stokva/issues)

</div>
