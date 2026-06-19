'use strict';

const { app, BrowserWindow, ipcMain, screen, powerSaveBlocker } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow;
let activeScan = null;
let mouseStartX = null;
let mouseStartY = null;
let powerBlockerId = null;

// ── Args: Windows passes /s (run), /p (preview), /c (configure) ──────────
const args = process.argv.slice(1);
const isPreview = args.some(a => a.toLowerCase().startsWith('/p'));
const isConfigure = args.some(a => a.toLowerCase().startsWith('/c'));

if (isConfigure) {
  // Nothing to configure — just quit
  app.quit();
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const bounds = screen.getPrimaryDisplay().bounds;

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    fullscreen: !isPreview,
    frame: false,
    alwaysOnTop: !isPreview,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    backgroundColor: '#020810',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Prevent display sleep while screensaver is running
  powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');

  // Track initial mouse position — exit on move
  const { x: initX, y: initY } = screen.getCursorScreenPoint();
  mouseStartX = initX;
  mouseStartY = initY;

  if (!isPreview) {
    // Poll mouse position every 200ms
    const mouseInterval = setInterval(() => {
      const { x, y } = screen.getCursorScreenPoint();
      const dx = Math.abs(x - mouseStartX);
      const dy = Math.abs(y - mouseStartY);
      if (dx > 5 || dy > 5) {
        clearInterval(mouseInterval);
        exitScreensaver();
      }
    }, 200);

    // Exit on any keypress
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown') exitScreensaver();
    });

    // Exit on click
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.executeJavaScript(`
        document.addEventListener('mousedown', () => { require('electron').ipcRenderer.send('exit-screensaver'); });
      `).catch(() => {});
    });
  }

  // Start background scan after 2 seconds
  setTimeout(startBackgroundScan, 2000);
}

function exitScreensaver(threat) {
  if (activeScan) { activeScan.kill(); activeScan = null; }
  if (powerBlockerId !== null) powerSaveBlocker.stop(powerBlockerId);

  if (threat) {
    // Launch main ThreatOp app with threat info
    const mainApp = path.join('C:\\Program Files\\War Room\\War Room.exe');
    if (fs.existsSync(mainApp)) {
      const { spawn: sp } = require('child_process');
      sp(mainApp, ['--threat', JSON.stringify(threat)], { detached: true, stdio: 'ignore' }).unref();
    }
  }

  app.quit();
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
  const args = ['--recursive', '--infected', '--no-summary', '--stdout', 'C:\\Users'];

  const proc = spawn(clamscan, args, { windowsHide: true });
  activeScan = proc;

  let fileCount = 0;

  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach((line) => {
      const foundMatch = line.match(/^(.+):\s+(.+)\s+FOUND$/i);
      const okMatch    = line.match(/^(.+):\s+OK$/i);

      if (foundMatch) {
        const threat = { file: foundMatch[1].trim(), virus: foundMatch[2].trim(), ts: Date.now() };
        // Send threat to renderer for red alert display
        mainWindow?.webContents.send('threat-found', threat);
        // Wake screen and exit after 3 seconds
        setTimeout(() => exitScreensaver(threat), 3000);
      } else if (okMatch) {
        fileCount++;
        if (fileCount % 25 === 0) {
          mainWindow?.webContents.send('scan-progress', { fileCount });
        }
      }
    });
  });

  proc.on('close', (code) => {
    activeScan = null;
    mainWindow?.webContents.send('scan-complete', { fileCount });
    // Restart scan after 30 min
    setTimeout(startBackgroundScan, 30 * 60 * 1000);
  });
}

// ── IPC ───────────────────────────────────────────────────────────────────
ipcMain.on('exit-screensaver', () => exitScreensaver());

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
