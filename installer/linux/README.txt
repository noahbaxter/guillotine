Guillotine - Linux Installation
================================

REQUIREMENTS
------------
The plugin UI requires WebKitGTK. Install it with:

  Ubuntu/Debian:  sudo apt install libwebkit2gtk-4.1-0
  Fedora:         sudo dnf install webkit2gtk4.1
  Arch:           sudo pacman -S webkit2gtk-4.1
  openSUSE:       sudo zypper install libwebkit2gtk-4_1-0

If 4.1 isn't available, 4.0 works too (e.g., libwebkit2gtk-4.0-37).

Without WebKitGTK, the plugin loads and processes audio but shows a white screen.


INSTALLATION
------------
Copy the plugin folders to your user plugin directories:

  VST3:  ~/.vst3/Guillotine.vst3
  LV2:   ~/.lv2/Guillotine.lv2
  CLAP:  ~/.clap/Guillotine.clap

Or system-wide (requires sudo):

  VST3:  /usr/lib/vst3/Guillotine.vst3
  LV2:   /usr/lib/lv2/Guillotine.lv2
  CLAP:  /usr/lib/clap/Guillotine.clap


MORE INFO
---------
https://github.com/noahbaxter/guillotine
