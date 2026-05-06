# ============================================================
# STOKVA - Installation Windows entièrement automatique
# by NETPROCESS
# ============================================================
# Détecte et installe automatiquement Node.js, PostgreSQL, NSSM
# Configure la base, applique les migrations, démarre le service.
#
# Journal d'installation : un fichier install-YYYY-MM-DD-HHMMSS.log
# est genere dans le dossier logs/ pour diagnostic en cas de probleme.
# ============================================================

#Requires -Version 5.0

[CmdletBinding()]
param(
    [string]$Port = "3000",
    [string]$DbName = "stokva",
    [string]$DbUser = "stokva",
    [string]$PostgresPassword = "postgres",  # Mot de passe superuser postgres (defaut: postgres)
    [switch]$SkipServiceInstall,             # N'installe pas le service Windows
    [switch]$NoTranscript                    # Desactive le journal d'installation
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # Plus rapide pour Invoke-WebRequest

# Couleurs
function Write-Step { param($Msg) Write-Host ""; Write-Host " ============================================================" -ForegroundColor Cyan; Write-Host "   $Msg" -ForegroundColor Cyan; Write-Host " ============================================================" -ForegroundColor Cyan }
function Write-Ok   { param($Msg) Write-Host " [OK] $Msg" -ForegroundColor Green }
function Write-Info { param($Msg) Write-Host " [INFO] $Msg" -ForegroundColor Cyan }
function Write-Warn { param($Msg) Write-Host " [WARN] $Msg" -ForegroundColor Yellow }
function Write-Err  { param($Msg) Write-Host " [ERREUR] $Msg" -ForegroundColor Red }

# Sortie propre : stoppe le transcript et termine
function Exit-Installer {
    param([int]$Code = 0)
    if ($script:LogFile) {
        try { Stop-Transcript | Out-Null } catch { }
        if ($Code -ne 0) {
            Write-Host ""
            Write-Host " Journal d'installation sauvegarde dans :" -ForegroundColor Yellow
            Write-Host "   $($script:LogFile)" -ForegroundColor Yellow
            Write-Host " (a joindre en cas de demande de support)" -ForegroundColor Yellow
        }
    }
    Read-Host "Appuyez sur Entree pour fermer"
    exit $Code
}

# ============================================================
# Vérification droits administrateur
# ============================================================
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Info "Droits administrateur requis. Relancement en mode admin..."
    $argArray = @(
        "-NoProfile", "-ExecutionPolicy", "Bypass",
        "-File", "`"$($MyInvocation.MyCommand.Path)`"",
        "-Port", "`"$Port`"",
        "-DbName", "`"$DbName`"",
        "-DbUser", "`"$DbUser`"",
        "-PostgresPassword", "`"$PostgresPassword`""
    )
    if ($SkipServiceInstall) { $argArray += "-SkipServiceInstall" }
    if ($NoTranscript)       { $argArray += "-NoTranscript" }
    Start-Process powershell -Verb RunAs -ArgumentList $argArray
    exit
}

# ============================================================
# Démarrage du journal d'installation (transcript)
# ============================================================
$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $AppDir

$LogFile = $null
if (-not $NoTranscript) {
    $logsDir = Join-Path $AppDir "logs"
    if (-not (Test-Path $logsDir)) {
        New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
    }
    $timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
    $LogFile = Join-Path $logsDir "install-$timestamp.log"
    try {
        Start-Transcript -Path $LogFile -IncludeInvocationHeader | Out-Null
    } catch {
        Write-Warn "Impossible de demarrer le journal : $($_.Exception.Message)"
        $LogFile = $null
    }
}
# Promotion explicite au scope script pour que les fonctions y aient acces
$script:LogFile = $LogFile

Write-Host ""
Write-Host " ============================================================" -ForegroundColor Cyan
Write-Host "                    S T O K V A" -ForegroundColor Cyan
Write-Host "            Installation automatique" -ForegroundColor Cyan
Write-Host "                  by NETPROCESS" -ForegroundColor Cyan
Write-Host " ============================================================" -ForegroundColor Cyan

if ($LogFile) {
    Write-Host ""
    Write-Info "Journal d'installation : $LogFile"
}

# Trap global : assure l'arret du transcript meme en cas d'erreur fatale
trap {
    Write-Err "Erreur non gere : $($_.Exception.Message)"
    if ($LogFile) {
        try { Stop-Transcript | Out-Null } catch { }
        Write-Host ""
        Write-Host " Journal d'installation sauvegarde dans : $LogFile" -ForegroundColor Yellow
    }
    Read-Host "Appuyez sur Entree pour fermer"
    exit 1
}

Write-Info "Repertoire d'installation : $AppDir"

# Promouvoir le mot de passe postgres dans le scope script (utilise par les fonctions)
$script:PostgresPassword = $PostgresPassword

# ============================================================
# Détection winget
# ============================================================
$hasWinget = $false
try {
    winget --version 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $hasWinget = $true
        Write-Ok "winget detecte (installation rapide possible)"
    }
} catch {
    Write-Info "winget non detecte (fallback : telechargement direct)"
}

# ============================================================
# Helpers
# ============================================================

function Refresh-Path {
    $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

function Test-NodeJS {
    try {
        $version = & node --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $major = [int]($version -replace 'v(\d+)\..*', '$1')
            if ($major -ge 18) {
                return @{ Found = $true; Version = $version }
            }
        }
    } catch { }
    return @{ Found = $false }
}

function Install-NodeJS {
    Write-Info "Installation de Node.js 20 LTS..."

    if ($hasWinget) {
        Write-Info "Tentative via winget..."
        & winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
        if ($LASTEXITCODE -eq 0) {
            Refresh-Path
            $check = Test-NodeJS
            if ($check.Found) { return $true }
        }
        Write-Warn "winget a echoue, fallback sur MSI direct"
    }

    # Fallback : MSI direct
    Write-Info "Telechargement de Node.js 20 LTS (~30 Mo)..."
    $msi = "$env:TEMP\node-lts.msi"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi" -OutFile $msi -UseBasicParsing

    Write-Info "Installation silencieuse..."
    $proc = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart ADDLOCAL=ALL" -Wait -PassThru
    Remove-Item $msi -Force -ErrorAction SilentlyContinue

    if ($proc.ExitCode -ne 0) {
        Write-Err "Installation Node.js echouee (code $($proc.ExitCode))"
        return $false
    }
    Refresh-Path
    return (Test-NodeJS).Found
}

function Test-PostgreSQL {
    $svc = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $svc) { return @{ Found = $false } }

    # Démarrer si arrêté
    if ($svc.Status -ne 'Running') {
        Write-Info "Demarrage du service $($svc.Name)..."
        Start-Service $svc.Name
        Start-Sleep -Seconds 3
    }

    # S'assurer que psql.exe est dans le PATH de la session
    if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
        $pgRoot = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
        if ($pgRoot -and (Test-Path "$($pgRoot.FullName)\bin\psql.exe")) {
            $env:Path = "$($pgRoot.FullName)\bin;$env:Path"
        }
    }

    return @{ Found = $true; Service = $svc.Name }
}

function Install-PostgreSQL {
    # Utiliser le mot de passe fourni en parametre (defaut: 'postgres')
    # On filtre les caracteres problematiques pour SQL/cmd line
    $pgPwd = $script:PostgresPassword -replace '[''"\\\$]', ''
    if (-not $pgPwd) { $pgPwd = "postgres" }
    $script:GeneratedPostgresPwd = $pgPwd

    Write-Host ""
    Write-Host "  Mot de passe pour le superuser 'postgres' :" -ForegroundColor Yellow
    Write-Host "    $pgPwd" -ForegroundColor Yellow
    if ($pgPwd -eq "postgres") {
        Write-Host "  (mot de passe par defaut, modifiable apres installation via pgAdmin)" -ForegroundColor Yellow
    } else {
        Write-Host "  (notez-le, il sera necessaire pour pgAdmin)" -ForegroundColor Yellow
    }
    Write-Host ""

    if ($hasWinget) {
        Write-Info "Installation via winget (PostgreSQL 16, ~250 Mo)..."
        $wingetArgs = @(
            "install", "-e", "--id", "PostgreSQL.PostgreSQL.16",
            "--accept-source-agreements", "--accept-package-agreements", "--silent",
            "--custom", "--unattendedmodeui minimal --mode unattended --superpassword `"$pgPwd`" --servicename postgresql-x64-16 --serviceaccount postgres --servicepassword `"$pgPwd`" --serverport 5432"
        )
        & winget @wingetArgs
        if ($LASTEXITCODE -eq 0) {
            Start-Sleep -Seconds 5
            Refresh-Path
            $check = Test-PostgreSQL
            if ($check.Found) { return $true }
        }
        Write-Warn "winget a echoue, fallback sur EnterpriseDB"
    }

    # Fallback : EnterpriseDB installer
    Write-Info "Telechargement de PostgreSQL 16 (~250 Mo, peut prendre quelques minutes)..."
    $exe = "$env:TEMP\postgresql-installer.exe"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri "https://get.enterprisedb.com/postgresql/postgresql-16.6-1-windows-x64.exe" -OutFile $exe -UseBasicParsing

    Write-Info "Installation silencieuse de PostgreSQL..."
    $proc = Start-Process $exe -ArgumentList @(
        "--unattendedmodeui", "minimal",
        "--mode", "unattended",
        "--superpassword", $pgPwd,
        "--servicename", "postgresql-x64-16",
        "--serviceaccount", "postgres",
        "--servicepassword", $pgPwd,
        "--serverport", "5432",
        "--enable-components", "server,commandlinetools"
    ) -Wait -PassThru
    Remove-Item $exe -Force -ErrorAction SilentlyContinue

    if ($proc.ExitCode -ne 0) {
        Write-Err "Installation PostgreSQL echouee (code $($proc.ExitCode))"
        return $false
    }
    Start-Sleep -Seconds 5
    Refresh-Path
    return (Test-PostgreSQL).Found
}

