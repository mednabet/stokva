@echo off
chcp 65001 >nul
title STOKVA
setlocal

set "INSTALL_DIR=%~dp0"
set "INSTALL_DIR=%INSTALL_DIR:~0,-1%"
set "INDEX_FILE=%INSTALL_DIR%\index.html"

if not exist "%INDEX_FILE%" (
    echo [ERREUR] index.html introuvable dans %INSTALL_DIR%
    pause
    exit /b 1
)

set "BROWSER="

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
    goto :launch
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
    goto :launch
)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
    goto :launch
)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
    goto :launch
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
    goto :launch
)
if exist "%ProgramFiles%\Mozilla Firefox\firefox.exe" (
    set "BROWSER=%ProgramFiles%\Mozilla Firefox\firefox.exe"
    goto :launch
)

:launch
if defined BROWSER (
    start "" "%BROWSER%" "file:///%INSTALL_DIR:\=/%/index.html"
) else (
    start "" "%INDEX_FILE%"
)
exit /b 0
