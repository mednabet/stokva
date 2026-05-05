# Guide de migration : v1 (localStorage) → v2 (PostgreSQL)

> by **NETPROCESS** — Mai 2026

## Pourquoi cette migration ?

La version 1 de STOKVA stockait toutes les données dans `localStorage` (clé `stokva_db_v1`). Cela limitait l'application :

- **Mono-poste** : pas de partage entre utilisateurs
- **Mono-navigateur** : nettoyer le cache = tout perdre
- **Pas d'audit** : impossible de tracer qui a fait quoi
- **Pas de temps réel** : pas de notifications entre postes
- **Évolutivité limitée** : ajouter des règles métier = modifier le code

La version 2 ajoute un **backend Node.js + PostgreSQL** qui transforme STOKVA en vraie solution multi-utilisateurs, tout en **gardant le frontend existant**.

## Ce qui change

### Coexistence des deux modes

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (à la racine du repo)                         │
│  index.html, js/, css/, assets/                         │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  CHOIX DU MODE                                          │
│                                                         │
│  Mode 1 (v1, défaut)  : js/storage.js → localStorage    │
│  Mode 2 (v2, nouveau) : js/api-client.js → API REST    │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
            (mode 2 uniquement)
┌─────────────────────────────────────────────────────────┐
│  Backend (sous-dossier /backend)                        │
│  Node.js + Express + PostgreSQL + WebSocket             │
└─────────────────────────────────────────────────────────┘
```

Vous pouvez utiliser le mode v1 (localStorage) tant que le backend n'est pas démarré. Le frontend continue de fonctionner exactement comme avant.

### Pour activer le mode v2 (backend)

1. **Installer le backend** : `cd backend && install-windows.bat`
2. **Modifier le frontend pour pointer vers l'API** : remplacer dans `index.html` (et chaque page concernée) :

```html
<!-- Mode v1 (actuel) -->
<script src="js/storage.js"></script>

<!-- Mode v2 (avec backend) -->
<script src="backend/frontend-bridge/js/api-client.js"></script>
<script src="backend/frontend-bridge/js/storage-shim.js"></script>
<script src="backend/frontend-bridge/js/auth.js"></script>
```

Le **shim de compatibilité** (`storage-shim.js`) expose un objet `DB` avec la même API que `js/storage.js`, mais qui appelle l'API REST en arrière-plan. Les pages existantes continuent de fonctionner — elles deviennent juste asynchrones (préfixer les appels par `await`).

## Nouvelles capacités

### Multi-utilisateurs temps réel

- 4 rôles : `admin`, `responsable`, `operateur`, `consultation`
- WebSocket pour notifications instantanées (réception confirmée par un collègue → vue mise à jour)
- Audit log complet (qui, quoi, quand, depuis quelle IP)

### Pont-bascule série réelle

- Lecture RS232/USB (Toledo, Mettler, génériques)
- 4 modes de pesage : `simple`, `manuel`, `tare_enregistree`, `2_passes`
- Simulateur intégré pour tester sans matériel

### Reporting

- Registre G0 conforme norme marocaine EN 07-O04
- Exports Excel et PDF
- Statistiques par partenaire / article / dépôt / véhicule

### Transferts inter-dépôts

- Workflow envoi → en transit → réception (partielle possible)
- Tolérance de perte paramétrable

### Moteur de paramétrage

- Cascade Article > Dépôt > Société (fallback automatique)
- Champs personnalisés validés (regex, min/max, requis conditionnel)
- 25+ paramètres par défaut, modifiables en live sans redéploiement

## Migration des données existantes (v1 → v2)

Si vous avez déjà saisi des données dans la version localStorage, vous pouvez les exporter et les importer dans la v2 :

### 1) Exporter depuis le navigateur

Ouvrez la console (F12) sur la page STOKVA v1 :

```javascript
copy(localStorage.getItem('stokva_db_v1'));
```

Collez le contenu dans un fichier `export-v1.json`.

### 2) Importer dans v2

Un script `backend/scripts/import-v1.js` peut être ajouté pour parser ce JSON et l'insérer dans PostgreSQL. Demandez-le si nécessaire — il n'est pas livré par défaut car la structure exacte de v1 dépend de votre usage.

À défaut, la migration peut se faire manuellement via l'API REST :
- POST sur `/api/partners`, `/api/articles`, `/api/depots`, `/api/vehicles` pour les référentiels
- POST sur `/api/receptions`, `/api/expeditions` pour les documents

## Compatibilité ascendante

- **Aucun fichier existant n'a été modifié** dans la v2. Tout est ajouté dans `/backend` ou en surcouche.
- Les **scripts Windows** (`install-windows.bat` à la racine, `start-server.bat`, etc.) continuent de fonctionner pour la v1.
- Le branding NETPROCESS, les logos, les icônes sont **conservés tels quels**.

## Désinstaller le backend

Si vous ne voulez plus utiliser le backend :

1. Arrêter le service : `Get-Service STOKVA | Stop-Service` (Windows) ou `sudo systemctl stop stokva` (Linux)
2. Supprimer la base : `dropdb stokva` (avec utilisateur PostgreSQL)
3. Supprimer le dossier `backend/`
4. Restaurer dans `index.html` les anciennes balises `<script src="js/storage.js">`

Le frontend continuera de fonctionner exactement comme avant la migration.

---

© 2026 NETPROCESS — Licence MIT
