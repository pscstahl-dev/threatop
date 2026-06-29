'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const os = require('os');

// ── Platform helpers ───────────────────────────────────────────────────────
const IS_WIN   = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';

let mainWindow;

function createWindow() {
  const iconFile = IS_WIN
    ? path.join(__dirname, '../../build/icon.ico')
    : path.join(__dirname, '../../build/icon.png');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#020810',
    ...(IS_LINUX ? {} : {
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#020810',
        symbolColor: '#00c8ff',
        height: 36,
      },
    }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: fs.existsSync(iconFile) ? iconFile : undefined,
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.env.NODE_ENV === 'dev') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── ClamAV detection ───────────────────────────────────────────────────────
const CLAMAV_WIN_DIR = 'C:\\ClamAV';

function findClamAV() {
  if (IS_LINUX) {
    const linuxPaths = [
      '/usr/bin/clamscan',
      '/usr/local/bin/clamscan',
      '/opt/homebrew/bin/clamscan',
    ];
    for (const p of linuxPaths) {
      if (fs.existsSync(p)) return { clamscan: p };
    }
    return { clamscan: 'clamscan' };
  }

  const installedPath = path.join(CLAMAV_WIN_DIR, 'clamscan.exe');
  if (fs.existsSync(installedPath)) return { clamscan: installedPath };

  const bundledDir = path.join(process.resourcesPath || path.join(__dirname, '../../'), 'clamav-bin');
  const bundledPath = path.join(bundledDir, 'clamscan.exe');
  if (fs.existsSync(bundledPath)) {
    installBundledClamAV(bundledDir);
    return { clamscan: bundledPath };
  }

  const winPaths = [
    'C:\\Program Files\\ClamAV\\clamscan.exe',
    'C:\\Program Files (x86)\\ClamAV\\clamscan.exe',
    path.join(os.homedir(), 'scoop', 'apps', 'clamav', 'current', 'clamscan.exe'),
  ];
  for (const p of winPaths) {
    if (fs.existsSync(p)) return { clamscan: p };
  }
  return { clamscan: 'clamscan' };
}

function installBundledClamAV(bundledDir) {
  if (!IS_WIN) return;
  try {
    if (!fs.existsSync(CLAMAV_WIN_DIR)) {
      fs.mkdirSync(CLAMAV_WIN_DIR, { recursive: true });
    }
    const { execSync } = require('child_process');
    execSync(`xcopy "${bundledDir}\\*" "${CLAMAV_WIN_DIR}\\" /E /I /Y /Q`, { windowsHide: true });

    const freshclam = path.join(CLAMAV_WIN_DIR, 'freshclam.exe');
    const conf      = path.join(CLAMAV_WIN_DIR, 'freshclam.conf');
    if (!fs.existsSync(conf)) {
      const sampleConf = path.join(CLAMAV_WIN_DIR, 'conf_examples', 'freshclam.conf.sample');
      if (fs.existsSync(sampleConf)) {
        let content = fs.readFileSync(sampleConf, 'utf8');
        content = content.replace(/^Example/m, '#Example');
        fs.writeFileSync(conf, content);
      }
    }
    if (fs.existsSync(freshclam)) {
      spawn(freshclam, [], { windowsHide: true, detached: true }).unref();
    }
  } catch (e) {
    console.log('ClamAV install error:', e.message);
  }
}

// ── Quarantine ─────────────────────────────────────────────────────────────
function getQuarantineDir() {
  if (IS_LINUX) {
    return path.join(os.homedir(), '.local', 'share', 'threatop', 'quarantine');
  }
  return 'C:\\ThreatOp\\Quarantine';
}

