# DownloadWebView2.ps1
# Downloads and installs WebView2 NuGet package for Windows builds

$ErrorActionPreference = "Stop"

$packageDir = "$PSScriptRoot\..\packages"
$packageName = "Microsoft.Web.WebView2"
$packageVersion = "1.0.3485.44"
$fullPackageName = "$packageName.$packageVersion"

# Check if already installed
if (Test-Path "$packageDir\$fullPackageName") {
    Write-Host "WebView2 $packageVersion already installed"
    exit 0
}

Write-Host "Installing WebView2 $packageVersion..."

# Create packages directory
New-Item -ItemType Directory -Force -Path $packageDir | Out-Null

# Download nuget.exe if not present
$nugetPath = "$packageDir\nuget.exe"
if (-not (Test-Path $nugetPath)) {
    Write-Host "Downloading NuGet CLI..."
    $nugetUrl = "https://dist.nuget.org/win-x86-commandline/latest/nuget.exe"
    Invoke-WebRequest -Uri $nugetUrl -OutFile $nugetPath
}

# Install the package
Write-Host "Installing $packageName $packageVersion..."
& $nugetPath install $packageName -Version $packageVersion -OutputDirectory $packageDir

# Verify installation
$webview2Header = "$packageDir\$fullPackageName\build\native\include\WebView2.h"
if (Test-Path $webview2Header) {
    Write-Host "WebView2 SDK installed successfully"
    Write-Host "Include path: $packageDir\$fullPackageName\build\native\include"
    exit 0
} else {
    Write-Error "WebView2 installation failed - WebView2.h not found at $webview2Header"
    exit 1
}
