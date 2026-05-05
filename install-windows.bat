@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title STOKVA - Installation
color 0B

:: =========================================
::  STOKVA - Script d'installation
::  Windows 7/8/10/11
::  by NETPROCESS
:: =========================================

echo.
echo  ============================================================
echo.
echo                    S T O K V A
echo.
echo            Gestion des Depots de Stockage
echo                  by NETPROCESS
echo.
echo                Installation automatique
echo.
echo  ============================================================
echo.
echo.

set "INSTALL_DIR=%~dp0"
set "INSTALL_DIR=%INSTALL_DIR:~0,-1%"
set "APP_NAME=STOKVA"
set "INDEX_FILE=%INSTALL_DIR%\index.html"

echo [INFO] Repertoire d'installation : %INSTALL_DIR%
echo.

:: -------- Etape 1 : Verification fichiers --------
echo [1/5] Verification des fichiers...
if not exist "%INDEX_FILE%" (
    echo  [ERREUR] index.html introuvable
    echo  Verifiez que le script est dans le dossier de l'application.
    pause
    exit /b 1
)
if not exist "%INSTALL_DIR%\js\app.js" (
    echo  [ERREUR] Dossier js/ incomplet
    pause
    exit /b 1
)
if not exist "%INSTALL_DIR%\assets\icons\favicon.ico" (
    echo  [ATTENTION] Icone STOKVA introuvable - les raccourcis utiliseront l'icone par defaut
)
echo      [OK] Fichiers verifies
echo.

:: -------- Etape 2 : Detection navigateur --------
echo [2/5] Detection d'un navigateur compatible...
set "BROWSER="
set "BROWSER_NAME="

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
    set "BROWSER_NAME=Google Chrome"
    goto :browser_found
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
    set "BROWSER_NAME=Google Chrome"
    goto :browser_found
)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
    set "BROWSER_NAME=Google Chrome"
    goto :browser_found
)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
    set "BROWSER_NAME=Microsoft Edge"
    goto :browser_found
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
    set "BROWSER_NAME=Microsoft Edge"
    goto :browser_found
)
if exist "%ProgramFiles%\Mozilla Firefox\firefox.exe" (
    set "BROWSER=%ProgramFiles%\Mozilla Firefox\firefox.exe"
    set "BROWSER_NAME=Mozilla Firefox"
    goto :browser_found
)
if exist "%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe" (
    set "BROWSER=%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe"
    set "BROWSER_NAME=Mozilla Firefox"
    goto :browser_found
)

echo      [ATTENTION] Aucun navigateur moderne detecte.
echo      Veuillez installer Chrome, Edge ou Firefox.
echo      Lien : https://www.google.com/chrome/
echo.
choice /C ON /M "Continuer quand meme"
if errorlevel 2 exit /b 0
set "BROWSER_NAME=Navigateur par defaut"
goto :step3

:browser_found
echo      [OK] Navigateur detecte : %BROWSER_NAME%
echo.

:step3
:: -------- Etape 3 : Creation des raccourcis --------
echo [3/5] Creation des raccourcis...

set "DESKTOP=%USERPROFILE%\Desktop"
if not exist "%DESKTOP%" set "DESKTOP=%USERPROFILE%\Bureau"

:: Icone : utiliser favicon.ico si dispo
set "ICON_PATH=%SystemRoot%\System32\shell32.dll,13"
if exist "%INSTALL_DIR%\assets\icons\favicon.ico" (
    set "ICON_PATH=%INSTALL_DIR%\assets\icons\favicon.ico"
)

set "SHORTCUT_PS=%TEMP%\stokva_shortcut.ps1"
(
    echo $WshShell = New-Object -ComObject WScript.Shell
    echo $Shortcut = $WshShell.CreateShortcut^("%DESKTOP%\STOKVA.lnk"^)
    echo $Shortcut.TargetPath = "%INSTALL_DIR%\start-stokva.bat"
    echo $Shortcut.WorkingDirectory = "%INSTALL_DIR%"
    echo $Shortcut.IconLocation = "%ICON_PATH%"
    echo $Shortcut.Description = "STOKVA - Gestion des Depots de Stockage"
    echo $Shortcut.Save^(^)
) > "%SHORTCUT_PS%"

powershell -ExecutionPolicy Bypass -File "%SHORTCUT_PS%" >nul 2>&1
if exist "%DESKTOP%\STOKVA.lnk" (
    echo      [OK] Raccourci cree sur le Bureau
) else (
    echo      [INFO] Impossible de creer le raccourci automatiquement
)
del "%SHORTCUT_PS%" >nul 2>&1

:: Menu Demarrer
set "STARTMENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs"
set "SHORTCUT_PS2=%TEMP%\stokva_startmenu.ps1"
(
    echo $WshShell = New-Object -ComObject WScript.Shell
    echo $Shortcut = $WshShell.CreateShortcut^("%STARTMENU%\STOKVA.lnk"^)
    echo $Shortcut.TargetPath = "%INSTALL_DIR%\start-stokva.bat"
    echo $Shortcut.WorkingDirectory = "%INSTALL_DIR%"
    echo $Shortcut.IconLocation = "%ICON_PATH%"
    echo $Shortcut.Description = "STOKVA - Gestion des Depots"
    echo $Shortcut.Save^(^)
) > "%SHORTCUT_PS2%"

powershell -ExecutionPolicy Bypass -File "%SHORTCUT_PS2%" >nul 2>&1
if exist "%STARTMENU%\STOKVA.lnk" (
    echo      [OK] Raccourci ajoute au Menu Demarrer
)
del "%SHORTCUT_PS2%" >nul 2>&1
echo.

:: -------- Etape 4 : Configuration du lanceur --------
echo [4/5] Configuration du lanceur...
(
    echo @echo off
    echo title STOKVA
    echo cd /d "%INSTALL_DIR%"
    if defined BROWSER (
        echo start "" "%BROWSER%" "file:///%INSTALL_DIR:\=/%/index.html"
    ) else (
        echo start "" "index.html"
    )
    echo exit
) > "%INSTALL_DIR%\start-stokva.bat"
echo      [OK] Lanceur configure
echo.

:: -------- Etape 5 : Detection Python --------
echo [5/5] Verification de Python ^(optionnel^)...
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo      [OK] Python detecte. Mode serveur local disponible.
    echo      Utilisez start-server.bat pour http://localhost:8080
) else (
    echo      [INFO] Python non installe ^(optionnel^).
    echo      L'application fonctionne sans, en mode fichier local.
)
echo.

:: -------- Resume --------
echo.
echo  ============================================================
echo.
echo            INSTALLATION TERMINEE AVEC SUCCES !
echo.
echo  ============================================================
echo.
echo  Identifiants par defaut :
echo    Utilisateur  :  admin
echo    Mot de passe :  admin
echo.
echo  IMPORTANT : Changez ces identifiants des la premiere connexion.
echo.
echo  Lancement de STOKVA :
echo    1. Double-clic sur le raccourci "STOKVA" du Bureau
echo    2. Menu Demarrer ^> STOKVA
echo    3. Double-clic sur start-stokva.bat
echo.
echo.

choice /C ON /M "Lancer STOKVA maintenant"
if errorlevel 2 goto :end

echo.
echo Lancement...
if defined BROWSER (
    start "" "%BROWSER%" "file:///%INSTALL_DIR:\=/%/index.html"
) else (
    start "" "%INDEX_FILE%"
)

:end
echo.
echo Merci d'utiliser STOKVA - by NETPROCESS
timeout /t 3 >nul
exit /b 0
