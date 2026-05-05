# 📤 Comment publier STOKVA sur GitHub

Ce guide vous montre comment mettre **STOKVA** (l'application développée par NETPROCESS) sur GitHub en quelques minutes.

---

## 🎯 Méthode 1 — Via l'interface web (le plus simple)

### Étape 1 : Créer un compte GitHub
- Allez sur **https://github.com**
- Cliquez sur **Sign up**

### Étape 2 : Créer un nouveau dépôt
1. Cliquez sur le **+** en haut à droite → **New repository**
2. Remplissez :
   - **Repository name** : `stokva` (ou `netprocess-stokva` si vous préférez)
   - **Description** : "STOKVA — Gestion des Dépôts de Stockage. Application web standalone par NETPROCESS"
   - Choisissez **Public** ou **Private**
   - ⚠️ **Ne cochez PAS** "Add a README file" (on a déjà le nôtre)
3. Cliquez sur **Create repository**

### Étape 3 : Uploader les fichiers
1. Sur la page du nouveau dépôt, cliquez sur **uploading an existing file**
2. **Glissez-déposez** tous les fichiers et dossiers depuis ce projet
3. En bas, message : `Initial commit - STOKVA v1.0.0`
4. Cliquez sur **Commit changes**

✅ **C'est fait !**

---

## 💻 Méthode 2 — Via Git en ligne de commande

### Prérequis
Git pour Windows : https://git-scm.com/download/win

### Étape 1 : Créer le dépôt sur GitHub
Sans uploader de fichiers. Notez l'URL.

### Étape 2 : Initialiser Git localement
```powershell
cd C:\chemin\vers\stokva

git init
git add .
git commit -m "Initial commit - STOKVA v1.0.0"
git branch -M main
git remote add origin https://github.com/mednabet/stokva.git
git push -u origin main
```

### Étape 3 : Authentification
Utilisez un **Personal Access Token** :
1. GitHub → Settings → Developer settings → Personal access tokens
2. Generate new token (classic) → cochez `repo` → Generate
3. Copiez le token et utilisez-le comme mot de passe

---

## 📦 Créer une "Release" téléchargeable

1. Page du dépôt → **Releases** (à droite)
2. **Create a new release**
3. Tag version : `v1.0.0`
4. Title : `STOKVA v1.0.0 — Première version stable`
5. Description :
   ```
   🎉 Première version stable de STOKVA, l'application de gestion des dépôts par NETPROCESS.

   ## Highlights
   - 11 modules complets (réceptions, expéditions, pont-bascule, stock, rapports...)
   - Charte graphique complète (indigo + cyan)
   - Installation Windows automatique
   - 100% local, RGPD-friendly
   - Conforme EN 07-O04

   ## Installation
   1. Téléchargez le ZIP ci-dessous
   2. Extrayez-le
   3. Double-cliquez sur `install-windows.bat`

   Identifiants par défaut : `admin` / `admin`
   ```
6. Cochez "Set as the latest release"
7. **Publish release**

---

## 🌐 Bonus : Activer GitHub Pages

Hébergez STOKVA gratuitement sur le web :

1. Settings du dépôt → **Pages**
2. Source : **GitHub Actions**
3. Le workflow `.github/workflows/deploy-pages.yml` se déclenche automatiquement
4. URL finale : `https://mednabet.github.io/stokva/`

> ⚠️ **Note de confidentialité** : avec GitHub Pages, l'application est publique mais les données utilisateur restent stockées dans le navigateur de chaque visiteur (localStorage). Aucune donnée n'est envoyée au serveur.

---

## 🔗 Personnaliser les liens

Modifiez `README.md` pour remplacer `mednabet` par votre vrai nom GitHub :

```bash
git clone https://github.com/mednabet/stokva.git
```

---

## ✅ Checklist finale

- [ ] Dépôt GitHub créé
- [ ] Tous les fichiers uploadés (incluant `assets/`, `static/`, `.github/`)
- [ ] README.md avec logo affiché correctement
- [ ] LICENSE bien visible
- [ ] Une release v1.0.0 publiée
- [ ] (Optionnel) GitHub Pages activé

---

🎉 **Bon partage !** STOKVA est désormais accessible au monde entier.

---

**STOKVA** est une marque de **NETPROCESS** © 2026
