# 🎨 STOKVA — Charte graphique

Identité visuelle complète de l'application **STOKVA**, éditée par **NETPROCESS**.

---

## 📛 Identité

| Élément | Valeur |
|---------|--------|
| **Nom de l'application** | STOKVA |
| **Tagline** | Depot Management |
| **Éditeur** | NETPROCESS |
| **Version** | 1.0.0 |
| **Étymologie** | *Stock + Va* — l'inventaire en mouvement |

### Règles d'écriture
- ✅ **STOKVA** (toutes capitales) — usage principal
- ✅ Stokva — usage courant dans le texte
- ❌ ~~stokva~~ ou ~~StoKVa~~ — à éviter

---

## 🎨 Palette de couleurs

### Couleurs primaires

| Rôle | Nom | Hex | Usage |
|------|-----|-----|-------|
| **Primary** | Indigo profond | `#312E81` | Couleur principale, headers, navigation |
| **Accent** | Cyan électrique | `#06B6D4` | Boutons d'action, liens, highlights |
| **Secondary** | Violet vibrant | `#6366F1` | Éléments secondaires, hover states |

### Échelle neutre

```
#0F172A  Slate 900   - Texte primaire fond clair
#1E293B  Slate 800   - Texte primaire (alt)
#475569  Slate 600   - Texte secondaire
#94A3B8  Slate 400   - Texte tertiaire / placeholders
#CBD5E1  Slate 300   - Bordures fortes
#E2E8F0  Slate 200   - Bordures légères
#F8FAFC  Slate 50    - Fonds alternatifs
```

### Couleurs sémantiques

| Rôle | Couleur | Hex | Application |
|------|---------|-----|-------------|
| 🟢 **Succès** | Emerald | `#10B981` | Entrées de stock, validations |
| 🟠 **Alerte** | Amber | `#F59E0B` | Stocks bas, warnings |
| 🔴 **Danger** | Red | `#EF4444` | Sorties, erreurs, suppressions |
| 🟣 **Info** | Violet | `#8B5CF6` | Pesées, informations |

---

## 🔤 Typographie

### Police principale : **Outfit**
Sans-serif moderne, géométrique, lisible. Utilisée pour tous les titres et l'interface.

```css
font-family: 'Outfit', system-ui, -apple-system, sans-serif;
```

**Graisses utilisées** : 400 (Regular), 500 (Medium), 700 (Bold), 800 (Extra Bold)

### Police monospace : **JetBrains Mono**
Pour les numéros de bons, codes, matricules, valeurs numériques techniques.

```css
font-family: 'JetBrains Mono', 'Courier New', monospace;
```

### Échelle typographique

| Usage | Taille | Poids |
|-------|--------|-------|
| Display (hero) | 48-68px | 800 |
| H1 | 28-32px | 800 |
| H2 | 22-24px | 700 |
| H3 | 18px | 600 |
| Body | 14px | 400 |
| Caption | 12px | 500 |
| Label | 11px | 600 |

---

## 🎯 Logo

Le logo combine un **cube isométrique** (qui évoque le conteneur, le dépôt et le flux 3D) avec le **wordmark STOKVA** en typographie Outfit Extra Bold.

### Variantes disponibles

| Fichier | Usage recommandé |
|---------|------------------|
| `logos/stokva-logo-full.svg` | Page de connexion, hero, présentation, documents |
| `logos/stokva-logo-horizontal.svg` | Header de l'application (mode clair) |
| `logos/stokva-logo-horizontal-dark.svg` | Header de l'application (mode sombre) |
| `icons/favicon.svg` | Favicon, app icon, monogramme seul |

### Zone de protection

Maintenir **autour du logo une zone vide d'au moins la hauteur du cube** (minimum 16px). Ne jamais placer de texte ou autre élément dans cette zone.

### À ne pas faire ❌

- ❌ Modifier les couleurs du logo
- ❌ Étirer, compresser, déformer
- ❌ Ajouter ombre, contour, effet de relief
- ❌ Utiliser sur fond chargé sans plaque de protection
- ❌ Reproduire sous une taille de 80px de large

---

## 🖼️ Assets fournis

```
assets/
├── icons/
│   ├── favicon.svg              - Source vectorielle
│   ├── favicon.ico              - Multi-résolution (16/32/48)
│   ├── favicon-16x16.png        - Onglet navigateur
│   ├── favicon-32x32.png        - Bookmark
│   ├── favicon-48x48.png        - Windows tile
│   ├── favicon-64x64.png        - Desktop shortcut
│   ├── favicon-96x96.png        - Android home
│   ├── favicon-128x128.png      - Chrome Web Store
│   ├── favicon-192x192.png      - PWA standard
│   ├── favicon-256x256.png      - Windows tile large
│   ├── favicon-512x512.png      - PWA splash
│   └── apple-touch-icon.png     - iOS home screen (180x180)
└── logos/
    ├── stokva-logo-full.svg
    ├── stokva-logo-full.png             (2x retina)
    ├── stokva-logo-horizontal.svg
    ├── stokva-logo-horizontal.png       (2x retina)
    ├── stokva-logo-horizontal-dark.svg
    └── stokva-logo-horizontal-dark.png  (2x retina)
```

---

## 💎 Inspiration

Le design s'inspire de :
- **Linear** — typographie et espacement
- **Vercel** — palette indigo et clarté visuelle
- **Stripe** — usage du gradient subtil
- **Notion** — ergonomie discrète

L'objectif : se démarquer des bleus corporate ennuyeux du secteur logistique tout en gardant une crédibilité professionnelle.

---

**© 2026 NETPROCESS — Tous droits réservés**
