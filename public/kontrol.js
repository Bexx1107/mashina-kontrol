/**
 * MASHINA KONTROL — Web Client Engine (V3 Ultra-Polished Modular Architecture)
 * Complete 5-Deck Virtual PC Controller:
 * 1. Multi-Layout Gamepad (Xbox, PlayStation, SNES)
 * 2. 12-Tile Brutalist Macro Deck & Stream Deck
 * 3. Precision Trackpad & 10-Key Numpad
 * 4. Presentation & Media Remote
 * 5. Full PC QWERTY Keyboard & Live String Typing Bar
 * 
 * Features:
 * - 5 Brutalist Hardware Themes (Charcoal, Paper, Amber CRT, 90s Retro, Stealth)
 * - Live Button Rebinding & Customizer Modal (localStorage persistent)
 * - Zero-Dependency Packed Binary Opcode Frames (<1ms RTT)
 * - Web Audio Mechanical Synth & Multi-Pulse Mobile Haptics
 * 
 * Author: Mashina Studio / Bexx (https://mashina-studio.eu)
 */

(function () {
  'use strict';

  const isLocalHost = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' || 
                      window.location.hostname === '[::1]' ||
                      window.location.hostname.startsWith('127.');

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ─── Controller Layout Profiles ─────────────────────────────────────
  const CONTROLLER_LAYOUTS = {
    xbox: {
      name: 'XBOX STANDARD',
      topRow: { lt: 'LT', lb: 'LB', select: 'SELECT', start: 'START', rb: 'RB', rt: 'RT' },
      faceButtons: [
        { id: 'btn-face-y', key: 'BTN_Y', label: 'Y', cls: 'face-btn btn-y', color: '#FFD700', border: '#665520', top: 0, left: 44 },
        { id: 'btn-face-x', key: 'BTN_X', label: 'X', cls: 'face-btn btn-x', color: '#00B0FF', border: '#205066', top: 44, left: 0 },
        { id: 'btn-face-b', key: 'BTN_B', label: 'B', cls: 'face-btn btn-b', color: '#FF5252', border: '#662020', top: 44, right: 0 },
        { id: 'btn-face-a', key: 'BTN_A', label: 'A', cls: 'face-btn btn-a', color: '#00E676', border: '#206635', bottom: 0, left: 44 }
      ]
    },
    ps: {
      name: 'PLAYSTATION DUALSENSE',
      topRow: { lt: 'L2', lb: 'L1', select: 'SHARE', start: 'OPTIONS', rb: 'R1', rt: 'R2' },
      faceButtons: [
        { id: 'btn-face-y', key: 'BTN_PS_TRIANGLE', label: '▲', cls: 'face-btn', color: '#00E676', border: '#206635', top: 0, left: 44 },
        { id: 'btn-face-x', key: 'BTN_PS_SQUARE', label: '◼', cls: 'face-btn', color: '#FF5252', border: '#662020', top: 44, left: 0 },
        { id: 'btn-face-b', key: 'BTN_PS_CIRCLE', label: '⭘', cls: 'face-btn', color: '#FF3B30', border: '#661410', top: 44, right: 0 },
        { id: 'btn-face-a', key: 'BTN_PS_CROSS', label: '✖', cls: 'face-btn', color: '#00B0FF', border: '#205066', bottom: 0, left: 44 }
      ]
    },
    snes: {
      name: 'NINTENDO RETRO SNES',
      topRow: { lt: 'ZL', lb: 'L', select: 'SELECT', start: 'START', rb: 'R', rt: 'ZR' },
      faceButtons: [
        { id: 'btn-face-y', key: 'BTN_SNES_X', label: 'X', cls: 'face-btn', color: '#9B59B6', border: '#4A235A', top: 0, left: 44 },
        { id: 'btn-face-x', key: 'BTN_SNES_Y', label: 'Y', cls: 'face-btn', color: '#9B59B6', border: '#4A235A', top: 44, left: 0 },
        { id: 'btn-face-b', key: 'BTN_SNES_A', label: 'A', cls: 'face-btn', color: '#8E44AD', border: '#5B2C6F', top: 44, right: 0 },
        { id: 'btn-face-a', key: 'BTN_SNES_B', label: 'B', cls: 'face-btn', color: '#8E44AD', border: '#5B2C6F', bottom: 0, left: 44 }
      ]
    }
  };

  // ─── Application State ──────────────────────────────────────────────
  const state = {
    ws: null,
    connected: false,
    authenticated: false,
    authAttempted: false,
    latency: 0,
    pingInterval: null,
    wakeLock: null,
    currentMode: 'gamepad',
    currentLayout: ['xbox', 'ps', 'snes'].includes(localStorage.getItem('mashina_kontrol_layout')) ? localStorage.getItem('mashina_kontrol_layout') : 'xbox',
    currentTheme: localStorage.getItem('mashina_kontrol_theme') || 'charcoal',
    editMode: false,
    player: {
      slot: parseInt(localStorage.getItem('mashina_player_slot') || '0', 10) || null,
      name: localStorage.getItem('mashina_player_name') || '',
      color: localStorage.getItem('mashina_player_color') || '#00f0ff',
      claimed: false
    },
    slots: [],
    customBindings: JSON.parse(localStorage.getItem('mashina_kontrol_bindings') || '{}'),
    joystickMode: localStorage.getItem('mashina_kontrol_joystick_mode') || 'fixed',
    layoutTransforms: JSON.parse(localStorage.getItem('mashina_layout_transforms') || '{}'),
    selectedModuleId: null,
    selectedModuleScale: 1.0,
    audioCtx: null,
    soundEnabled: true,
    hapticsEnabled: true,
    modifiers: {
      shift: false,
      ctrl: false,
      alt: false,
      win: false,
      caps: false
    },
    joysticks: {
      left: { active: false, id: null, x: 0, y: 0, originX: 0, originY: 0 },
      right: { active: false, id: null, x: 0, y: 0, originX: 0, originY: 0 }
    },
    trackpad: {
      pointers: new Map(),
      touchStart: 0,
      hasMoved: false
    },
    // Presentation Timer State
    timer: {
      running: false,
      start: 0,
      elapsed: 0,
      interval: null,
      targetMinutes: 0
    },
    // Teleprompter State
    prompter: {
      open: false,
      scrolling: false,
      speed: 1.5,
      fontSize: 20,
      mirror: false,
      editing: false,
      notes: localStorage.getItem('mashina_kontrol_notes') || `Welcome to Mashina Kontrol Presentation Remote.

• Speak clearly and keep an eye on the stage timer above.
• Use your thumb on the giant Previous / Next buttons to navigate slides without looking down.
• You can edit this speech script anytime by tapping "Edit Notes". Notes are saved automatically on this device.`
    }
  };

  // ─── DOM Element Cache ──────────────────────────────────────────────
  const el = {
    html: document.documentElement,
    led: document.getElementById('led-status'),
    latencyText: document.getElementById('latency-val'),
    clientSlotBadge: document.getElementById('client-slot-badge'),
    playerBadge: document.getElementById('player-badge'),
    playerDot: document.getElementById('player-dot'),
    playerLabel: document.getElementById('player-label'),
    lobbyModal: document.getElementById('lobby-modal'),
    lobbyCloseBtn: document.getElementById('lobby-close-btn'),
    lobbySlotsContainer: document.getElementById('lobby-slots-container'),
    lobbyNameInput: document.getElementById('lobby-name-input'),
    lobbyPaletteContainer: document.getElementById('lobby-palette-container'),
    lobbyError: document.getElementById('lobby-error'),
    btnLobbyJoin: document.getElementById('btn-lobby-join'),
    hubSlotsGrid: document.getElementById('hub-slots-grid'),
    hubPlayersCount: document.getElementById('hub-players-count'),
    pwaInstallBtn: document.getElementById('btn-pwa-install'),
    modeBtns: document.querySelectorAll('.mode-btn'),
    decks: {
      hub: document.getElementById('deck-hub'),
      gamepad: document.getElementById('deck-gamepad'),
      keyboard: document.getElementById('deck-keyboard'),
      stream: document.getElementById('deck-stream'),
      trackpad: document.getElementById('deck-trackpad'),
      present: document.getElementById('deck-present')
    },
    // Desktop Hub Elements
    hubQrImg: document.getElementById('hub-qr-img'),
    hubPinDisplay: document.getElementById('hub-pin-display'),
    hubUrlInput: document.getElementById('hub-url-input'),
    hubBtnCopy: document.getElementById('hub-btn-copy'),
    hubBtnOpenPad: document.getElementById('hub-btn-open-pad'),
    hubStatusBadge: document.getElementById('hub-status-badge'),
    hubLatencyBadge: document.getElementById('hub-latency-badge'),
    hubActiveDeviceName: document.getElementById('hub-active-device-name'),
    hubDiagSlot: document.getElementById('hub-diag-slot'),
    hubDiagOs: document.getElementById('hub-diag-os'),
    hubDriverStatusText: document.getElementById('hub-driver-status-text'),
    btnInstallVigem: document.getElementById('btn-install-vigem'),
    hubStickLeftDot: document.getElementById('hub-stick-left-dot'),
    hubStickRightDot: document.getElementById('hub-stick-right-dot'),
    pwaGuideModal: document.getElementById('pwa-guide-modal'),
    pwaGuideClose: document.getElementById('pwa-guide-close'),
    pwaGuideOk: document.getElementById('pwa-guide-ok'),
    btnToggleTrackpadFull: document.getElementById('btn-toggle-trackpad-full'),
    trackpadToggleText: document.getElementById('trackpad-toggle-text'),
    // Machinery Header & Actions
    fullscreenBtn: document.getElementById('btn-fullscreen'),
    themeModalBtn: document.getElementById('btn-theme-modal'),
    editModeBtn: document.getElementById('btn-edit-mode'),
    settingsModalBtn: document.getElementById('btn-settings-modal'),
    qrModalBtn: document.getElementById('btn-qr-modal'),
    // Modals & Toolbars
    layoutEditToolbar: document.getElementById('layout-edit-toolbar'),
    scaleIndicator: document.getElementById('scale-indicator'),
    btnScaleDown: document.getElementById('btn-scale-down'),
    btnScaleUp: document.getElementById('btn-scale-up'),
    btnSaveLayoutPositions: document.getElementById('btn-save-layout-positions'),
    btnResetLayoutPositions: document.getElementById('btn-reset-layout-positions'),
    btnResetLayoutPositionsModal: document.getElementById('btn-reset-layout-positions-modal'),
    btnExitEditMode: document.getElementById('btn-exit-edit-mode'),
    themeModal: document.getElementById('theme-modal'),
    themeCloseBtn: document.getElementById('theme-close-btn'),
    themeBtns: document.querySelectorAll('.theme-opt-btn'),
    customizerModal: document.getElementById('customizer-modal'),
    customizerCloseBtn: document.getElementById('customizer-close-btn'),
    customizerForm: document.getElementById('customizer-form'),
    custTargetId: document.getElementById('cust-target-id'),
    custLabel: document.getElementById('cust-label'),
    custActionType: document.getElementById('cust-action-type'),
    custPayload: document.getElementById('cust-payload'),
    custHaptic: document.getElementById('cust-haptic'),
    custSaveBtn: document.getElementById('cust-save-btn'),
    custResetBtn: document.getElementById('cust-reset-btn'),
    settingsModal: document.getElementById('settings-modal'),
    settingsCloseBtn: document.getElementById('settings-close-btn'),
    settingHaptics: document.getElementById('setting-haptics'),
    settingAudio: document.getElementById('setting-audio'),
    settingOrientation: document.getElementById('setting-orientation'),
    settingJoystickMode: document.getElementById('setting-joystick-mode'),
    btnToggleEditModeSetting: document.getElementById('btn-toggle-edit-mode-setting'),
    btnResetAllBindings: document.getElementById('btn-reset-all-bindings'),
    diagSlot: document.getElementById('diag-slot'),
    diagLatency: document.getElementById('diag-latency'),
    diagPlatform: document.getElementById('diag-platform'),
    orientationBanner: document.getElementById('orientation-banner'),
    orientDismiss: document.getElementById('orient-dismiss'),
    qrModal: document.getElementById('qr-modal'),
    qrCloseBtn: document.getElementById('qr-close-btn'),
    qrContainer: document.getElementById('qr-container'),
    // Gamepad Elements
    gamepadMiddleZone: document.getElementById('gamepad-middle-zone'),
    layoutBtns: document.querySelectorAll('.layout-opt'),
    btnLt: document.getElementById('btn-lt'),
    btnLb: document.getElementById('btn-lb'),
    btnRb: document.getElementById('btn-rb'),
    btnRt: document.getElementById('btn-rt'),
    btnSelect: document.getElementById('btn-select'),
    btnStart: document.getElementById('btn-start'),
    leftPod: document.getElementById('joystick-left-pod'),
    leftThumb: document.getElementById('joystick-left-thumb'),
    rightPod: document.getElementById('joystick-right-pod'),
    rightThumb: document.getElementById('joystick-right-thumb'),
    // Trackpad Surface
    trackSurface: document.getElementById('trackpad-surface'),
    trackLeftBtn: document.getElementById('track-left-btn'),
    trackRightBtn: document.getElementById('track-right-btn'),
    // Presentation Deck & Timer & Prompter
    timerDisplay: document.getElementById('pres-timer-display'),
    timerToggleBtn: document.getElementById('btn-timer-toggle'),
    timerResetBtn: document.getElementById('btn-timer-reset'),
    timerTargetSelect: document.getElementById('pres-timer-target'),
    prompterToggleBtn: document.getElementById('btn-prompter-toggle'),
    prompterDrawer: document.getElementById('prompter-drawer'),
    prompterPlayBtn: document.getElementById('btn-prompter-play'),
    prompterSlowerBtn: document.getElementById('btn-prompter-slower'),
    prompterFasterBtn: document.getElementById('btn-prompter-faster'),
    prompterSpeedVal: document.getElementById('prompter-speed-val'),
    prompterFontDnBtn: document.getElementById('btn-prompter-font-dn'),
    prompterFontUpBtn: document.getElementById('btn-prompter-font-up'),
    prompterMirrorBtn: document.getElementById('btn-prompter-mirror'),
    prompterEditBtn: document.getElementById('btn-prompter-edit'),
    prompterCloseBtn: document.getElementById('btn-prompter-close'),
    prompterScrollView: document.getElementById('prompter-scroll-view'),
    prompterEditor: document.getElementById('prompter-editor'),
    // Keyboard Deck
    kbInput: document.getElementById('kb-string-input'),
    kbSendBtn: document.getElementById('kb-string-send-btn'),
    kbModShift: document.getElementById('kb-mod-shift'),
    kbModCtrl: document.getElementById('kb-mod-ctrl'),
    kbModAlt: document.getElementById('kb-mod-alt'),
    kbModWin: document.getElementById('kb-mod-win'),
    kbModCaps: document.getElementById('kb-mod-caps')
  };

  // ─── Tactile Web Audio Synthesizer (Mechanical Micro-Click) ─────────
  function initAudio() {
    if (!state.audioCtx && typeof window.AudioContext !== 'undefined') {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      state.audioCtx = new AudioContext();
    }
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
  }

  function playClickSound(freq = 120, duration = 0.015, gainVal = 0.08) {
    if (!state.soundEnabled || !state.audioCtx) return;
    try {
      const osc = state.audioCtx.createOscillator();
      const gain = state.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, state.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, state.audioCtx.currentTime + duration);
      gain.gain.setValueAtTime(gainVal, state.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, state.audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(state.audioCtx.destination);
      osc.start();
      osc.stop(state.audioCtx.currentTime + duration);
    } catch {}
  }

  // ─── Tactile Haptic Vibration Engine ────────────────────────────────
  function vibrate(pattern) {
    if (!state.hapticsEnabled) return;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        if (pattern === 'double') pattern = [12, 24, 12];
        else if (typeof pattern === 'string') pattern = parseInt(pattern, 10) || 12;
        navigator.vibrate(pattern);
      } catch {}
    }
  }

  let reconnectTimer = null;

  function scheduleReconnect(delay = 1500) {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      initWebSocket();
    }, delay);
  }

  function getSessionId() {
    let sid = sessionStorage.getItem('mashina_session_id');
    if (!sid) {
      sid = 'sid_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      sessionStorage.setItem('mashina_session_id', sid);
    }
    return sid;
  }

  // ─── WebSocket Connection & Reconnection ────────────────────────────
  function initWebSocket() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (state.ws) {
      if (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING) {
        return;
      }
      state.ws.onopen = null;
      state.ws.onclose = null;
      state.ws.onerror = null;
      state.ws.onmessage = null;
      try { state.ws.close(); } catch {}
      state.ws = null;
    }

    const loc = window.location;
    const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    let port = loc.port || '3480';
    if (port === '3456' || port === '5173') port = '3480';
    const urlParams = new URLSearchParams(window.location.search);
    const urlPin = urlParams.get('pin');
    const savedPin = urlPin || localStorage.getItem('mashina_kontrol_pin') || '';

    if (isLocalHost && !urlParams.has('role')) {
      urlParams.set('role', 'hub');
    }
    if (savedPin) {
      urlParams.set('pin', savedPin);
    }
    urlParams.set('sid', getSessionId());
    const qs = urlParams.toString();
    const wsUrl = `${proto}//${loc.hostname}:${port}${qs ? '?' + qs : ''}`;

    updateStatus('reconnecting');

    try {
      state.ws = new WebSocket(wsUrl);
      state.ws.binaryType = 'arraybuffer';
    } catch (e) {
      scheduleReconnect(2000);
      return;
    }

    state.ws.onopen = () => {
      fetchHostInfo();

      if (isLocalHost) {
        state.connected = true;
        state.authenticated = true;
        updateStatus('online');
        startPingTelemetry();
      } else {
        // Remote client: amber LED until server verifies pairing PIN
        state.connected = false;
        state.authenticated = false;
        updateStatus('reconnecting');
        stopPingTelemetry(); // No pings until authenticated!
        if (savedPin && !state.authAttempted) {
          state.authAttempted = true;
          sendJSON('AUTH', { pin: savedPin });
        } else {
          const pinModal = document.getElementById('pin-modal');
          if (pinModal) pinModal.classList.add('active');
        }
      }
    };

    state.ws.onclose = () => {
      state.connected = false;
      state.authenticated = false;
      updateStatus('reconnecting');
      stopPingTelemetry();
      scheduleReconnect(1500);
    };

    state.ws.onerror = () => {
      state.connected = false;
      state.authenticated = false;
      updateStatus('offline');
    };

    state.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'PONG') {
          const now = Date.now();
          state.latency = Math.max(1, now - (msg.t || now));
          if (el.latencyText) el.latencyText.textContent = `${state.latency}ms`;
          if (el.hubLatencyBadge) el.hubLatencyBadge.textContent = `${state.latency}ms`;
        }
        if (msg.type === 'CLIENT_INFO') {
          const count = msg.payload.activeCount || 1;
          const max = msg.payload.maxSlots || 8;
          const slot = msg.payload.slot ? `Slot ${msg.payload.slot} · ` : '';
          if (el.clientSlotBadge) el.clientSlotBadge.textContent = `${slot}${count}/${max}`;
          if (el.hubDiagSlot) el.hubDiagSlot.textContent = `${count}/${max}`;

          if (msg.payload.authenticated) {
            state.connected = true;
            state.authenticated = true;
            updateStatus('online');
            const pinModal = document.getElementById('pin-modal');
            if (pinModal) pinModal.classList.remove('active');
          }
        }
        if (msg.type === 'CLIENT_COUNT') {
          const count = msg.payload.activeControllers !== undefined ? msg.payload.activeControllers : (msg.payload.activeCount || 0);
          const max = msg.payload.maxSlots || 8;
          if (el.clientSlotBadge) {
            const curText = el.clientSlotBadge.textContent;
            const slotPrefix = curText.includes('Slot') ? curText.split('·')[0] + '· ' : '';
            el.clientSlotBadge.textContent = `${slotPrefix}${count}/${max}`;
          }
          if (el.hubDiagSlot) el.hubDiagSlot.textContent = `${count}/${max}`;
          if (el.hubStatusBadge) {
            el.hubStatusBadge.textContent = count > 0 ? `● CONNECTED (${count} phone${count > 1 ? 's' : ''})` : '● READY';
          }
          if (el.hubActiveDeviceName) {
            if (count > 0 && el.hubActiveDeviceName.textContent === 'Waiting for Phone...') {
              el.hubActiveDeviceName.textContent = 'Phone Paired (Ready)';
            } else if (count === 0) {
              el.hubActiveDeviceName.textContent = 'Waiting for Phone...';
            }
          }
        }
        if (msg.type === 'INPUT_TELEMETRY') {
          handleInputTelemetry(msg.payload);
        }
        if (msg.type === 'SLOT_STATE') {
          state.slots = msg.payload.slots || [];
          renderHubMultiplayerSlots();
          renderLobbySlots();

          // If on remote/mobile device and authenticated but not yet claimed:
          if (!isLocalHost && state.authenticated && !state.player.claimed) {
            const savedSlotNum = parseInt(localStorage.getItem('mashina_player_slot') || '0', 10);
            let targetSlot = savedSlotNum ? state.slots.find(s => s.slot === savedSlotNum && s.status === 'available') : null;
            if (!targetSlot) {
              targetSlot = state.slots.find(s => s.status === 'available');
            }
            if (targetSlot) {
              const savedName = localStorage.getItem('mashina_player_name') || `Player ${targetSlot.slot}`;
              const savedColor = localStorage.getItem('mashina_player_color') || targetSlot.color || '#00f0ff';
              sendJSON('CLAIM_SLOT', { slot: targetSlot.slot, name: savedName, color: savedColor });
            } else if (state.slots.length > 0) {
              openLobbyModal();
            }
          }
        }
        if (msg.type === 'CLAIM_SUCCESS') {
          state.player.claimed = true;
          state.player.slot = msg.payload.slot;
          state.player.name = msg.payload.name;
          state.player.color = msg.payload.color;

          localStorage.setItem('mashina_player_slot', String(msg.payload.slot));
          localStorage.setItem('mashina_player_name', msg.payload.name);
          localStorage.setItem('mashina_player_color', msg.payload.color);

          applyPlayerTheme(msg.payload.color);
          updatePlayerBadge();
          closeLobbyModal();
          vibrate([15, 30, 15]);
        }
        if (msg.type === 'CLAIM_FAILED') {
          showLobbyError(msg.payload?.error || 'Could not claim slot');
          openLobbyModal();
        }
        if (msg.type === 'RELEASE_SUCCESS') {
          state.player.claimed = false;
          state.player.slot = null;
          updatePlayerBadge();
          openLobbyModal();
        }
        if (msg.type === 'AUTH_REQUIRED') {
          if (!isLocalHost) {
            state.connected = false;
            state.authenticated = false;
            updateStatus('reconnecting');
            stopPingTelemetry();
            if (!state.authAttempted) {
              const currentPin = new URLSearchParams(window.location.search).get('pin') || localStorage.getItem('mashina_kontrol_pin');
              if (currentPin) {
                state.authAttempted = true;
                sendJSON('AUTH', { pin: currentPin });
                return;
              }
            }
            const pinModal = document.getElementById('pin-modal');
            if (pinModal) pinModal.classList.add('active');
          }
        }
        if (msg.type === 'AUTH_SUCCESS') {
          state.connected = true;
          state.authenticated = true;
          state.authAttempted = false;
          updateStatus('online');
          startPingTelemetry();
          const pinModal = document.getElementById('pin-modal');
          if (pinModal) pinModal.classList.remove('active');
          const pinErr = document.getElementById('pin-error');
          if (pinErr) pinErr.style.display = 'none';
          const validPin = new URLSearchParams(window.location.search).get('pin') || localStorage.getItem('mashina_kontrol_pin');
          if (validPin) localStorage.setItem('mashina_kontrol_pin', validPin);

          // If on mobile/remote device, check slot claiming
          if (!isLocalHost && !state.player.claimed) {
            if (state.slots.length > 0) {
              const savedSlotNum = parseInt(localStorage.getItem('mashina_player_slot') || '0', 10);
              let targetSlot = savedSlotNum ? state.slots.find(s => s.slot === savedSlotNum && s.status === 'available') : null;
              if (!targetSlot) {
                targetSlot = state.slots.find(s => s.status === 'available');
              }
              if (targetSlot) {
                const savedName = localStorage.getItem('mashina_player_name') || `Player ${targetSlot.slot}`;
                const savedColor = localStorage.getItem('mashina_player_color') || targetSlot.color || '#00f0ff';
                sendJSON('CLAIM_SLOT', { slot: targetSlot.slot, name: savedName, color: savedColor });
              } else {
                openLobbyModal();
              }
            }
          }
        }
        if (msg.type === 'AUTH_FAILED') {
          if (!isLocalHost) {
            state.connected = false;
            state.authenticated = false;
            state.authAttempted = true;
            updateStatus('offline');
            stopPingTelemetry();
            localStorage.removeItem('mashina_kontrol_pin');
            try {
              const u = new URL(window.location.href);
              if (u.searchParams.has('pin')) {
                u.searchParams.delete('pin');
                window.history.replaceState({}, '', u.pathname + (u.search ? u.search : ''));
              }
            } catch {}
            const pinModal = document.getElementById('pin-modal');
            if (pinModal) pinModal.classList.add('active');
            const pinErr = document.getElementById('pin-error');
            if (pinErr) {
              pinErr.textContent = msg.payload?.error || 'Invalid Pairing PIN';
              pinErr.style.display = 'block';
            }
            const pinInput = document.getElementById('pin-input');
            if (pinInput) {
              pinInput.value = '';
              pinInput.focus();
            }
          } else {
            localStorage.removeItem('mashina_kontrol_pin');
          }
        }
      } catch {}
    };
  }

  function sendJSON(type, payload = {}) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    state.ws.send(JSON.stringify({ type, payload, t: Date.now() }));
  }

  function sendBinary(opcode, int1, int2) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    const buf = new ArrayBuffer(5);
    const view = new DataView(buf);
    view.setUint8(0, opcode);
    view.setInt16(1, int1);
    view.setInt16(3, int2);
    state.ws.send(buf);
  }

  function updateStatus(status) {
    if (!el.led) return;
    el.led.className = `led-indicator ${status}`;
    if (status === 'online') {
      if (el.latencyText && state.latency === 0) el.latencyText.textContent = '<1ms';
    } else {
      if (el.latencyText) el.latencyText.textContent = '--';
    }
  }

  function startPingTelemetry() {
    stopPingTelemetry();
    sendJSON('PING', { clientTime: Date.now() });
    state.pingInterval = setInterval(() => {
      sendJSON('PING', { clientTime: Date.now() });
    }, 2500);
  }

  function stopPingTelemetry() {
    if (state.pingInterval) {
      clearInterval(state.pingInterval);
      state.pingInterval = null;
    }
  }

  // ─── Fetch Host Info & Generate QR Code ─────────────────────────────
  // ─── Fetch Host Info & Generate QR Code ─────────────────────────────
  async function fetchHostInfo() {
    try {
      const loc = window.location;
      let port = loc.port || '3480';
      if (port === '3456') port = '3480';
      const res = await fetch(`http://${loc.hostname}:${port}/api/info`);
      if (res.ok) {
        const data = await res.json();
        if (data.pin) {
          localStorage.setItem('mashina_kontrol_pin', data.pin);
        }
        if (isLocalHost) {
          const pinModal = document.getElementById('pin-modal');
          if (pinModal) pinModal.classList.remove('active');
          const pinErr = document.getElementById('pin-error');
          if (pinErr) pinErr.style.display = 'none';
        }
        renderQRModal(data);
        renderHubCard(data);
      }
    } catch {}
  }

  function getPrimaryUrl(info) {
    const loc = window.location;
    const pin = info?.pin || localStorage.getItem('mashina_kontrol_pin') || '';
    const pinQuery = pin ? `?pin=${pin}` : '';

    let bestIp = (loc.hostname !== 'localhost' && loc.hostname !== '127.0.0.1' && !loc.hostname.startsWith('169.254.')) ? loc.hostname : '';
    if (!bestIp && info && info.interfaces && info.interfaces.length) {
      // Exclude invalid link-local APIPA addresses
      const validIps = info.interfaces.filter(i => !i.ip.startsWith('169.254.') && !i.ip.startsWith('127.'));
      // Prefer real Wi-Fi / Ethernet LAN subnets
      const lanIp = validIps.find(i => 
        i.ip.startsWith('192.168.') || 
        i.ip.startsWith('10.') || 
        /^172\.(1[6-9]|2\d|3[01])\./.test(i.ip)
      );
      bestIp = lanIp ? lanIp.ip : (validIps[0] ? validIps[0].ip : '');
    }
    const port = loc.port || '3480';
    return bestIp ? `http://${bestIp}:${port}/${pinQuery}` : `${loc.protocol}//${loc.hostname}:${port}/${pinQuery}`;
  }

  function renderHubCard(info) {
    const pin = info?.pin || localStorage.getItem('mashina_kontrol_pin') || '';
    const primaryUrl = getPrimaryUrl(info);

    if (el.hubPinDisplay) {
      el.hubPinDisplay.textContent = pin || '----';
    }
    if (el.hubUrlInput) {
      el.hubUrlInput.value = primaryUrl;
    }
    if (el.hubQrImg) {
      if (typeof qrcode !== 'undefined') {
        try {
          const qr = qrcode(0, 'M');
          qr.addData(primaryUrl);
          qr.make();
          el.hubQrImg.src = qr.createDataURL(6, 4);
        } catch (e) {
          console.error('Failed to generate offline Hub QR:', e);
        }
      }
      el.hubQrImg.alt = `Pairing QR: ${primaryUrl}`;
    }
    if (el.hubDiagOs && info?.platform) {
      el.hubDiagOs.textContent = info.platform === 'win32' ? 'Windows (Native SendInput)' : info.platform;
    }
    if (el.hubDriverStatusText) {
      if (info?.vigemInstalled) {
        el.hubDriverStatusText.textContent = '🎮 Native Xbox 360 Controller (ViGEmBus Active)';
        el.hubDriverStatusText.style.color = 'var(--mashina-emerald)';
        if (el.btnInstallVigem) {
          el.btnInstallVigem.textContent = '✓ Driver Active & Running';
          el.btnInstallVigem.style.borderColor = 'var(--mashina-emerald)';
          el.btnInstallVigem.style.color = 'var(--mashina-emerald)';
        }
      } else {
        el.hubDriverStatusText.textContent = '⌨️ Keyboard/Mouse Emulation';
        el.hubDriverStatusText.style.color = 'var(--mashina-amber)';
      }
    }
  }

  function renderQRModal(info) {
    if (!el.qrContainer) return;
    const pin = info?.pin || localStorage.getItem('mashina_kontrol_pin') || '';
    const primaryUrl = getPrimaryUrl(info);
    const loc = window.location;
    const port = loc.port || '3480';
    const pinQuery = pin ? `?pin=${encodeURIComponent(pin)}` : '';

    let qrDataUrl = '';
    if (typeof qrcode !== 'undefined') {
      try {
        const qr = qrcode(0, 'M');
        qr.addData(primaryUrl);
        qr.make();
        qrDataUrl = qr.createDataURL(5, 4);
      } catch (e) {
        console.error('Failed to generate offline modal QR:', e);
      }
    }

    let linksHtml = '';
    if (info && info.interfaces && info.interfaces.length) {
      info.interfaces.forEach(({ name, ip }) => {
        const isTailscale = ip.startsWith('100.');
        const label = isTailscale ? 'Tailscale' : name;
        const target = `http://${ip}:${port}/${pinQuery}`;
        linksHtml += `<div style="margin-top: 4px;">• <strong>${escapeHtml(label)}:</strong> <a href="${encodeURI(target)}" target="_blank" rel="noopener" style="color: var(--mashina-cyan); word-break: break-all;">${escapeHtml(target)}</a></div>`;
      });
    }

    const platformText = info?.platform ? `${escapeHtml(info.platform)} (${escapeHtml(info.hostname || '')})` : 'Offline / Connecting';
    const pinText = pin ? escapeHtml(pin) : (isLocalHost ? 'Localhost (Authorized)' : 'Required (Check Host Screen)');

    el.qrContainer.innerHTML = `
      <div style="background: #FFFFFF; padding: 8px; border-radius: 4px; border: 2px solid var(--mashina-line); display: inline-block;">
        ${qrDataUrl ? `<img src="${qrDataUrl}" alt="Scan QR Code" width="180" height="180" style="display: block;">` : `<div style="width:180px;height:180px;display:flex;align-items:center;justify-content:center;color:#000;">Scan QR</div>`}
      </div>
      <div style="font-family: var(--font-mono); font-size: 13px; font-weight: 800; color: var(--mashina-amber); margin: 6px 0;">
        PAIRING PIN: ${pinText}
      </div>
      <div style="font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); text-align: left; width: 100%; border-top: 1px solid var(--mashina-line); padding-top: 8px; margin-top: 6px;">
        <div style="color: var(--mashina-emerald); margin-bottom: 4px;">● Daemon: ${platformText}</div>
        ${linksHtml}
      </div>
    `;
  }

  // ─── Desktop Hub Live Wireframe Visualizer ──────────────────────────
  let deviceResetTimer = null;

  function mapToWfKey(key) {
    if (!key) return null;
    const norm = key.toUpperCase();
    const map = {
      'BTN_PS_CROSS': 'BTN_A',
      'BTN_PS_CIRCLE': 'BTN_B',
      'BTN_PS_SQUARE': 'BTN_X',
      'BTN_PS_TRIANGLE': 'BTN_Y',
      'BTN_SNES_B': 'BTN_A',
      'BTN_SNES_A': 'BTN_B',
      'BTN_SNES_Y': 'BTN_X',
      'BTN_SNES_X': 'BTN_Y',
      'BTN_L1': 'BTN_LB',
      'BTN_R1': 'BTN_RB',
      'BTN_L2': 'BTN_LT',
      'BTN_R2': 'BTN_RT',
      'BTN_SHARE': 'BTN_SELECT',
      'BTN_OPTIONS': 'BTN_START',
      'BTN_PS': 'BTN_HOME'
    };
    return map[norm] || norm;
  }

  function setWireframeKey(key, isPressed, color = null) {
    const wfKey = mapToWfKey(key);
    if (!wfKey) return;
    const btn = document.querySelector(`.hub-controller-wireframe [data-wf="${wfKey}"]`);
    if (btn) {
      btn.classList.toggle('active-press', isPressed);
      if (isPressed && color) {
        btn.style.borderColor = color;
        btn.style.boxShadow = `0 0 10px ${color}`;
        btn.style.color = color;
      } else {
        btn.style.borderColor = '';
        btn.style.boxShadow = '';
        btn.style.color = '';
      }
    }
  }

  function setWireframeStick(stick, x, y, color = null) {
    const dot = stick === 'LEFT' ? el.hubStickLeftDot : el.hubStickRightDot;
    if (!dot) return;
    const maxRadius = 14;
    const tx = Math.round((x || 0) * maxRadius);
    const ty = Math.round((y || 0) * maxRadius);
    dot.style.transform = `translate(${tx}px, ${ty}px)`;
    if (color && (Math.abs(x) > 0.2 || Math.abs(y) > 0.2)) {
      dot.style.background = color;
      dot.style.boxShadow = `0 0 8px ${color}`;
    } else {
      dot.style.background = '';
      dot.style.boxShadow = '';
    }
  }

  function handleInputTelemetry(payload) {
    if (!payload) return;
    const { action, key, stick, x, y, slot, name, color } = payload;

    if (slot) {
      updateHubSlotActivity(slot, action, key || stick, color);
    }

    if (el.hubActiveDeviceName) {
      const pilotLabel = name || (slot ? `Pilot P${slot}` : 'Phone');
      el.hubActiveDeviceName.textContent = `${pilotLabel} Transmitting Input`;
      el.hubActiveDeviceName.style.color = color || 'var(--mashina-amber)';
      if (deviceResetTimer) clearTimeout(deviceResetTimer);
      deviceResetTimer = setTimeout(() => {
        if (el.hubActiveDeviceName) {
          el.hubActiveDeviceName.textContent = 'Connected (Standing By)';
          el.hubActiveDeviceName.style.color = '';
        }
      }, 1200);
    }

    if (action === 'BTN_DOWN') {
      setWireframeKey(key, true, color);
    } else if (action === 'BTN_UP') {
      setWireframeKey(key, false);
    } else if (action === 'BTN_TAP') {
      setWireframeKey(key, true, color);
      setTimeout(() => setWireframeKey(key, false), 120);
    } else if (action === 'STICK_MOVE') {
      setWireframeStick(stick, x, y, color);
    }
  }

  // ─── Multiplayer Lobby & Player Slot System ────────────────────────
  const LOBBY_PALETTE = [
    { name: 'Cyber Cyan', color: '#00f0ff', glow: 'rgba(0, 240, 255, 0.45)' },
    { name: 'Neon Amber', color: '#ff8c00', glow: 'rgba(255, 140, 0, 0.45)' },
    { name: 'Toxic Green', color: '#00ff88', glow: 'rgba(0, 255, 136, 0.45)' },
    { name: 'Laser Purple', color: '#b026ff', glow: 'rgba(176, 38, 255, 0.45)' },
    { name: 'Crimson Red', color: '#ff2a5f', glow: 'rgba(255, 42, 95, 0.45)' },
    { name: 'Solar Gold', color: '#ffd700', glow: 'rgba(255, 215, 0, 0.45)' },
    { name: 'Cyber Pink', color: '#ff00aa', glow: 'rgba(255, 0, 170, 0.45)' },
    { name: 'Titanium', color: '#e0e6ed', glow: 'rgba(224, 230, 237, 0.45)' }
  ];

  let selectedLobbySlot = null;
  let selectedLobbyColor = '#00f0ff';

  function applyPlayerTheme(color) {
    if (!color) return;
    const found = LOBBY_PALETTE.find(p => p.color.toLowerCase() === color.toLowerCase());
    const glow = found ? found.glow : 'rgba(0, 240, 255, 0.35)';

    document.documentElement.style.setProperty('--player-accent', color);
    document.documentElement.style.setProperty('--player-glow', glow);
    document.documentElement.setAttribute('data-player-color', color);

    if (el.playerDot) {
      el.playerDot.style.background = color;
      el.playerDot.style.boxShadow = `0 0 8px ${color}`;
    }
  }

  function updatePlayerBadge() {
    if (!el.playerBadge) return;
    if (state.player && state.player.claimed && state.player.slot) {
      el.playerBadge.style.display = 'inline-flex';
      el.playerBadge.style.borderColor = state.player.color || 'var(--mashina-cyan)';
      el.playerBadge.style.boxShadow = `0 0 8px ${state.player.color || 'var(--mashina-cyan)'}`;
      if (el.playerLabel) {
        el.playerLabel.textContent = `P${state.player.slot} · ${state.player.name || `Player ${state.player.slot}`}`;
      }
      if (el.playerDot) {
        el.playerDot.style.background = state.player.color || 'var(--mashina-cyan)';
      }
    } else {
      el.playerBadge.style.display = 'none';
    }
  }

  function initLobbyUI() {
    if (!el.lobbyPaletteContainer) return;

    // Render palette swatches
    el.lobbyPaletteContainer.innerHTML = '';
    LOBBY_PALETTE.forEach((item) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'lobby-swatch';
      swatch.style.background = item.color;
      swatch.style.setProperty('--swatch-color', item.glow);
      swatch.title = item.name;
      if (item.color.toLowerCase() === (state.player.color || '#00f0ff').toLowerCase()) {
        swatch.classList.add('active');
        selectedLobbyColor = item.color;
      }
      swatch.addEventListener('click', () => {
        document.querySelectorAll('.lobby-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        selectedLobbyColor = item.color;
        vibrate(8);
        playClickSound(300, 0.01, 0.04);
        updateLobbyModalHeader();
        updateSelectedSlotHighlight();
      });
      el.lobbyPaletteContainer.appendChild(swatch);
    });

    // Callsign input event
    if (el.lobbyNameInput) {
      if (state.player.name) el.lobbyNameInput.value = state.player.name;
      el.lobbyNameInput.addEventListener('input', () => {
        if (el.lobbyError) el.lobbyError.style.display = 'none';
      });
    }

    // Join Button
    if (el.btnLobbyJoin) {
      el.btnLobbyJoin.addEventListener('click', () => {
        if (!selectedLobbySlot) {
          showLobbyError('Please choose an available controller slot (P1 - P8)');
          return;
        }
        const name = (el.lobbyNameInput?.value || '').trim() || `Player ${selectedLobbySlot}`;
        sendJSON('CLAIM_SLOT', {
          slot: selectedLobbySlot,
          name: name,
          color: selectedLobbyColor
        });
        vibrate(15);
        playClickSound(440, 0.02, 0.1);
      });
    }

    // Badge click to open lobby anytime
    if (el.playerBadge) {
      el.playerBadge.addEventListener('click', () => {
        openLobbyModal();
      });
    }

    // Close button (only allowed if already claimed a slot)
    if (el.lobbyCloseBtn) {
      el.lobbyCloseBtn.addEventListener('click', () => {
        if (state.player.claimed) {
          closeLobbyModal();
        }
      });
    }
  }

  function updateLobbyModalHeader() {
    const dot = document.getElementById('lobby-header-dot');
    if (dot) {
      dot.style.background = selectedLobbyColor;
      dot.style.boxShadow = `0 0 8px ${selectedLobbyColor}`;
    }
  }

  function updateSelectedSlotHighlight() {
    document.querySelectorAll('.lobby-slot-card').forEach(card => {
      const slotNum = parseInt(card.dataset.slot, 10);
      if (slotNum === selectedLobbySlot) {
        card.classList.add('selected');
        card.style.setProperty('--selected-color', selectedLobbyColor);
      } else {
        card.classList.remove('selected');
      }
    });
  }

  function showLobbyError(msg) {
    if (!el.lobbyError) return;
    el.lobbyError.textContent = msg;
    el.lobbyError.style.display = 'block';
    vibrate([20, 40, 20]);
  }

  function openLobbyModal() {
    if (!el.lobbyModal) return;
    if (el.lobbyError) el.lobbyError.style.display = 'none';
    renderLobbySlots();
    el.lobbyModal.classList.add('active');
    if (el.lobbyCloseBtn) {
      el.lobbyCloseBtn.style.display = state.player.claimed ? 'block' : 'none';
    }
    updateLobbyModalHeader();
  }

  function closeLobbyModal() {
    if (!el.lobbyModal) return;
    el.lobbyModal.classList.remove('active');
  }

  function renderLobbySlots() {
    if (!el.lobbySlotsContainer) return;
    el.lobbySlotsContainer.innerHTML = '';

    const slots = state.slots.length > 0 ? state.slots : Array.from({ length: 8 }, (_, i) => ({
      slot: i + 1,
      status: 'available',
      name: `Player ${i + 1}`,
      color: LOBBY_PALETTE[i]?.color || '#00f0ff'
    }));

    // If no slot selected yet, auto-select current player slot or first available slot
    if (!selectedLobbySlot) {
      if (state.player.slot) {
        selectedLobbySlot = state.player.slot;
      } else {
        const firstAvail = slots.find(s => s.status === 'available');
        if (firstAvail) selectedLobbySlot = firstAvail.slot;
      }
    }

    slots.forEach(s => {
      const card = document.createElement('div');
      card.className = 'lobby-slot-card';
      card.dataset.slot = s.slot;

      const isTaken = s.status === 'occupied' && (!state.player.claimed || state.player.slot !== s.slot);
      if (isTaken) card.classList.add('taken');
      if (s.slot === selectedLobbySlot) {
        card.classList.add('selected');
        card.style.setProperty('--selected-color', selectedLobbyColor);
      }

      card.innerHTML = `
        <span class="slot-card-id" style="color: ${s.color};">P${s.slot}</span>
        <span class="slot-card-status">${isTaken ? 'TAKEN' : 'OPEN'}</span>
        <span class="slot-card-pilot">${isTaken ? s.name : 'Ready'}</span>
      `;

      if (!isTaken) {
        card.addEventListener('click', () => {
          selectedLobbySlot = s.slot;
          updateSelectedSlotHighlight();
          if (el.lobbyNameInput && !el.lobbyNameInput.value) {
            el.lobbyNameInput.placeholder = `Player ${s.slot}`;
          }
          vibrate(10);
          playClickSound(360, 0.012, 0.05);
        });
      }

      el.lobbySlotsContainer.appendChild(card);
    });

    if (el.btnLobbyJoin) {
      el.btnLobbyJoin.disabled = false;
    }
  }

  // ─── Desktop Hub Multiplayer Bay ──────────────────────────────────
  function renderHubMultiplayerSlots() {
    if (!el.hubSlotsGrid) return;
    el.hubSlotsGrid.innerHTML = '';

    const slots = state.slots.length > 0 ? state.slots : Array.from({ length: 8 }, (_, i) => ({
      slot: i + 1,
      status: 'available',
      name: `Player ${i + 1}`,
      color: LOBBY_PALETTE[i]?.color || '#00f0ff'
    }));

    const activeCount = slots.filter(s => s.status === 'occupied').length;
    if (el.hubPlayersCount) {
      el.hubPlayersCount.textContent = `${activeCount} / 8 Active Pilots`;
    }

    slots.slice(0, 4).forEach(s => {
      const isConnected = s.status === 'occupied';
      const bay = document.createElement('div');
      bay.className = `hub-pilot-bay ${isConnected ? 'connected' : ''}`;
      bay.id = `hub-pilot-bay-${s.slot}`;
      bay.style.setProperty('--bay-color', s.color);

      bay.innerHTML = `
        <div class="hub-pilot-header">
          <span class="hub-pilot-tag">P${s.slot}</span>
          <span class="hub-pilot-status-dot"></span>
        </div>
        <div class="hub-pilot-name">${isConnected ? s.name : 'WAITING...'}</div>
        <div class="hub-pilot-activity" id="hub-pilot-act-${s.slot}">${isConnected ? 'READY' : 'STANDBY'}</div>
      `;

      el.hubSlotsGrid.appendChild(bay);
    });
  }

  const hubPilotTimers = {};
  function updateHubSlotActivity(slot, action, detail, color) {
    const actEl = document.getElementById(`hub-pilot-act-${slot}`);
    const bayEl = document.getElementById(`hub-pilot-bay-${slot}`);
    if (!actEl || !bayEl) return;

    bayEl.style.borderColor = color || 'var(--mashina-cyan)';
    actEl.textContent = `▶ ${detail || action}`;
    actEl.classList.add('active-press');

    if (hubPilotTimers[slot]) clearTimeout(hubPilotTimers[slot]);
    hubPilotTimers[slot] = setTimeout(() => {
      actEl.textContent = 'READY';
      actEl.classList.remove('active-press');
      bayEl.style.borderColor = '';
    }, 600);
  }

  // ─── Screen Wake Lock (Prevent Sleep) ───────────────────────────────
  async function requestWakeLock() {
    initAudio();
    if ('wakeLock' in navigator) {
      try {
        state.wakeLock = await navigator.wakeLock.request('screen');
      } catch {}
    }
  }

  // ─── Brutalist Theme Engine ─────────────────────────────────────────
  function setTheme(theme) {
    state.currentTheme = theme;
    localStorage.setItem('mashina_kontrol_theme', theme);
    el.html.setAttribute('data-theme', theme);
    el.themeBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
    vibrate(10);
    playClickSound(180, 0.012, 0.06);
  }

  function isClientDevice() {
    return document.documentElement.classList.contains('is-mobile-client') ||
           !isLocalHost ||
           ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0) ||
           /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  }

  // ─── Device-Aware Initial Mode Detection ────────────────────────────
  function getInitialMode() {
    if (isClientDevice()) {
      const saved = localStorage.getItem('mashina_kontrol_mode');
      if (saved && saved !== 'hub') return saved;
      return 'gamepad';
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('mode')) return params.get('mode');

    // If on PC Host desktop browser, ALWAYS default to the Desktop Command Hub
    if (isLocalHost && window.innerWidth >= 900) {
      return 'hub';
    }

    return 'gamepad';
  }

  // ─── Mode Switcher (6 Modular Decks) ────────────────────────────────
  function setMode(mode, savePreference = false) {
    if (isClientDevice() && mode === 'hub') {
      mode = 'gamepad';
    }
    state.currentMode = mode;
    if (savePreference && mode !== 'hub') {
      localStorage.setItem('mashina_kontrol_mode', mode);
    }
    el.modeBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    Object.keys(el.decks).forEach(key => {
      if (el.decks[key]) {
        el.decks[key].classList.toggle('active', key === mode);
      }
    });
    if (mode === 'hub') {
      renderHubMultiplayerSlots();
    }
    applyAllLayoutTransforms();
    setupDraggableModules();
    if (state.editMode) {
      const activeDeck = document.querySelector('.deck-view.active');
      const firstMod = (activeDeck && activeDeck.querySelector('.customizer-draggable')) || document.querySelector('.customizer-draggable');
      if (firstMod) {
        selectModule(getModuleId(firstMod), firstMod);
      }
    }
    vibrate(8);
    playClickSound(200, 0.015, 0.05);
  }

  // ─── Controller Layout Switcher (Xbox, PS, SNES) ───────────────────
  function setLayout(layoutKey) {
    state.currentLayout = layoutKey;
    localStorage.setItem('mashina_kontrol_layout', layoutKey);
    el.layoutBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.layout === layoutKey);
    });

    renderGamepadLayout(layoutKey);
    vibrate(12);
    playClickSound(190, 0.014, 0.06);
  }

  function renderGamepadLayout(layoutKey) {
    if (!el.gamepadMiddleZone) return;

    if (layoutKey === 'ps') {
      // PlayStation DualSense Layout: Symmetrical sticks on lower-inside, D-Pad on upper-outer, Symbols on upper-outer, Central Touchpad
      const config = CONTROLLER_LAYOUTS.ps;
      if (el.btnLt) el.btnLt.textContent = config.topRow.lt;
      if (el.btnLb) el.btnLb.textContent = config.topRow.lb;
      if (el.btnRb) el.btnRb.textContent = config.topRow.rb;
      if (el.btnRt) el.btnRt.textContent = config.topRow.rt;
      if (el.btnSelect) el.btnSelect.textContent = config.topRow.select;
      if (el.btnStart) el.btnStart.textContent = config.topRow.start;

      el.gamepadMiddleZone.className = 'gamepad-middle-zone layout-ps';
      el.gamepadMiddleZone.innerHTML = `
        <div class="controller-wing-left" id="ctrl-wing-left">
          <!-- Top Outer: Directional D-Pad -->
          <div class="dpad-cross" id="dpad-container">
            <button class="dpad-btn up" id="btn-dpad-up" data-key="DPAD_UP" data-id="DPAD_UP">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5l-7 7h14z"/></svg>
            </button>
            <button class="dpad-btn left" id="btn-dpad-left" data-key="DPAD_LEFT" data-id="DPAD_LEFT">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M5 12l7-7v14z"/></svg>
            </button>
            <div class="dpad-center-hub"></div>
            <button class="dpad-btn right" id="btn-dpad-right" data-key="DPAD_RIGHT" data-id="DPAD_RIGHT">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 12l-7-7v14z"/></svg>
            </button>
            <button class="dpad-btn down" id="btn-dpad-down" data-key="DPAD_DOWN" data-id="DPAD_DOWN">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 19l-7-7h14z"/></svg>
            </button>
          </div>

          <!-- Bottom Inner: Left Thumbstick (Symmetrical Inside) -->
          <div class="joystick-pod-wrapper" id="joystick-left-wrapper">
            <div class="joystick-pod" id="joystick-left-pod">
              <div class="joystick-thumb" id="joystick-left-thumb"></div>
            </div>
          </div>
        </div>

        <!-- Center: DualSense Central Clickable Touchpad Zone -->
        <div class="ps-center-touchpad-zone" id="ps-center-touchpad-zone">
          <div class="ps-touchpad-meta">
            <button class="meta-pill-btn" id="btn-ps-share" data-key="BTN_SHARE" data-id="BTN_SHARE">SHARE</button>
            <button class="meta-pill-btn" id="btn-ps-options" data-key="BTN_OPTIONS" data-id="BTN_OPTIONS">OPTIONS</button>
          </div>
          <button class="ps-touchpad-btn" id="btn-ps-touchpad" data-key="BTN_TOUCHPAD" data-id="BTN_TOUCHPAD">
            [ TOUCHPAD ]
          </button>
          <div style="font-family: var(--font-mono); font-size: 8px; color: var(--text-muted); letter-spacing: 0.06em;">DUALSENSE SYMMETRIC</div>
        </div>

        <div class="controller-wing-right" id="ctrl-wing-right">
          <!-- Bottom Inner: Right Thumbstick (Symmetrical Inside) -->
          <div class="joystick-pod-wrapper" id="joystick-right-wrapper">
            <div class="joystick-pod" id="joystick-right-pod">
              <div class="joystick-thumb" id="joystick-right-thumb"></div>
            </div>
          </div>

          <!-- Top Outer: PlayStation Action Symbols (▲, ◼, ⭘, ✖) -->
          <div class="face-diamond" id="face-diamond-container">
            <button class="face-btn btn-y pos-top" id="btn-face-y" data-key="BTN_PS_TRIANGLE" data-id="BTN_PS_TRIANGLE" style="color: #00E676; border-color: #206635;">▲</button>
            <button class="face-btn btn-x pos-left" id="btn-face-x" data-key="BTN_PS_SQUARE" data-id="BTN_PS_SQUARE" style="color: #FF5252; border-color: #662020;">◼</button>
            <button class="face-btn btn-b pos-right" id="btn-face-b" data-key="BTN_PS_CIRCLE" data-id="BTN_PS_CIRCLE" style="color: #FF3B30; border-color: #661410;">⭘</button>
            <button class="face-btn btn-a pos-bottom" id="btn-face-a" data-key="BTN_PS_CROSS" data-id="BTN_PS_CROSS" style="color: #00B0FF; border-color: #205066;">✖</button>
          </div>
        </div>
      `;

      setupJoysticks();
      setupButtonListeners();
      applyCustomBindingsToDOM();
      applyAllLayoutTransforms();
      setupDraggableModules();
      setupDynamicTouchSpawn();
      return;
    }

    if (layoutKey === 'snes') {
      // Nintendo Retro SNES Layout: Classic D-Pad & 4-Action Diamond without analog stick clutter
      const config = CONTROLLER_LAYOUTS.snes;
      if (el.btnLt) el.btnLt.textContent = config.topRow.lt;
      if (el.btnLb) el.btnLb.textContent = config.topRow.lb;
      if (el.btnRb) el.btnRb.textContent = config.topRow.rb;
      if (el.btnRt) el.btnRt.textContent = config.topRow.rt;
      if (el.btnSelect) el.btnSelect.textContent = config.topRow.select;
      if (el.btnStart) el.btnStart.textContent = config.topRow.start;

      el.gamepadMiddleZone.className = 'gamepad-middle-zone layout-snes';
      el.gamepadMiddleZone.innerHTML = `
        <div class="controller-wing-left" id="ctrl-wing-left" style="justify-content: center; flex: 1;">
          <div class="dpad-cross" id="dpad-container">
            <button class="dpad-btn up" id="btn-dpad-up" data-key="DPAD_UP" data-id="DPAD_UP">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5l-7 7h14z"/></svg>
            </button>
            <button class="dpad-btn left" id="btn-dpad-left" data-key="DPAD_LEFT" data-id="DPAD_LEFT">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M5 12l7-7v14z"/></svg>
            </button>
            <div class="dpad-center-hub"></div>
            <button class="dpad-btn right" id="btn-dpad-right" data-key="DPAD_RIGHT" data-id="DPAD_RIGHT">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 12l-7-7v14z"/></svg>
            </button>
            <button class="dpad-btn down" id="btn-dpad-down" data-key="DPAD_DOWN" data-id="DPAD_DOWN">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 19l-7-7h14z"/></svg>
            </button>
          </div>
        </div>

        <div class="controller-wing-right" id="ctrl-wing-right" style="justify-content: center; flex: 1;">
          <div class="face-diamond" id="face-diamond-container">
            <button class="face-btn btn-y pos-top" id="btn-face-y" data-key="BTN_SNES_X" data-id="BTN_SNES_X" style="color: #9B59B6; border-color: #4A235A;">X</button>
            <button class="face-btn btn-x pos-left" id="btn-face-x" data-key="BTN_SNES_Y" data-id="BTN_SNES_Y" style="color: #9B59B6; border-color: #4A235A;">Y</button>
            <button class="face-btn btn-b pos-right" id="btn-face-b" data-key="BTN_SNES_A" data-id="BTN_SNES_A" style="color: #8E44AD; border-color: #5B2C6F;">A</button>
            <button class="face-btn btn-a pos-bottom" id="btn-face-a" data-key="BTN_SNES_B" data-id="BTN_SNES_B" style="color: #8E44AD; border-color: #5B2C6F;">B</button>
          </div>
        </div>
      `;

      setupJoysticks();
      setupButtonListeners();
      applyCustomBindingsToDOM();
      applyAllLayoutTransforms();
      setupDraggableModules();
      setupDynamicTouchSpawn();
      return;
    }

    // Default: Xbox Standard Asymmetrical Layout (Left Stick on upper-outer, D-Pad on lower-inner; Right Stick on lower-inner, Face Diamond on upper-outer)
    const config = CONTROLLER_LAYOUTS.xbox;

    // Update Top Row Trigger Labels
    if (el.btnLt) el.btnLt.textContent = config.topRow.lt;
    if (el.btnLb) el.btnLb.textContent = config.topRow.lb;
    if (el.btnRb) el.btnRb.textContent = config.topRow.rb;
    if (el.btnRt) el.btnRt.textContent = config.topRow.rt;
    if (el.btnSelect) el.btnSelect.textContent = config.topRow.select;
    if (el.btnStart) el.btnStart.textContent = config.topRow.start;

    el.gamepadMiddleZone.className = 'gamepad-middle-zone layout-xbox';
    el.gamepadMiddleZone.innerHTML = `
      <!-- Left Wing: Top-Left Stick (Raised Outer) + Bottom-Right D-Pad (Lowered Inner) (Xbox Asymmetry) -->
      <div class="controller-wing-left" id="ctrl-wing-left">
        <div class="joystick-pod-wrapper" id="joystick-left-wrapper">
          <div class="joystick-pod" id="joystick-left-pod">
            <div class="joystick-thumb" id="joystick-left-thumb"></div>
          </div>
        </div>

        <div class="dpad-cross" id="dpad-container">
          <button class="dpad-btn up" id="btn-dpad-up" data-key="DPAD_UP" data-id="DPAD_UP">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5l-7 7h14z"/></svg>
          </button>
          <button class="dpad-btn left" id="btn-dpad-left" data-key="DPAD_LEFT" data-id="DPAD_LEFT">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M5 12l7-7v14z"/></svg>
          </button>
          <div class="dpad-center-hub"></div>
          <button class="dpad-btn right" id="btn-dpad-right" data-key="DPAD_RIGHT" data-id="DPAD_RIGHT">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 12l-7-7v14z"/></svg>
          </button>
          <button class="dpad-btn down" id="btn-dpad-down" data-key="DPAD_DOWN" data-id="DPAD_DOWN">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 19l-7-7h14z"/></svg>
          </button>
        </div>
      </div>

      <!-- Right Wing: Bottom-Left Right Stick (Lowered Inner) + Top-Right Face Diamond (Raised Outer) (Xbox Asymmetry) -->
      <div class="controller-wing-right" id="ctrl-wing-right">
        <div class="joystick-pod-wrapper" id="joystick-right-wrapper">
          <div class="joystick-pod" id="joystick-right-pod">
            <div class="joystick-thumb" id="joystick-right-thumb"></div>
          </div>
        </div>

        <div class="face-diamond" id="face-diamond-container">
          <button class="face-btn btn-y pos-top" id="btn-face-y" data-key="BTN_Y" data-id="BTN_Y">Y</button>
          <button class="face-btn btn-x pos-left" id="btn-face-x" data-key="BTN_X" data-id="BTN_X">X</button>
          <button class="face-btn btn-b pos-right" id="btn-face-b" data-key="BTN_B" data-id="BTN_B">B</button>
          <button class="face-btn btn-a pos-bottom" id="btn-face-a" data-key="BTN_A" data-id="BTN_A">A</button>
        </div>
      </div>
    `;

    setupJoysticks();
    setupButtonListeners();
    applyCustomBindingsToDOM();
    applyAllLayoutTransforms();
    setupDraggableModules();
    setupDynamicTouchSpawn();
  }

  // ─── Layout Drag & Scale Engine (Gamepad & Presentation Decks) ──────
  const DRAGGABLE_SELECTOR = '.dpad-cross, .face-diamond, .joystick-pod, .ps-center-touchpad-zone, .bumper-group, .pres-giant-btn, .pres-aux-controls';

  function getCurrentTransformKey() {
    return (state.currentMode === 'gamepad') ? state.currentLayout : state.currentMode;
  }

  function getModuleId(moduleEl) {
    return moduleEl.id || moduleEl.dataset.id || moduleEl.dataset.module || moduleEl.className.split(' ')[0];
  }

  function getModuleTransform(moduleId) {
    const key = getCurrentTransformKey();
    const layoutMap = state.layoutTransforms[key] || {};
    return layoutMap[moduleId] || { x: 0, y: 0, scale: 1.0 };
  }

  function setModuleTransform(moduleId, transform) {
    const key = getCurrentTransformKey();
    if (!state.layoutTransforms[key]) {
      state.layoutTransforms[key] = {};
    }
    state.layoutTransforms[key][moduleId] = transform;
  }

  function applyTransformToElement(targetEl, transform) {
    if (!targetEl) return;
    const x = transform.x || 0;
    const y = transform.y || 0;
    const scale = transform.scale !== undefined ? transform.scale : 1.0;
    if (x === 0 && y === 0 && scale === 1.0) {
      targetEl.style.transform = '';
    } else {
      targetEl.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    }
  }

  function applyAllLayoutTransforms() {
    const key = getCurrentTransformKey();
    const layoutMap = state.layoutTransforms[key] || {};
    const modules = document.querySelectorAll(DRAGGABLE_SELECTOR);
    modules.forEach(mod => {
      const modId = getModuleId(mod);
      const transform = layoutMap[modId] || { x: 0, y: 0, scale: 1.0 };
      applyTransformToElement(mod, transform);
    });
  }

  function selectModule(moduleId, moduleEl) {
    state.selectedModuleId = moduleId;
    const transform = getModuleTransform(moduleId);
    state.selectedModuleScale = transform.scale !== undefined ? transform.scale : 1.0;
    if (el.scaleIndicator) {
      el.scaleIndicator.textContent = `${Math.round(state.selectedModuleScale * 100)}%`;
    }

    document.querySelectorAll('.customizer-draggable').forEach(m => m.classList.remove('customizer-selected'));
    if (moduleEl) {
      moduleEl.classList.add('customizer-selected');
    } else {
      const target = document.getElementById(moduleId) || document.querySelector(`.${moduleId}`);
      if (target) target.classList.add('customizer-selected');
    }
  }

  function deselectAllModules() {
    state.selectedModuleId = null;
    document.querySelectorAll('.customizer-draggable').forEach(m => m.classList.remove('customizer-selected'));
  }

  function adjustSelectedScale(delta) {
    if (!state.selectedModuleId) {
      const activeDeck = document.querySelector('.deck-view.active');
      const firstMod = (activeDeck && activeDeck.querySelector('.customizer-draggable')) || document.querySelector('.customizer-draggable');
      if (firstMod) {
        selectModule(getModuleId(firstMod), firstMod);
      } else {
        return;
      }
    }

    const transform = getModuleTransform(state.selectedModuleId);
    let curScale = transform.scale !== undefined ? transform.scale : 1.0;
    curScale = Math.min(2.0, Math.max(0.5, parseFloat((curScale + delta).toFixed(2))));
    transform.scale = curScale;
    state.selectedModuleScale = curScale;

    setModuleTransform(state.selectedModuleId, transform);

    const targetEl = document.getElementById(state.selectedModuleId) || document.querySelector(`.${state.selectedModuleId}`);
    if (targetEl) {
      applyTransformToElement(targetEl, transform);
    }

    if (el.scaleIndicator) {
      el.scaleIndicator.textContent = `${Math.round(curScale * 100)}%`;
    }

    vibrate(8);
    playClickSound(240, 0.01, 0.05);
  }

  function saveLayoutPositions() {
    localStorage.setItem('mashina_layout_transforms', JSON.stringify(state.layoutTransforms));
    vibrate([15, 30, 15]);
    playClickSound(320, 0.02, 0.09);
    if (el.btnSaveLayoutPositions) {
      const orig = el.btnSaveLayoutPositions.textContent;
      el.btnSaveLayoutPositions.textContent = '✓ SAVED';
      setTimeout(() => {
        if (el.btnSaveLayoutPositions) el.btnSaveLayoutPositions.textContent = orig;
      }, 1200);
    }
  }

  function resetLayoutPositions() {
    const key = getCurrentTransformKey();
    delete state.layoutTransforms[key];
    localStorage.setItem('mashina_layout_transforms', JSON.stringify(state.layoutTransforms));

    const activeDeck = document.querySelector('.deck-view.active');
    const modules = activeDeck ? activeDeck.querySelectorAll(DRAGGABLE_SELECTOR) : document.querySelectorAll(DRAGGABLE_SELECTOR);
    modules.forEach(mod => {
      mod.style.transform = '';
    });

    state.selectedModuleScale = 1.0;
    if (el.scaleIndicator) el.scaleIndicator.textContent = '100%';

    vibrate([15, 30, 15]);
    playClickSound(180, 0.02, 0.08);
    if (el.btnResetLayoutPositions) {
      const orig = el.btnResetLayoutPositions.textContent;
      el.btnResetLayoutPositions.textContent = '✓ RESET';
      setTimeout(() => {
        if (el.btnResetLayoutPositions) el.btnResetLayoutPositions.textContent = orig;
      }, 1200);
    }
  }

  function setupDraggableModules() {
    const modules = document.querySelectorAll(DRAGGABLE_SELECTOR);
    modules.forEach(mod => {
      mod.classList.add('customizer-draggable');
      if (mod.dataset.draggableBound) return;
      mod.dataset.draggableBound = 'true';
      const moduleId = getModuleId(mod);

      let dragInfo = null;

      mod.addEventListener('pointerdown', (e) => {
        if (!state.editMode) return;
        e.stopPropagation();

        selectModule(moduleId, mod);

        const curTransform = getModuleTransform(moduleId);
        dragInfo = {
          active: true,
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          initX: curTransform.x || 0,
          initY: curTransform.y || 0,
          scale: curTransform.scale !== undefined ? curTransform.scale : 1.0,
          moved: false
        };

        try { mod.setPointerCapture(e.pointerId); } catch {}
      });

      mod.addEventListener('pointermove', (e) => {
        if (!state.editMode || !dragInfo || !dragInfo.active || dragInfo.pointerId !== e.pointerId) return;
        e.stopPropagation();

        const dx = e.clientX - dragInfo.startX;
        const dy = e.clientY - dragInfo.startY;

        if (Math.hypot(dx, dy) > 5) {
          dragInfo.moved = true;
        }

        const newX = Math.round(dragInfo.initX + dx);
        const newY = Math.round(dragInfo.initY + dy);

        mod.style.transform = `translate(${newX}px, ${newY}px) scale(${dragInfo.scale})`;
      });

      const onDragEnd = (e) => {
        if (!state.editMode || !dragInfo || !dragInfo.active || dragInfo.pointerId !== e.pointerId) return;
        e.stopPropagation();

        try { mod.releasePointerCapture(e.pointerId); } catch {}

        if (dragInfo.moved) {
          mod._dragMoved = true;
          setTimeout(() => { mod._dragMoved = false; }, 200);

          const dx = e.clientX - dragInfo.startX;
          const dy = e.clientY - dragInfo.startY;
          const finalX = Math.round(dragInfo.initX + dx);
          const finalY = Math.round(dragInfo.initY + dy);

          const transform = {
            x: finalX,
            y: finalY,
            scale: dragInfo.scale
          };
          setModuleTransform(moduleId, transform);
          vibrate(8);
        }

        dragInfo.active = false;
        dragInfo = null;
      };

      mod.addEventListener('pointerup', onDragEnd);
      mod.addEventListener('pointercancel', onDragEnd);
    });
  }

  // ─── Dynamic Floating Joystick Mode Engine ───────────────────────────
  function applyJoystickModeStyles() {
    const isDynamic = state.joystickMode === 'dynamic';
    if (el.decks.gamepad) {
      el.decks.gamepad.classList.toggle('dynamic-joysticks-active', isDynamic);
    }
    const leftPod = document.getElementById('joystick-left-pod');
    const rightPod = document.getElementById('joystick-right-pod');

    if (leftPod) {
      leftPod.style.opacity = isDynamic ? '0.15' : '';
      leftPod.style.pointerEvents = isDynamic ? 'none' : '';
    }
    if (rightPod) {
      rightPod.style.opacity = isDynamic ? '0.15' : '';
      rightPod.style.pointerEvents = isDynamic ? 'none' : '';
    }

    // Hide any active floating pods when switching modes
    const dynLeft = document.getElementById('dynamic-stick-left');
    const dynRight = document.getElementById('dynamic-stick-right');
    if (dynLeft) dynLeft.classList.remove('active');
    if (dynRight) dynRight.classList.remove('active');
  }

  function updateJoystickMode(mode) {
    state.joystickMode = mode;
    localStorage.setItem('mashina_kontrol_joystick_mode', mode);
    applyJoystickModeStyles();
    vibrate(10);
  }

  // ─── Button Customizer & Keybinding Engine ───────────────────────────
  function toggleEditMode() {
    state.editMode = !state.editMode;
    if (el.editModeBtn) {
      el.editModeBtn.classList.toggle('active', state.editMode);
      el.editModeBtn.style.color = state.editMode ? 'var(--mashina-red)' : '';
      el.editModeBtn.style.borderColor = state.editMode ? 'var(--mashina-red)' : '';
    }
    document.body.classList.toggle('edit-mode-active', state.editMode);
    if (el.layoutEditToolbar) {
      el.layoutEditToolbar.style.display = state.editMode ? 'flex' : 'none';
    }

    if (!state.editMode) {
      deselectAllModules();
    } else {
      const activeDeck = document.querySelector('.deck-view.active');
      const firstMod = (activeDeck && activeDeck.querySelector('.customizer-draggable')) || document.querySelector('.customizer-draggable');
      if (firstMod) {
        const modId = getModuleId(firstMod);
        selectModule(modId, firstMod);
      }
    }

    vibrate(15);
    playClickSound(state.editMode ? 260 : 140, 0.02, 0.08);
  }

  function openCustomizerModal(btnEl) {
    const targetId = btnEl.dataset.id || btnEl.id || btnEl.dataset.key || btnEl.dataset.macroKey;
    if (!targetId) return;

    const currentBinding = state.customBindings[targetId] || {};
    const defaultLabel = btnEl.querySelector('.tile-label') ? btnEl.querySelector('.tile-label').textContent : btnEl.textContent.trim();
    const defaultKey = btnEl.dataset.key || btnEl.dataset.macroKey || '';

    el.custTargetId.value = targetId;
    el.custLabel.value = currentBinding.label !== undefined ? currentBinding.label : defaultLabel;
    el.custActionType.value = currentBinding.actionType || (btnEl.dataset.macroCmd ? 'SHELL' : 'KEY');
    el.custPayload.value = currentBinding.payload !== undefined ? currentBinding.payload : (btnEl.dataset.macroCmd || defaultKey);
    el.custHaptic.value = currentBinding.haptic !== undefined ? currentBinding.haptic : '20';

    if (el.customizerModal) {
      el.customizerModal.classList.add('active');
    }
  }

  function saveCustomBinding() {
    const targetId = el.custTargetId.value;
    if (!targetId) return;

    const binding = {
      label: el.custLabel.value.trim(),
      actionType: el.custActionType.value,
      payload: el.custPayload.value.trim(),
      haptic: el.custHaptic.value
    };

    state.customBindings[targetId] = binding;
    localStorage.setItem('mashina_kontrol_bindings', JSON.stringify(state.customBindings));

    applyCustomBindingsToDOM();
    if (el.customizerModal) el.customizerModal.classList.remove('active');
    vibrate([15, 30, 15]);
    playClickSound(300, 0.02, 0.09);
  }

  function resetCustomBinding() {
    const targetId = el.custTargetId.value;
    if (!targetId) return;

    delete state.customBindings[targetId];
    localStorage.setItem('mashina_kontrol_bindings', JSON.stringify(state.customBindings));

    applyCustomBindingsToDOM();
    if (el.customizerModal) el.customizerModal.classList.remove('active');
    vibrate(10);
  }

  function applyCustomBindingsToDOM() {
    Object.keys(state.customBindings).forEach(targetId => {
      const binding = state.customBindings[targetId];
      const targetEl = document.querySelector(`[data-id="${targetId}"], #${targetId}, [data-key="${targetId}"], [data-macro-key="${targetId}"]`);
      if (targetEl && binding) {
        if (targetEl.querySelector('.tile-label')) {
          targetEl.querySelector('.tile-label').textContent = binding.label;
        } else if (!targetEl.querySelector('svg')) {
          targetEl.textContent = binding.label;
        }
      }
    });
  }

  // Helper to programmatically press and release buttons with haptics & audio
  function triggerButtonPress(btn) {
    if (!btn || state.editMode) return;

    if (!isLocalHost && !state.authenticated) {
      const pinModal = document.getElementById('pin-modal');
      if (pinModal) pinModal.classList.add('active');
      vibrate([40, 40, 40]);
      return;
    }

    if (!isLocalHost && !state.player.claimed) {
      const target = (state.slots && state.slots.find(s => s.status === 'available')) || { slot: 1, color: '#00f0ff' };
      const savedName = localStorage.getItem('mashina_player_name') || `Player ${target.slot}`;
      const savedColor = localStorage.getItem('mashina_player_color') || target.color || '#00f0ff';
      sendJSON('CLAIM_SLOT', { slot: target.slot, name: savedName, color: savedColor });
      state.player.claimed = true;
      state.player.slot = target.slot;
      applyPlayerTheme(savedColor);
      updatePlayerBadge();
    }

    btn.classList.add('pressed');

    const targetId = btn.dataset.id || btn.id || btn.dataset.key || btn.dataset.macroKey;
    const custom = state.customBindings[targetId];

    // Haptic feedback
    const hapticVal = custom && custom.haptic !== undefined ? custom.haptic : (btn.dataset.haptic || 12);
    vibrate(hapticVal);
    playClickSound(180, 0.012, 0.07);

    // Check sticky modifiers if pressing in keyboard deck
    const isKb = btn.closest('#deck-keyboard') || btn.classList.contains('kb-key') || btn.classList.contains('kb-util-btn');
    if (isKb && btn.dataset.key) {
      const activeMods = [];
      if (state.modifiers.ctrl) activeMods.push('LCONTROL');
      if (state.modifiers.shift || state.modifiers.caps) activeMods.push('LSHIFT');
      if (state.modifiers.alt) activeMods.push('LMENU');
      if (state.modifiers.win) activeMods.push('LWIN');

      if (activeMods.length > 0) {
        btn._activeChord = true;
        const chordKey = activeMods.join('+') + '+' + btn.dataset.key;
        sendJSON('MACRO_EXEC', { action: 'KEY', key: chordKey });
        // Consume non-caps Shift modifier after one key
        if (state.modifiers.shift && !state.modifiers.caps) {
          state.modifiers.shift = false;
          if (el.kbModShift) el.kbModShift.classList.remove('active-mod');
        }
        return;
      }
    }

    // Execute Custom Binding or Default
    if (custom) {
      if (custom.actionType === 'SHELL') {
        sendJSON('MACRO_EXEC', { action: 'SHELL', cmd: custom.payload });
      } else if (custom.actionType === 'TEXT') {
        sendJSON('TYPE_TEXT', { text: custom.payload });
      } else if (custom.actionType === 'CHORD') {
        sendJSON('MACRO_EXEC', { action: 'KEY', key: custom.payload });
      } else {
        sendJSON('BTN_DOWN', { key: custom.payload });
      }
      return;
    }

    // Default Handlers
    const macroKey = btn.dataset.macroKey;
    const macroCmd = btn.dataset.macroCmd;
    const isToggle = btn.dataset.toggle === 'true';

    if (isToggle) btn.classList.toggle('active-state');

    if (macroCmd) {
      sendJSON('MACRO_EXEC', { action: 'SHELL', cmd: macroCmd });
    } else if (macroKey) {
      sendJSON('MACRO_EXEC', { action: 'KEY', key: macroKey });
    } else if (btn.dataset.key) {
      sendJSON('BTN_DOWN', { key: btn.dataset.key });
    }
  }

  function triggerButtonRelease(btn) {
    if (!btn || state.editMode) return;
    btn.classList.remove('pressed');

    if (btn._activeChord) {
      delete btn._activeChord;
      return;
    }

    const targetId = btn.dataset.id || btn.id || btn.dataset.key || btn.dataset.macroKey;
    const custom = state.customBindings[targetId];

    if (custom && custom.actionType === 'KEY') {
      sendJSON('BTN_UP', { key: custom.payload });
    } else if (btn.dataset.key) {
      sendJSON('BTN_UP', { key: btn.dataset.key });
    }
  }

  // ─── Button Press & Release Dispatcher ──────────────────────────────
  function setupButtonListeners() {
    const buttons = document.querySelectorAll('[data-key], .macro-tile, .kb-key, .pres-giant-btn, .pres-aux-btn, .num-key');
    buttons.forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = 'true';

      const handlePress = (e) => {
        if (state.editMode) return;
        e.preventDefault();
        try { btn.setPointerCapture(e.pointerId); } catch {}
        triggerButtonPress(btn);
      };

      const handleRelease = (e) => {
        if (state.editMode) return;
        e.preventDefault();
        try { btn.releasePointerCapture(e.pointerId); } catch {}
        triggerButtonRelease(btn);
      };

      btn.addEventListener('pointerdown', handlePress);
      btn.addEventListener('pointerup', handleRelease);
      btn.addEventListener('pointercancel', handleRelease);
      btn.addEventListener('click', (e) => {
        if (state.editMode) {
          e.preventDefault();
          e.stopPropagation();
          if (btn._dragMoved || (btn.closest('.customizer-draggable') && btn.closest('.customizer-draggable')._dragMoved)) return;
          if (btn.classList.contains('customizer-draggable')) {
            selectModule(getModuleId(btn), btn);
            return;
          }
          openCustomizerModal(btn);
        }
      });
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  // ─── Virtual QWERTY Keyboard Live Typing Bar ────────────────────────
  function setupKeyboardDeck() {
    if (el.kbSendBtn && el.kbInput) {
      const sendTypedString = () => {
        const text = el.kbInput.value;
        if (!text) return;
        sendJSON('TYPE_TEXT', { text });
        vibrate(15);
        playClickSound(220, 0.015, 0.08);
        el.kbInput.value = '';
      };

      el.kbSendBtn.addEventListener('click', sendTypedString);
      el.kbInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendTypedString();
        }
      });
    }

    // Sticky Modifier Keys
    const modifierMap = [
      { btn: el.kbModShift, mod: 'shift' },
      { btn: el.kbModCtrl, mod: 'ctrl' },
      { btn: el.kbModAlt, mod: 'alt' },
      { btn: el.kbModWin, mod: 'win' },
      { btn: el.kbModCaps, mod: 'caps' }
    ];

    modifierMap.forEach(({ btn, mod }) => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        state.modifiers[mod] = !state.modifiers[mod];
        btn.classList.toggle('active-mod', state.modifiers[mod]);
        vibrate(10);
        playClickSound(state.modifiers[mod] ? 240 : 120, 0.01, 0.06);
      });
    });
  }

  // ─── Unified Analog Joystick Engine (Fixed & Dynamic Floating) ─────
  const MAX_STICK_RADIUS = 36;
  let dynamicTouchAttached = false;
  let globalJoystickListenersAttached = false;
  let stickLoopRunning = false;
  let lastStickTick = 0;

  function runStickLoop() {
    if (!stickLoopRunning) return;
    const now = performance.now();
    if (now - lastStickTick >= 16) {
      lastStickTick = now;
      let anyActive = false;
      ['left', 'right'].forEach((stickName) => {
        const stick = state.joysticks[stickName];
        if (stick && stick.active && (Math.hypot(stick.x, stick.y) > 0.08)) {
          anyActive = true;
          sendJSON('STICK_MOVE', { stick: stickName.toUpperCase(), x: stick.x, y: stick.y });
          setWireframeStick(stickName.toUpperCase(), stick.x, stick.y);
        }
      });
      if (!anyActive) {
        stickLoopRunning = false;
        return;
      }
    }
    requestAnimationFrame(runStickLoop);
  }

  function startStickLoop() {
    if (!stickLoopRunning) {
      stickLoopRunning = true;
      lastStickTick = performance.now();
      requestAnimationFrame(runStickLoop);
    }
  }

  function updateStickDisplacement(stick, clientX, clientY, stickName) {
    if (!stick) return;
    let dx = clientX - stick.originX;
    let dy = clientY - stick.originY;
    const dist = Math.hypot(dx, dy);

    if (dist > MAX_STICK_RADIUS) {
      dx = (dx / dist) * MAX_STICK_RADIUS;
      dy = (dy / dist) * MAX_STICK_RADIUS;
    }

    // Displace appropriate thumb: dynamic floating thumb or fixed thumb
    if (state.joystickMode === 'dynamic' && stick.dynamicThumbEl) {
      stick.dynamicThumbEl.style.transform = `translate(${dx}px, ${dy}px)`;
    } else if (stick.thumbEl) {
      stick.thumbEl.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    let normX = dx / MAX_STICK_RADIUS;
    let normY = dy / MAX_STICK_RADIUS;

    if (Math.hypot(normX, normY) < 0.08) {
      normX = 0;
      normY = 0;
    }

    stick.x = parseFloat(normX.toFixed(3));
    stick.y = parseFloat(normY.toFixed(3));

    sendJSON('STICK_MOVE', { stick: stickName.toUpperCase(), x: stick.x, y: stick.y });
    setWireframeStick(stickName.toUpperCase(), stick.x, stick.y);

    if (Math.hypot(stick.x, stick.y) > 0.08) {
      startStickLoop();
    }
  }

  function resetStickState(stick, stickName) {
    if (!stick) return;
    stick.active = false;
    stick.id = null;
    stick.x = 0;
    stick.y = 0;

    if (stick.thumbEl) {
      stick.thumbEl.style.transform = 'translate(0px, 0px)';
    }
    if (stick.dynamicThumbEl) {
      stick.dynamicThumbEl.style.transform = 'translate(0px, 0px)';
    }
    if (stick.dynamicPodEl) {
      stick.dynamicPodEl.classList.remove('active');
    }
    if (stick.podEl && state.joystickMode !== 'dynamic') {
      stick.podEl.classList.remove('floating-touching');
    }

    sendJSON('STICK_MOVE', { stick: stickName.toUpperCase(), x: 0, y: 0 });
    setWireframeStick(stickName.toUpperCase(), 0, 0);

    const leftActive = state.joysticks.left.active && Math.hypot(state.joysticks.left.x, state.joysticks.left.y) > 0.08;
    const rightActive = state.joysticks.right.active && Math.hypot(state.joysticks.right.x, state.joysticks.right.y) > 0.08;
    if (!leftActive && !rightActive) {
      stickLoopRunning = false;
    }
  }

  function ensureGlobalJoystickListeners() {
    if (globalJoystickListenersAttached) return;
    globalJoystickListenersAttached = true;

    window.addEventListener('pointermove', (e) => {
      ['left', 'right'].forEach((stickName) => {
        const stick = state.joysticks[stickName];
        if (stick && stick.active && stick.id === e.pointerId) {
          e.preventDefault();
          updateStickDisplacement(stick, e.clientX, e.clientY, stickName);
        }
      });
    }, { passive: false });

    const handlePointerRelease = (e) => {
      ['left', 'right'].forEach((stickName) => {
        const stick = state.joysticks[stickName];
        if (stick && stick.active && (stick.id === e.pointerId || stick.id === null)) {
          resetStickState(stick, stickName);
        }
      });
    };

    window.addEventListener('pointerup', handlePointerRelease, { passive: false });
    window.addEventListener('pointercancel', handlePointerRelease, { passive: false });

    // Touch safety net: if all fingers lift, guarantee both sticks snap to center
    window.addEventListener('touchend', (e) => {
      if (e.touches.length === 0) {
        resetStickState(state.joysticks.left, 'left');
        resetStickState(state.joysticks.right, 'right');
      }
    }, { passive: true });

    window.addEventListener('touchcancel', (e) => {
      if (e.touches.length === 0) {
        resetStickState(state.joysticks.left, 'left');
        resetStickState(state.joysticks.right, 'right');
      }
    }, { passive: true });

    window.addEventListener('blur', () => {
      resetStickState(state.joysticks.left, 'left');
      resetStickState(state.joysticks.right, 'right');
      document.querySelectorAll('.pressed').forEach(btn => {
        triggerButtonRelease(btn);
      });
    });
  }

  function setupJoysticks() {
    const leftPod = document.getElementById('joystick-left-pod');
    const leftThumb = document.getElementById('joystick-left-thumb');
    const rightPod = document.getElementById('joystick-right-pod');
    const rightThumb = document.getElementById('joystick-right-thumb');

    if (leftPod && leftThumb) setupSingleJoystick('left', leftPod, leftThumb);
    if (rightPod && rightThumb) setupSingleJoystick('right', rightPod, rightThumb);

    // Dynamic direct-to-body floating sticks
    state.joysticks.left.dynamicPodEl = document.getElementById('dynamic-stick-left');
    state.joysticks.left.dynamicThumbEl = document.getElementById('dynamic-thumb-left');
    state.joysticks.right.dynamicPodEl = document.getElementById('dynamic-stick-right');
    state.joysticks.right.dynamicThumbEl = document.getElementById('dynamic-thumb-right');

    setupDynamicTouchSpawn();
    applyJoystickModeStyles();
    ensureGlobalJoystickListeners();
  }

  function setupSingleJoystick(stickName, podEl, thumbEl) {
    if (!podEl || !thumbEl) return;
    const stick = state.joysticks[stickName];
    stick.podEl = podEl;
    stick.thumbEl = thumbEl;

    // Fixed Mode: direct touch on joystick pod
    const onFixedPointerDown = (e) => {
      if (state.editMode || state.joystickMode === 'dynamic') return;
      e.preventDefault();
      try { podEl.setPointerCapture(e.pointerId); } catch {}
      const rect = podEl.getBoundingClientRect();
      stick.active = true;
      stick.id = e.pointerId;
      stick.originX = rect.left + rect.width / 2;
      stick.originY = rect.top + rect.height / 2;
      stick.podEl = podEl;
      stick.thumbEl = thumbEl;
      updateStickDisplacement(stick, e.clientX, e.clientY, stickName);
      vibrate(8);
      playClickSound(180, 0.01, 0.05);
    };

    podEl.addEventListener('pointerdown', onFixedPointerDown);
  }

  function setupDynamicTouchSpawn() {
    const gamepadDeck = el.decks.gamepad || document.getElementById('deck-gamepad');
    if (!gamepadDeck || dynamicTouchAttached) return;
    dynamicTouchAttached = true;

    function isInteractiveButton(target) {
      return !!target.closest('button, .dpad-btn, .face-btn, .hw-bumper, .hw-trigger, .meta-pill-btn, .home-badge-btn, .layout-opt, .action-btn, .ps-touchpad-btn, .modal-overlay, #btn-mode-hub, #btn-mode-gamepad, #btn-mode-stream, #btn-mode-trackpad, #btn-mode-remote, #btn-mode-prompter');
    }

    function isInsideExcludedZone(clientX, clientY, target) {
      if (isInteractiveButton(target)) return true;

      // Selectors for all button clusters, panels, and UI elements that need safe zones
      const exclusionSelectors = [
        '.face-diamond',
        '#face-diamond-container',
        '.dpad-cross',
        '#dpad-container',
        '.gamepad-top-row',
        '.ps-center-touchpad-zone',
        '.ps-touchpad-meta',
        '.ps-touchpad-btn',
        '.meta-pill-btn',
        '.hw-bumper',
        '.hw-trigger',
        '.face-btn',
        '.dpad-btn',
        'header',
        '.controller-header',
        '.modal-overlay'
      ];

      // Safe buffer around button clusters (50px ensures the 120px pod doesn't overlap)
      const SAFE_BUFFER = 50;

      for (let s = 0; s < exclusionSelectors.length; s++) {
        const elements = document.querySelectorAll(exclusionSelectors[s]);
        for (let i = 0; i < elements.length; i++) {
          const elem = elements[i];
          const rect = elem.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          if (
            clientX >= (rect.left - SAFE_BUFFER) &&
            clientX <= (rect.right + SAFE_BUFFER) &&
            clientY >= (rect.top - SAFE_BUFFER) &&
            clientY <= (rect.bottom + SAFE_BUFFER)
          ) {
            return true;
          }
        }
      }

      // Keep pod from spawning off-screen edges
      const EDGE_MARGIN = 20;
      if (
        clientX < EDGE_MARGIN ||
        clientX > (window.innerWidth - EDGE_MARGIN) ||
        clientY < EDGE_MARGIN ||
        clientY > (window.innerHeight - EDGE_MARGIN)
      ) {
        return true;
      }

      return false;
    }

    gamepadDeck.addEventListener('pointerdown', (e) => {
      if (state.joystickMode !== 'dynamic' || state.editMode) return;

      // Disallow spawning over buttons or within button cluster safezones
      if (isInsideExcludedZone(e.clientX, e.clientY, e.target)) return;

      // Large, open touch zones: entire left half is left stick, entire right half is right stick
      const isLeft = e.clientX < (window.innerWidth / 2);
      const stickName = isLeft ? 'left' : 'right';

      if (stickName === 'right' && state.currentLayout === 'snes') {
        return;
      }

      const stick = state.joysticks[stickName];
      const podEl = document.getElementById(`dynamic-stick-${stickName}`);
      const thumbEl = document.getElementById(`dynamic-thumb-${stickName}`);

      if (!stick || !podEl || !thumbEl) return;

      if (stick.active) {
        resetStickState(stick, stickName);
      }

      e.preventDefault();
      try { gamepadDeck.setPointerCapture(e.pointerId); } catch {}

      stick.active = true;
      stick.id = e.pointerId;
      stick.originX = e.clientX;
      stick.originY = e.clientY;
      stick.dynamicPodEl = podEl;
      stick.dynamicThumbEl = thumbEl;

      // Position the dynamic floating pod precisely centered under the finger
      podEl.style.left = `${e.clientX}px`;
      podEl.style.top = `${e.clientY}px`;
      podEl.classList.add('active');
      thumbEl.style.transform = 'translate(0px, 0px)';

      vibrate(8);
      playClickSound(180, 0.01, 0.05);
    });
  }

  // ─── Trackpad Gesture Engine ────────────────────────────────────────
  function setupTrackpad() {
    const deckTrackpad = el.decks ? el.decks.trackpad : document.getElementById('deck-trackpad');
    const savedMode = localStorage.getItem('mashina_kontrol_trackpad_mode') || 'split';
    if (savedMode === 'full' && deckTrackpad) {
      deckTrackpad.classList.add('mode-full');
      if (el.trackpadToggleText) el.trackpadToggleText.textContent = '⊞ + NUMPAD';
    }
    if (el.btnToggleTrackpadFull && deckTrackpad) {
      el.btnToggleTrackpadFull.addEventListener('click', () => {
        const isFull = deckTrackpad.classList.toggle('mode-full');
        if (el.trackpadToggleText) el.trackpadToggleText.textContent = isFull ? '⊞ + NUMPAD' : '⛶ EXPAND FULL';
        localStorage.setItem('mashina_kontrol_trackpad_mode', isFull ? 'full' : 'split');
        vibrate(10);
      });
    }

    if (!el.trackSurface) return;

    el.trackSurface.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { el.trackSurface.setPointerCapture(e.pointerId); } catch {}
      state.trackpad.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      state.trackpad.touchStart = Date.now();
      state.trackpad.hasMoved = false;
    });

    el.trackSurface.addEventListener('pointermove', (e) => {
      if (!state.trackpad.pointers.has(e.pointerId)) return;
      e.preventDefault();
      const prev = state.trackpad.pointers.get(e.pointerId);
      const dx = (e.clientX - prev.x) * 1.6;
      const dy = (e.clientY - prev.y) * 1.6;

      state.trackpad.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (Math.hypot(dx, dy) > 1.2) state.trackpad.hasMoved = true;

      // 1 Finger: Cursor Move (High-frequency binary packet 0x03)
      if (state.trackpad.pointers.size === 1) {
        sendBinary(0x03, Math.round(dx), Math.round(dy));
      } else if (state.trackpad.pointers.size >= 2) {
        // 2 Fingers: Vertical Wheel Scroll
        sendJSON('MOUSE_SCROLL', { direction: dy > 0 ? 1 : -1 });
      }
    });

    const onTrackpadUp = (e) => {
      if (!state.trackpad.pointers.has(e.pointerId)) return;
      e.preventDefault();
      try { el.trackSurface.releasePointerCapture(e.pointerId); } catch {}
      const duration = Date.now() - state.trackpad.touchStart;
      state.trackpad.pointers.delete(e.pointerId);

      // Quick tap (<200ms without movement) = Left Click
      if (!state.trackpad.hasMoved && duration < 200) {
        vibrate(15);
        playClickSound(220, 0.012, 0.08);
        sendJSON('MOUSE_CLICK', { button: 1 });
      }
    };

    el.trackSurface.addEventListener('pointerup', onTrackpadUp);
    el.trackSurface.addEventListener('pointercancel', onTrackpadUp);

    // Trackpad Physical Rocker Buttons
    if (el.trackLeftBtn) {
      el.trackLeftBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        vibrate(15);
        playClickSound(180, 0.015, 0.08);
        sendJSON('MOUSE_CLICK', { button: 1 });
      });
    }
    if (el.trackRightBtn) {
      el.trackRightBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        vibrate([15, 25, 15]);
        playClickSound(140, 0.015, 0.08);
        sendJSON('MOUSE_CLICK', { button: 3 });
      });
    }
  }

  // ─── Presentation Remote Engine (Timer + Teleprompter) ──────────────
  function setupPresentationDeck() {
    // 1. Presentation Timer / Stopwatch
    function formatTime(ms) {
      const totalSec = Math.floor(ms / 1000);
      const hrs = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    function updateTimerDisplay() {
      if (!el.timerDisplay) return;
      if (state.timer.running) {
        state.timer.elapsed = Date.now() - state.timer.start;
      }
      el.timerDisplay.textContent = formatTime(state.timer.elapsed);

      // Warning & Overdue Threshold Check
      if (state.timer.targetMinutes > 0) {
        const targetMs = state.timer.targetMinutes * 60 * 1000;
        if (state.timer.elapsed >= targetMs) {
          el.timerDisplay.className = 'pres-timer-digits overdue';
        } else if (state.timer.elapsed >= targetMs * 0.8) {
          el.timerDisplay.className = 'pres-timer-digits warning';
        } else {
          el.timerDisplay.className = 'pres-timer-digits';
        }
      } else {
        el.timerDisplay.className = 'pres-timer-digits';
      }
    }

    if (el.timerToggleBtn) {
      el.timerToggleBtn.addEventListener('click', () => {
        state.timer.running = !state.timer.running;
        if (state.timer.running) {
          state.timer.start = Date.now() - state.timer.elapsed;
          state.timer.interval = setInterval(updateTimerDisplay, 250);
          el.timerToggleBtn.textContent = '❚❚ PAUSE';
          el.timerToggleBtn.style.color = 'var(--mashina-amber)';
        } else {
          if (state.timer.interval) {
            clearInterval(state.timer.interval);
            state.timer.interval = null;
          }
          el.timerToggleBtn.textContent = '▶ START';
          el.timerToggleBtn.style.color = '';
        }
        vibrate(10);
        playClickSound(200, 0.012, 0.06);
      });
    }

    if (el.timerResetBtn) {
      el.timerResetBtn.addEventListener('click', () => {
        if (state.timer.interval) {
          clearInterval(state.timer.interval);
          state.timer.interval = null;
        }
        state.timer.running = false;
        state.timer.elapsed = 0;
        if (el.timerToggleBtn) {
          el.timerToggleBtn.textContent = '▶ START';
          el.timerToggleBtn.style.color = '';
        }
        updateTimerDisplay();
        vibrate([10, 20, 10]);
        playClickSound(160, 0.012, 0.06);
      });
    }

    if (el.timerTargetSelect) {
      el.timerTargetSelect.addEventListener('change', (e) => {
        state.timer.targetMinutes = parseInt(e.target.value, 10) || 0;
        updateTimerDisplay();
      });
    }

    // 2. Teleprompter & Speaker Notes Overlay
    function renderPrompterNotes() {
      if (!el.prompterScrollView || !el.prompterEditor) return;
      el.prompterEditor.value = state.prompter.notes;
      const paragraphs = state.prompter.notes
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => `<p>${escapeHtml(line)}</p>`)
        .join('');
      el.prompterScrollView.innerHTML = paragraphs || '<p style="color: var(--text-muted);">(No speaker notes. Tap "Edit Notes" to paste script.)</p>';
      el.prompterScrollView.style.fontSize = `${state.prompter.fontSize}px`;
      if (el.prompterSpeedVal) el.prompterSpeedVal.textContent = `${state.prompter.speed.toFixed(1)}x`;
    }

    renderPrompterNotes();

    let scrollRafId = null;
    function prompterScrollLoop() {
      if (!state.prompter.scrolling || !el.prompterScrollView) return;
      el.prompterScrollView.scrollTop += state.prompter.speed * 0.75;
      scrollRafId = requestAnimationFrame(prompterScrollLoop);
    }

    if (el.prompterToggleBtn && el.prompterDrawer) {
      el.prompterToggleBtn.addEventListener('click', () => {
        state.prompter.open = !state.prompter.open;
        el.prompterDrawer.classList.toggle('active', state.prompter.open);
        el.prompterToggleBtn.classList.toggle('active', state.prompter.open);
        vibrate(12);
        playClickSound(220, 0.015, 0.07);
      });
    }

    if (el.prompterCloseBtn && el.prompterDrawer) {
      el.prompterCloseBtn.addEventListener('click', () => {
        state.prompter.open = false;
        state.prompter.scrolling = false;
        if (scrollRafId) cancelAnimationFrame(scrollRafId);
        el.prompterDrawer.classList.remove('active');
        if (el.prompterToggleBtn) el.prompterToggleBtn.classList.remove('active');
        if (el.prompterPlayBtn) el.prompterPlayBtn.textContent = '▶ Auto-Scroll';
        vibrate(8);
      });
    }

    if (el.prompterPlayBtn) {
      el.prompterPlayBtn.addEventListener('click', () => {
        state.prompter.scrolling = !state.prompter.scrolling;
        if (state.prompter.scrolling) {
          el.prompterPlayBtn.textContent = '❚❚ Pause';
          el.prompterPlayBtn.style.background = 'var(--mashina-red)';
          el.prompterPlayBtn.style.color = '#FFF';
          prompterScrollLoop();
        } else {
          el.prompterPlayBtn.textContent = '▶ Auto-Scroll';
          el.prompterPlayBtn.style.background = '';
          el.prompterPlayBtn.style.color = '';
          if (scrollRafId) cancelAnimationFrame(scrollRafId);
        }
        vibrate(10);
      });
    }

    if (el.prompterSlowerBtn) {
      el.prompterSlowerBtn.addEventListener('click', () => {
        state.prompter.speed = Math.max(0.25, parseFloat((state.prompter.speed - 0.25).toFixed(2)));
        if (el.prompterSpeedVal) el.prompterSpeedVal.textContent = `${state.prompter.speed.toFixed(1)}x`;
        vibrate(8);
      });
    }

    if (el.prompterFasterBtn) {
      el.prompterFasterBtn.addEventListener('click', () => {
        state.prompter.speed = Math.min(6.0, parseFloat((state.prompter.speed + 0.25).toFixed(2)));
        if (el.prompterSpeedVal) el.prompterSpeedVal.textContent = `${state.prompter.speed.toFixed(1)}x`;
        vibrate(8);
      });
    }

    if (el.prompterFontDnBtn && el.prompterScrollView) {
      el.prompterFontDnBtn.addEventListener('click', () => {
        state.prompter.fontSize = Math.max(14, state.prompter.fontSize - 2);
        el.prompterScrollView.style.fontSize = `${state.prompter.fontSize}px`;
        vibrate(8);
      });
    }

    if (el.prompterFontUpBtn && el.prompterScrollView) {
      el.prompterFontUpBtn.addEventListener('click', () => {
        state.prompter.fontSize = Math.min(48, state.prompter.fontSize + 2);
        el.prompterScrollView.style.fontSize = `${state.prompter.fontSize}px`;
        vibrate(8);
      });
    }

    if (el.prompterMirrorBtn && el.prompterScrollView) {
      el.prompterMirrorBtn.addEventListener('click', () => {
        state.prompter.mirror = !state.prompter.mirror;
        el.prompterScrollView.classList.toggle('mirror', state.prompter.mirror);
        el.prompterMirrorBtn.style.color = state.prompter.mirror ? 'var(--mashina-cyan)' : '';
        vibrate(10);
      });
    }

    if (el.prompterEditBtn && el.prompterEditor && el.prompterScrollView) {
      el.prompterEditBtn.addEventListener('click', () => {
        state.prompter.editing = !state.prompter.editing;
        if (state.prompter.editing) {
          el.prompterScrollView.style.display = 'none';
          el.prompterEditor.style.display = 'block';
          el.prompterEditBtn.textContent = '✓ Done';
          el.prompterEditBtn.style.color = 'var(--mashina-emerald)';
          el.prompterEditor.focus();
        } else {
          state.prompter.notes = el.prompterEditor.value;
          localStorage.setItem('mashina_kontrol_notes', state.prompter.notes);
          renderPrompterNotes();
          el.prompterEditor.style.display = 'none';
          el.prompterScrollView.style.display = 'block';
          el.prompterEditBtn.textContent = '✎ Edit Notes';
          el.prompterEditBtn.style.color = '';
        }
        vibrate(12);
      });
    }
  }

  // ─── Machinery UI & Modals Initialization ───────────────────────────
  function setupUIControls() {
    // Standalone PWA Installation
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (el.pwaInstallBtn) el.pwaInstallBtn.style.display = 'inline-flex';
    });

    // Mobile fallback: show Install button on touch/mobile devices if not in standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.innerWidth < 768;
    if (isMobile && !isStandalone && el.pwaInstallBtn) {
      el.pwaInstallBtn.style.display = 'inline-flex';
    }

    if (el.pwaInstallBtn) {
      el.pwaInstallBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === 'accepted') {
            el.pwaInstallBtn.style.display = 'none';
          }
          deferredPrompt = null;
        } else if (el.pwaGuideModal) {
          el.pwaGuideModal.classList.add('active');
        }
      });
    }

    if (el.pwaGuideClose && el.pwaGuideModal) {
      el.pwaGuideClose.addEventListener('click', () => el.pwaGuideModal.classList.remove('active'));
    }
    if (el.pwaGuideOk && el.pwaGuideModal) {
      el.pwaGuideOk.addEventListener('click', () => el.pwaGuideModal.classList.remove('active'));
    }

    // Hub Copy URL Button
    if (el.hubBtnCopy && el.hubUrlInput) {
      el.hubBtnCopy.addEventListener('click', () => {
        const val = el.hubUrlInput.value;
        const doSuccess = () => {
          const orig = el.hubBtnCopy.textContent;
          el.hubBtnCopy.textContent = 'COPIED!';
          el.hubBtnCopy.style.background = 'var(--mashina-emerald)';
          el.hubBtnCopy.style.color = '#000000';
          setTimeout(() => {
            el.hubBtnCopy.textContent = orig;
            el.hubBtnCopy.style.background = '';
            el.hubBtnCopy.style.color = '';
          }, 1800);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(val).then(doSuccess).catch(() => {
            el.hubUrlInput.select();
            document.execCommand('copy');
            doSuccess();
          });
        } else {
          el.hubUrlInput.select();
          document.execCommand('copy');
          doSuccess();
        }
        vibrate(10);
      });
    }

    // Hub Switch to Touch Pad Button
    if (el.hubBtnOpenPad) {
      el.hubBtnOpenPad.addEventListener('click', () => {
        setMode('gamepad', true);
      });
    }

    // Hub ViGEmBus Driver 1-Click Install Button
    if (el.btnInstallVigem) {
      el.btnInstallVigem.addEventListener('click', async (e) => {
        e.preventDefault();
        const origText = el.btnInstallVigem.textContent;
        el.btnInstallVigem.textContent = '⏳ Launching Installer...';
        el.btnInstallVigem.disabled = true;

        try {
          const res = await fetch('/api/driver/install', { method: 'POST' });
          const data = await res.json();
          if (data.success) {
            el.btnInstallVigem.textContent = '⚡ Accepting UAC Prompt...';
            let attempts = 0;
            const checkInt = setInterval(async () => {
              attempts++;
              try {
                const infoRes = await fetch('/api/info');
                if (infoRes.ok) {
                  const info = await infoRes.json();
                  if (info.vigemInstalled) {
                    clearInterval(checkInt);
                    el.btnInstallVigem.disabled = false;
                    renderHubCard(info);
                    return;
                  }
                }
              } catch (_) {}
              if (attempts > 30) {
                clearInterval(checkInt);
                el.btnInstallVigem.disabled = false;
                el.btnInstallVigem.textContent = origText;
              }
            }, 2000);
          } else {
            window.location.href = './install-gamepad-driver.bat';
            el.btnInstallVigem.disabled = false;
            el.btnInstallVigem.textContent = origText;
          }
        } catch (_) {
          window.location.href = './install-gamepad-driver.bat';
          el.btnInstallVigem.disabled = false;
          el.btnInstallVigem.textContent = origText;
        }
      });
    }

    // Mode Switchers
    el.modeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setMode(btn.dataset.mode, true);
      });
    });

    // Sub-Layout Switchers
    el.layoutBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setLayout(btn.dataset.layout);
      });
    });

    // Fullscreen (Standard Browser Fullscreen for Android, PC, Mac, iPad)
    function toggleUniversalFullscreen() {
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isStandalone = window.navigator.standalone === true || 
                           window.matchMedia('(display-mode: standalone)').matches;

      const doc = document;
      const fullscreenEl = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement;
      if (fullscreenEl) {
        const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
        if (exit) {
          try { exit.call(doc).catch(() => {}); } catch {}
        }
      } else {
        const docEl = document.documentElement;
        const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
        if (req) {
          try {
            const res = req.call(docEl);
            if (res && res.catch) res.catch(() => {});
          } catch {}
        }

        // On iOS Safari where Apple blocks requestFullscreen, show the 1-tap PWA tip
        if (isIOS && !isStandalone) {
          window.scrollTo(0, 1);
          const tip = document.getElementById('ios-fullscreen-tip');
          if (tip) {
            tip.style.display = 'block';
            setTimeout(() => {
              if (tip) tip.style.display = 'none';
            }, 8000);
          }
        }
      }

      requestWakeLock();
      vibrate(15);
    }

    if (el.fullscreenBtn) {
      el.fullscreenBtn.addEventListener('click', toggleUniversalFullscreen);
      el.fullscreenBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        toggleUniversalFullscreen();
      });
    }

    const tipClose = document.getElementById('ios-tip-close');
    if (tipClose) {
      tipClose.addEventListener('click', () => {
        const tip = document.getElementById('ios-fullscreen-tip');
        if (tip) tip.style.display = 'none';
      });
    }

    // Hub PIN Customization & Regeneration
    const handlePinEdit = async () => {
      const currentPin = el.hubPinDisplay ? el.hubPinDisplay.textContent : '----';
      const entered = prompt(
        'Enter a new 4 to 6 digit Pairing PIN (or leave blank to generate a random PIN):',
        currentPin !== '----' ? currentPin : ''
      );
      if (entered === null) return; // Cancelled
      const targetPin = entered.trim();
      try {
        const res = await fetch('/api/pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: targetPin })
        });
        const data = await res.json();
        if (data.success && data.pin) {
          localStorage.setItem('mashina_kontrol_pin', data.pin);
          await fetchHostInfo();
        }
      } catch (err) {
        console.error('Failed to update PIN:', err);
      }
    };

    const btnEditPin = document.getElementById('hub-btn-edit-pin');
    if (btnEditPin) {
      btnEditPin.addEventListener('click', handlePinEdit);
    }
    if (el.hubPinDisplay) {
      el.hubPinDisplay.addEventListener('click', handlePinEdit);
    }

    // Theme Modal & Buttons
    if (el.themeModalBtn && el.themeModal) {
      el.themeModalBtn.addEventListener('click', () => el.themeModal.classList.add('active'));
    }
    if (el.themeCloseBtn && el.themeModal) {
      el.themeCloseBtn.addEventListener('click', () => el.themeModal.classList.remove('active'));
    }
    el.themeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        setTheme(btn.dataset.theme);
        if (el.themeModal) el.themeModal.classList.remove('active');
      });
    });

    // Layout Edit Mode Direct Toggle (Wrench Icon in Header)
    if (el.editModeBtn) {
      el.editModeBtn.addEventListener('click', toggleEditMode);
    }

    // Settings Modal (Gear Icon in Header)
    if (el.settingsModalBtn && el.settingsModal) {
      el.settingsModalBtn.addEventListener('click', () => {
        el.settingsModal.classList.add('active');
        if (el.diagSlot && el.clientSlotBadge) el.diagSlot.textContent = el.clientSlotBadge.textContent;
        if (el.diagLatency && el.latencyText) el.diagLatency.textContent = el.latencyText.textContent;
        vibrate(10);
        playClickSound(200, 0.012, 0.06);
      });
    }

    if (el.settingsCloseBtn && el.settingsModal) {
      el.settingsCloseBtn.addEventListener('click', () => {
        el.settingsModal.classList.remove('active');
        vibrate(8);
      });
    }

    // Settings Dropdowns
    if (el.settingHaptics) {
      el.settingHaptics.value = state.hapticsEnabled ? 'enabled' : 'disabled';
      el.settingHaptics.addEventListener('change', (e) => {
        state.hapticsEnabled = e.target.value === 'enabled';
        localStorage.setItem('mashina_kontrol_haptics', e.target.value);
        if (state.hapticsEnabled) vibrate([10, 20, 10]);
      });
    }

    if (el.settingAudio) {
      el.settingAudio.value = state.soundEnabled ? 'enabled' : 'disabled';
      el.settingAudio.addEventListener('change', (e) => {
        state.soundEnabled = e.target.value === 'enabled';
        localStorage.setItem('mashina_kontrol_audio', e.target.value);
        if (state.soundEnabled) playClickSound(220, 0.02, 0.08);
      });
    }

    if (el.settingOrientation) {
      const savedOrient = localStorage.getItem('mashina_kontrol_orientation') || 'auto';
      el.settingOrientation.value = savedOrient;
      el.settingOrientation.addEventListener('change', (e) => {
        localStorage.setItem('mashina_kontrol_orientation', e.target.value);
        checkOrientation();
      });
    }

    // Joystick Mode Setting
    if (el.settingJoystickMode) {
      el.settingJoystickMode.value = state.joystickMode;
      el.settingJoystickMode.addEventListener('change', (e) => {
        updateJoystickMode(e.target.value);
      });
    }

    // Layout Toolbar Drag & Scale Buttons
    if (el.btnScaleDown) el.btnScaleDown.addEventListener('click', () => adjustSelectedScale(-0.1));
    if (el.btnScaleUp) el.btnScaleUp.addEventListener('click', () => adjustSelectedScale(0.1));
    if (el.btnSaveLayoutPositions) el.btnSaveLayoutPositions.addEventListener('click', saveLayoutPositions);
    if (el.btnResetLayoutPositions) el.btnResetLayoutPositions.addEventListener('click', resetLayoutPositions);
    if (el.btnResetLayoutPositionsModal) el.btnResetLayoutPositionsModal.addEventListener('click', () => {
      resetLayoutPositions();
      if (el.settingsModal) el.settingsModal.classList.remove('active');
    });
    if (el.btnExitEditMode) el.btnExitEditMode.addEventListener('click', toggleEditMode);

    // Toggle Button Rebind Mode from Settings
    if (el.btnToggleEditModeSetting) {
      el.btnToggleEditModeSetting.addEventListener('click', () => {
        toggleEditMode();
        el.btnToggleEditModeSetting.textContent = state.editMode ? '⚙ Edit Mode: ACTIVE (Tap to Rebind)' : '⚙ Toggle Edit Mode';
        el.btnToggleEditModeSetting.style.background = state.editMode ? 'var(--mashina-amber)' : '';
        if (state.editMode && el.settingsModal) {
          el.settingsModal.classList.remove('active');
        }
      });
    }

    // Reset All Bindings
    if (el.btnResetAllBindings) {
      el.btnResetAllBindings.addEventListener('click', () => {
        state.customBindings = {};
        localStorage.removeItem('mashina_kontrol_bindings');
        renderGamepadLayout(state.currentLayout);
        applyCustomBindingsToDOM();
        vibrate([15, 30, 15]);
        playClickSound(180, 0.02, 0.08);
        el.btnResetAllBindings.textContent = '✓ Reset Done!';
        setTimeout(() => {
          if (el.btnResetAllBindings) el.btnResetAllBindings.textContent = 'Reset All Bindings';
        }, 1500);
      });
    }

    // Orientation Adaptation Banner & Dismissal
    if (el.orientDismiss && el.orientationBanner) {
      el.orientDismiss.addEventListener('click', () => {
        sessionStorage.setItem('mashina_kontrol_orient_dismissed', 'true');
        el.orientationBanner.style.display = 'none';
        vibrate(8);
      });
    }

    // Customizer Modal Form
    if (el.customizerCloseBtn && el.customizerModal) {
      el.customizerCloseBtn.addEventListener('click', () => el.customizerModal.classList.remove('active'));
    }
    if (el.custSaveBtn) el.custSaveBtn.addEventListener('click', saveCustomBinding);
    if (el.custResetBtn) el.custResetBtn.addEventListener('click', resetCustomBinding);

    // QR Modal
    if (el.qrModalBtn && el.qrModal) {
      el.qrModalBtn.addEventListener('click', () => {
        el.qrModal.classList.add('active');
        fetchHostInfo();
      });
    }
    if (el.qrCloseBtn && el.qrModal) {
      el.qrCloseBtn.addEventListener('click', () => el.qrModal.classList.remove('active'));
    }

    // Pairing PIN Modal Submit
    const pinSubmitBtn = document.getElementById('btn-pin-submit');
    const pinInput = document.getElementById('pin-input');
    if (pinSubmitBtn && pinInput) {
      const doSubmitPin = () => {
        const pinVal = pinInput.value.trim();
        if (!pinVal) return;
        state.authAttempted = false;
        localStorage.setItem('mashina_kontrol_pin', pinVal);
        sendJSON('AUTH', { pin: pinVal });
      };
      pinSubmitBtn.addEventListener('click', doSubmitPin);
      pinInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSubmitPin();
      });
    }

    // Global Modal Backdrop Dismissal
    window.addEventListener('click', (e) => {
      if (e.target === el.qrModal) el.qrModal.classList.remove('active');
      if (e.target === el.themeModal) el.themeModal.classList.remove('active');
      if (e.target === el.customizerModal) el.customizerModal.classList.remove('active');
      if (e.target === el.settingsModal) el.settingsModal.classList.remove('active');
      if (e.target === el.pwaGuideModal) el.pwaGuideModal.classList.remove('active');
    });
  }

  // ─── Auto Orientation Sensor & Banner Engine ────────────────────────
  function checkOrientation() {
    const isPortrait = window.matchMedia('(orientation: portrait)').matches || window.innerHeight > window.innerWidth;
    const pref = localStorage.getItem('mashina_kontrol_orientation') || 'auto';
    const dismissed = sessionStorage.getItem('mashina_kontrol_orient_dismissed');

    if (!el.orientationBanner) return;

    if (pref === 'portrait') {
      el.orientationBanner.style.display = 'none';
    } else if (isPortrait && !dismissed) {
      el.orientationBanner.style.display = 'flex';
    } else {
      el.orientationBanner.style.display = 'none';
    }
  }

  // ─── Application Bootstrap ──────────────────────────────────────────
  function init() {
    // Parse URL pin parameter if present
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const pinFromUrl = urlParams.get('pin');
      if (pinFromUrl) {
        localStorage.setItem('mashina_kontrol_pin', pinFromUrl);
      }
    } catch {}

    if (isLocalHost) {
      const pinModal = document.getElementById('pin-modal');
      if (pinModal) pinModal.classList.remove('active');
    }

    // PWA Service Worker Registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    // Load saved settings
    const savedHaptics = localStorage.getItem('mashina_kontrol_haptics');
    if (savedHaptics !== null) state.hapticsEnabled = savedHaptics === 'enabled';
    const savedAudio = localStorage.getItem('mashina_kontrol_audio');
    if (savedAudio !== null) state.soundEnabled = savedAudio === 'enabled';

    if (isClientDevice()) {
      const hubBtn = document.querySelector('.mode-btn[data-mode="hub"]');
      if (hubBtn) hubBtn.remove();
      const hubDeck = document.getElementById('deck-hub');
      if (hubDeck) hubDeck.classList.remove('active');
    }

    try { setTheme(state.currentTheme); } catch (e) { console.error('setTheme:', e); }
    try { initWebSocket(); } catch (e) { console.error('initWebSocket:', e); }
    try { setupUIControls(); } catch (e) { console.error('setupUIControls:', e); }
    try { setLayout(state.currentLayout); } catch (e) { console.error('setLayout:', e); }
    try {
      const initialMode = getInitialMode();
      setMode(initialMode);
    } catch (e) {
      console.error('setMode error:', e);
      setMode('gamepad');
    }
    try { setupButtonListeners(); } catch (e) { console.error('setupButtonListeners:', e); }
    try { setupPresentationDeck(); } catch (e) { console.error('setupPresentationDeck:', e); }
    try { setupKeyboardDeck(); } catch (e) { console.error('setupKeyboardDeck:', e); }
    try { setupTrackpad(); } catch (e) { console.error('setupTrackpad:', e); }
    try { applyCustomBindingsToDOM(); } catch (e) { console.error('applyCustomBindingsToDOM:', e); }
    try { applyAllLayoutTransforms(); } catch (e) { console.error('applyAllLayoutTransforms:', e); }
    try { setupDraggableModules(); } catch (e) { console.error('setupDraggableModules:', e); }
    try { initLobbyUI(); } catch (e) { console.error('initLobbyUI:', e); }
    if (state.player.color) {
      try { applyPlayerTheme(state.player.color); } catch (e) { console.error('applyPlayerTheme:', e); }
    }
    try { updatePlayerBadge(); } catch (e) { console.error('updatePlayerBadge:', e); }
    try { checkOrientation(); } catch (e) { console.error('checkOrientation:', e); }

    window.addEventListener('resize', checkOrientation);
    if (screen && screen.orientation && screen.orientation.addEventListener) {
      screen.orientation.addEventListener('change', checkOrientation);
    }

    window.addEventListener('pointerdown', requestWakeLock, { once: true });

    window.addEventListener('beforeunload', () => {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        try { state.ws.close(1000, 'Page Unload'); } catch {}
      }
    });

    // Proactively reconnect when tab becomes active again
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        if (!state.ws || state.ws.readyState === WebSocket.CLOSED || state.ws.readyState === WebSocket.CLOSING) {
          scheduleReconnect(100);
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
