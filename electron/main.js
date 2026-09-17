const { app, BrowserWindow, Tray, Menu, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

// Prevent Windows GPU process launch crashes (error_code=18)
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('log-level', '3'); // Silence benign Chromium DirectComposition warnings

let mainWindow = null;
let tray = null;
let daemonProcess = null;
let isQuitting = false;
let hostUrl = 'http://localhost:3480';
let lanUrl = '';
let pairingPin = '7788';
try {
  const pinPath = path.join(__dirname, '..', '.pin');
  if (fs.existsSync(pinPath)) {
    const savedPin = fs.readFileSync(pinPath, 'utf8').trim();
    if (savedPin) pairingPin = savedPin;
  }
} catch {}

const PORT = process.env.KONTROL_PORT || 3480;

// ─── Launch Background Daemon Engine ─────────────────────────────────
function startDaemon() {
  const daemonScript = path.join(__dirname, '..', 'server', 'daemon.js');
  const env = {
    ...process.env,
    KONTROL_PORT: String(PORT),
    ELECTRON_RUN_AS_NODE: '1',
    KONTROL_RESOURCES_PATH: process.resourcesPath || path.join(path.dirname(process.execPath), 'resources')
  };

  try {
    const nodeExecutable = process.execPath;
    daemonProcess = spawn(nodeExecutable, [daemonScript], {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    daemonProcess.stdout.on('data', (data) => {
      const text = data.toString();
      const lanMatch = text.match(/Ethernet:\s+(http:\/\/[^\s]+)/i) || text.match(/Wi-Fi:\s+(http:\/\/[^\s]+)/i);
      if (lanMatch) lanUrl = lanMatch[1];
      const pinMatch = text.match(/Pairing PIN:\s+(\d+)/i);
      if (pinMatch) pairingPin = pinMatch[1];
    });

    daemonProcess.stderr.on('data', (data) => {
      console.error(`[Daemon Error] ${data}`);
    });

    daemonProcess.on('exit', (code) => {
      if (!isQuitting) {
        console.warn(`[Daemon] Exited with code ${code}. Restarting in 2s...`);
        setTimeout(startDaemon, 2000);
      }
    });
  } catch (err) {
    console.error('[Daemon] Failed to spawn background daemon:', err);
  }
}

// ─── Poll for Daemon Readiness ────────────────────────────────────────
function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve) => {
    function check() {
      const req = http.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve(true);
        } else {
          retry();
        }
      });
      req.on('error', retry);
      req.setTimeout(800, () => {
        req.destroy();
        retry();
      });
    }

    function retry() {
      if (Date.now() - start < timeoutMs) {
        setTimeout(check, 300);
      } else {
        resolve(false);
      }
    }

    check();
  });
}

// ─── Create Main Desktop Window ──────────────────────────────────────
async function createWindow() {
  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, '..', 'app.ico')
    : path.join(__dirname, '..', 'public', 'icon-512.png');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    icon: iconPath,
    title: 'MASHINA KONTROL · Desktop Command Hub',
    backgroundColor: '#0c0d0f',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  const ready = await waitForServer(hostUrl, 8000);
  if (ready) {
    mainWindow.loadURL(hostUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'public', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (process.platform === 'win32' && tray) {
        try {
          tray.displayBalloon({
            title: 'MASHINA KONTROL',
            content: 'Running minimized in system tray. Double-click tray icon to restore.'
          });
        } catch {}
      }
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

// ─── System Tray Integration ─────────────────────────────────────────
function createTray() {
  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, '..', 'app.ico')
    : path.join(__dirname, '..', 'public', 'icon-192.png');

  tray = new Tray(iconPath);
  tray.setToolTip('MASHINA KONTROL · Virtual Gamepad & PC Deck');

  const updateMenu = () => {
    try {
      const pinPath = path.join(__dirname, '..', '.pin');
      if (fs.existsSync(pinPath)) {
        const savedPin = fs.readFileSync(pinPath, 'utf8').trim();
        if (savedPin) pairingPin = savedPin;
      }
    } catch {}
    const copyTarget = lanUrl || `${hostUrl}/?pin=${pairingPin}`;
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'MASHINA KONTROL',
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Show Command Hub',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      {
        label: 'Copy Phone Pairing Link',
        click: () => {
          clipboard.writeText(copyTarget);
          if (process.platform === 'win32') {
            tray.displayBalloon({
              title: 'Pairing Link Copied',
              content: copyTarget
            });
          }
        }
      },
      {
        label: 'Open Hub in Web Browser',
        click: () => shell.openExternal(hostUrl)
      },
      { type: 'separator' },
      {
        label: 'Restart Host Daemon',
        click: () => {
          if (daemonProcess) {
            try { daemonProcess.kill(); } catch {}
          }
          startDaemon();
        }
      },
      {
        label: 'Quit MASHINA KONTROL',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);
    tray.setContextMenu(contextMenu);
  };

  updateMenu();

  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

// ─── Single Instance Lock ─────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    startDaemon();
    createWindow();
    createTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else if (mainWindow) {
        mainWindow.show();
      }
    });
  });
}

// ─── Graceful App Termination ─────────────────────────────────────────
app.on('before-quit', () => {
  isQuitting = true;
  if (daemonProcess) {
    try {
      daemonProcess.kill('SIGTERM');
    } catch {}
  }
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') {
    // macOS keeps app alive in dock/tray until explicitly quit
  } else {
    // On Windows/Linux, keep running in the tray unless user quits
  }
});
