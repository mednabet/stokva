# Changelog

Tous les changements notables de **STOKVA** sont documentés dans ce fichier.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) · Versionnage : [SemVer](https://semver.org/lang/fr/).

---

## [2.0.0] — 2026-05-05

### 🚀 Backend Node.js + PostgreSQL multi-utilisateurs

L'application STOKVA passe en mode client-serveur avec backend PostgreSQL. **Architecture unifiée** : un seul port (3000), un seul service Windows, le backend sert à la fois l'API et le frontend statique.

#### 🆕 Backend Node.js dans `/backend`
- **Node.js 20 + Express + PostgreSQL 16**
- **Sert le frontend statique** sur `/` (HTML/CSS/JS/assets)
- **API REST** sur `/api/*` documentée Swagger (`/api/docs`)
- **WebSocket** sur `/ws` pour le temps réel
- **Authentification JWT** (access + refresh tokens)
- **Audit log** complet (qui/quoi/quand/IP)
- **3 modes de déploiement** : Windows (auto-installer), Linux/VPS (systemd), Docker

#### 🆕 11 modules backend
- Auth, Partners, Articles, Depots, Vehicles, Receptions, Expeditions, Transfers, Weighbridge, Reports, Settings, Config

#### 🆕 Pont-bascule série réelle
- Lecture RS232/USB (Toledo, Mettler, génériques)
- 4 modes : `simple`, `manuel`, `tare_enregistree`, `2_passes`
- Auto-reconnexion + simulateur intégré

#### 🆕 Transferts inter-dépôts
- Workflow `draft` → `in_transit` → `received`
- Réception partielle avec tolérance configurable

#### 🆕 Moteur de paramétrage modulaire
- **3 niveaux** avec cascade automatique : Article > Dépôt > Société
- 25+ paramètres par défaut, modifiables en live (sans redéploiement)
- **Champs personnalisés** par entité avec validation regex/min-max/conditionnel

#### 🆕 Reporting
- Registre G0 mensuel conforme EN 07-O04
- Exports Excel (ExcelJS) et PDF (PDFKit)
- Statistiques agrégées par partenaire/article/dépôt/véhicule

#### 🆕 Auto-installer Windows
- Détection automatique de Node.js, PostgreSQL, NSSM
- Installation auto via `winget` (Windows 10 1809+) ou MSI direct
- Génération sécurisée des mots de passe et JWT secret
- Création du service Windows STOKVA (démarrage auto)

#### 🛡️ RBAC affiné
- 4 rôles : `admin`, `responsable`, `operateur`, `consultation`
- Garde-fou anti-stock-négatif paramétrable (avec colonne dédiée prioritaire)
- Rate limiting sur les routes auth (30 tentatives / 15 min)

#### 📦 Migrations PostgreSQL
- 5 migrations versionnées (`backend/migrations/`)
- Script `migrate.js` idempotent (table `_migrations`)
- Seed automatique (admin/admin + données démo)

### 🧹 Nettoyage de la v1

Pour éviter toute confusion entre les modes localStorage et backend, les fichiers redondants de la v1 ont été supprimés :

- ~~`install-windows.bat`~~ (racine) → remplacé par `backend/install-windows.bat`
- ~~`start-server.bat`, `start-stokva.bat`~~ → service Windows STOKVA gère tout
- ~~`reset-data.bat`~~ → utiliser `backend/scripts/reset-db.js`
- ~~`push-to-github*.bat`~~ → scripts ad-hoc retirés
- ~~`PUBLIER-SUR-GITHUB.md`, `MIGRATION.md`~~ → documentation simplifiée dans `README.md`
- ~~`backend/frontend-bridge/login.html`~~ → doublon avec `index.html`
- ~~`backend/frontend-bridge/storage-shim.js`~~ → mode v1/v2 unifié, plus besoin de shim
- ~~`backend/frontend-bridge/config.html`~~ → page démo retirée

Le **frontend continue de fonctionner exactement comme avant** (mode localStorage par défaut), il est juste maintenant servi par le backend Express sur le port 3000 au lieu d'un serveur Python séparé sur 8080.

---


## [1.0.0] — 2026-05-05

### 🎉 Première version stable

#### 🎨 Identité visuelle
- **Nom de l'application** : **STOKVA** (par NETPROCESS)
- **Charte graphique complète** : palette indigo profond + cyan électrique
- **Logo** : cube isométrique abstrait avec wordmark Outfit Extra Bold
- **Icônes** : 9 tailles PNG + SVG + ICO multi-résolution
- **Manifest PWA** : installation comme app sur mobile/desktop
- **Page de présentation** : `static/description/index.html`
- **Charte complète** : [`assets/brand/BRAND-GUIDELINES.md`](assets/brand/BRAND-GUIDELINES.md)

#### 📦 Modules
- **Tableau de bord** avec KPIs en temps réel et graphiques Chart.js
- **Module Réceptions** avec génération auto BR + impression bons
- **Module Expéditions** avec génération auto BL + impression bons
- **Pont-bascule** : 3 modes (simulation / manuel / liaison série)
  - Capture poids brut / tare / net automatique
  - Liaison réception ↔ pesée
- **Stock & Articles** : catalogue, alertes stock minimum, mouvements
- **Multi-dépôts** avec capacité et responsable
- **Partenaires** : 3 types (fournisseur / client / mixte)
- **Véhicules** avec tare et chauffeur associé
- **6 rapports** :
  - Registre mensuel style G0 (conforme EN 07-O04)
  - Mouvements par période
  - Stats partenaires / articles / véhicules
  - Journal des pesées
- **Exports** Excel (SheetJS) et PDF (jsPDF + autotable)
- **4 rôles** : Administrateur / Responsable / Opérateur / Consultation
- **Paramètres** complets : société, documents, pont-bascule, sauvegarde
- **Sauvegarde / restauration JSON** complète
- **Mode clair / sombre** avec persistance

#### 🪟 Installation Windows
- Script d'installation automatique `install-windows.bat`
- Détection automatique navigateur (Chrome / Edge / Firefox)
- Création de raccourcis Bureau et Menu Démarrer (avec icône STOKVA)
- Lanceur rapide `start-stokva.bat`
- Lanceur serveur local `start-server.bat` (Python optionnel)

#### 🔐 Sécurité
- Stockage 100% local (clé `stokva_db_v1`) — RGPD-friendly
- Aucune connexion serveur — fonctionne hors-ligne
- Permissions fines par module
- Migration des clés localStorage vers le préfixe `stokva_`
