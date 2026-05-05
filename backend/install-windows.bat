@echo off
chcp 65001 >nul
title STOKVA - Installation automatique
color 0B

REM ============================================================
REM  STOKVA - Installation Windows (wrapper)
REM  by NETPROCESS
REM ============================================================
REM  Ce script lance l'installeur PowerShell qui :
REM    - Detecte/installe Node.js et PostgreSQL automatiquement
REM    - Configure la base de donnees
REM    - Applique les migrations
REM    - Installe le service Windows
REM
REM  Le script PowerShell est plus robuste que CMD pour gerer
REM  les telechargements, l'elevation UAC et les manipulations
REM  de PATH systeme.
REM ============================================================

echo.
echo  ============================================================
echo                    S T O K V A
echo            Installation automatique
echo                  by NETPROCESS
echo  ============================================================
echo.
echo  Cet installeur va :
echo    1. Detecter et installer Node.js 20 LTS (si absent)
echo    2. Detecter et installer PostgreSQL 16 (si absent)
echo    3. Configurer la base STOKVA
echo    4. Installer les dependances et appliquer les migrations
echo    5. Creer le service Windows STOKVA (demarrage auto)
echo.
echo  Methodes utilisees ^(par ordre de priorite^) :
echo    - winget ^(Windows 10 1809+ / Windows 11^)
echo    - Telechargement direct des installeurs officiels
echo.
echo  Duree estimee : 5-10 min (selon connexion internet)
echo  Telechargement : ~300 Mo si Node.js + PostgreSQL absents
echo.
pause

REM Lancer le PowerShell installeur avec privileges eleves
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1" %*

REM Le PowerShell gere lui-meme l'elevation UAC et le pause final
exit /b %ERRORLEVEL%
