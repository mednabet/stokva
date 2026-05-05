# STOKVA — Backend & Migration PostgreSQL

> **Gestion des Dépôts de Stockage** — par **NETPROCESS**

Backend Node.js + Express + PostgreSQL pour l'application STOKVA, transformant la version mono-poste (localStorage) en solution multi-utilisateurs temps réel.

---

## Sommaire

1. [Architecture](#architecture)
2. [Modules](#modules)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [API REST](#api-rest)
6. [WebSocket](#websocket)
7. [Pont-bascule](#pont-bascule)
8. [Migration depuis localStorage](#migration-depuis-localstorage)
9. [Sécurité](#sécurité)

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Navigateurs (postes)                  │
│   index.html / pesee.html / réceptions / expéditions     │
└────────────┬─────────────────────────┬───────────────────┘
             │ HTTP REST               │ WebSocket
             │ /api/*                  │ /ws?token=…
┌────────────▼─────────────────────────▼───────────────────┐
│                   Express + WS Hub                       │
│  • Auth JWT (access + refresh)                           │
│  • RBAC (admin / responsable / opérateur / consultation) │
│  • Audit log + rate-limit + Swagger                      │
└────────────┬─────────────────────────┬───────────────────┘
             │                         │
   ┌─────────▼─────────┐    ┌──────────▼────────┐
   │   PostgreSQL 16   │    │  Pont-bascule     │
   │   (stockage)      │    │  (RS232 / USB)    │
   └───────────────────┘    └───────────────────┘
```

**Stack** : Node 20+, Express 4, PostgreSQL 14+, ws, JWT, bcrypt, ExcelJS, PDFKit, serialport.

---

## Modules

| Module           | Endpoint                | Description                                              |
|------------------|-------------------------|----------------------------------------------------------|
| **Auth**         | `/api/auth`             | Login, refresh, logout, change-password                  |
| **Partners**     | `/api/partners`         | Fournisseurs / clients / mixtes (avec ICE/RC/IF)         |
| **Articles**     | `/api/articles`         | Catalogue + alertes stock min                            |
| **Depots**       | `/api/depots`           | Dépôts + stock global                                    |
| **Vehicles**     | `/api/vehicles`         | Camions + chauffeurs                                     |
| **Receptions**   | `/api/receptions`       | Bons de réception (BR) avec impact stock                 |
| **Expeditions**  | `/api/expeditions`      | Bons de livraison (BL) avec contrôle dispo               |
| **Transfers**    | `/api/transfers`        | Transferts inter-dépôts (envoi → en transit → réception) |
| **Weighbridge**  | `/api/weighbridge`      | Pont-bascule série + pesées (1 ou 2 passes)              |
| **Reports**      | `/api/reports`          | Registre G0, stats, dashboard, exports XLSX/PDF          |
| **Settings**     | `/api/settings`         | Société, utilisateurs, audit log                         |

---

## Installation

Trois modes au choix selon votre infrastructure.

### A) Linux / VPS (Ubuntu 22.04+)

Installation automatique : Node, PostgreSQL, service systemd, nginx en reverse-proxy.

```bash
sudo bash install-vps.sh
```

Personnalisation :
```bash
sudo APP_DIR=/srv/stokva PORT=8000 bash install-vps.sh
```

### B) Windows (poste serveur)

**Aucun prérequis manuel** — l'installer détecte et installe automatiquement Node.js, PostgreSQL et NSSM si absents.

```cmd
install-windows.bat
```

L'installer (le `.bat` lance le `.ps1` plus robuste) :

1. Demande l'élévation UAC si nécessaire
2. Détecte ou installe Node.js 20 LTS (via `winget` si dispo, sinon MSI direct depuis nodejs.org)
3. Détecte ou installe PostgreSQL 16 (via `winget` ou EnterpriseDB installer)
4. Génère un mot de passe aléatoire pour le superuser PostgreSQL (affiché à l'écran, à conserver pour pgAdmin)
5. Crée la base `stokva` + utilisateur applicatif + permissions
6. Génère `.env` avec mots de passe + JWT secret aléatoires
7. `npm install`, applique les migrations, seed les données initiales
8. Installe NSSM si absent et crée le service Windows `STOKVA` (démarrage automatique)
9. Ouvre Swagger UI dans le navigateur

**Durée** : 5-10 min selon connexion (~300 Mo téléchargés si Node.js + PostgreSQL absents).

**Options PowerShell** (avancé) :
```powershell
.\install-windows.ps1 -Port 8000 -DbName mydb -DbUser myuser -SkipServiceInstall
```

**Si l'installation auto échoue** (rare) : suivre les liens manuels :
- Node.js 20+ : https://nodejs.org
- PostgreSQL 16 : https://www.postgresql.org/download/windows/

### C) Docker (recommandé pour test/dev)

```bash
bash install-docker.sh
```

Démarre 3 conteneurs : `stokva-db` (Postgres 16), `stokva-backend` (Node), `stokva-frontend` (nginx servant l'UI + reverse-proxy `/api` et `/ws`).

Accès :
- Frontend : http://localhost:8080
- Backend : http://localhost:3000
- Swagger : http://localhost:3000/api/docs

---

## Configuration

Toutes les variables sont dans `.env` (généré automatiquement par les scripts d'install). Voir `.env.example` pour la liste complète.

Les plus importantes :

| Variable              | Défaut          | Description                              |
|-----------------------|-----------------|------------------------------------------|
| `PORT`                | `3000`          | Port HTTP                                |
| `DB_HOST`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` | – | Connexion Postgres            |
| `JWT_SECRET`          | (généré)        | Secret de signature JWT (long, aléatoire)|
| `JWT_EXPIRES_IN`      | `12h`           | Durée access token                       |
| `JWT_REFRESH_EXPIRES_IN` | `7d`         | Durée refresh token                      |
| `CORS_ORIGIN`         | `*`             | Liste d'origines autorisées (séparées `,`)|
| `WEIGHBRIDGE_ENABLED` | `false`         | Active la lecture port série             |
| `WEIGHBRIDGE_PORT`    | `COM3`/`/dev/ttyUSB0` | Port série du pont-bascule         |
| `WEIGHBRIDGE_BAUDRATE`| `9600`          | Vitesse de transmission                  |

---

## API REST

Documentation interactive : **http://localhost:3000/api/docs** (Swagger UI).

### Authentification

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
# => { accessToken, refreshToken, user: {...} }

# Toutes les autres requêtes :
curl http://localhost:3000/api/articles \
  -H "Authorization: Bearer <accessToken>"
```

### Workflow d'un document

```bash
# Créer une réception en brouillon
POST /api/receptions
{
  "depot_id": 1, "partner_id": 2, "plate": "12345-A-1",
  "lines": [{ "article_id": 5, "quantity": 25.5, "unit_price": 100 }]
}
# => { id: 42, number: "BR/2026/00042", state: "draft", ... }

# Confirmer (impacte le stock)
POST /api/receptions/42/confirm

# Annuler (réversible si déjà confirmé)
POST /api/receptions/42/cancel
```

Les expéditions et transferts suivent le même pattern, avec contrôle de disponibilité avant décrémentation.

### Rôles (RBAC)

| Rôle           | Lecture | Création | Confirmation | Annulation | Suppression | Admin |
|----------------|---------|----------|--------------|------------|-------------|-------|
| `consultation` | ✅      | ❌        | ❌           | ❌          | ❌           | ❌    |
| `operateur`    | ✅      | ✅ (docs) | ✅ (docs)    | ❌          | ❌           | ❌    |
| `responsable`  | ✅      | ✅        | ✅           | ✅          | ❌           | ❌    |
| `admin`        | ✅      | ✅        | ✅           | ✅          | ✅           | ✅    |

---

## WebSocket

Connexion :
```javascript
const ws = new WebSocket(`ws://localhost:3000/ws?token=${accessToken}`);
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  console.log(msg.type, msg.payload);
};
```

Événements diffusés :

| Événement              | Déclencheur                          |
|------------------------|--------------------------------------|
| `presence`             | Connexion/déconnexion utilisateur    |
| `reception.created`    | Nouvelle réception                   |
| `reception.confirmed`  | Réception confirmée → stock mis à jour |
| `expedition.confirmed` | Expédition confirmée                 |
| `transfer.in_transit`  | Transfert envoyé                     |
| `transfer.received`    | Transfert reçu (potentiellement partiel) |
| `weighing.first_pass`  | Première pesée                       |
| `weighing.done`        | Pesée terminée                       |
| `weighbridge.live`     | Lecture continue de la balance (≈ 2 Hz) |

---

## Pont-bascule

Trois modes de pesée supportés (champ `mode` sur la table `weighings`) :

- **`simulation`** : génère des poids aléatoires pour tester l'UI sans matériel
- **`manuel`** : opérateur saisit le poids
- **`serial`** : lecture automatique depuis le port série

### Activation port série

Dans `.env` :
```ini
WEIGHBRIDGE_ENABLED=true
WEIGHBRIDGE_PORT=/dev/ttyUSB0   # ou COM3 sous Windows
WEIGHBRIDGE_BAUDRATE=9600
WEIGHBRIDGE_PARITY=none
WEIGHBRIDGE_DATABITS=8
WEIGHBRIDGE_STOPBITS=1
```

Le service tente l'ouverture au démarrage et reconnecte automatiquement toutes les 5 secondes en cas de coupure.

### Format des trames

Le parser accepte les formats les plus courants :
- Toledo continuous : `STX <weight> <unit> <status> CR LF`
- Mettler MT-SICS : `<weight>\r\n`
- Générique : digits + décimal + `kg`/`T`/`g`

Conversion automatique en kilogrammes.

### Endpoint live

```bash
GET /api/weighbridge/live
# => { weight: 12450, connected: true, port: "COM3", lastReadAt: "...", stale: false }
```

Les lectures sont aussi diffusées en temps réel via WebSocket sur l'événement `weighbridge.live`.

### Workflow 2 passes

```bash
# 1) Camion plein arrive → poids brut
POST /api/weighbridge/weighings
{ "vehicle_id": 7, "gross_weight": 24500, "mode": "serial", "operation_type": "reception" }
# => { id: 88, number: "PB/2026/00088", state: "first_pass" }

# 2) Camion repart vide → tare → net auto-calculé
POST /api/weighbridge/weighings/88/second-pass
{ "tare_weight": 9200 }
# => { state: "done", net_weight: 15300 }
```

---

## Migration depuis localStorage

Si vous avez une instance v1 (localStorage `stokva_db_v1`) à migrer :

1. **Côté ancienne app** — exporter les données :
   ```javascript
   const data = localStorage.getItem('stokva_db_v1');
   console.log(data); // copier
   ```
2. **Importer dans Postgres** — un script `scripts/import-v1.js` peut être ajouté pour parser ce JSON et insérer dans les tables. Demandez-le si nécessaire.
3. **Migrer le frontend** — remplacer les `<script src="js/storage.js">` par :
   ```html
   <script src="js/api-client.js"></script>
   <script src="js/storage-shim.js"></script>
   <script src="js/auth.js"></script>
   ```
   Le shim expose un `DB` compatible (mais asynchrone : préfixer les appels par `await`).

Les fichiers de pont sont fournis dans `frontend-bridge/`.

---

## Sécurité

- **Mot de passe par défaut** : `admin / admin` — **à changer immédiatement** après première connexion
- **JWT secret** : généré aléatoirement par les scripts d'install (32 octets hex). Ne jamais le committer
- **Rate limiting** : 30 tentatives de login par 15 min par IP
- **Audit log** : toutes les actions sensibles (création, confirmation, annulation, login) sont enregistrées dans `audit_log` avec user/IP/timestamp
- **Helmet + CORS** : activés
- **HTTPS** : à configurer au niveau du reverse-proxy (nginx/Caddy/Traefik) en production

### Conformité Maroc

- Champs ICE / RC / IF / CNSS / Patente sur la société et les partenaires
- Devise par défaut : MAD (modifiable)
- Registre G0 conforme à la norme **EN 07-O04** (réceptions + expéditions confirmées avec ICE)
- Numérotation séquentielle annuelle : `BR/2026/00001`, `BL/2026/00001`, etc.

---

## Paramétrage modulaire

STOKVA est totalement paramétrable via un moteur à 3 niveaux avec **fallback automatique Article > Dépôt > Société**. Tout comportement métier non-trivial est configurable en live, sans redéploiement.

### Architecture

```
Article (le plus spécifique)  ──► gagne si défini
                                 │
                                 ▼
Dépôt                       ──► sinon, gagne si défini
                                 │
                                 ▼
Société (défaut global)     ──► sinon, valeur globale
```

Chaque paramètre est stocké en JSONB dans la table `settings` avec un triplet `(scope, scope_id, key)`. La fonction PostgreSQL `get_setting(key, depot_id, article_id, default)` résout la cascade en une seule requête.

### Endpoints de configuration

| Méthode | Route                                                          | Rôle                              |
|---------|----------------------------------------------------------------|-----------------------------------|
| GET     | `/api/config/settings`                                         | Liste tous les paramètres + leur scope label |
| GET     | `/api/config/settings/effective?key=X&depot_id=Y&article_id=Z` | Valeur effective après cascade     |
| GET     | `/api/config/settings/effective-all?depot_id=Y&article_id=Z`   | Vue d'ensemble pour UI (avec source) |
| GET     | `/api/config/settings/:scope/:scopeId?`                        | Liste pour un scope donné         |
| PUT     | `/api/config/settings/:scope/:scopeId?`                        | Crée / met à jour un override     |
| DELETE  | `/api/config/settings/:scope/:scopeId/:key`                    | Supprime l'override (revient au parent) |
| GET     | `/api/config/custom-fields?entity=reception`                   | Définitions des champs personnalisés |
| POST    | `/api/config/custom-fields`                                    | Crée un champ perso               |
| PUT     | `/api/config/custom-fields/:id`                                | Modifie une définition            |
| DELETE  | `/api/config/custom-fields/:id`                                | Supprime un champ perso           |

### Catalogue des paramètres

#### Stock

| Clé                           | Type    | Défaut | Description                                                            |
|-------------------------------|---------|--------|------------------------------------------------------------------------|
| `stock.allow_negative`        | boolean | false  | Autoriser le stock négatif (par dépôt ou par article via override)     |
| `stock.warn_below_min`        | boolean | true   | Émettre une alerte WS quand un article descend sous son stock minimum  |
| `stock.block_on_low`          | boolean | false  | Bloquer les expéditions si le stock résultant passerait sous le min    |

Note : les colonnes `articles.allow_negative_stock` et `depots.allow_negative_stock` (NULL par défaut) prennent **priorité absolue** sur les settings si non NULL — utile pour figer un comportement directement dans la fiche article/dépôt.

#### Pesées

| Clé                            | Type     | Défaut                                   | Description                                                    |
|--------------------------------|----------|------------------------------------------|----------------------------------------------------------------|
| `weighing.modes_enabled`       | string[] | `["simple","manuel","tare_enregistree","2_passes"]` | Modes activés. Les modes hors liste sont rejetés HTTP 400 |
| `weighing.default_mode`        | string   | `"2_passes"`                             | Mode proposé par défaut à l'opérateur                         |
| `weighing.min_weight`          | number   | 0                                        | Poids minimum accepté (kg)                                     |
| `weighing.max_weight`          | number   | 60000                                    | Poids maximum accepté (kg)                                     |
| `weighing.tare_tolerance_pct`  | number   | 5                                        | Tolérance entre tare mesurée et tare véhicule (%). Au-delà = warning |
| `weighing.require_vehicle`     | boolean  | true                                     | Véhicule (id ou plaque) obligatoire                            |
| `weighing.require_driver`      | boolean  | false                                    | Chauffeur obligatoire                                          |
| `weighing.require_partner`     | boolean  | false                                    | Partenaire obligatoire                                         |
| `weighing.stable_seconds`      | number   | 3                                        | Durée de stabilité requise avant validation auto               |

**Quatre modes de pesage** distincts (chacun avec son endpoint dédié) :
- `POST /api/weighbridge/weighings/simple` → mode **simple**, pesage libre, tare=0
- `POST /api/weighbridge/weighings/single` → mode **manuel**, brut + tare en un appel
- `POST /api/weighbridge/weighings/with-vehicle-tare` → mode **tare_enregistree**, utilise la tare du véhicule
- `POST /api/weighbridge/weighings` puis `/:id/second-pass` → mode **2_passes** classique

#### Réceptions

| Clé                              | Type    | Défaut | Description                                                |
|----------------------------------|---------|--------|------------------------------------------------------------|
| `reception.require_weighing`     | boolean | false  | Une pesée pont-bascule est obligatoire pour confirmer      |
| `reception.auto_confirm`         | boolean | false  | Confirme automatiquement à la création (impact stock direct) |
| `reception.require_unit_price`   | boolean | false  | Prix unitaire obligatoire sur chaque ligne                 |
| `reception.allow_overweight`     | boolean | true   | Accepter qty > celle annoncée par le bon fournisseur       |

#### Expéditions

| Clé                                | Type    | Défaut | Description                                                |
|------------------------------------|---------|--------|------------------------------------------------------------|
| `expedition.require_weighing`      | boolean | false  | Pesée pont-bascule obligatoire pour confirmer              |
| `expedition.require_destination`   | boolean | true   | La destination est obligatoire                             |
| `expedition.require_unit_price`    | boolean | true   | Prix unitaire obligatoire sur chaque ligne                 |
| `expedition.partial_allowed`       | boolean | true   | Autoriser des expéditions partielles                       |

#### Transferts

| Clé                                  | Type    | Défaut | Description                                                |
|--------------------------------------|---------|--------|------------------------------------------------------------|
| `transfer.require_weighing`          | boolean | false  | Pesée obligatoire pour les transferts inter-dépôts         |
| `transfer.partial_receive_allowed`   | boolean | true   | Autoriser réception partielle (qty_received < qty_sent)    |
| `transfer.tolerate_loss_pct`         | number  | 2      | Différence tolérée envoi/réception (%). Au-delà = warning  |

#### Numérotation

| Clé                       | Type    | Défaut | Description                                       |
|---------------------------|---------|--------|---------------------------------------------------|
| `numbering.reset_yearly`  | boolean | true   | Réinitialiser les compteurs au 1er janvier        |
| `numbering.padding`       | number  | 5      | Nombre de chiffres dans la séquence (PB/2026/00001) |

### Champs personnalisés

Les entités `reception`, `expedition`, `transfer`, `weighing`, `partner`, `article`, `vehicle` peuvent recevoir des champs personnalisés (table `custom_fields`). Les valeurs sont stockées dans la colonne JSONB `custom_data`.

**Types supportés** : `text`, `number`, `date`, `datetime`, `boolean`, `select`, `multiselect`.

**Validation par champ** :
- `required` (statique) ou `required_when` (conditionnel selon contexte JSON, ex: `{"depot_id": 1}`)
- `min_value` / `max_value` pour les nombres
- `min_length` / `max_length` / `pattern` (regex) pour les chaînes
- `options` (liste) pour `select` / `multiselect`
- `default_value` pour pré-remplir
- `display_order` pour ordonner dans l'UI

**Exemple** : ajouter un champ "numéro de plaque remorque" obligatoire au format marocain :

```bash
curl -X POST /api/config/custom-fields -H "Authorization: Bearer $TOKEN" -d '{
  "entity": "reception",
  "code": "plaque_remorque",
  "label": "Plaque remorque",
  "field_type": "text",
  "required": true,
  "pattern": "^[0-9]+-[A-Z]+-[0-9]+$",
  "min_length": 7,
  "max_length": 15,
  "help_text": "Format marocain : 12345-A-1"
}'
```

À partir de cet instant, toute création de réception sans `custom_data.plaque_remorque` (ou avec un format invalide) est rejetée avec HTTP 400 et un détail précis pointant le champ fautif.

### Champs perso fournis par défaut (seed)

| Entité      | Code              | Type    | Description                       |
|-------------|-------------------|---------|-----------------------------------|
| reception   | numero_lot        | text    | Numéro de lot fournisseur         |
| reception   | temperature       | number  | Température produit (°C)          |
| reception   | controle_qualite  | boolean | Contrôle qualité OK               |
| expedition  | reference_client  | text    | Référence client / BC / SAP       |
| expedition  | urgence           | select  | normale / urgent / critique       |

### Page UI de paramétrage

Une page `config.html` est fournie dans `frontend-bridge/`. Elle permet à l'admin de :
- Choisir un dépôt et/ou un article comme contexte
- Voir tous les paramètres avec leur valeur effective et leur **source** (badge couleur : société/dépôt/article)
- Modifier un paramètre à n'importe quel niveau
- Réinitialiser un override (revenir au niveau parent)
- Réception en temps réel via WebSocket des modifications faites par d'autres admins



L'ensemble du backend a été testé en conditions réelles avant livraison. Tableau des contrôles passés :

| Test                                                              | Résultat |
|-------------------------------------------------------------------|----------|
| Migrations PostgreSQL 001 + 002 + 003 sur base vierge             | ✅       |
| Seed (société, admin, dépôt, article, partenaire de démo)         | ✅       |
| Login `admin/admin` → JWT access + refresh                        | ✅       |
| `/me` avec Bearer token                                           | ✅       |
| CRUD partenaires / articles / dépôts                              | ✅       |
| Création réception → confirmation → impact stock (+125.5 T)       | ✅       |
| Création expédition → contrôle dispo → décrémentation             | ✅       |
| Expédition rejetée si stock insuffisant (HTTP 409 + détails)      | ✅       |
| Transfert inter-dépôts : draft → in_transit → received            | ✅       |
| Pesée pont-bascule 1 passe + 2 passes (net auto = brut - tare)    | ✅       |
| Simulateur balance diffuse les poids (~ 2 Hz)                     | ✅       |
| Registre G0 mensuel (1 ligne par document, articles agrégés)      | ✅       |
| Export Excel G0 (`.xlsx` 7 KB validé)                             | ✅       |
| Export PDF G0 (`.pdf` 1.7 KB validé)                              | ✅       |
| Stats par partenaire / article / dépôt / véhicule                 | ✅       |
| Dashboard KPIs (réceptions/expéditions/transferts/alertes/total)  | ✅       |
| WebSocket : auth JWT, broadcast `reception.created`, `weighbridge.live` | ✅ |
| RBAC : utilisateur `consultation` rejeté en écriture (HTTP 403)   | ✅       |
| Audit log : login/création/confirmation/annulation tracées        | ✅       |
| Refresh token + invalidation au logout                            | ✅       |
| Annulation réception bloquée si stock insuffisant (anti-négatif)  | ✅       |

### Bugs corrigés en cours de validation

- `RETURNING ${HEAD_FIELDS}` avec alias de table dans INSERT/UPDATE → ajout d'une variante `_RAW` sans préfixe
- Routes `/alerts/low-stock` et `/drivers/list` masquées par `/:id` → réordonnées avant les routes paramétriques
- ORDER BY sur alias d'agrégat dans le SQL stats → réécrit avec CTE `grouped`
- Vue `v_register_g0` produisait N lignes par document → migration 002 (1 ligne par doc, articles agrégés)
- Articles dupliqués si même article sur plusieurs lignes → migration 003 avec `string_agg(DISTINCT ...)`
- `checkAvailable` lançait une erreur générique → conversion en `ConflictError` propre
- `reset-db.js` ne pouvait pas dropper le schéma sans superuser → support `PG_SUPERUSER` env var
- Annulation de réception pouvait créer un stock négatif → garde-fou pré-reverse

---

## Support

Pour toute question, anomalie ou demande d'évolution :

**NETPROCESS** — Développement & intégration sur mesure

---

© 2026 NETPROCESS — Licence MIT
