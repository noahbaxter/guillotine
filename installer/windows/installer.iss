; Guillotine Inno Setup Installer
; Uses Windows Restart Manager to handle locked files (no reboot needed)
;
; Usage: iscc /DVERSION=1.0.0 installer.iss
; Or:    iscc /DVERSION=1.0.0 /DSOURCE_DIR=path\to\build installer.iss

#ifndef VERSION
  #error "VERSION must be defined. Use: iscc /DVERSION=x.x.x installer.iss"
#endif

#ifndef SOURCE_DIR
  #define SOURCE_DIR "..\..\build\Guillotine_artefacts\Release"
#endif

[Setup]
AppName=Guillotine
AppVersion={#VERSION}
AppPublisher=Dichotic Studios
DefaultDirName={commoncf64}\VST3
OutputBaseFilename=Guillotine-{#VERSION}-Windows-x64
OutputDir=.
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
; No uninstaller - users can just delete the .vst3 folder
Uninstallable=no
CreateUninstallRegKey=no

; Uses Windows Restart Manager to close apps holding files
CloseApplications=force
CloseApplicationsFilter=*.dll,*.vst3,*.exe,*.json
RestartApplications=yes

; Minimal UI
DisableProgramGroupPage=yes
DisableWelcomePage=yes
DisableDirPage=yes

[InstallDelete]
; Remove old installation (whether folder or file)
Type: filesandordirs; Name: "{app}\Guillotine.vst3"

[Files]
; Install just the VST3 DLL (single file, not bundle)
Source: "{#SOURCE_DIR}\VST3\Guillotine.vst3\Contents\x86_64-win\Guillotine.vst3"; DestDir: "{app}"


[Messages]
SetupWindowTitle=Guillotine {#VERSION}