function Test-NSSM {
    return [bool](Get-Command nssm -ErrorAction SilentlyContinue)
}

function Install-NSSM {
    if ($hasWinget) {
        & winget install -e --id NSSM.NSSM --accept-source-agreements --accept-package-agreements --silent 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Refresh-Path
            if (Test-NSSM) { return $true }
        }
    }

    # Fallback : zip
    Write-Info "Telechargement de NSSM..."
    $zip = "$env:TEMP\nssm.zip"
    $extractDir = "$env:TEMP\nssm-extract"
    $installDir = "C:\Program Files\nssm"

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $zip -UseBasicParsing

    if (-not (Test-Path $installDir)) { New-Item -ItemType Directory -Path $installDir -Force | Out-Null }
    Expand-Archive -Path $zip -DestinationPath $extractDir -Force
    Copy-Item "$extractDir\nssm-2.24\win64\nssm.exe" "$installDir\nssm.exe" -Force

    # Ajouter au PATH système (persistant)
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    if ($machinePath -notlike "*$installDir*") {
        [System.Environment]::SetEnvironmentVariable("Path", "$machinePath;$installDir", "Machine")
    }
    $env:Path = "$env:Path;$installDir"

    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    return Test-NSSM
}

# ============================================================
# Étape 1 : Node.js
# ============================================================
Write-Step "Etape 1/5 : Node.js"

