@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title STOKVA - Push GitHub
color 0B

:: =========================================
::  STOKVA - Push automatique vers GitHub
::  by NETPROCESS
:: =========================================

echo.
echo  ============================================================
echo            STOKVA - Push automatique vers GitHub
echo  ============================================================
echo.

:: -------- Verification Git --------
where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [ERREUR] Git n'est pas installe.
    echo.
    echo  Telechargez Git pour Windows :
    echo  https://git-scm.com/download/win
    echo.
    echo  Pendant l'installation, choisissez :
    echo    - "Git from the command line and also from 3rd-party software"
    echo    - "Use Windows default console window"
    echo.
    pause
    exit /b 1
)
echo  [OK] Git detecte
git --version
echo.

:: -------- Demande des informations --------
echo  ----------------------------------------------------------
echo   ETAPE 1 : Vos informations GitHub
echo  ----------------------------------------------------------
echo.

set /p "GH_USERNAME=Votre nom d'utilisateur GitHub : "
if "%GH_USERNAME%"=="" (
    echo  [ERREUR] Nom d'utilisateur requis.
    pause
    exit /b 1
)

set /p "REPO_NAME=Nom du depot (defaut : stokva) : "
if "%REPO_NAME%"=="" set "REPO_NAME=stokva"

set /p "GH_EMAIL=Votre email GitHub : "
if "%GH_EMAIL%"=="" (
    echo  [ERREUR] Email requis pour les commits.
    pause
    exit /b 1
)

echo.
echo  ----------------------------------------------------------
echo   RECAPITULATIF
echo  ----------------------------------------------------------
echo   Utilisateur GitHub : %GH_USERNAME%
echo   Email             : %GH_EMAIL%
echo   Nom du depot      : %REPO_NAME%
echo   URL finale        : https://github.com/%GH_USERNAME%/%REPO_NAME%
echo  ----------------------------------------------------------
echo.

choice /C ON /M "Continuer"
if errorlevel 2 exit /b 0

echo.
echo  ----------------------------------------------------------
echo   ETAPE 2 : Creer le depot sur GitHub.com
echo  ----------------------------------------------------------
echo.
echo   AVANT DE CONTINUER, creez le depot manuellement :
echo.
echo     1. Ouvrez : https://github.com/new
echo     2. Repository name : %REPO_NAME%
echo     3. NE COCHEZ AUCUNE OPTION (pas de README, pas de .gitignore)
echo     4. Cliquez sur "Create repository"
echo.
echo   Le navigateur va s'ouvrir maintenant...
echo.
timeout /t 3 >nul
start "" "https://github.com/new"
echo.
echo   Une fois le depot cree sur GitHub, revenez ici.
echo.
pause
echo.

:: -------- Etape 3 : Init du dépôt local --------
echo  ----------------------------------------------------------
echo   ETAPE 3 : Initialisation du depot local
echo  ----------------------------------------------------------
echo.

cd /d "%~dp0"

if exist ".git" (
    echo  [INFO] Dossier .git deja present.
    choice /C ON /M "Reinitialiser (ecrasera l'historique local)"
    if errorlevel 2 (
        echo  Conservation du depot existant.
    ) else (
        rmdir /s /q .git
        echo  [OK] Ancien depot supprime.
    )
)

if not exist ".git" (
    git init
    echo  [OK] Depot initialise
)

git config user.name "%GH_USERNAME%"
git config user.email "%GH_EMAIL%"
echo  [OK] Identite git configuree
echo.

:: -------- Etape 4 : Add + Commit --------
echo  ----------------------------------------------------------
echo   ETAPE 4 : Ajout et commit des fichiers
echo  ----------------------------------------------------------
echo.

git add .
echo  [OK] Fichiers ajoutes
echo.

git commit -m "Initial commit - STOKVA v1.0.0"
if %ERRORLEVEL% NEQ 0 (
    echo  [INFO] Commit deja existant ou aucun changement.
)
echo.

git branch -M main
echo  [OK] Branche principale : main
echo.

:: -------- Etape 5 : Configuration remote --------
echo  ----------------------------------------------------------
echo   ETAPE 5 : Connexion au depot distant GitHub
echo  ----------------------------------------------------------
echo.

git remote remove origin >nul 2>&1
git remote add origin https://github.com/%GH_USERNAME%/%REPO_NAME%.git
echo  [OK] Remote configure : https://github.com/%GH_USERNAME%/%REPO_NAME%.git
echo.

:: -------- Etape 6 : Push --------
echo  ----------------------------------------------------------
echo   ETAPE 6 : Authentification et push
echo  ----------------------------------------------------------
echo.
echo   Git va demander vos identifiants :
echo.
echo     - Username : %GH_USERNAME%
echo     - Password : VOTRE PERSONAL ACCESS TOKEN (PAS votre mot de passe!)
echo.
echo   Si vous n'avez pas de token, creez-en un :
echo     1. https://github.com/settings/tokens
echo     2. Generate new token (classic)
echo     3. Cochez la case "repo"
echo     4. Generate token
echo     5. COPIEZ le token (commence par ghp_...)
echo.

choice /C ON /M "Pret a continuer"
if errorlevel 2 (
    echo.
    echo  Push annule. Vous pouvez relancer ce script plus tard.
    echo  Ou executez manuellement : git push -u origin main
    pause
    exit /b 0
)

echo.
echo  Push en cours...
echo.
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo  ============================================================
    echo            SUCCES ! STOKVA est maintenant sur GitHub
    echo  ============================================================
    echo.
    echo  Voir le depot : https://github.com/%GH_USERNAME%/%REPO_NAME%
    echo.
    echo  Prochaines etapes :
    echo    1. Ouvrir le depot dans le navigateur
    echo    2. Aller dans "Releases" (a droite)
    echo    3. Create a new release : v1.0.0
    echo    4. (Optionnel) Settings - Pages : activer GitHub Pages
    echo.
    
    choice /C ON /M "Ouvrir le depot dans le navigateur"
    if errorlevel 1 if not errorlevel 2 (
        start "" "https://github.com/%GH_USERNAME%/%REPO_NAME%"
    )
) else (
    echo.
    echo  ============================================================
    echo            ECHEC DU PUSH
    echo  ============================================================
    echo.
    echo  Causes possibles :
    echo    - Le depot %REPO_NAME% n'existe pas sur votre compte GitHub
    echo    - Mauvais token (verifiez les permissions "repo")
    echo    - Probleme reseau
    echo.
    echo  Pour relancer : git push -u origin main
    echo.
)

echo.
pause
exit /b 0
