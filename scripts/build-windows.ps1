# build-windows.ps1 - Windows build script matching GitHub Actions CI
# Usage: .\scripts\build-windows.ps1 [clean|release|debug|install|sync]
#
# Workflow: Edit code in WSL, run this script to sync & build on Windows FS

param(
    [string]$Config = "release",
    [switch]$NoSync
)

$ErrorActionPreference = "Stop"
$ProjectRoot = "C:\Users\Noah\Code\guillotine"
$BuildDir = Join-Path $ProjectRoot "build"
$VST3Dest = "C:\Program Files\Common Files\VST3"
$WSLSource = "/home/noahbaxter/Code/personal/guillotine/"

# Sync from WSL to Windows FS
function Sync-FromWSL {
    Write-Host "=== Syncing from WSL ===" -ForegroundColor Cyan
    Write-Host "Source: $WSLSource"
    Write-Host "Dest:   $ProjectRoot"

    $rsyncCmd = "rsync -av --delete " +
        "--exclude='build/' " +
        "--exclude='packages/' " +
        "--exclude='*.zip' " +
        "--exclude='.git/' " +
        "$WSLSource /mnt/c/Users/Noah/Code/guillotine/"

    wsl bash -c $rsyncCmd
    if ($LASTEXITCODE -ne 0) { throw "Sync from WSL failed" }

    Write-Host "Sync complete." -ForegroundColor Green
    Write-Host ""
}

# Handle sync-only
if ($Config -eq "sync") {
    Sync-FromWSL
    exit 0
}

# Find CMake from VS BuildTools
$CMakePath = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
if (-not (Test-Path $CMakePath)) {
    $CMakePath = "cmake"  # Fall back to PATH
}

Write-Host "=== Guillotine Windows Build ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"
Write-Host "Build:   $BuildDir"
Write-Host "CMake:   $CMakePath"
Write-Host "Config:  $Config"
Write-Host ""

# Handle clean
if ($Config -eq "clean") {
    Write-Host "Cleaning build directory..." -ForegroundColor Yellow
    if (Test-Path $BuildDir) {
        Remove-Item -Recurse -Force $BuildDir
    }
    Write-Host "Done." -ForegroundColor Green
    exit 0
}

# Handle install-only (no build)
if ($Config -eq "install") {
    $VST3Path = Join-Path $BuildDir "Guillotine_artefacts\Release\VST3\Guillotine.vst3"
    if (-not (Test-Path $VST3Path)) {
        Write-Error "VST3 not found at $VST3Path - run build first"
        exit 1
    }

    # Check if running as admin
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

    $VST3DestPath = Join-Path $VST3Dest "Guillotine.vst3"

    if ($isAdmin) {
        Write-Host "Installing VST3 to $VST3DestPath..." -ForegroundColor Yellow
        # Remove old version if exists, then copy fresh
        if (Test-Path $VST3DestPath) { Remove-Item -Recurse -Force $VST3DestPath }
        Copy-Item -Recurse $VST3Path $VST3DestPath
        Write-Host "Installed!" -ForegroundColor Green
    } else {
        Write-Host "Requesting admin privileges to install VST3..." -ForegroundColor Yellow
        $cmd = "if (Test-Path '$VST3DestPath') { Remove-Item -Recurse -Force '$VST3DestPath' }; Copy-Item -Recurse '$VST3Path' '$VST3DestPath'; Write-Host 'VST3 installed!' -ForegroundColor Green; Start-Sleep 2"
        Start-Process powershell -Verb RunAs -ArgumentList "-Command", $cmd
    }
    exit 0
}

# Determine build type
$BuildType = if ($Config -eq "debug") { "Debug" } else { "Release" }

# Sync from WSL before building (unless -NoSync)
if (-not $NoSync) {
    Sync-FromWSL
}

# Configure (only if needed)
$CMakeCacheFile = Join-Path $BuildDir "CMakeCache.txt"
if (-not (Test-Path $CMakeCacheFile)) {
    Write-Host "=== Configuring CMake ===" -ForegroundColor Cyan
    Push-Location $ProjectRoot
    try {
        & $CMakePath -B build -G "Visual Studio 17 2022" -A x64
        if ($LASTEXITCODE -ne 0) { throw "CMake configure failed" }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "=== Using existing CMake configuration ===" -ForegroundColor Cyan
}

# Build
Write-Host ""
Write-Host "=== Building $BuildType ===" -ForegroundColor Cyan
& $CMakePath --build $BuildDir --config $BuildType --parallel
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

# Verify output
$VST3Path = Join-Path $BuildDir "Guillotine_artefacts\$BuildType\VST3\Guillotine.vst3"
$StandalonePath = Join-Path $BuildDir "Guillotine_artefacts\$BuildType\Standalone\Guillotine.exe"

Write-Host ""
Write-Host "=== Build Complete ===" -ForegroundColor Green

if (Test-Path $VST3Path) {
    $binary = Get-ChildItem -Path $VST3Path -Recurse -Filter "*.vst3" -File | Select-Object -First 1
    if ($binary) {
        $sizeMB = [math]::Round($binary.Length / 1MB, 2)
        Write-Host "VST3: $($binary.FullName) ($sizeMB MB)" -ForegroundColor Green
    }
}

if (Test-Path $StandalonePath) {
    $size = [math]::Round((Get-Item $StandalonePath).Length / 1MB, 2)
    Write-Host "Standalone: $StandalonePath ($size MB)" -ForegroundColor Green
}

# Offer to install
Write-Host ""
Write-Host "To install VST3 to system folder, run:" -ForegroundColor Yellow
Write-Host "  .\scripts\build-windows.ps1 install" -ForegroundColor White