$node = Test-NodeJS
if (-not $node.Found) {
    if (-not (Install-NodeJS)) {
        Write-Err "Impossible d'installer Node.js. Installez manuellement depuis https://nodejs.org"
        Exit-Installer 1
    }
    $node = Test-NodeJS
}
Write-Ok "Node.js : $($node.Version)"

# ============================================================
# Étape 2 : PostgreSQL
# ============================================================
Write-Step "Etape 2/5 : PostgreSQL"

$pg = Test-PostgreSQL
if (-not $pg.Found) {
    if (-not (Install-PostgreSQL)) {
        Write-Err "Impossible d'installer PostgreSQL."
        Exit-Installer 1
    }
    $pg = Test-PostgreSQL
}
Write-Ok "PostgreSQL detecte (service: $($pg.Service))"

# ============================================================
# Étape 3 : Configuration de la base
# ============================================================
Write-Step "Etape 3/5 : Configuration de la base"

# Mot de passe superuser : si PG vient d'etre installe, utiliser celui defini.
# Sinon, $PostgresPassword vaut "postgres" par defaut. On tentera la connexion
# avec ce mot de passe ; si elle echoue, on demandera a l'utilisateur.
if ($script:GeneratedPostgresPwd) {
    $PostgresPassword = $script:GeneratedPostgresPwd
    Write-Ok "Utilisation du mot de passe defini lors de l'installation"
}

