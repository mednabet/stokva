@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title STOKVA v2 - Publication GitHub
color 0B

REM ============================================================
REM  STOKVA v2 - Script de publication sur GitHub
REM  by NETPROCESS
REM ============================================================

echo.
echo  ============================================================
echo    STOKVA v2 - Publication sur GitHub
echo    by NETPROCESS
echo  ============================================================
echo.

REM 1) Verifier git
where git >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo  [ERREUR] Git n'est pas installe ou pas dans le PATH.
    echo  Telechargez Git : https://git-scm.com/download/win
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('git --version') do echo  [OK] %%i
echo.

REM 2) Se placer dans le repertoire du script
cd /d "%~dp0"

REM 3) Initialiser le repo si necessaire
if not exist ".git" (
    echo  [INFO] Initialisation du depot Git...
    git init
    git remote add origin https://github.com/mednabet/stokva.git
    git fetch origin
    git checkout main 2>nul || git checkout -b main
    echo.
)

REM 4) Configurer l'utilisateur Git
for /f "tokens=*" %%i in ('git config user.name') do set USER_NAME=%%i
for /f "tokens=*" %%i in ('git config user.email') do set USER_EMAIL=%%i

if "!USER_NAME!"=="" (
    set /p USER_NAME="  Votre nom (Git) : "
    git config user.name "!USER_NAME!"
)
if "!USER_EMAIL!"=="" (
    set /p USER_EMAIL="  Votre email (Git) : "
    git config user.email "!USER_EMAIL!"
)

echo  [INFO] Utilisateur Git : !USER_NAME! ^<!USER_EMAIL!^>
echo.

REM 5) Etat du depot
echo  ============================================================
echo    Etat du depot
echo  ============================================================
git status --short
echo.

set /p CONFIRM="Continuer la publication ? (O/N) : "
if /i "!CONFIRM!" NEQ "O" if /i "!CONFIRM!" NEQ "Y" (
    echo  [INFO] Annule.
    pause
    exit /b 0
)

REM 6) Stage + commit
echo.
echo  [INFO] Creation du commit...
git add -A
git commit -m "feat(backend): version 2.0 - Backend Node.js + PostgreSQL multi-utilisateurs" -m "Migration vers mode client-serveur. Backend dans /backend, frontend v1 inchange. Voir MIGRATION.md et CHANGELOG.md."

if %ERRORLEVEL% NEQ 0 (
    echo  [INFO] Aucun changement a committer ou commit deja fait.
)

REM 7) Push
echo.
echo  ============================================================
echo    Push vers GitHub
echo  ============================================================
echo.
echo  [INFO] Si Git demande des credentials, utilisez :
echo    - Username : votre nom GitHub
echo    - Password : un Personal Access Token
echo      Creer : https://github.com/settings/tokens
echo      Permissions : 'repo' (Full control)
echo.

git push origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo  ============================================================
    echo    Publication reussie !
    echo  ============================================================
    echo.
    echo    Repo : https://github.com/mednabet/stokva
    echo.
    echo    Pour creer un tag de release v2.0.0 :
    echo      git tag -a v2.0.0 -m "Backend Node.js + PostgreSQL"
    echo      git push origin v2.0.0
    echo.
) else (
    echo.
    echo  [ERREUR] Le push a echoue.
    echo.
)

pause
