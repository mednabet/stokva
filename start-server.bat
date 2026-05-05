@echo off
chcp 65001 >nul
title STOKVA - Serveur local
color 0A

set "INSTALL_DIR=%~dp0"
set "INSTALL_DIR=%INSTALL_DIR:~0,-1%"
cd /d "%INSTALL_DIR%"

echo.
echo  ============================================================
echo            STOKVA - Serveur HTTP local
echo  ============================================================
echo.

where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    where py >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo  [ERREUR] Python n'est pas installe.
        echo.
        echo  Installer Python : https://www.python.org/downloads/
        echo  Cochez "Add Python to PATH" pendant l'installation.
        echo.
        echo  Alternative : utilisez start-stokva.bat
        echo.
        pause
        exit /b 1
    )
    set "PYTHON_CMD=py"
) else (
    set "PYTHON_CMD=python"
)

echo  [OK] Python detecte
echo.

set "PORT=8080"
netstat -an | find ":%PORT%" | find "LISTENING" >nul
if %ERRORLEVEL% EQU 0 (
    set "PORT=8081"
    netstat -an | find ":!PORT!" | find "LISTENING" >nul
    if !ERRORLEVEL! EQU 0 set "PORT=8082"
)

echo  Demarrage du serveur sur le port %PORT%...
echo.
echo  ============================================================
echo    URL : http://localhost:%PORT%
echo    Identifiants : admin / admin
echo.
echo    Pour ARRETER : Ctrl+C ou fermez cette fenetre
echo  ============================================================
echo.

start /b "" cmd /c "timeout /t 2 >nul && start http://localhost:%PORT%/"

%PYTHON_CMD% -m http.server %PORT%

echo.
echo Serveur arrete.
pause