# Test connexion
$env:PGPASSWORD = $PostgresPassword
$null = & psql -U postgres -h localhost -c "SELECT 1" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Warn "Connexion impossible avec le mot de passe : $PostgresPassword"
    Write-Host ""
    Write-Host "  Saisissez le mot de passe du superuser 'postgres' :" -ForegroundColor Cyan
    Write-Host "  (defini lors de l'installation precedente de PostgreSQL)" -ForegroundColor Cyan
    $secure = Read-Host "  Mot de passe postgres" -AsSecureString
    $PostgresPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

    $env:PGPASSWORD = $PostgresPassword
    $null = & psql -U postgres -h localhost -c "SELECT 1" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Mot de passe incorrect. Verifiez-le avec pgAdmin ou reinstallez PostgreSQL."
        Exit-Installer 1
    }
}
Write-Ok "Connexion PostgreSQL etablie"

# Générer mot de passe applicatif
Add-Type -AssemblyName System.Web
$dbPassword = [System.Web.Security.Membership]::GeneratePassword(20, 0)
$dbPassword = $dbPassword -replace '[''"\\\$]', 'X'

# Générer JWT secret
$jwtSecret = [Guid]::NewGuid().ToString("N") + [Guid]::NewGuid().ToString("N")

Write-Info "Creation de la base et de l'utilisateur..."

# Créer base si absente
$dbExists = & psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'"
if ($dbExists -ne "1") {
    & psql -U postgres -h localhost -c "CREATE DATABASE $DbName;" | Out-Null
    Write-Ok "Base $DbName creee"
} else {
    Write-Ok "Base $DbName existe deja"
}

# Créer/MAJ utilisateur
$userExists = & psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DbUser'"
if ($userExists -ne "1") {
    & psql -U postgres -h localhost -c "CREATE USER $DbUser WITH PASSWORD '$dbPassword';" | Out-Null
    Write-Ok "Utilisateur $DbUser cree"
} else {
    & psql -U postgres -h localhost -c "ALTER USER $DbUser WITH PASSWORD '$dbPassword';" | Out-Null
    Write-Ok "Mot de passe utilisateur $DbUser mis a jour"
}

# Permissions
& psql -U postgres -h localhost -c "GRANT ALL PRIVILEGES ON DATABASE $DbName TO $DbUser;" | Out-Null
& psql -U postgres -h localhost -d $DbName -c "GRANT ALL ON SCHEMA public TO $DbUser;" | Out-Null
& psql -U postgres -h localhost -d $DbName -c "ALTER SCHEMA public OWNER TO $DbUser;" | Out-Null

$env:PGPASSWORD = $null

# ============================================================
# Étape 4 : Application
# ============================================================
Write-Step "Etape 4/5 : Application"

# Créer .env
$envContent = @"
NODE_ENV=production
PORT=$Port
HOST=0.0.0.0
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DbName
DB_USER=$DbUser
DB_PASSWORD=$dbPassword
JWT_SECRET=$jwtSecret
JWT_EXPIRES_IN=12h
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGIN=*
WS_PATH=/ws
WEIGHBRIDGE_ENABLED=false
WEIGHBRIDGE_PORT=COM3
WEIGHBRIDGE_BAUDRATE=9600
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=300
LOG_LEVEL=combined
"@
Set-Content -Path "$AppDir\.env" -Value $envContent -Encoding ASCII
Write-Ok ".env genere"

# npm install
Write-Info "Installation des dependances npm (peut prendre 1-2 min)..."
& npm install --omit=dev --no-audit --no-fund 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Err "npm install a echoue"
    Exit-Installer 1
}
Write-Ok "Dependances installees"

# Migrations
Write-Info "Application des migrations..."
& node scripts\migrate.js
if ($LASTEXITCODE -ne 0) {
    Write-Err "Echec des migrations"
    Exit-Installer 1
}

# Seed
Write-Info "Donnees initiales..."
& node scripts\seed.js

# ============================================================
# Étape 5 : Service Windows
# ============================================================
Write-Step "Etape 5/5 : Service Windows"

