#!/usr/bin/env node
/**
 * MASHINA KONTROL — Desktop Host Daemon (Ultimate PC Control Engine)
 * Zero-install, ultra-low latency WebSocket input bridge & HTTP server.
 * 
 * Part of Mashina Studio (https://mashina-studio.eu)
 * Author: Mashina Studio / Bexx
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn, execSync } = require('child_process');

// ─── Process Stream Protection & Safe Logging ────────────────────────
const LOG_FILE = path.join(__dirname, '..', 'daemon.log');
function writeToLogFile(level, text) {
  try {
    const ts = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `[${ts}] [${level}] ${text}\n`, 'utf8');
  } catch {}
}

if (process.stdout) {
  process.stdout.on('error', (err) => {
    if (err && (err.code === 'EPIPE' || err.code === 'EOF' || err.code === 'ERR_STREAM_DESTROYED')) return;
  });
}
if (process.stderr) {
  process.stderr.on('error', (err) => {
    if (err && (err.code === 'EPIPE' || err.code === 'EOF' || err.code === 'ERR_STREAM_DESTROYED')) return;
  });
}
if (process.stdin) {
  process.stdin.on('error', () => {});
}

// Mirror console output to daemon.log for guaranteed diagnostic persistence
const _origLog = console.log;
const _origWarn = console.warn;
const _origError = console.error;
console.log = (...args) => {
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  writeToLogFile('INFO', line);
  try { _origLog.apply(console, args); } catch {}
};
console.warn = (...args) => {
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  writeToLogFile('WARN', line);
  try { _origWarn.apply(console, args); } catch {}
};
console.error = (...args) => {
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  writeToLogFile('ERROR', line);
  try { _origError.apply(console, args); } catch {}
};

const PORT = parseInt(process.env.KONTROL_PORT || '3480', 10);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const CONFIG_FILE = path.join(__dirname, '..', 'presets.json');
const PLATFORM = os.platform(); // 'linux', 'win32', 'darwin'
const ALLOW_SHELL_MACROS = process.env.ALLOW_SHELL_MACROS === 'true';
const PIN_FILE = path.join(__dirname, '..', '.pin');

function getOrInitPin() {
  if (process.env.KONTROL_PIN) return process.env.KONTROL_PIN.trim();
  try {
    if (fs.existsSync(PIN_FILE)) {
      const saved = fs.readFileSync(PIN_FILE, 'utf8').trim();
      if (/^\d{4,6}$/.test(saved)) return saved;
    }
  } catch {}
  const generated = String(Math.floor(1000 + Math.random() * 9000));
  try {
    fs.writeFileSync(PIN_FILE, generated, 'utf8');
  } catch {}
  return generated;
}

let PAIRING_PIN = getOrInitPin();

// ─── Network Interface Enumeration ──────────────────────────────────
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // Must be IPv4, non-internal, and NOT a dead link-local APIPA address (169.254.x.x)
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.') && !net.address.startsWith('127.')) {
        addresses.push({ name, ip: net.address });
      }
    }
  }

  // Sort real LAN subnets (192.168.x.x, 10.x.x.x, 172.16-31.x.x) first, before VPN/virtual adapters
  addresses.sort((a, b) => {
    const isLanA = a.ip.startsWith('192.168.') || a.ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(a.ip);
    const isLanB = b.ip.startsWith('192.168.') || b.ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(b.ip);
    if (isLanA && !isLanB) return -1;
    if (!isLanA && isLanB) return 1;
    return 0;
  });

  return addresses;
}

// ─── Minimal ANSI Banner ────────────────────────────────────────────
function printAnsiBanner(port, ips, pin) {
  console.log('\x1b[38;2;200;16;46m');
  console.log('  ███╗   ███╗ █████╗ ███████╗██╗  ██╗██╗███╗   ██╗ █████╗ ');
  console.log('  ████╗ ████║██╔══██╗██╔════╝██║  ██║██║████╗  ██║██╔══██╗');
  console.log('  ██╔████╔██║███████║███████╗███████║██║██╔██╗ ██║███████║');
  console.log('  ██║╚██╔╝██║██╔══██║╚════██║██╔══██║██║██║╚██╗██║██╔══██║');
  console.log('  ██║ ╚═╝ ██║██║  ██║███████║██║  ██║██║██║ ╚████║██║  ██║');
  console.log('  ╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝');
  console.log('\x1b[0m\x1b[1m  K O N T R O L   ·   U L T I M A T E   P C   D E C K\x1b[0m');
  console.log('  \x1b[90mBuilt by a machine. Judged by humans. (Mashina Studio)\x1b[0m\n');

  console.log('  \x1b[32m●\x1b[0m \x1b[1mHost Daemon Online:\x1b[0m http://localhost:' + port);
  console.log(`  \x1b[33m●\x1b[0m \x1b[1mPairing PIN:\x1b[0m        \x1b[33;1m${pin}\x1b[0m \x1b[90m(Required for remote LAN connections)\x1b[0m`);
  ips.forEach(({ name, ip }) => {
    const isTailscale = ip.startsWith('100.');
    const label = isTailscale ? 'Tailscale' : name;
    console.log(`  \x1b[36m→\x1b[0m \x1b[1m${label}:\x1b[0m http://${ip}:${port}/?pin=${pin}`);
  });
  console.log('\n  \x1b[90mScan or open on your mobile phone / tablet on the same Wi-Fi.\x1b[0m\n');
}

// ─── Windows Native Win32 Input Host (Sub-Millisecond SendInput) ────
class Win32InputHelper {
  constructor() {
    this.process = null;
    this.ready = false;
    this.vigemEnabled = false;
    this.binDir = this.resolveBinDir();
    this.exePath = path.join(this.binDir, 'kontrol-wininput.exe');
    this.srcPath = path.join(__dirname, 'src', 'KontrolWinInput.cs');
    this.queue = [];
    this.ensureBinaryAndStart();
  }

  resolveBinDir() {
    const candidates = [
      process.env.KONTROL_RESOURCES_PATH ? path.join(process.env.KONTROL_RESOURCES_PATH, 'server', 'bin') : '',
      process.resourcesPath ? path.join(process.resourcesPath, 'server', 'bin') : '',
      path.join(path.dirname(process.execPath), 'resources', 'server', 'bin'),
      path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'bin'),
      path.join(__dirname, '..', 'server', 'bin'),
      path.join(__dirname, 'bin'),
      path.join(process.cwd(), 'server', 'bin')
    ].filter(Boolean);

    for (const dir of candidates) {
      try {
        const testExe = path.join(dir, 'kontrol-wininput.exe');
        if (!dir.includes('app.asar') && fs.existsSync(testExe)) {
          return dir;
        }
      } catch {}
    }

    // Extraction fallback for packaged Electron apps:
    // If inside app.asar without unpacked files, extract to %TEMP%/mashina-kontrol-bin
    const tempBin = path.join(os.tmpdir(), 'mashina-kontrol-bin');
    try {
      if (!fs.existsSync(tempBin)) fs.mkdirSync(tempBin, { recursive: true });
      const internalBin = path.join(__dirname, 'bin');
      const files = ['kontrol-wininput.exe', 'Nefarius.ViGEm.Client.dll'];
      for (const f of files) {
        const src = path.join(internalBin, f);
        const dst = path.join(tempBin, f);
        if (fs.existsSync(src)) {
          try {
            fs.writeFileSync(dst, fs.readFileSync(src));
          } catch {}
        }
      }
      if (fs.existsSync(path.join(tempBin, 'kontrol-wininput.exe'))) {
        return tempBin;
      }
    } catch (e) {
      console.warn('[WinInput] Temp extraction failed:', e.message);
    }

    return path.join(__dirname, 'bin');
  }

  ensureBinaryAndStart() {
    let needsCompile = !fs.existsSync(this.exePath);
    if (!needsCompile && fs.existsSync(this.srcPath)) {
      try {
        const srcStat = fs.statSync(this.srcPath);
        const exeStat = fs.statSync(this.exePath);
        if (srcStat.mtimeMs > exeStat.mtimeMs) {
          needsCompile = true;
        }
      } catch {}
    }
    if (needsCompile) {
      this.compileBinary();
    }
    this.startProcess();
  }

  compileBinary() {
    if (!fs.existsSync(this.binDir)) {
      fs.mkdirSync(this.binDir, { recursive: true });
    }

    const cscPaths = [
      'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
      'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
    ];
    const csc = cscPaths.find(p => fs.existsSync(p)) || 'csc.exe';

    const icoPath = path.join(__dirname, '..', 'app.ico');
    const icoFlag = fs.existsSync(icoPath) ? ` /win32icon:"${icoPath}"` : '';

    console.log(`[WinInput] Compiling native helper with ${csc}...`);
    try {
      execSync(`"${csc}" /nologo /optimize+${icoFlag} /out:"${this.exePath}" "${this.srcPath}"`, { stdio: 'inherit' });
      console.log(`[WinInput] Native helper compiled successfully: ${this.exePath}`);
    } catch (e) {
      console.error(`[WinInput] Failed to compile helper:`, e.message);
    }
  }

  startProcess() {
    if (!fs.existsSync(this.exePath)) {
      console.warn(`[WinInput] Native helper not found at ${this.exePath}. Input simulation unavailable.`);
      return;
    }

    try {
      this.process = spawn(this.exePath, [], {
        cwd: this.binDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      this.process.on('error', (err) => {
        console.error('[WinInput] Helper process error:', err.message);
      });

      if (this.process.stdin) {
        this.process.stdin.on('error', () => {});
      }

      if (this.process.stdout) {
        this.process.stdout.on('error', () => {});
      }

      if (this.process.stderr) {
        this.process.stderr.on('data', (d) => {
          console.warn('[WinInput stderr]:', d.toString().trim());
        });
        this.process.stderr.on('error', () => {});
      }

      this.process.stdout.on('data', (data) => {
        const text = data.toString();
        if (text.includes('KONTROL_WININPUT_READY')) {
          this.ready = true;
          this.vigemEnabled = text.includes('VIGEM_ENABLED');
          if (this.vigemEnabled) {
            console.log('[WinInput] Native ViGEm Virtual Xbox 360 Gamepad & Win32 SendInput active (<0.1ms latency)');
          } else {
            console.log('[WinInput] Native Win32 SendInput engine active (<0.1ms latency)');
          }
          while (this.queue.length > 0) {
            const cmd = this.queue.shift();
            this.sendRaw(cmd);
          }
        }
      });

      this.process.on('exit', (code) => {
        this.ready = false;
        this.process = null;
        if (code !== 0 && code !== null) {
          console.warn(`[WinInput] Process exited with code ${code}. Restarting...`);
          setTimeout(() => this.startProcess(), 1000);
        }
      });
    } catch (err) {
      console.error(`[WinInput] Failed to spawn helper:`, err.message);
    }
  }

  sendRaw(cmd) {
    if (this.process && this.ready && this.process.stdin && this.process.stdin.writable) {
      try {
        this.process.stdin.write(cmd + '\n');
      } catch {}
    } else {
      if (this.queue.length < 500) {
        this.queue.push(cmd);
      }
    }
  }

  gamepadConnect(slot = 1) {
    this.sendRaw(`GP_CONNECT ${slot}`);
  }

  gamepadDisconnect(slot = 1) {
    this.sendRaw(`GP_DISCONNECT ${slot}`);
  }

  gamepadButton(slot = 1, button, isDown) {
    this.sendRaw(`GP_BTN ${slot} ${button} ${isDown ? 1 : 0}`);
  }

  gamepadAxis(slot = 1, axis, value) {
    this.sendRaw(`GP_AXIS ${slot} ${axis} ${Math.round(value)}`);
  }

  gamepadTrigger(slot = 1, trigger, value) {
    this.sendRaw(`GP_TRIGGER ${slot} ${trigger} ${Math.round(value)}`);
  }

  keyDown(key) {
    this.sendRaw(`KD ${key}`);
  }

  keyUp(key) {
    this.sendRaw(`KU ${key}`);
  }

  keyTap(key) {
    this.sendRaw(`KT ${key}`);
  }

  chord(keys) {
    this.sendRaw(`CHORD ${keys}`);
  }

  mouseMove(dx, dy) {
    this.sendRaw(`MM ${Math.round(dx)} ${Math.round(dy)}`);
  }

  mouseDown(btn) {
    this.sendRaw(`MD ${btn}`);
  }

  mouseUp(btn) {
    this.sendRaw(`MU ${btn}`);
  }

  mouseClick(btn) {
    this.sendRaw(`MC ${btn}`);
  }

  mouseWheel(delta) {
    this.sendRaw(`MW ${delta}`);
  }

  typeString(str) {
    this.sendRaw(`TXT ${str}`);
  }
}

// ─── Native macOS Input Helper (CoreGraphics & AppleScript) ─────────
class MacInputHelper {
  constructor() {
    this.process = null;
    this.ready = false;
    this.queue = [];
    this.binPath = this.resolveBinPath();
    this.init();
  }

  resolveBinPath() {
    const candidates = [
      process.env.KONTROL_RESOURCES_PATH ? path.join(process.env.KONTROL_RESOURCES_PATH, 'server', 'bin', 'kontrol-macinput') : '',
      process.resourcesPath ? path.join(process.resourcesPath, 'server', 'bin', 'kontrol-macinput') : '',
      path.join(path.dirname(process.execPath), 'resources', 'server', 'bin', 'kontrol-macinput'),
      path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'bin', 'kontrol-macinput'),
      path.join(__dirname, 'bin', 'kontrol-macinput'),
      path.join(process.cwd(), 'server', 'bin', 'kontrol-macinput')
    ].filter(Boolean);

    for (const p of candidates) {
      try {
        if (!p.includes('app.asar') && fs.existsSync(p)) return p;
      } catch {}
    }
    return path.join(__dirname, 'bin', 'kontrol-macinput');
  }

  init() {
    if (fs.existsSync(this.binPath)) {
      try {
        this.process = spawn(this.binPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
        this.process.stdout.on('data', (data) => {
          if (data.toString().includes('KONTROL_MACINPUT_READY')) {
            this.ready = true;
            console.log('[MacInput] Native CoreGraphics input engine active (<0.1ms latency)');
            while (this.queue.length > 0) {
              const cmd = this.queue.shift();
              this.sendRaw(cmd);
            }
          }
        });
        this.process.on('exit', () => {
          this.ready = false;
          this.process = null;
        });
      } catch (err) {
        console.warn('[MacInput] Native helper failed to spawn. Using AppleScript fallback.');
      }
    } else {
      console.log('[MacInput] Native helper binary not found. Using AppleScript bridge for macOS.');
      this.ready = true;
    }
  }

  sendRaw(cmd) {
    if (this.process && this.ready && this.process.stdin && this.process.stdin.writable) {
      try {
        this.process.stdin.write(cmd + '\n');
      } catch {}
    } else {
      // Fallback via AppleScript
      const parts = cmd.split(' ');
      if (parts[0] === 'TXT') {
        const text = cmd.slice(4).replace(/"/g, '\\"');
        exec(`osascript -e 'tell application "System Events" to keystroke "${text}"'`);
      } else if (parts[0] === 'KT' || parts[0] === 'KD') {
        const key = parts[1];
        exec(`osascript -e 'tell application "System Events" to key code ${key}'`);
      }
    }
  }

  mouseMove(dx, dy) {
    this.sendRaw(`MM ${Math.round(dx)} ${Math.round(dy)}`);
  }

  mouseDown(btn) {
    this.sendRaw(`MD ${btn}`);
  }

  mouseUp(btn) {
    this.sendRaw(`MU ${btn}`);
  }

  mouseClick(btn) {
    this.mouseDown(btn);
    setTimeout(() => this.mouseUp(btn), 20);
  }

  mouseWheel(delta) {
    this.sendRaw(`MW ${delta}`);
  }

  keyDown(code) {
    this.sendRaw(`KD ${code}`);
  }

  keyUp(code) {
    this.sendRaw(`KU ${code}`);
  }

  keyTap(code) {
    this.sendRaw(`KD ${code}`);
    setTimeout(() => this.sendRaw(`KU ${code}`), 25);
  }

  typeString(str) {
    this.sendRaw(`TXT ${str}`);
  }
}

// ─── Native OS Input Simulation Engine ──────────────────────────────
class InputEngine {
  constructor() {
    this.hasXdotool = false;
    this.win32Helper = null;
    this.macHelper = null;
    this.keyRefCount = new Map();
    this.mouseAccumulator = { dx: 0, dy: 0 };
    this.mouseFlushTimer = null;
    this.init();
  }

  init() {
    if (PLATFORM === 'win32') {
      this.win32Helper = new Win32InputHelper();
    } else if (PLATFORM === 'darwin') {
      this.macHelper = new MacInputHelper();
    } else if (PLATFORM === 'linux') {
      exec('which xdotool', (err) => {
        if (!err) this.hasXdotool = true;
      });
    }
  }

  gamepadConnect(slot = 1) {
    if (PLATFORM === 'win32' && this.win32Helper) {
      this.win32Helper.gamepadConnect(slot);
    }
  }

  gamepadDisconnect(slot = 1) {
    if (PLATFORM === 'win32' && this.win32Helper) {
      this.win32Helper.gamepadDisconnect(slot);
    }
  }

  gamepadButton(slot = 1, button, isDown) {
    if (PLATFORM === 'win32' && this.win32Helper) {
      this.win32Helper.gamepadButton(slot, button, isDown);
    }
  }

  gamepadAxis(slot = 1, axis, value) {
    if (PLATFORM === 'win32' && this.win32Helper) {
      this.win32Helper.gamepadAxis(slot, axis, value);
    }
  }

  gamepadTrigger(slot = 1, trigger, value) {
    if (PLATFORM === 'win32' && this.win32Helper) {
      this.win32Helper.gamepadTrigger(slot, trigger, value);
    }
  }

  keyDown(key) {
    const count = (this.keyRefCount.get(key) || 0) + 1;
    this.keyRefCount.set(key, count);
    if (count === 1) {
      this.simulateKey(key, 'down');
    }
  }

  keyUp(key) {
    const count = this.keyRefCount.get(key) || 0;
    if (count <= 1) {
      this.keyRefCount.delete(key);
      if (count === 1) {
        this.simulateKey(key, 'up');
      }
    } else {
      this.keyRefCount.set(key, count - 1);
    }
  }

  keyTap(key) {
    this.simulateKey(key, 'tap');
  }

  typeString(str) {
    if (PLATFORM === 'win32' && this.win32Helper) {
      this.win32Helper.typeString(str);
      return;
    }
    if (PLATFORM === 'darwin' && this.macHelper) {
      this.macHelper.typeString(str);
      return;
    }
    if (PLATFORM === 'linux' && this.hasXdotool) {
      const safe = str.replace(/'/g, "'\\''");
      exec(`xdotool type -- '${safe}'`);
    }
  }

  mouseMove(dx, dy) {
    if (PLATFORM === 'win32' && this.win32Helper) {
      this.win32Helper.mouseMove(dx, dy);
      return;
    }
    if (PLATFORM === 'darwin' && this.macHelper) {
      this.macHelper.mouseMove(dx, dy);
      return;
    }

    this.mouseAccumulator.dx += dx;
    this.mouseAccumulator.dy += dy;
    if (!this.mouseFlushTimer) {
      this.mouseFlushTimer = setImmediate(() => {
        const { dx, dy } = this.mouseAccumulator;
        this.mouseAccumulator.dx = 0;
        this.mouseAccumulator.dy = 0;
        this.mouseFlushTimer = null;
        this.simulateMouseMove(dx, dy);
      });
    }
  }

  mouseClick(button = 1) {
    const btnNum = parseInt(button, 10) || 1;
    const safeBtn = (btnNum >= 1 && btnNum <= 5) ? btnNum : 1;
    if (PLATFORM === 'win32' && this.win32Helper) {
      this.win32Helper.mouseClick(safeBtn);
      return;
    }
    if (PLATFORM === 'darwin' && this.macHelper) {
      this.macHelper.mouseClick(safeBtn);
      return;
    }
    if (PLATFORM === 'linux' && this.hasXdotool) {
      exec(`xdotool click ${safeBtn}`);
    }
  }

  mouseScroll(direction) {
    if (PLATFORM === 'win32' && this.win32Helper) {
      // Wheel down is negative delta (-120), wheel up is positive delta (+120)
      const delta = direction > 0 ? -120 : 120;
      this.win32Helper.mouseWheel(delta);
      return;
    }
    if (PLATFORM === 'darwin' && this.macHelper) {
      const delta = direction > 0 ? -5 : 5;
      this.macHelper.mouseWheel(delta);
      return;
    }
    const btn = direction > 0 ? 5 : 4;
    if (PLATFORM === 'linux' && this.hasXdotool) {
      exec(`xdotool click ${btn}`);
    }
  }

  simulateKey(key, action = 'tap') {
    // ─── Windows High-Performance SendInput Mapping ─────────────────
    if (PLATFORM === 'win32' && this.win32Helper) {
      const win32KeyMap = {
        // Xbox / Standard Gamepad
        'BTN_A': 'SPACE',
        'BTN_B': 'ESCAPE',
        'BTN_X': 'F',
        'BTN_Y': 'E',
        'BTN_LB': 'Q',
        'BTN_RB': 'R',
        'BTN_LT': 'LSHIFT',
        'BTN_RT': 'LCONTROL',
        'BTN_START': 'RETURN',
        'BTN_SELECT': 'TAB',
        'BTN_HOME': 'LWIN',
        // PlayStation Aliases
        'BTN_CROSS': 'SPACE',
        'BTN_CIRCLE': 'ESCAPE',
        'BTN_SQUARE': 'F',
        'BTN_TRIANGLE': 'E',
        'BTN_L1': 'Q',
        'BTN_R1': 'R',
        'BTN_L2': 'LSHIFT',
        'BTN_R2': 'LCONTROL',
        'BTN_SHARE': 'TAB',
        'BTN_OPTIONS': 'RETURN',
        'BTN_PS': 'LWIN',
        'BTN_TOUCHPAD': 'TAB',
        // Nintendo Retro Aliases
        'BTN_TURBO_A': 'SPACE',
        'BTN_TURBO_B': 'ESCAPE',
        // PlayStation Specific Data-Keys
        'BTN_PS_TRIANGLE': 'E',
        'BTN_PS_SQUARE': 'F',
        'BTN_PS_CIRCLE': 'ESCAPE',
        'BTN_PS_CROSS': 'SPACE',
        // SNES Specific Data-Keys
        'BTN_SNES_X': 'E',
        'BTN_SNES_Y': 'F',
        'BTN_SNES_A': 'ESCAPE',
        'BTN_SNES_B': 'SPACE',
        // D-Pad
        'DPAD_UP': 'UP',
        'DPAD_DOWN': 'DOWN',
        'DPAD_LEFT': 'LEFT',
        'DPAD_RIGHT': 'RIGHT',
        // Analog Stick (WASD Mode)
        'STICK_UP': 'W',
        'STICK_DOWN': 'S',
        'STICK_LEFT': 'A',
        'STICK_RIGHT': 'D',
        // Presentation Keys
        'PRES_NEXT': 'PAGEDOWN',
        'PRES_PREV': 'PAGEUP',
        'PRES_START': 'F5',
        'PRES_EXIT': 'ESCAPE',
        'PRES_BLACK': 'B',
        'PRES_WHITE': 'W',
        // Media Keys
        'MEDIA_PLAY': 'MEDIA_PLAY',
        'MEDIA_NEXT': 'MEDIA_NEXT',
        'MEDIA_PREV': 'MEDIA_PREV',
        'MEDIA_VOL_UP': 'MEDIA_VOL_UP',
        'MEDIA_VOL_DOWN': 'MEDIA_VOL_DOWN',
        'MEDIA_MUTE': 'MEDIA_MUTE',
        // Comms & Shortcuts
        'DISCORD_MUTE': 'LCONTROL+LSHIFT+M',
        'DISCORD_DEAFEN': 'LCONTROL+LSHIFT+D',
        'OBS_SCENE_1': 'F13',
        'OBS_SCENE_2': 'F14',
        'OBS_SCENE_3': 'F15',
        'OBS_REC': 'F16',
        'CLIP_SCREENSHOT': 'LWIN+LSHIFT+S',
        'CLIP_COPY': 'LCONTROL+C',
        'CLIP_PASTE': 'LCONTROL+V',
        'UNDO': 'LCONTROL+Z',
        // Standard Keyboard Keys
        'ESC': 'ESCAPE',
        'TAB': 'TAB',
        'CAPS': 'CAPSLOCK',
        'CAPSLOCK': 'CAPSLOCK',
        'ENTER': 'RETURN',
        'BACKSPACE': 'BACKSPACE',
        'BKSP': 'BACKSPACE',
        'SPACE': 'SPACE',
        'CTRL': 'LCONTROL',
        'CONTROL': 'LCONTROL',
        'ALT': 'LMENU',
        'SHIFT': 'LSHIFT',
        'SUPER': 'LWIN',
        'WIN': 'LWIN',
        'ARROWUP': 'UP',
        'ARROWDOWN': 'DOWN',
        'ARROWLEFT': 'LEFT',
        'ARROWRIGHT': 'RIGHT',
        'DELETE': 'DELETE',
        // Numpad Keys
        'NUM_0': 'NUM_0', 'NUM_1': 'NUM_1', 'NUM_2': 'NUM_2', 'NUM_3': 'NUM_3',
        'NUM_4': 'NUM_4', 'NUM_5': 'NUM_5', 'NUM_6': 'NUM_6', 'NUM_7': 'NUM_7',
        'NUM_8': 'NUM_8', 'NUM_9': 'NUM_9', 'NUM_DOT': 'NUM_DOT',
        'NUM_DIV': 'NUM_DIV', 'NUM_MUL': 'NUM_MUL', 'NUM_SUB': 'NUM_SUB',
        'NUM_ADD': 'NUM_ADD', 'NUM_ENTER': 'NUM_ENTER', 'NUM_CLEAR': 'ESCAPE',
        'NUM_BACKSPACE': 'BACKSPACE',
      };

      const mapped = win32KeyMap[key] || key;

      if (mapped.includes('+')) {
        this.win32Helper.chord(mapped);
      } else if (action === 'down') {
        this.win32Helper.keyDown(mapped);
      } else if (action === 'up') {
        this.win32Helper.keyUp(mapped);
      } else {
        this.win32Helper.keyTap(mapped);
      }
      return;
    }

    // ─── macOS CoreGraphics / AppleScript Mapping ───────────────────
    if (PLATFORM === 'darwin' && this.macHelper) {
      const macKeyMap = {
        'BTN_A': 49, 'BTN_B': 53, 'BTN_X': 3, 'BTN_Y': 14,
        'BTN_LB': 12, 'BTN_RB': 15, 'BTN_LT': 56, 'BTN_RT': 59,
        'BTN_START': 36, 'BTN_SELECT': 48, 'BTN_HOME': 55,
        'BTN_CROSS': 49, 'BTN_CIRCLE': 53, 'BTN_SQUARE': 3, 'BTN_TRIANGLE': 14,
        'BTN_L1': 12, 'BTN_R1': 15, 'BTN_L2': 56, 'BTN_R2': 59,
        'BTN_SHARE': 48, 'BTN_OPTIONS': 36, 'BTN_PS': 55, 'BTN_TOUCHPAD': 48,
        'BTN_PS_CROSS': 49, 'BTN_PS_CIRCLE': 53, 'BTN_PS_SQUARE': 3, 'BTN_PS_TRIANGLE': 14,
        'BTN_TURBO_A': 49, 'BTN_TURBO_B': 53,
        'BTN_SNES_A': 53, 'BTN_SNES_B': 49, 'BTN_SNES_X': 14, 'BTN_SNES_Y': 3,
        'DPAD_UP': 126, 'DPAD_DOWN': 125, 'DPAD_LEFT': 123, 'DPAD_RIGHT': 124,
        'STICK_UP': 13, 'STICK_DOWN': 1, 'STICK_LEFT': 0, 'STICK_RIGHT': 2,
        'PRES_NEXT': 121, 'PRES_PREV': 116, 'PRES_START': 96, 'PRES_EXIT': 53,
        'PRES_BLACK': 11, 'PRES_WHITE': 13,
        'ESC': 53, 'TAB': 48, 'ENTER': 36, 'RETURN': 36,
        'BACKSPACE': 51, 'BKSP': 51, 'SPACE': 49,
        'CTRL': 59, 'CONTROL': 59, 'ALT': 58, 'SHIFT': 56, 'CMD': 55, 'SUPER': 55, 'WIN': 55,
        'ARROWUP': 126, 'ARROWDOWN': 125, 'ARROWLEFT': 123, 'ARROWRIGHT': 124,
        'DELETE': 117
      };
      const code = macKeyMap[key];
      if (code !== undefined) {
        if (action === 'down') this.macHelper.keyDown(code);
        else if (action === 'up') this.macHelper.keyUp(code);
        else this.macHelper.keyTap(code);
      }
      return;
    }

    // ─── Linux xdotool Fallback ─────────────────────────────────────
    const linuxKeyMap = {
      // Xbox / Standard Gamepad
      'BTN_A': 'space', 'BTN_B': 'Escape', 'BTN_X': 'f', 'BTN_Y': 'e',
      'BTN_LB': 'q', 'BTN_RB': 'r', 'BTN_LT': 'Shift_L', 'BTN_RT': 'Control_L',
      'BTN_START': 'Return', 'BTN_SELECT': 'Tab', 'BTN_HOME': 'Super_L',
      // PlayStation Aliases & Data-Keys
      'BTN_CROSS': 'space', 'BTN_CIRCLE': 'Escape', 'BTN_SQUARE': 'f', 'BTN_TRIANGLE': 'e',
      'BTN_L1': 'q', 'BTN_R1': 'r', 'BTN_L2': 'Shift_L', 'BTN_R2': 'Control_L',
      'BTN_SHARE': 'Tab', 'BTN_OPTIONS': 'Return', 'BTN_PS': 'Super_L', 'BTN_TOUCHPAD': 'Tab',
      'BTN_PS_CROSS': 'space', 'BTN_PS_CIRCLE': 'Escape', 'BTN_PS_SQUARE': 'f', 'BTN_PS_TRIANGLE': 'e',
      // Nintendo Retro Aliases & Data-Keys
      'BTN_TURBO_A': 'space', 'BTN_TURBO_B': 'Escape',
      'BTN_SNES_A': 'Escape', 'BTN_SNES_B': 'space', 'BTN_SNES_X': 'e', 'BTN_SNES_Y': 'f',
      // D-Pad
      'DPAD_UP': 'Up', 'DPAD_DOWN': 'Down', 'DPAD_LEFT': 'Left', 'DPAD_RIGHT': 'Right',
      // Analog Stick (WASD Mode)
      'STICK_UP': 'w', 'STICK_DOWN': 's', 'STICK_LEFT': 'a', 'STICK_RIGHT': 'd',
      // Presentation Keys
      'PRES_NEXT': 'Page_Down', 'PRES_PREV': 'Page_Up', 'PRES_START': 'F5', 'PRES_EXIT': 'Escape',
      'PRES_BLACK': 'b', 'PRES_WHITE': 'w',
      // Media Keys
      'MEDIA_PLAY': 'XF86AudioPlay', 'MEDIA_NEXT': 'XF86AudioNext', 'MEDIA_PREV': 'XF86AudioPrev',
      'MEDIA_VOL_UP': 'XF86AudioRaiseVolume', 'MEDIA_VOL_DOWN': 'XF86AudioLowerVolume', 'MEDIA_MUTE': 'XF86AudioMute',
      // Comms & Shortcuts
      'DISCORD_MUTE': 'ctrl+shift+m', 'DISCORD_DEAFEN': 'ctrl+shift+d',
      'OBS_SCENE_1': 'F13', 'OBS_SCENE_2': 'F14', 'OBS_SCENE_3': 'F15', 'OBS_REC': 'F16',
      'CLIP_SCREENSHOT': 'Print', 'CLIP_COPY': 'ctrl+c', 'CLIP_PASTE': 'ctrl+v', 'UNDO': 'ctrl+z',
      // Standard Keyboard Keys
      'ESC': 'Escape', 'TAB': 'Tab', 'CAPS': 'Caps_Lock', 'CAPSLOCK': 'Caps_Lock', 'ENTER': 'Return',
      'BACKSPACE': 'BackSpace', 'BKSP': 'BackSpace', 'SPACE': 'space',
      'CTRL': 'Control_L', 'CONTROL': 'Control_L', 'ALT': 'Alt_L',
      'SHIFT': 'Shift_L', 'SUPER': 'Super_L', 'WIN': 'Super_L',
      'ARROWUP': 'Up', 'ARROWDOWN': 'Down', 'ARROWLEFT': 'Left', 'ARROWRIGHT': 'Right',
      'DELETE': 'Delete',
      // Numpad Keys
      'NUM_0': 'KP_0', 'NUM_1': 'KP_1', 'NUM_2': 'KP_2', 'NUM_3': 'KP_3',
      'NUM_4': 'KP_4', 'NUM_5': 'KP_5', 'NUM_6': 'KP_6', 'NUM_7': 'KP_7',
      'NUM_8': 'KP_8', 'NUM_9': 'KP_9', 'NUM_DOT': 'KP_Decimal',
      'NUM_DIV': 'KP_Divide', 'NUM_MUL': 'KP_Multiply', 'NUM_SUB': 'KP_Subtract',
      'NUM_ADD': 'KP_Add', 'NUM_ENTER': 'KP_Enter', 'NUM_CLEAR': 'Escape',
      'NUM_BACKSPACE': 'BackSpace',
    };

    const mapped = linuxKeyMap[key] || key;

    if (PLATFORM === 'linux' && this.hasXdotool) {
      if (!/^[A-Za-z0-9_+-]+$/.test(mapped)) {
        console.warn(`[InputEngine] Invalid key string rejected: ${mapped}`);
        return;
      }
      if (action === 'down') {
        exec(`xdotool keydown ${mapped}`);
      } else if (action === 'up') {
        exec(`xdotool keyup ${mapped}`);
      } else {
        exec(`xdotool key ${mapped}`);
      }
    }
  }

  simulateMouseMove(dx, dy) {
    if (PLATFORM === 'linux' && this.hasXdotool) {
      const safeDx = Math.round(Number(dx)) || 0;
      const safeDy = Math.round(Number(dy)) || 0;
      exec(`xdotool mousemove_relative -- ${safeDx} ${safeDy}`);
    }
  }
}

const input = new InputEngine();

const VIGEM_BUTTON_MAP = {
  'BTN_A': 'A',
  'BTN_B': 'B',
  'BTN_X': 'X',
  'BTN_Y': 'Y',
  'BTN_CROSS': 'A',
  'BTN_CIRCLE': 'B',
  'BTN_SQUARE': 'X',
  'BTN_TRIANGLE': 'Y',
  'BTN_PS_CROSS': 'A',
  'BTN_PS_CIRCLE': 'B',
  'BTN_PS_SQUARE': 'X',
  'BTN_PS_TRIANGLE': 'Y',
  'BTN_SNES_B': 'A',
  'BTN_SNES_A': 'B',
  'BTN_SNES_Y': 'X',
  'BTN_SNES_X': 'Y',
  'BTN_LB': 'LeftShoulder',
  'BTN_RB': 'RightShoulder',
  'BTN_L1': 'LeftShoulder',
  'BTN_R1': 'RightShoulder',
  'BTN_LT': 'LT',
  'BTN_RT': 'RT',
  'BTN_L2': 'LT',
  'BTN_R2': 'RT',
  'BTN_START': 'Start',
  'BTN_OPTIONS': 'Start',
  'BTN_SELECT': 'Back',
  'BTN_SHARE': 'Back',
  'BTN_HOME': 'Guide',
  'BTN_PS': 'Guide',
  'BTN_L3': 'LeftThumb',
  'BTN_R3': 'RightThumb',
  'DPAD_UP': 'Up',
  'DPAD_DOWN': 'Down',
  'DPAD_LEFT': 'Left',
  'DPAD_RIGHT': 'Right'
};

// Connected Clients Registry (Multi-device up to 8 connected phones)
const connectedClients = new Set();

// ─── Multiplayer Player Slots Registry (P1..P8) ─────────────────────
const DEFAULT_PALETTE = [
  '#00f0ff', // P1: Cyber Cyan
  '#ff8c00', // P2: Neon Amber
  '#00ff88', // P3: Toxic Green
  '#b026ff', // P4: Laser Purple
  '#ff2a5f', // P5: Crimson Red
  '#ffd700', // P6: Solar Gold
  '#ff00aa', // P7: Cyber Pink
  '#e0e6ed'  // P8: Titanium Silver
];

const playerSlots = Array.from({ length: 8 }, (_, i) => ({
  slot: i + 1,
  status: 'available', // 'available' | 'occupied' | 'reconnecting'
  clientId: null,
  sessionId: null,
  graceTimer: null,
  name: `Player ${i + 1}`,
  color: DEFAULT_PALETTE[i]
}));

function getSlotsSummary() {
  return playerSlots.map(s => ({
    slot: s.slot,
    status: s.status,
    name: s.name,
    color: s.color,
    isTaken: s.status === 'occupied' || s.status === 'reconnecting'
  }));
}

function getActiveControllersCount() {
  let count = 0;
  for (const c of connectedClients) {
    if (!c.isHub) count++;
  }
  return count;
}

function broadcastSlots() {
  broadcastJSON('SLOT_STATE', { slots: getSlotsSummary() });
}

function broadcastJSON(type, payload = {}, excludeClient = null) {
  const data = { type, payload, t: Date.now() };
  for (const client of connectedClients) {
    if (client !== excludeClient && client.authenticated) {
      try { client.send(data); } catch {}
    }
  }
}

// ─── WebSocket Server Implementation (RFC 6455 Pure Node) ───────────
class WebSocketClient {
  constructor(socket, req) {
    this.socket = socket;
    try {
      this.socket.setNoDelay(true);
      this.socket.setKeepAlive(true, 5000);
    } catch {}
    this.ip = req.socket.remoteAddress || '';
    this.isAlive = true;
    this.lastSeen = Date.now();
    this.id = crypto.randomBytes(4).toString('hex');
    this.buffer = Buffer.alloc(0);
    this.heldKeys = new Set();
    this.playerSlot = null;
    this.playerName = null;
    this.playerColor = null;

    // Detect if client is a Desktop Hub Monitor (PC browser) or mobile Controller
    const parsedReq = new URL(req.url, 'http://localhost');
    const roleParam = parsedReq.searchParams.get('role');
    const pinParam = parsedReq.searchParams.get('pin');
    const sidParam = parsedReq.searchParams.get('sid');
    this.sessionId = sidParam || null;
    const isLocalhost = this.ip === '127.0.0.1' || this.ip === '::1' || this.ip === '::ffff:127.0.0.1' || this.ip.startsWith('127.');
    this.isLocalhost = isLocalhost;
    this.isHub = roleParam === 'hub' || (this.isLocalhost && !pinParam && roleParam !== 'controller');

    // Auto-authenticate localhost loopback; require PIN for remote LAN
    this.authenticated = isLocalhost;

    // Check if URL query contained valid pin
    if (pinParam && pinParam === PAIRING_PIN) {
      this.authenticated = true;
    }

    // Prune superseded connection ONLY if same session ID (or same localhost hub tab)
    if (this.sessionId) {
      for (const existing of connectedClients) {
        if (existing !== this && existing.sessionId === this.sessionId) {
          console.log(`[WS] Pruning superseded connection for session ${this.sessionId} (${existing.id})`);
          try { existing.socket.destroy(); } catch {}
          connectedClients.delete(existing);
        }
      }
    } else if (this.isHub && this.isLocalhost) {
      // Prune previous localhost Hub connection when refreshing or re-opening Hub tab
      for (const existing of connectedClients) {
        if (existing.isHub && existing.isLocalhost && existing !== this) {
          console.log(`[WS] Pruning superseded localhost Hub tab (${existing.id})`);
          try { existing.socket.destroy(); } catch {}
          connectedClients.delete(existing);
        }
      }
    }

    connectedClients.add(this);
    this.slot = this.isHub ? 0 : getActiveControllersCount();

    const clientType = this.isHub ? 'Desktop Hub Monitor' : 'Controller';
    console.log(`[WS] ${clientType} connected (${this.id}) from ${this.ip}. Active controllers: ${getActiveControllersCount()}/8 | Auth: ${this.authenticated ? 'YES' : 'PENDING PIN'}`);

    this.send({
      type: 'CLIENT_INFO',
      payload: {
        slot: this.slot,
        isHub: this.isHub,
        activeCount: getActiveControllersCount(),
        activeControllers: getActiveControllersCount(),
        maxSlots: 8,
        hostname: os.hostname(),
        platform: PLATFORM,
        authenticated: this.authenticated
      }
    });

    if (this.authenticated) {
      this.send({
        type: 'AUTH_SUCCESS',
        payload: { authenticated: true }
      });
      this.send({
        type: 'SLOT_STATE',
        payload: { slots: getSlotsSummary() }
      });
    } else {
      this.send({
        type: 'AUTH_REQUIRED',
        payload: { requiresPin: true }
      });
    }

    broadcastJSON('CLIENT_COUNT', {
      activeCount: getActiveControllersCount(),
      activeControllers: getActiveControllersCount(),
      maxSlots: 8,
      totalConnections: connectedClients.size
    });

    socket.on('data', (chunk) => this.handleData(chunk));
    socket.on('end', () => this.cleanup());
    socket.on('close', () => this.cleanup());
    socket.on('error', (err) => this.cleanup());
  }

  sendRawText(text) {
    const payload = Buffer.from(text, 'utf8');
    const len = payload.length;
    let header;

    if (len < 126) {
      header = Buffer.from([0x81, len]);
    } else if (len <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }

    try { this.socket.write(Buffer.concat([header, payload])); } catch {}
  }

  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) === 0x80;
      let payloadLength = secondByte & 0x7f;

      let offset = 2;
      if (payloadLength === 126) {
        if (this.buffer.length < offset + 2) break;
        payloadLength = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLength === 127) {
        if (this.buffer.length < offset + 8) break;
        payloadLength = Number(this.buffer.readBigUInt64BE(offset));
        offset += 8;
      }

      let maskKey = null;
      if (isMasked) {
        if (this.buffer.length < offset + 4) break;
        maskKey = this.buffer.slice(offset, offset + 4);
        offset += 4;
      }

      if (this.buffer.length < offset + payloadLength) break;

      const rawPayload = this.buffer.slice(offset, offset + payloadLength);
      this.buffer = this.buffer.slice(offset + payloadLength);

      let payload = rawPayload;
      if (isMasked && maskKey) {
        payload = Buffer.alloc(payloadLength);
        for (let i = 0; i < payloadLength; i++) {
          payload[i] = rawPayload[i] ^ maskKey[i % 4];
        }
      }

      this.processFrame(opcode, payload);
    }
  }

  processFrame(opcode, payload) {
    this.isAlive = true;
    this.lastSeen = Date.now();

    if (opcode === 0x8) { this.cleanup(); return; }
    if (opcode === 0x9) { this.sendPong(payload); return; }
    if (opcode === 0xa) { return; }

    if (opcode === 0x1) {
      try {
        const msg = JSON.parse(payload.toString('utf8'));

        if (msg.type === 'AUTH') {
          const submittedPin = msg.payload ? String(msg.payload.pin).trim() : '';
          if (this.isLocalhost || (submittedPin && submittedPin === PAIRING_PIN)) {
            this.authenticated = true;
            console.log(`[WS ${this.id}] Client successfully authenticated ${this.isLocalhost ? '(Localhost Loopback)' : 'with pairing PIN'}`);
            this.send({ type: 'AUTH_SUCCESS', payload: { authenticated: true } });
            this.send({ type: 'SLOT_STATE', payload: { slots: getSlotsSummary() } });
          } else {
            console.warn(`[WS ${this.id}] Remote client sent invalid pairing PIN`);
            this.send({ type: 'AUTH_FAILED', payload: { error: 'Invalid pairing PIN' } });
          }
          return;
        }

        if (!this.authenticated) {
          // Client already received AUTH_REQUIRED upon initial connection.
          // Silently drop unauthenticated frames to avoid an infinite auth-retry ping-pong loop.
          return;
        }

        this.handleMessage(msg);
      } catch (err) {
        console.error(`[WS ${this.id}] Invalid JSON:`, err.message);
      }
    }

    if (opcode === 0x2) {
      if (!this.authenticated) return;
      this.handleBinaryMessage(payload);
    }
  }

  broadcastTelemetry(payloadData) {
    const meta = {
      slot: this.playerSlot || this.slot,
      name: this.playerName || `Player ${this.playerSlot || this.slot}`,
      color: this.playerColor || DEFAULT_PALETTE[(this.slot - 1) % DEFAULT_PALETTE.length]
    };
    broadcastJSON('INPUT_TELEMETRY', { ...payloadData, ...meta }, this);
  }

  handleMessage(msg) {
    const { type, payload, t } = msg;

    if (type === 'PING') {
      this.send({ type: 'PONG', t: t || Date.now(), s: Date.now() });
      return;
    }

    if (type === 'CLAIM_SLOT') {
      const reqSlot = parseInt(payload?.slot, 10);
      let reqName = String(payload?.name || '').trim().replace(/[<>&"']/g, '').slice(0, 16);
      if (!reqName) reqName = `Player ${reqSlot || 1}`;
      let reqColor = String(payload?.color || '').trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(reqColor)) {
        reqColor = DEFAULT_PALETTE[(reqSlot - 1) % DEFAULT_PALETTE.length] || '#00f0ff';
      }

      if (isNaN(reqSlot) || reqSlot < 1 || reqSlot > 8) {
        this.send({ type: 'CLAIM_FAILED', payload: { error: 'Invalid slot number (1-8)' } });
        return;
      }

      const target = playerSlots[reqSlot - 1];
      const isSameSession = (this.sessionId && target.sessionId === this.sessionId);
      const isReconnecting = (target.status === 'reconnecting');
      if (target.status === 'occupied' && target.clientId !== this.id && !isSameSession) {
        this.send({ type: 'CLAIM_FAILED', payload: { error: `Slot P${reqSlot} is already claimed by ${target.name}` } });
        return;
      }

      // If slot was in grace period, cancel the pending disconnect timer
      if (target.graceTimer) {
        clearTimeout(target.graceTimer);
        target.graceTimer = null;
      }

      // If client previously held another slot, release it
      if (this.playerSlot && this.playerSlot !== reqSlot) {
        const prev = playerSlots[this.playerSlot - 1];
        if (prev && prev.clientId === this.id) {
          if (prev.graceTimer) {
            clearTimeout(prev.graceTimer);
            prev.graceTimer = null;
          }
          prev.status = 'available';
          prev.clientId = null;
          prev.sessionId = null;
          prev.name = `Player ${prev.slot}`;
          prev.color = DEFAULT_PALETTE[prev.slot - 1];
          if (this.playerSlot >= 1 && this.playerSlot <= 4) {
            input.gamepadDisconnect(this.playerSlot);
          }
        }
      }

      target.status = 'occupied';
      target.clientId = this.id;
      target.sessionId = this.sessionId;
      target.name = reqName;
      target.color = reqColor;

      this.playerSlot = reqSlot;
      this.playerName = reqName;
      this.playerColor = reqColor;
      this.isHub = false;

      if (reqSlot >= 1 && reqSlot <= 4) {
        input.gamepadConnect(reqSlot);
      }

      console.log(`[LOBBY] Client ${this.id} (${this.ip}) claimed Slot P${reqSlot} as "${reqName}" (${reqColor})`);

      this.send({
        type: 'CLAIM_SUCCESS',
        payload: { slot: reqSlot, name: reqName, color: reqColor }
      });

      broadcastSlots();
      return;
    }

    if (type === 'RELEASE_SLOT') {
      if (this.playerSlot) {
        const slotNum = this.playerSlot;
        const prev = playerSlots[slotNum - 1];
        if (prev && (prev.clientId === this.id || (this.sessionId && prev.sessionId === this.sessionId))) {
          if (prev.graceTimer) {
            clearTimeout(prev.graceTimer);
            prev.graceTimer = null;
          }
          if (slotNum >= 1 && slotNum <= 4) {
            input.gamepadDisconnect(slotNum);
          }
          prev.status = 'available';
          prev.clientId = null;
          prev.sessionId = null;
          prev.name = `Player ${prev.slot}`;
          prev.color = DEFAULT_PALETTE[prev.slot - 1];
        }
        console.log(`[LOBBY] Client ${this.id} explicitly released Slot P${this.playerSlot}`);
        this.playerSlot = null;
        this.playerName = null;
        this.playerColor = null;
        this.send({ type: 'RELEASE_SUCCESS', payload: { released: true } });
        broadcastSlots();
      }
      return;
    }

    if (type === 'BTN_DOWN') {
      if (payload && payload.key) {
        const slot = (this.playerSlot && this.playerSlot <= 4) ? this.playerSlot : 1;
        const vigemBtn = VIGEM_BUTTON_MAP[payload.key];
        if (vigemBtn && input.win32Helper && input.win32Helper.vigemEnabled) {
          if (vigemBtn === 'LT' || vigemBtn === 'RT') {
            input.gamepadTrigger(slot, vigemBtn, 255);
          } else {
            input.gamepadButton(slot, vigemBtn, true);
          }
        } else {
          if (!this.heldKeys.has(payload.key)) {
            this.heldKeys.add(payload.key);
            input.keyDown(payload.key);
          }
        }
        this.broadcastTelemetry({ action: 'BTN_DOWN', key: payload.key });
      }
      return;
    }
    if (type === 'BTN_UP') {
      if (payload && payload.key) {
        const slot = (this.playerSlot && this.playerSlot <= 4) ? this.playerSlot : 1;
        const vigemBtn = VIGEM_BUTTON_MAP[payload.key];
        if (vigemBtn && input.win32Helper && input.win32Helper.vigemEnabled) {
          if (vigemBtn === 'LT' || vigemBtn === 'RT') {
            input.gamepadTrigger(slot, vigemBtn, 0);
          } else {
            input.gamepadButton(slot, vigemBtn, false);
          }
        } else {
          if (this.heldKeys.has(payload.key)) {
            this.heldKeys.delete(payload.key);
            input.keyUp(payload.key);
          }
        }
        this.broadcastTelemetry({ action: 'BTN_UP', key: payload.key });
      }
      return;
    }
    if (type === 'BTN_TAP') {
      if (payload && payload.key) {
        const slot = (this.playerSlot && this.playerSlot <= 4) ? this.playerSlot : 1;
        const vigemBtn = VIGEM_BUTTON_MAP[payload.key];
        if (vigemBtn && input.win32Helper && input.win32Helper.vigemEnabled) {
          if (vigemBtn === 'LT' || vigemBtn === 'RT') {
            input.gamepadTrigger(slot, vigemBtn, 255);
            setTimeout(() => input.gamepadTrigger(slot, vigemBtn, 0), 40);
          } else {
            input.gamepadButton(slot, vigemBtn, true);
            setTimeout(() => input.gamepadButton(slot, vigemBtn, false), 40);
          }
        } else {
          input.keyTap(payload.key);
        }
        this.broadcastTelemetry({ action: 'BTN_TAP', key: payload.key });
      }
      return;
    }

    if (type === 'TYPE_TEXT') {
      if (payload.text) input.typeString(payload.text);
      return;
    }

    if (type === 'STICK_MOVE') {
      const { stick, x, y } = payload;
      const slot = (this.playerSlot && this.playerSlot <= 4) ? this.playerSlot : 1;
      this.handleStick(stick, x, y, slot);
      this.broadcastTelemetry({ action: 'STICK_MOVE', stick, x, y });
      return;
    }

    if (type === 'MOUSE_MOVE') {
      input.mouseMove(payload.dx, payload.dy);
      return;
    }

    if (type === 'MOUSE_CLICK') {
      input.mouseClick(payload.button || 1);
      return;
    }

    if (type === 'MOUSE_SCROLL') {
      input.mouseScroll(payload.direction || 0);
      return;
    }

    if (type === 'MACRO_EXEC') {
      if (payload.action === 'SHELL' && payload.cmd) {
        if (!ALLOW_SHELL_MACROS) {
          console.warn(`[SECURITY] Blocked SHELL execution for command: "${payload.cmd}". Set ALLOW_SHELL_MACROS=true to enable.`);
          return;
        }
        exec(payload.cmd);
      } else if (payload.action === 'KEY') {
        input.keyTap(payload.key);
      } else if (payload.action === 'TEXT') {
        input.typeString(payload.text || '');
      }
      return;
    }
  }

  setStickKey(key, active) {
    if (active) {
      if (!this.heldKeys.has(key)) {
        this.heldKeys.add(key);
        input.keyDown(key);
      }
    } else {
      if (this.heldKeys.has(key)) {
        this.heldKeys.delete(key);
        input.keyUp(key);
      }
    }
  }

  handleStick(stick, x, y, slot = 1) {
    if (input.win32Helper && input.win32Helper.vigemEnabled) {
      if (stick === 'LEFT') {
        const valX = Math.round((x || 0) * 32767);
        const valY = Math.round(-(y || 0) * 32767); // Invert Y for Xbox standard
        input.gamepadAxis(slot, 'LX', valX);
        input.gamepadAxis(slot, 'LY', valY);
      } else if (stick === 'RIGHT') {
        const valX = Math.round((x || 0) * 32767);
        const valY = Math.round(-(y || 0) * 32767);
        input.gamepadAxis(slot, 'RX', valX);
        input.gamepadAxis(slot, 'RY', valY);
      }
      return;
    }

    const DEADZONE = 0.20;
    if (stick === 'LEFT') {
      this.setStickKey('STICK_UP', y < -DEADZONE);
      this.setStickKey('STICK_DOWN', y > DEADZONE);
      this.setStickKey('STICK_LEFT', x < -DEADZONE);
      this.setStickKey('STICK_RIGHT', x > DEADZONE);
    } else if (stick === 'RIGHT') {
      const SENSITIVITY = 14;
      if (Math.abs(x) > DEADZONE || Math.abs(y) > DEADZONE) {
        input.mouseMove(x * SENSITIVITY, y * SENSITIVITY);
      }
    }
  }

  handleBinaryMessage(buf) {
    const op = buf[0];
    if (op === 0x03 && buf.length >= 5) {
      const dx = buf.readInt16BE(1);
      const dy = buf.readInt16BE(3);
      input.mouseMove(dx, dy);
    }
  }

  send(data) {
    const jsonStr = JSON.stringify(data);
    const payload = Buffer.from(jsonStr, 'utf8');
    const len = payload.length;

    let header;
    if (len < 126) {
      header = Buffer.from([0x81, len]);
    } else if (len <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }

    try { this.socket.write(Buffer.concat([header, payload])); } catch {}
  }

  sendPing() {
    const frame = Buffer.from([0x89, 0x00]);
    try { this.socket.write(frame); } catch {}
  }

  sendPong(payload) {
    const frame = Buffer.concat([Buffer.from([0x8a, payload.length]), payload]);
    try { this.socket.write(frame); } catch {}
  }

  cleanup() {
    if (!connectedClients.has(this)) return;
    this.isAlive = false;
    for (const key of this.heldKeys) {
      input.keyUp(key);
    }
    this.heldKeys.clear();
    if (this.playerSlot) {
      const slotNum = this.playerSlot;
      const prev = playerSlots[slotNum - 1];
      if (prev && prev.clientId === this.id) {
        // Hold slot in reconnecting state with an 8s grace period
        // Keep virtual gamepad alive in Windows so Overcooked / games don't drop the controller
        prev.status = 'reconnecting';
        prev.clientId = null;
        console.log(`[LOBBY] Client ${this.id} disconnected. Holding Slot P${slotNum} in 8s grace period...`);
        if (prev.graceTimer) clearTimeout(prev.graceTimer);
        prev.graceTimer = setTimeout(() => {
          prev.graceTimer = null;
          if (prev.status === 'reconnecting') {
            console.log(`[LOBBY] Grace period expired for Slot P${slotNum}. Disconnecting virtual controller.`);
            if (slotNum >= 1 && slotNum <= 4) {
              input.gamepadDisconnect(slotNum);
            }
            prev.status = 'available';
            prev.clientId = null;
            prev.sessionId = null;
            prev.name = `Player ${prev.slot}`;
            prev.color = DEFAULT_PALETTE[prev.slot - 1];
            broadcastSlots();
          }
        }, 8000);
      }
      this.playerSlot = null;
      broadcastSlots();
    }
    connectedClients.delete(this);
    try { this.socket.destroy(); } catch {}
    const clientType = this.isHub ? 'Desktop Hub Monitor' : 'Controller';
    console.log(`[WS] ${clientType} disconnected (${this.id}). Active controllers: ${getActiveControllersCount()}/8`);
    broadcastJSON('CLIENT_COUNT', {
      activeControllers: getActiveControllersCount(),
      activeCount: getActiveControllersCount(),
      maxSlots: 8,
      totalConnections: connectedClients.size
    });
  }
}

// Active heartbeat sweeper: check every 15s; prune connections inactive for > 45s
setInterval(() => {
  const now = Date.now();
  for (const client of connectedClients) {
    if (now - client.lastSeen > 45000) {
      console.log(`[WS] Pruning timed-out client (${client.id}) from ${client.ip} (inactive > 45s)`);
      try { client.socket.destroy(); } catch {}
      connectedClients.delete(client);
      broadcastJSON('CLIENT_COUNT', { activeCount: connectedClients.size, maxSlots: 8 });
      continue;
    }
    client.sendPing();
  }
}, 15000).unref();

// ─── HTTP Static Server & REST Endpoints ────────────────────────────
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.bat': 'application/x-bat',
};

let _vigemCached = null;
let _vigemLastCheck = 0;
function isVigemInstalled() {
  if (PLATFORM !== 'win32') return false;
  const now = Date.now();
  if (_vigemCached !== null && (now - _vigemLastCheck < 10000)) {
    return _vigemCached;
  }
  _vigemLastCheck = now;
  try {
    const out = execSync('sc.exe query ViGEmBus', { stdio: 'pipe', encoding: 'utf8', timeout: 2000 });
    _vigemCached = out.includes('ViGEmBus');
  } catch {
    _vigemCached = false;
  }
  return _vigemCached;
}

function isLoopbackReq(req) {
  const ip = req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.startsWith('127.');
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = parsed.pathname;

  // System Stats API
  if (pathname === '/api/info') {
    const isLocal = isLoopbackReq(req);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      name: 'MASHINA KONTROL',
      version: '2.1.0',
      platform: PLATFORM,
      hostname: os.hostname(),
      uptime: process.uptime(),
      interfaces: getLocalIPs(),
      pin: isLocal ? PAIRING_PIN : null,
      pairingPinRequired: true,
      vigemInstalled: isVigemInstalled()
    }));
    return;
  }

  // Dynamic PIN Management API (Update or Regenerate Pairing PIN)
  if (pathname === '/api/pin') {
    const isLocal = isLoopbackReq(req);
    const pinHeader = req.headers['x-pairing-pin'];
    if (!isLocal && pinHeader !== PAIRING_PIN) {
      res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Unauthorized: Pairing PIN required to update PIN' }));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          let newPin = payload.pin ? String(payload.pin).trim() : '';
          if (!newPin || !/^\d{4,6}$/.test(newPin)) {
            newPin = String(Math.floor(1000 + Math.random() * 9000));
          }
          PAIRING_PIN = newPin;
          try {
            fs.writeFileSync(PIN_FILE, newPin, 'utf8');
          } catch {}
          console.log(`[Security] Pairing PIN updated to: ${PAIRING_PIN}`);
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: true, pin: PAIRING_PIN }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
        }
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ pin: PAIRING_PIN }));
    return;
  }

  // 1-Click Bundled Driver Installer API (Triggered directly from Hub UI)
  if (pathname === '/api/driver/install') {
    if (PLATFORM !== 'win32') {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, error: 'Driver installation is only supported on Windows' }));
      return;
    }

    const installerPath = path.join(__dirname, '..', 'drivers', 'ViGEmBusSetup.exe');
    if (fs.existsSync(installerPath)) {
      try {
        spawn(installerPath, ['/passive'], { detached: true, stdio: 'ignore' }).unref();
        _vigemCached = null; // Invalidate cache
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, message: 'Bundled offline installer launched' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    } else {
      try {
        spawn('winget', ['install', '--id', 'ViGEm.ViGEmBus', '-e', '--accept-package-agreements', '--accept-source-agreements'], { detached: true, stdio: 'ignore' }).unref();
        _vigemCached = null;
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, message: 'Winget install launched' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    }
    return;
  }

  // Presets Store API (with body size limit & PIN check for remote)
  if (pathname === '/api/presets') {
    if (req.method === 'POST') {
      const isLocal = isLoopbackReq(req);
      const pinHeader = req.headers['x-pairing-pin'];
      const pinQuery = parsed.searchParams.get('pin');
      if (!isLocal && pinHeader !== PAIRING_PIN && pinQuery !== PAIRING_PIN) {
        res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Unauthorized: Pairing PIN required to save presets' }));
        return;
      }

      let body = '';
      let bodyLen = 0;
      req.on('data', chunk => {
        bodyLen += chunk.length;
        if (bodyLen > 256 * 1024) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload too large' }));
          req.destroy();
          return;
        }
        body += chunk;
      });
      req.on('end', () => {
        try {
          JSON.parse(body); // Validation
          fs.writeFileSync(CONFIG_FILE, body);
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: 'Invalid JSON presets payload' }));
        }
      });
      return;
    }
    const presets = fs.existsSync(CONFIG_FILE) ? fs.readFileSync(CONFIG_FILE, 'utf8') : '{}';
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(presets);
    return;
  }

  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '').replace(/^[\/\\]+/, '');
  const filePath = path.resolve(PUBLIC_DIR, safePath);

  // Security: prevent path traversal outside PUBLIC_DIR
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden — Mashina Kontrol');
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found — Mashina Kontrol');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
  });
  const fileStream = fs.createReadStream(filePath);
  fileStream.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('500 Internal Server Error');
    }
  });
  res.on('error', () => {});
  fileStream.pipe(res);
});

// Upgrade HTTP to RFC 6455 WebSocket
server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => {});
  try {
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 5000);
  } catch {}
  const wsKey = req.headers['sec-websocket-key'];
  if (!wsKey) {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash('sha1')
    .update(wsKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
  ];

  try {
    socket.write(headers.join('\r\n') + '\r\n\r\n');
    new WebSocketClient(socket, req);
  } catch {
    socket.destroy();
  }
});

function freePortIfOccupied(port) {
  if (PLATFORM !== 'win32') return;
  try {
    const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const lines = output.trim().split('\n');
    let killed = false;
    for (const line of lines) {
      if (line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1], 10);
        if (pid && pid !== process.pid) {
          console.log(`[Daemon] Port ${port} is occupied by PID ${pid}. Reclaiming port for active instance...`);
          try {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
            killed = true;
          } catch {}
        }
      }
    }
    if (killed) {
      const waitStart = Date.now();
      while (Date.now() - waitStart < 400) {}
    }
  } catch {}
}

let listenRetries = 0;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    if (listenRetries === 0 && PLATFORM === 'win32') {
      listenRetries++;
      console.warn(`[Daemon] Port ${PORT} busy. Attempting to free port and retry...`);
      freePortIfOccupied(PORT);
      setTimeout(() => {
        try {
          server.listen(PORT, '0.0.0.0', () => {
            const ips = getLocalIPs();
            printAnsiBanner(PORT, ips, PAIRING_PIN);
          });
        } catch (retryErr) {
          console.error(`\x1b[31m[Daemon FATAL] Port ${PORT} is still in use: ${retryErr.message}\x1b[0m`);
          process.exit(1);
        }
      }, 500);
      return;
    }

    console.error(`\x1b[31m[Daemon FATAL] Port ${PORT} is already in use by another process.\x1b[0m`);
    console.error(`Please close any existing process on port ${PORT} and restart.\n`);
    if (input && input.win32Helper && input.win32Helper.process) {
      try { input.win32Helper.process.kill(); } catch {}
    }
    process.exit(1);
  }
  console.error('[Daemon] HTTP Server Error:', err.message);
});

process.on('uncaughtException', (err, origin) => {
  console.error(`[Daemon] Uncaught Exception (${origin}):`, err ? (err.stack || err.message) : err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Daemon] Unhandled Rejection at:', promise, 'reason:', reason);
});

function cleanupOnExit() {
  if (input && input.win32Helper && input.win32Helper.process) {
    try { input.win32Helper.process.kill(); } catch {}
  }
}

process.on('exit', (code) => {
  cleanupOnExit();
  console.log(`[Daemon] Process exit event with code: ${code}`);
});

process.on('beforeExit', (code) => {
  console.log(`[Daemon] Process beforeExit event with code: ${code}`);
});

process.on('SIGINT', () => {
  cleanupOnExit();
  console.log('[Daemon] Received SIGINT signal. Shutting down gracefully.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanupOnExit();
  console.log('[Daemon] Received SIGTERM signal. Shutting down gracefully.');
  process.exit(0);
});

// Permanent keep-alive interval to guarantee the event loop never empties
setInterval(() => {}, 60000);

// Auto-free port if a stale instance is lingering before binding
freePortIfOccupied(PORT);

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();
  printAnsiBanner(PORT, ips, PAIRING_PIN);
});

