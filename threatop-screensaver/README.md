# ThreatOp Screensaver

A functional Windows screensaver that scans your PC for threats while displaying the War Room UI.

## Build

```powershell
cd threatop-screensaver
npm install
npm run build
```

This creates `dist/ThreatOp Screensaver Setup 0.1.0.exe`

## Install as Windows Screensaver

After building, the installer sets it up automatically. To manually install:

1. Find `dist\win-unpacked\ThreatOp Screensaver.exe`
2. Copy it to `C:\Windows\System32\`
3. Rename it to `ThreatOp.scr`
4. Right-click Desktop → Personalize → Lock screen → Screen saver settings
5. Select **ThreatOp** from the dropdown
6. Set your idle timeout
7. Click OK

## What it does

- Displays the full War Room UI fullscreen
- World map with live OTX threat intel arcs
- Radar sweep continuously animating
- Scans `C:\Users` in quick mode in the background
- Progress shown in left panel and bottom bar
- On threat detection: red alert fires, system wakes, main ThreatOp app opens

## Exit

Any mouse movement (>5px) or keypress exits the screensaver immediately.
