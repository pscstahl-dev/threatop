'use strict';

const { app, BrowserWindow, ipcMain, screen, powerSaveBlocker } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let activeScan = null;
let powerBlockerId = null;
let mouseInterval = null;
let mouseStartX = null;
let mouseStartY = null;
let initialized = false;

const args = process.argv.slice(1);
const isPreview = args.some(a => a.toLowerCase().startsWith('/p'));
const isConfigure = args.some(a => a.toLowerCase().startsWith('/c'));

if (isConfigure) app.quit();

function exitScreensaver(threat) {
  if (mouseInterval) { clearInterval(mouseInterval); mouseInterval = null; }
  if (activeScan) { activeScan.kill(); activeScan = null; }
  if (powerBlockerId !== null) { powerSaveBlocker.stop(powerBlockerId); powerBlockerId = null; }
  if (mainWindow) { mainWindow.destroy(); mainWindow = null; }
  if (threat) {
    const mainAppPath = 'C:\\Program Files\\War Room\\War Room.exe';
    if (fs.existsSync(mainAppPath)) {
      const { spawn: sp } = require('child_process');
      sp(mainAppPath, ['--threat', JSON.stringify(threat)], { detached: true, stdio: 'ignore' }).unref();
    }
  }
  setTimeout(() => app.quit(), 500);
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  mainWindow = new BrowserWindow({
    x: isPreview ? 100 : x,
    y: isPreview ? 100 : y,
    width: isPreview ? 600 : width,
    height: isPreview ? 400 : height,
    fullscreen: !isPreview,
    frame: isPreview,
    alwaysOnTop: !isPreview,
    skipTaskbar: !isPreview,
    resizable: isPreview,
    movable: isPreview,
    backgroundColor: '#020810',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Preview mode — close on any click or keypress
  if (isPreview) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown') mainWindow.close();
      });
    });
    mainWindow.on('blur', () => mainWindow && mainWindow.close());
    return;
  }

  // Full screensaver mode
  powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');

  mainWindow.webContents.on('did-finish-load', () => {
    if (!initialized) {
      initialized = true;

      // Record starting mouse position
      const pos = screen.getCursorScreenPoint();
      mouseStartX = pos.x;
      mouseStartY = pos.y;

      // Poll mouse every 100ms — exit on movement > 2px
      mouseInterval = setInterval(() => {
        try {
          const cur = screen.getCursorScreenPoint();
          const dx = Math.abs(cur.x - mouseStartX);
          const dy = Math.abs(cur.y - mouseStartY);
          if (dx > 2 || dy > 2) {
            clearInterval(mouseInterval);
            mouseInterval = null;
            exitScreensaver();
          }
        } catch (e) {
          exitScreensaver();
        }
      }, 100);

      // Exit on any keypress
      mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown') exitScreensaver();
      });

      // Start background scan after 3 seconds
      setTimeout(startBackgroundScan, 3000);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── ClamAV ────────────────────────────────────────────────────────────────
function findClamAV() {
  const paths = [
    'C:\\ClamAV\\clamscan.exe',
    'C:\\Program Files\\ClamAV\\clamscan.exe',
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return 'clamscan';
}

function startBackgroundScan() {
  const clamscan = findClamAV();
  const scanArgs = ['--recursive', '--infected', '--no-summary', '--stdout', 'C:\\Users'];
  const proc = spawn(clamscan, scanArgs, { windowsHide: true });
  activeScan = proc;
  let fileCount = 0;

  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach((line) => {
      const foundMatch = line.match(/^(.+):\s+(.+)\s+FOUND$/i);
      const okMatch    = line.match(/^(.+):\s+OK$/i);
      if (foundMatch) {
        const threat = { file: foundMatch[1].trim(), virus: foundMatch[2].trim(), ts: Date.now() };
        mainWindow?.webContents.send('threat-found', threat);
        setTimeout(() => exitScreensaver(threat), 3000);
      } else if (okMatch) {
        fileCount++;
        if (fileCount % 25 === 0) mainWindow?.webContents.send('scan-progress', { fileCount });
      }
    });
  });

  proc.on('close', () => {
    activeScan = null;
    mainWindow?.webContents.send('scan-complete', { fileCount });
    setTimeout(startBackgroundScan, 30 * 60 * 1000);
  });
}

// ── IPC ───────────────────────────────────────────────────────────────────
ipcMain.on('exit-screensaver', () => exitScreensaver());

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());