if ($SkipServiceInstall) {
    Write-Info "Service Windows non installe (option -SkipServiceInstall)"
} else {
    if (-not (Test-NSSM)) {
        Write-Info "Installation de NSSM..."
        if (-not (Install-NSSM)) {
            Write-Warn "NSSM non disponible. Service Windows ignore."
        }
    }

    if (Test-NSSM) {
        Write-Info "Installation du service STOKVA..."

        $nodeExe = (Get-Command node).Source
        $serverJs = Join-Path $AppDir "src\server.js"

        # Stopper et supprimer existant
        & nssm stop STOKVA confirm 2>&1 | Out-Null
        & nssm remove STOKVA confirm 2>&1 | Out-Null

        # Logs dir
        $logsDir = Join-Path $AppDir "logs"
        if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }

        # Créer le service
        & nssm install STOKVA $nodeExe $serverJs
        & nssm set STOKVA AppDirectory $AppDir
        & nssm set STOKVA AppStdout (Join-Path $logsDir "stokva.log")
        & nssm set STOKVA AppStderr (Join-Path $logsDir "stokva-error.log")
        & nssm set STOKVA AppRotateFiles 1
        & nssm set STOKVA AppRotateBytes 10485760
        & nssm set STOKVA Start SERVICE_AUTO_START
        & nssm set STOKVA Description "STOKVA Backend - Gestion des depots de stockage (NETPROCESS)"

        & nssm start STOKVA 2>&1 | Out-Null
        Start-Sleep -Seconds 3

        $svc = Get-Service STOKVA -ErrorAction SilentlyContinue
        if ($svc.Status -eq 'Running') {
            Write-Ok "Service STOKVA installe et demarre"
        } else {
            Write-Warn "Service installe mais demarrage echoue. Voir logs\stokva-error.log"
        }
    }
}

# Lanceurs de secours
@"
@echo off
title STOKVA Backend
cd /d "%~dp0"
node src\server.js
pause
"@ | Set-Content -Path "$AppDir\start-stokva.bat" -Encoding ASCII

@"
@echo off
net stop STOKVA
pause
"@ | Set-Content -Path "$AppDir\stop-stokva.bat" -Encoding ASCII

# ============================================================
# Récapitulatif
# ============================================================
Write-Host ""
Write-Host " ============================================================" -ForegroundColor Green
Write-Host "    Installation terminee !" -ForegroundColor Green
Write-Host " ============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "    Backend       : http://localhost:$Port" -ForegroundColor Cyan
Write-Host "    API Docs      : http://localhost:$Port/api/docs" -ForegroundColor Cyan
Write-Host "    Health        : http://localhost:$Port/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "    Identifiants par defaut : admin / admin" -ForegroundColor Yellow
Write-Host "    (A CHANGER IMMEDIATEMENT depuis l'interface)" -ForegroundColor Yellow
Write-Host ""

if (-not $SkipServiceInstall) {
    Write-Host "    Service Windows : STOKVA (auto au boot)" -ForegroundColor Cyan
    Write-Host "      Demarrer : net start STOKVA" -ForegroundColor Cyan
    Write-Host "      Arreter  : net stop STOKVA" -ForegroundColor Cyan
}
Write-Host "    Logs runtime    : $AppDir\logs\stokva.log" -ForegroundColor Cyan
Write-Host "    Config          : $AppDir\.env" -ForegroundColor Cyan
if ($LogFile) {
    Write-Host "    Journal install : $LogFile" -ForegroundColor Cyan
}
Write-Host ""

if ($script:GeneratedPostgresPwd) {
    Write-Host "    Mot de passe PostgreSQL (superuser) :" -ForegroundColor Yellow
    Write-Host "      $($script:GeneratedPostgresPwd)" -ForegroundColor Yellow
    if ($script:GeneratedPostgresPwd -eq "postgres") {
        Write-Host "    (mot de passe par defaut, modifiable via pgAdmin si souhaite)" -ForegroundColor Yellow
    } else {
        Write-Host "    (notez-le pour pgAdmin)" -ForegroundColor Yellow
    }
    Write-Host ""
}

Write-Host " ============================================================" -ForegroundColor Green
Write-Host ""

# Arreter le journal d'installation
if ($LogFile) {
    try { Stop-Transcript | Out-Null } catch { }
}

# Ouvrir Swagger
Start-Sleep -Seconds 3
try { Start-Process "http://localhost:$Port/api/docs" } catch { }

Read-Host "Appuyez sur Entree pour fermer"