function ensureQuarantineDir() {
  const dir = getQuarantineDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function elevatedMove(src, dest) {
  return new Promise((resolve) => {
    const { exec: execCmd } = require('child_process');
    let cmd;
    if (IS_LINUX) {
      cmd = `pkexec mv "${src}" "${dest}"`;
    } else {
      cmd = `powershell -command "Copy-Item '${src}' '${dest}'; Remove-Item '${src}' -Force"`;
    }
    execCmd(cmd, (err) => {
      resolve(fs.existsSync(dest)
        ? { success: true, destPath: dest }
        : { success: false, error: err ? err.message : 'Unknown error' });
    });
  });
}

ipcMain.handle('quarantine-file', async (event, filePath) => {
  const quarantineDir = ensureQuarantineDir();
  const fileName  = path.basename(filePath);
  const destPath  = path.join(quarantineDir, `${Date.now()}_${fileName}.quarantine`);

  try {
    fs.renameSync(filePath, destPath);
    return { success: true, destPath };
  } catch (_) {}

  try {
    fs.copyFileSync(filePath, destPath);
    fs.unlinkSync(filePath);
    return { success: true, destPath };
  } catch (_) {}

  return elevatedMove(filePath, destPath);
});

ipcMain.handle('open-quarantine-folder', async () => {
  const dir = ensureQuarantineDir();
  shell.openPath(dir);
});

ipcMain.handle('restore-file', async (event, { quarantinePath, originalPath }) => {
  try {
    fs.renameSync(quarantinePath, originalPath);
    return { success: true };
  } catch (_) {}

  const { exec: execCmd } = require('child_process');
  return new Promise((resolve) => {
    let cmd;
    if (IS_LINUX) {
      cmd = `pkexec mv "${quarantinePath}" "${originalPath}"`;
    } else {
      cmd = `powershell -command "Copy-Item '${quarantinePath}' '${originalPath}'; Remove-Item '${quarantinePath}' -Force"`;
    }
    execCmd(cmd, (err) => {
      resolve(fs.existsSync(originalPath)
        ? { success: true }
        : { success: false, error: err ? err.message : 'Unknown error' });
    });
  });
});

// ── Scan ───────────────────────────────────────────────────────────────────
let activeScan  = null;
let scanPaused  = false;

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
  const args = ['--recursive', '--no-summary', '--stdout'];
  if (mode === 'full') args.push('--scan-archive=yes', '--max-recursion=10');
  args.push(...paths);

  // ── KEY FIX: On Linux use stdbuf to force line-buffered stdout so the
  //    Electron renderer gets real-time per-file updates instead of waiting
  //    for the OS pipe buffer to fill up.
  let proc;
  if (IS_LINUX) {
    // stdbuf -oL = line-buffered stdout; fall back gracefully if not found
    proc = spawn('stdbuf', ['-oL', clamscan, ...args], {
      env: { ...process.env },
    });
  } else {
    proc = spawn(clamscan, args, { windowsHide: true });
  }

  activeScan = proc;

  let fileCount   = 0;
  let threatCount = 0;
  const threats   = [];
  let buffer      = '';

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
        // Send update every file on Linux for real-time count, every 10 on Windows
        if (IS_LINUX || fileCount % 10 === 0) {
          mainWindow?.webContents.send('scan-event', { type: 'clean', file: okMatch[1].trim(), fileCount, threatCount });
        }
      }
    });
  });

  proc.stderr.on('data', (data) => {
    const msg = data.toString();
    if (!msg.includes('LibClamAV') && !msg.includes('fmap')) {
      mainWindow?.webContents.send('scan-event', { type: 'error', message: msg });
    }
  });

  // Handle stdbuf not being found — fall back to direct clamscan spawn
  proc.on('error', (err) => {
    if (IS_LINUX && err.code === 'ENOENT') {
      console.log('stdbuf not found, falling back to direct clamscan spawn');
      activeScan = spawn(clamscan, args, { env: { ...process.env } });
    }
  });

  return new Promise((resolve) => {
    proc.on('close', (code) => {
      activeScan = null;
      mainWindow?.webContents.send('scan-event', { type: 'complete', exitCode: code, fileCount, threatCount, threats });
      resolve({ fileCount, threatCount, threats });
    });
  });
});

ipcMain.handle('abort-scan', async () => {
  if (activeScan) {
    activeScan.kill();
    activeScan  = null;
    scanPaused  = false;
    return { aborted: true };
  }
  return { aborted: false };
});

ipcMain.handle('pause-scan', async () => {
  if (!activeScan || scanPaused) return { paused: false };

  if (IS_LINUX) {
    try { process.kill(activeScan.pid, 'SIGSTOP'); } catch (_) {}
  } else {
    const pid = activeScan.pid;
    exec(`powershell -command "$proc = Get-Process -Id ${pid}; $proc.Suspend()"`);
  }

  scanPaused = true;
  return { paused: true };
});

ipcMain.handle('resume-scan', async () => {
  if (!activeScan || !scanPaused) return { resumed: false };

  if (IS_LINUX) {
    try { process.kill(activeScan.pid, 'SIGCONT'); } catch (_) {}
  } else {
    const pid = activeScan.pid;
    exec(`powershell -command "$proc = Get-Process -Id ${pid}; $proc.Resume()"`);
  }

  scanPaused = false;
  return { resumed: true };
});

ipcMain.handle('open-file-location', async (event, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('update-definitions', async () => {
  if (IS_LINUX) {
    return new Promise((resolve) => {
      const proc = spawn('pkexec', ['freshclam']);
      let log = '';
      proc.stdout.on('data', d => { log += d.toString(); });
      proc.stderr.on('data', d => { log += d.toString(); });
      proc.on('close', code => resolve({ success: code === 0, log }));
    });
  } else {
    const freshclam = path.join(CLAMAV_WIN_DIR, 'freshclam.exe');
    return new Promise((resolve) => {
      const proc = spawn(freshclam, [], { windowsHide: true });
      let log = '';
      proc.stdout.on('data', d => { log += d.toString(); });
      proc.stderr.on('data', d => { log += d.toString(); });
      proc.on('close', code => resolve({ success: code === 0, log }));
    });
  }
});