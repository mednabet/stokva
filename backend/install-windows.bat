@echo off
REM ============================================================
REM STOKVA - Installation Windows
REM by NETPROCESS
REM ============================================================
REM Prerequis (a installer manuellement avant) :
REM   - Node.js 20+        : https://nodejs.org
REM   - PostgreSQL 14+     : https://www.postgresql.org/download/windows/
REM   - (Optionnel) NSSM   : https://nssm.cc/  pour service Windows
REM ============================================================

setlocal enabledelayedexpansion
chcp 65001 >nul

echo.
echo ============================================
echo  STOKVA - Installation Windows
echo  by NETPROCESS
echo ============================================
echo.

REM --- Verifications ---
where node >nul 2>nul
if errorlevel 1 (
    echo [ERREUR] Node.js introuvable. Installez Node.js 20+ depuis https://nodejs.org
    pause
    exit /b 1
)
where psql >nul 2>nul
if errorlevel 1 (
    echo [ATTENTION] psql introuvable dans PATH. Verifiez que PostgreSQL est installe et que C:\Program Files\PostgreSQL\xx\bin est dans le PATH.
    echo.
)

REM --- Configuration ---
set APP_DIR=%~dp0
set /p DB_NAME="Nom de la base [stokva] : "
if "!DB_NAME!"=="" set DB_NAME=stokva
set /p DB_USER="Utilisateur DB [stokva] : "
if "!DB_USER!"=="" set DB_USER=stokva
set /p DB_PASSWORD="Mot de passe DB : "
if "!DB_PASSWORD!"=="" (
    echo [ERREUR] Mot de passe requis.
    pause
    exit /b 1
)
set /p PORT="Port HTTP [3000] : "
if "!PORT!"=="" set PORT=3000

REM --- Generation JWT secret ---
for /f %%i in ('node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"') do set JWT_SECRET=%%i

echo.
echo --- Creation fichier .env ---
(
echo NODE_ENV=production
echo PORT=!PORT!
echo HOST=0.0.0.0
echo DB_HOST=localhost
echo DB_PORT=5432
echo DB_NAME=!DB_NAME!
echo DB_USER=!DB_USER!
echo DB_PASSWORD=!DB_PASSWORD!
echo JWT_SECRET=!JWT_SECRET!
echo JWT_EXPIRES_IN=12h
echo JWT_REFRESH_EXPIRES_IN=7d
echo CORS_ORIGIN=*
echo WS_PATH=/ws
echo WEIGHBRIDGE_ENABLED=false
echo WEIGHBRIDGE_PORT=COM3
echo WEIGHBRIDGE_BAUDRATE=9600
echo RATE_LIMIT_WINDOW_MS=900000
echo RATE_LIMIT_MAX=300
echo LOG_LEVEL=combined
) > "%APP_DIR%.env"

REM --- Installation des dependances npm ---
echo.
echo --- Installation des dependances ---
cd /d "%APP_DIR%"
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 (
    echo [ERREUR] npm install a echoue
    pause
    exit /b 1
)

REM --- Creation base si absente ---
echo.
echo --- Creation base PostgreSQL ---
echo Mot de passe postgres requis :
psql -U postgres -c "CREATE DATABASE !DB_NAME!;" 2>nul
psql -U postgres -c "CREATE USER !DB_USER! WITH PASSWORD '!DB_PASSWORD!';" 2>nul
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE !DB_NAME! TO !DB_USER!;" 2>nul
psql -U postgres -d !DB_NAME! -c "GRANT ALL ON SCHEMA public TO !DB_USER!;" 2>nul

REM --- Migrations ---
echo.
echo --- Application des migrations ---
node scripts\migrate.js
if errorlevel 1 (
    echo [ERREUR] Echec migrations
    pause
    exit /b 1
)

echo.
echo --- Donnees initiales ---
node scripts\seed.js

REM --- Lanceur ---
echo.
echo --- Creation lanceur start-stokva.bat ---
(
echo @echo off
echo cd /d "%APP_DIR%"
echo node src\server.js
echo pause
) > "%APP_DIR%start-stokva.bat"

REM --- Service Windows via NSSM (si disponible) ---
where nssm >nul 2>nul
if not errorlevel 1 (
    echo.
    echo --- Installation service Windows ---
    nssm install STOKVA "%ProgramFiles%\nodejs\node.exe" "%APP_DIR%src\server.js"
    nssm set STOKVA AppDirectory "%APP_DIR%"
    nssm set STOKVA AppStdout "%APP_DIR%logs\stokva.log"
    nssm set STOKVA AppStderr "%APP_DIR%logs\stokva-error.log"
    nssm set STOKVA Start SERVICE_AUTO_START
    mkdir "%APP_DIR%logs" 2>nul
    nssm start STOKVA
    echo Service STOKVA installe et demarre.
) else (
    echo.
    echo [INFO] NSSM non detecte. Pour installer comme service Windows :
    echo   1. Telechargez NSSM : https://nssm.cc/
    echo   2. Ajoutez-le au PATH
    echo   3. Relancez ce script.
    echo.
    echo Demarrage manuel : double-cliquez sur start-stokva.bat
)

echo.
echo ============================================
echo  Installation terminee !
echo ============================================
echo.
echo  Backend   : http://localhost:!PORT!
echo  API Docs  : http://localhost:!PORT!/api/docs
echo  Identifiants par defaut : admin / admin
echo.
echo  Fichier de config : %APP_DIR%.env
echo.
pause
