@echo off
chcp 65001 >nul
title STOKVA - Reinitialisation
color 0C

echo.
echo  ============================================================
echo                 STOKVA - Reinitialisation
echo  ============================================================
echo.
echo  ATTENTION : Cette operation supprimera TOUTES les donnees
echo  stockees localement (utilisateurs, articles, mouvements).
echo.
echo  Action IRREVERSIBLE.
echo.
echo  La cle localStorage est : stokva_db_v1
echo.
echo  Vous pouvez aussi utiliser :
echo    Application - Parametres - Sauvegarde - Reinitialiser
echo.

choice /C ON /M "Continuer la reinitialisation"
if errorlevel 2 (
    echo Operation annulee.
    timeout /t 2 >nul
    exit /b 0
)

echo.
echo Pour vider les donnees :
echo.
echo  1. Ouvrez STOKVA dans le navigateur
echo  2. Appuyez sur F12 pour ouvrir les outils developpeur
echo  3. Application ^(Chrome^) / Stockage ^(Firefox^)
echo  4. Local Storage - file:// ou http://localhost
echo  5. Clic droit sur "stokva_db_v1" - Supprimer
echo  6. Rechargez la page ^(F5^)
echo.
echo  OU plus simple :
echo  1. Lancez STOKVA
echo  2. Connectez-vous
echo  3. Parametres - Sauvegarde - Reinitialiser
echo.

pause
exit /b 0
