# Changelog

Tous les changements notables de **STOKVA** sont documentés dans ce fichier.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) · Versionnage : [SemVer](https://semver.org/lang/fr/).

---

## [2.0.0] — 2026-05-05

### 🚀 Backend Node.js + PostgreSQL multi-utilisateurs

> Voir [`MIGRATION.md`](MIGRATION.md) pour le guide de migration depuis la v1 (localStorage).

Le frontend v1 reste **inchangé** et fonctionne toujours en mode localStorage. La v2 ajoute un backend dans `/backend` qui peut être activé sans modifier les fichiers existants.

#### 🆕 Backend
- **Node.js 20 + Express + PostgreSQL 16** dans `/backend`
- **API REST** documentée Swagger (`/api/docs`)
- **Authentification JWT** (access + refresh tokens, sessions persistantes)
- **WebSocket** pour multi-utilisateurs temps réel
- **Audit log** complet (qui/quoi/quand/IP)
- **3 modes de déploiement** : Windows local, VPS Linux, Docker

#### 🆕 11 modules backend
- Auth, Partners, Articles, Depots, Vehicles, Receptions, Expeditions, Transfers, Weighbridge, Reports, Settings, Config

#### 🆕 Pont-bascule série réelle
- Lecture RS232/USB (Toledo, Mettler, génériques)
- 4 modes de pesage : `simple`, `manuel`, `tare_enregistree`, `2_passes`
- Auto-reconnexion + simulateur intégré

#### 🆕 Transferts inter-dépôts
- Workflow `draft` → `in_transit` → `received`
- Réception partielle avec tolérance configurable

#### 🆕 Moteur de paramétrage modulaire
- **3 niveaux** avec cascade automatique : Article > Dépôt > Société
- 25+ paramètres par défaut, modifiables en live (sans redéploiement)
- **Champs personnalisés** par entité avec validation regex/min-max/conditionnel
- Page UI de paramétrage : `backend/frontend-bridge/config.html`

#### 🆕 Reporting
- Registre G0 mensuel conforme EN 07-O04
- Exports Excel (ExcelJS) et PDF (PDFKit)
- Statistiques agrégées par partenaire/article/dépôt/véhicule

#### 🛡️ RBAC affiné
- 4 rôles avec contrôle granulaire par endpoint
- Garde-fou anti-stock-négatif paramétrable
- Rate limiting sur les routes auth

#### 📦 Migrations PostgreSQL
- 5 migrations versionnées (`backend/migrations/`)
- Script `migrate.js` idempotent (table `_migrations`)
- Seed automatique (admin/admin + données démo)

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
