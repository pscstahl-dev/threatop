# Threat-Op

**The world's first functional security screensaver.**

Built by a retired law enforcement officer. Scans for threats while your computer is idle.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-blue.svg)]()
[![Powered by ClamAV](https://img.shields.io/badge/Powered%20by-ClamAV-red.svg)]()

---

## What is Threat-Op?

Threat-Op is a military-themed cybersecurity desktop application and screensaver built on Electron and ClamAV. It combines a real-time file scanner with a live global threat intelligence feed displayed on an animated "War Room" command center interface.

**This is the first known implementation of a functional security screensaver** — a screensaver that actively scans your computer for malware while displaying live global threat data. Prior to Threat-Op, no screensaver existed that performed real security functions during idle time.

---

## Origin Story

> "I spent decades in law enforcement catching criminals. When I retired, I wanted to keep hunting — just in a different way. Threat-Op is built the way a cop thinks: always watching, always scanning, never off duty."
>
> — Vince, Retired Law Enforcement Officer & Creator of Threat-Op

---

## Features

### Desktop App (War Room)
- **Radar sweep UI** — animated scanner with file blips and threat indicators
- **Real world map** — Mercator projection with live threat intelligence overlay
- **Missile arc animations** — attack vectors displayed as arcs from origin to target country
- **Live AlienVault OTX integration** — real-time global threat pulse data
- **ClamAV scanning engine** — 3.6 million virus signatures
- **One-click scanning** — Quick scan PC or Full scan PC
- **Quarantine system** — isolate threats to `C:\ThreatOp\Quarantine\`
- **Red alert mode** — full-screen alert on threat detection

### Screensaver (World's First Functional Security Screensaver)
- **Fullscreen War Room display** while computer is idle
- **Background ClamAV scan** runs automatically during idle time
- **Live OTX threat intel** continuously updates the world map
- **Threat detection wake** — on finding a threat, red alert fires and system wakes
- **Exits instantly** on any mouse movement or keypress

---

## Tech Stack

- **Electron** — cross-platform desktop framework
- **ClamAV** — open source antivirus engine
- **AlienVault OTX API** — live threat intelligence
- **Canvas API** — radar, world map, and arc animations
- **Natural Earth / TopoJSON** — accurate world map data
- **Node.js** — backend scanning and IPC bridge

---

## Installation

### Requirements
- Windows 10/11
- Node.js (LTS)
- ClamAV for Windows

### Install ClamAV
```powershell
# Option A: Direct download
# Download from https://www.clamav.net/downloads
# Extract to C:\ClamAV\

# Update virus definitions
& "C:\ClamAV\freshclam.exe"
```

### Run from source
```powershell
git clone https://github.com/pscstahl-dev/threatop.git
cd threatop
npm install
npm start
```

### Build installer
```powershell
npm run build
# Installer created in dist/
```

### Screensaver
```powershell
cd threatop-screensaver
npm install
npm run build

# Copy to Windows
xcopy "dist\win-unpacked\*" "C:\Windows\System32\ThreatOp\" /E /I /Y
copy "C:\Windows\System32\ThreatOp\ThreatOp Screensaver.exe" "C:\Windows\System32\ThreatOp\ThreatOp.scr"

# Register as screensaver
Set-ItemProperty -Path "HKCU:\Control Panel\Desktop" -Name "SCRNSAVE.EXE" -Value "C:\Windows\System32\ThreatOp\ThreatOp.scr"
Set-ItemProperty -Path "HKCU:\Control Panel\Desktop" -Name "ScreenSaveActive" -Value "1"
Set-ItemProperty -Path "HKCU:\Control Panel\Desktop" -Name "ScreenSaveTimeOut" -Value "60"
```

---

## Project Structure

```
threatop/
├── src/
│   ├── main/
│   │   ├── main.js          # Electron main process, ClamAV bridge, quarantine
│   │   └── preload.js       # Secure IPC bridge
│   └── renderer/
│       └── index.html       # War Room UI — radar, map, arcs, threat feed
├── threatop-screensaver/
│   ├── src/
│   │   ├── main/
│   │   │   ├── main.js      # Screensaver process, mouse detection, background scan
│   │   │   └── preload.js   # Screensaver IPC bridge
│   │   └── renderer/
│   │       └── index.html   # Fullscreen War Room screensaver UI
│   └── package.json
└── package.json
```

---

## Roadmap

```
Phase 1 (Complete)  → Desktop app + functional screensaver
Phase 2 (Next)      → threatop.io public file scanner website
Phase 3             → B2B developer API with Stripe billing
Phase 4             → Real-time background protection (always-on)
Phase 5             → Mobile companion app
```

---

## Prior Art Declaration

This repository was first committed on **June 19, 2026** by Vince ([@pscstahl-dev](https://github.com/pscstahl-dev)), establishing public prior art for the concept of a **functional security screensaver** — a screensaver that performs active malware scanning during computer idle time while displaying live global threat intelligence.

---

## License

MIT — free to use, modify, and distribute with attribution.

---

## Website

[threatop.io](https://threatop.io) — coming soon

---

*Built by law enforcement. Designed to hunt threats.*