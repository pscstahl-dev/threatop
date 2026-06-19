# ◈ War Room

**ClamAV-powered threat scanner. Built by law enforcement. Designed to hunt threats.**

A military command center UI for file and directory scanning, built on Electron + ClamAV.

---

## Quick start (Windows)

### 1. Install ClamAV

**Option A — Scoop (recommended):**
```powershell
scoop install clamav
freshclam   # download virus definitions
```

**Option B — Installer:**
Download from https://www.clamav.net/downloads and install to `C:\Program Files\ClamAV\`

After installing, run `freshclam` to download the virus database (required before first scan).

### 2. Install Node.js

Download from https://nodejs.org (LTS version)

### 3. Clone and run

```powershell
git clone <your-repo>
cd warroom
npm install
npm start
```

---

## Project structure

```
warroom/
├── src/
│   ├── main/
│   │   ├── main.js       # Electron main process, ClamAV bridge, IPC
│   │   └── preload.js    # Secure renderer bridge (contextBridge)
│   └── renderer/
│       └── index.html    # War Room UI (radar, HUD, threat feed)
├── build/
│   └── icon.ico          # App icon (add your own)
├── clamav-bin/           # Optional: bundled ClamAV for distribution
└── package.json
```

---

## How the radar works

The radar sweep represents the scanner moving through your file system:

- **Sweep angle** = scan progress (rotates continuously during active scan)
- **Blue blips** = files being checked (spawned near sweep line)
- **Red blips** = threats found (persist, pulse to draw attention)
- **Rings** = directory depth zones (/, /var, /home, /etc labeled)
- **Red alert border** = activates on first threat detection

---

## Scan modes

| Mode | What it does |
|------|-------------|
| **Quick** | Recursive scan, no archive extraction |
| **Full** | Full scan including archives (zip, rar, etc), slower |

---

## Building a distributable

```powershell
npm run build
```

This creates a Windows installer in `dist/`. To bundle ClamAV:

1. Download the ClamAV Windows portable build
2. Extract to `clamav-bin/` in the project root
3. Run `npm run build` — the binaries will be included in the installer

---

## Next: threat intelligence feeds

Planned integrations (Phase 2):
- **AlienVault OTX** — community threat intel, free API
- **AbuseCH** — malware/ransomware/botnet feeds
- **MalwareBazaar** — malware hash lookup
- **VirusTotal** — file hash check against 70+ engines (free tier)

These will populate the world map overlay with live global threat data.

---

## Roadmap

```
Phase 1 (now)   → Desktop app, radar UI, ClamAV scanning
Phase 2         → Live threat intel feeds, world map overlay
Phase 3         → Public file scanner website (warroom.io)
Phase 4         → B2B API + Stripe billing for developers
Phase 5         → Real-time background protection (clamonacc)
Bonus           → Functional screensaver mode
```

---

*MIT License. Free and open source.*
