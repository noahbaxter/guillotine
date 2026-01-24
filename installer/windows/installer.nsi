; Guillotine NSIS Installer Script
; Builds unsigned Windows installer
;
; Usage (local):   makensis /DVERSION=1.0.3 installer.nsi
; Usage (CI):      makensis /DVERSION=1.0.3 /DSOURCE_DIR=..\..\build installer.nsi

!include "MUI2.nsh"
!include "FileFunc.nsh"

; Version (required)
!ifndef VERSION
  !error "VERSION must be defined. Use: makensis /DVERSION=x.x.x installer.nsi"
!endif

; Source directory (default for local builds)
!ifndef SOURCE_DIR
  !define SOURCE_DIR "..\..\build\Guillotine_artefacts\Release"
!endif

; Basic installer info
Name "Guillotine ${VERSION}"
OutFile "Guillotine-${VERSION}-Windows-x64.exe"
InstallDir "$PROGRAMFILES64\Common Files\VST3"
RequestExecutionLevel admin

; Modern UI settings
!define MUI_ABORTWARNING
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"

; Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Language
!insertmacro MUI_LANGUAGE "English"

; Installer sections
Section "Guillotine VST3" SecVST3
  SetOutPath "$INSTDIR"

  ; Copy VST3 bundle
  SetOutPath "$INSTDIR\Guillotine.vst3"
  File /r "${SOURCE_DIR}\VST3\Guillotine.vst3\*.*"

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\Guillotine.vst3\Uninstall.exe"

  ; Registry entries for Add/Remove Programs
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Guillotine" \
    "DisplayName" "Guillotine ${VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Guillotine" \
    "UninstallString" "$\"$INSTDIR\Guillotine.vst3\Uninstall.exe$\""
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Guillotine" \
    "Publisher" "Dichotic Studios"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Guillotine" \
    "DisplayVersion" "${VERSION}"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Guillotine" \
    "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Guillotine" \
    "NoRepair" 1

  ; Get installed size
  ${GetSize} "$INSTDIR\Guillotine.vst3" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Guillotine" \
    "EstimatedSize" "$0"
SectionEnd

; Uninstaller section
Section "Uninstall"
  ; Remove VST3
  RMDir /r "$INSTDIR"

  ; Remove registry entries
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Guillotine"
SectionEnd
