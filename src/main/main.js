'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#020810',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#020810',
      symbolColor: '#00c8ff',
      height: 36,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../../build/icon.ico'),
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.env.NODE_ENV === 'dev') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── ClamAV detection ──────────────────────────────────────────────────────
function findClamAV() {
  const bundled = path.join(process.resourcesPath || '', 'clamav-bin', 'clamscan.exe');
  if (fs.existsSync(bundled)) return { clamscan: bundled };

  const winPaths = [
    'C:\\ClamAV\\clamscan.exe',
    'C:\\Program Files\\ClamAV\\clamscan.exe',
    'C:\\Program Files (x86)\\ClamAV\\clamscan.exe',
    path.join(os.homedir(), 'scoop', 'apps', 'clamav', 'current', 'clamscan.exe'),
  ];
  for (const p of winPaths) {
    if (fs.existsSync(p)) return { clamscan: p };
  }
  return { clamscan: 'clamscan' };
}

// ── Quarantine ────────────────────────────────────────────────────────────
const QUARANTINE_DIR = 'C:\\ThreatOp\\Quarantine';

function ensureQuarantineDir() {
  if (!fs.existsSync(QUARANTINE_DIR)) {
    fs.mkdirSync(QUARANTINE_DIR, { recursive: true });
  }
}

ipcMain.handle('quarantine-file', async (event, filePath) => {
  try {
    ensureQuarantineDir();
    const fileName = path.basename(filePath);
    const timestamp = Date.now();
    const destName = `${timestamp}_${fileName}.quarantine`;
    const destPath = path.join(QUARANTINE_DIR, destName);
    fs.renameSync(filePath, destPath);
    return { success: true, destPath };
  } catch (err) {
    try {
      ensureQuarantineDir();
      const fileName = path.basename(filePath);
      const timestamp = Date.now();
      const destName = `${timestamp}_${fileName}.quarantine`;
      const destPath = path.join(QUARANTINE_DIR, destName);
      fs.copyFileSync(filePath, destPath);
      fs.unlinkSync(filePath);
      return { success: true, destPath };
    } catch (err2) {
      return { success: false, error: err2.message };
    }
  }
});

ipcMain.handle('open-quarantine-folder', async () => {
  ensureQuarantineDir();
  shell.openPath(QUARANTINE_DIR);
});

// ── Scan ──────────────────────────────────────────────────────────────────
let activeScan = null;
let scanPaused = false;

ipcMain.handle('select-target', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'openFile', 'multiSelections'],
    title: 'Select scan target',
  });
  return result.canceled ? null : result.filePaths;
});

ipcMain.handle('check-clamav', async () => {
  const { clamscan } = findClamAV();
  return new Promise((resolve) => {
    exec(`"${clamscan}" --version`, (err, stdout) => {
      if (err) resolve({ found: false });
      else resolve({ found: true, version: stdout.trim().split('\n')[0] });
    });
  });
});

ipcMain.handle('start-scan', async (event, { paths, mode }) => {
  if (activeScan) return { error: 'Scan already running' };

  const { clamscan } = findClamAV();
  // Remove --infected so we get ALL file output for counting
  const args = ['--recursive', '--no-summary', '--stdout'];
  if (mode === 'full') args.push('--scan-archive=yes', '--max-recursion=10');
  args.push(...paths);

  const proc = spawn(clamscan, args, { windowsHide: true });
  activeScan = proc;

  let fileCount = 0;
  let threatCount = 0;
  const threats = [];
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
        fileCount++;
        threatCount++;
        const threat = { file: foundMatch[1].trim(), virus: foundMatch[2].trim(), ts: Date.now() };
        threats.push(threat);
        mainWindow?.webContents.send('scan-event', { type: 'threat', ...threat, fileCount, threatCount });
      } else if (okMatch) {
        fileCount++;
        // Update every 10 files to keep UI responsive without flooding IPC
        if (fileCount % 10 === 0) {
          mainWindow?.webContents.send('scan-event', { type: 'clean', file: okMatch[1].trim(), fileCount, threatCount });
        }
      }
    });
  });

  proc.stderr.on('data', (data) => {
    const msg = data.toString();
    // Filter out noisy LibClamAV errors
    if (!msg.includes('LibClamAV') && !msg.includes('fmap')) {
      mainWindow?.webContents.send('scan-event', { type: 'error', message: msg });
    }
  });

  return new Promise((resolve) => {
    proc.on('close', (code) => {
      activeScan = null;
      // Send final count on completion
      mainWindow?.webContents.send('scan-event', { type: 'complete', exitCode: code, fileCount, threatCount, threats });
      resolve({ fileCount, threatCount, threats });
    });
  });
});

ipcMain.handle('abort-scan', async () => {
  if (activeScan) { activeScan.kill(); activeScan = null; scanPaused = false; return { aborted: true }; }
  return { aborted: false };
});

ipcMain.handle('pause-scan', async () => {
  if (activeScan && !scanPaused) {
    // Suspend the process on Windows using taskkill /F is too aggressive
    // Instead we use the undocumented NtSuspendProcess via a PowerShell call
    const pid = activeScan.pid;
    const { exec: execCmd } = require('child_process');
    execCmd(`powershell -command "$proc = Get-Process -Id ${pid}; $proc.Suspend()"`, () => {});
    scanPaused = true;
    return { paused: true };
  }
  return { paused: false };
});

ipcMain.handle('resume-scan', async () => {
  if (activeScan && scanPaused) {
    const pid = activeScan.pid;
    const { exec: execCmd } = require('child_process');
    execCmd(`powershell -command "$proc = Get-Process -Id ${pid}; $proc.Resume()"`, () => {});
    scanPaused = false;
    return { resumed: true };
  }
  return { resumed: false };
});

ipcMain.handle('open-file-location', async (event, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('update-definitions', async () => {
  return new Promise((resolve) => {
    const proc = spawn('C:\\ClamAV\\freshclam.exe', [], { windowsHide: true });
    let log = '';
    proc.stdout.on('data', d => { log += d.toString(); });
    proc.stderr.on('data', d => { log += d.toString(); });
    proc.on('close', code => resolve({ success: code === 0, log }));
  });
});