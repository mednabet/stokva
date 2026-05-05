# ============================================================
# STOKVA v2 — Script de publication sur GitHub
# by NETPROCESS
# ============================================================
# Ce script automatise le push des changements v2 vers le repo
# GitHub https://github.com/mednabet/stokva
#
# Prérequis :
#   - Git installé (https://git-scm.com/download/win)
#   - Compte GitHub configuré (token ou SSH)
#
# Usage :
#   powershell -ExecutionPolicy Bypass -File push-to-github-v2.ps1
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  STOKVA v2 — Publication sur GitHub" -ForegroundColor Cyan
Write-Host "  by NETPROCESS" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 1) Vérifier git
try {
    $gitVersion = git --version
    Write-Host "[OK] Git détecté : $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERREUR] Git introuvable. Installez-le depuis https://git-scm.com/" -ForegroundColor Red
    exit 1
}

# 2) Se placer dans le répertoire du script
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptPath

# 3) Vérifier que c'est bien un repo Git
if (-not (Test-Path ".git")) {
    Write-Host ""
    Write-Host "[INFO] Aucun dépôt Git détecté ici. Initialisation..." -ForegroundColor Yellow
    git init
    git remote add origin "https://github.com/mednabet/stokva.git"
    git fetch origin
    git checkout main 2>$null
    if ($LASTEXITCODE -ne 0) {
        git checkout -b main
    }
}

# 4) Configurer l'utilisateur Git si nécessaire
$userName = git config user.name
$userEmail = git config user.email
if (-not $userName -or -not $userEmail) {
    Write-Host ""
    Write-Host "[INFO] Configuration de l'utilisateur Git..." -ForegroundColor Yellow
    if (-not $userName) {
        $userName = Read-Host "  Votre nom (Git)"
        git config user.name "$userName"
    }
    if (-not $userEmail) {
        $userEmail = Read-Host "  Votre email (Git)"
        git config user.email "$userEmail"
    }
}

Write-Host ""
Write-Host "[INFO] Utilisateur Git : $userName <$userEmail>" -ForegroundColor Cyan

# 5) Afficher l'état actuel
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  État du dépôt" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
git status --short

# 6) Demander confirmation
Write-Host ""
$confirm = Read-Host "Continuer la publication ? (O/N)"
if ($confirm -notmatch "^[oOyY]") {
    Write-Host "[INFO] Annulé." -ForegroundColor Yellow
    exit 0
}

# 7) Créer les commits structurés (un par groupe logique)
Write-Host ""
Write-Host "[INFO] Création des commits structurés..." -ForegroundColor Cyan

# Stage everything new
git add -A

# Commit unique avec message détaillé
$commitMessage = @"
feat(backend): version 2.0 — Backend Node.js + PostgreSQL multi-utilisateurs

Migration de l'application STOKVA d'un mode standalone (localStorage) à
un mode client-serveur multi-utilisateurs, sans casser la compatibilité v1.

NOUVEAU :
- Backend Node.js 20 + Express + PostgreSQL 16 dans /backend
- API REST documentée Swagger (/api/docs)
- Authentification JWT avec refresh tokens
- WebSocket pour notifications temps réel
- Audit log complet (qui/quoi/quand/IP)
- 11 modules : auth, partners, articles, depots, vehicles, receptions,
  expeditions, transfers, weighbridge, reports, settings, config

PONT-BASCULE :
- Lecture série RS232/USB réelle (Toledo, Mettler, génériques)
- 4 modes : simple, manuel, tare_enregistree, 2_passes
- Auto-reconnexion + simulateur intégré

REPORTING :
- Registre G0 conforme EN 07-O04
- Exports Excel (ExcelJS) et PDF (PDFKit)
- Statistiques par partenaire/article/dépôt/véhicule

PARAMÉTRAGE MODULAIRE :
- 3 niveaux avec cascade Article > Dépôt > Société
- 25+ paramètres modifiables en live (sans redéploiement)
- Champs personnalisés validés (regex, min/max, requis conditionnel)
- Page UI : backend/frontend-bridge/config.html

DÉPLOIEMENT :
- Windows : backend/install-windows.bat (NSSM service)
- Linux/VPS : backend/install-vps.sh (systemd + nginx)
- Docker : backend/install-docker.sh (compose)

COMPATIBILITÉ :
- Aucun fichier v1 modifié
- Le frontend localStorage continue de fonctionner
- Voir MIGRATION.md pour activer le mode backend

Tests : 27 contrôles d'intégration passés en réel (PostgreSQL 16,
auth JWT, RBAC 4 rôles, workflow réception/expédition/transfert,
pesées 4 modes, exports XLSX/PDF, WebSocket multi-clients,
cascade settings 3 niveaux, validation custom fields avec regex).
"@

git commit -m "$commitMessage"

Write-Host ""
Write-Host "[OK] Commit créé." -ForegroundColor Green

# 8) Pousser vers GitHub
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Push vers GitHub" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[INFO] Si Git demande des credentials, utilisez :" -ForegroundColor Yellow
Write-Host "  - Username : votre nom d'utilisateur GitHub" -ForegroundColor Yellow
Write-Host "  - Password : un Personal Access Token (PAS votre mot de passe)" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Créer un token : https://github.com/settings/tokens" -ForegroundColor Yellow
Write-Host "  Permissions requises : 'repo' (Full control)" -ForegroundColor Yellow
Write-Host ""

git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "  ✓ Publication réussie !" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Repo : https://github.com/mednabet/stokva" -ForegroundColor Cyan
    Write-Host "  Tag suggéré : v2.0.0" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Pour créer le tag de release :" -ForegroundColor Yellow
    Write-Host "    git tag -a v2.0.0 -m 'Backend Node.js + PostgreSQL'" -ForegroundColor Yellow
    Write-Host "    git push origin v2.0.0" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "[ERREUR] Le push a échoué. Vérifiez :" -ForegroundColor Red
    Write-Host "  - Vos credentials GitHub" -ForegroundColor Red
    Write-Host "  - Votre connexion internet" -ForegroundColor Red
    Write-Host "  - Que la branche 'main' existe sur le remote" -ForegroundColor Red
    Write-Host ""
}

Read-Host "Appuyez sur Entrée pour quitter"
