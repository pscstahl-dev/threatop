'use strict';

const { app, BrowserWindow, ipcMain, screen, powerSaveBlocker } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
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

// ── ClamAV ────────────────────────────────────────────────────────────────
const CLAMAV_INSTALL_DIR = 'C:\\ClamAV';

function findClamAV() {
  const installedPath = path.join(CLAMAV_INSTALL_DIR, 'clamscan.exe');
  if (fs.existsSync(installedPath)) return installedPath;

  const bundledDir = path.join(process.resourcesPath || path.join(__dirname, '../../'), 'clamav-bin');
  const bundledPath = path.join(bundledDir, 'clamscan.exe');
  if (fs.existsSync(bundledPath)) {
    installBundledClamAV(bundledDir);
    return bundledPath;
  }

  return 'clamscan';
}

function installBundledClamAV(bundledDir) {
  try {
    if (!fs.existsSync(CLAMAV_INSTALL_DIR)) {
      fs.mkdirSync(CLAMAV_INSTALL_DIR, { recursive: true });
    }
    execSync(`xcopy "${bundledDir}\\*" "${CLAMAV_INSTALL_DIR}\\" /E /I /Y /Q`, { windowsHide: true });
    const freshclam = path.join(CLAMAV_INSTALL_DIR, 'freshclam.exe');
    const conf = path.join(CLAMAV_INSTALL_DIR, 'freshclam.conf');
    if (!fs.existsSync(conf)) {
      const sampleConf = path.join(CLAMAV_INSTALL_DIR, 'conf_examples', 'freshclam.conf.sample');
      if (fs.existsSync(sampleConf)) {
        let confContent = fs.readFileSync(sampleConf, 'utf8');
        confContent = confContent.replace(/^Example/m, '#Example');
        fs.writeFileSync(conf, confContent);
      }
    }
    if (fs.existsSync(freshclam)) {
      spawn(freshclam, [], { windowsHide: true, detached: true }).unref();
    }
  } catch (e) {
    console.log('ClamAV install error:', e.message);
  }
}

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

  // Preview mode — close on blur
  if (isPreview) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown') mainWindow.close();
    });
    mainWindow.on('blur', () => mainWindow && mainWindow.close());
    return;
  }

  // Full screensaver mode
  powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');

  mainWindow.webContents.on('did-finish-load', () => {
    if (!initialized) {
      initialized = true;

      const pos = screen.getCursorScreenPoint();
      mouseStartX = pos.x;
      mouseStartY = pos.y;

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

      mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown') exitScreensaver();
      });

      setTimeout(startBackgroundScan, 3000);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function startBackgroundScan() {
  const clamscan = findClamAV();
  const scanArgs = ['--recursive', '--no-summary', '--stdout', 'C:\\Users'];
  const proc = spawn(clamscan, scanArgs, { windowsHide: true });
  activeScan = proc;
  let fileCount = 0;
  let buffer = '';

  proc.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    lines.forEach((line) => {
      line = line.trim();
      if (!line) return;
      const foundMatch = line.match(/^(.+):\s+(.+)\s+FOUND$/i);
      const okMatch    = line.match(/^(.+):\s+OK$/i);
      if (foundMatch) {
        const threat = { file: foundMatch[1].trim(), virus: foundMatch[2].trim(), ts: Date.now() };
        mainWindow?.webContents.send('threat-found', threat);
        setTimeout(() => exitScreensaver(threat), 3000);
      } else if (okMatch) {
        fileCount++;
        if (fileCount % 10 === 0) mainWindow?.webContents.send('scan-progress', { fileCount });
      }
    });
  });

  proc.on('close', () => {
    activeScan = null;
    mainWindow?.webContents.send('scan-complete', { fileCount });
    setTimeout(startBackgroundScan, 30 * 60 * 1000);
  });
}

ipcMain.on('exit-screensaver', () => exitScreensaver());

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());