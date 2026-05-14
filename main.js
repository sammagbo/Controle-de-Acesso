const { app, BrowserWindow, globalShortcut, ipcMain, dialog, shell } = require('electron');
const path = require('path');

// =====================================================================
// MAGBO Access Control — Electron Main Process (Production-Ready)
// =====================================================================
// Reads configuration from environment variables:
//   MAGBO_API_URL  — Backend REST API base URL (default: http://localhost:8080)
//   MAGBO_SECTOR   — Sector ID for this terminal (default: PORT1)
//   MAGBO_KIOSK_PIN — Admin PIN to exit kiosk mode (default: 1234)
//   NODE_ENV       — 'production' enables kiosk mode
// =====================================================================

const MAGBO_API_URL = process.env.MAGBO_API_URL || 'http://localhost:8080';
const MAGBO_SECTOR = process.env.MAGBO_SECTOR || 'PORT1';
const MAGBO_KIOSK_PIN = process.env.MAGBO_KIOSK_PIN || '1234';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

let mainWindow = null;

function createWindow() {
      mainWindow = new BrowserWindow({
            width: 1920,
            height: 1080,
            kiosk: IS_PRODUCTION,
            fullscreen: IS_PRODUCTION,
            autoHideMenuBar: true,
            title: `MAGBO Access Control — ${MAGBO_SECTOR}`,
            icon: path.join(__dirname, 'build', 'icon.ico'),
            webPreferences: {
                  preload: path.join(__dirname, 'preload.js'),
                  contextIsolation: true,
                  nodeIntegration: false,
                  sandbox: false,
            },
      });

      // Development: open with reasonable size
      if (!IS_PRODUCTION) {
            mainWindow.setSize(1200, 800);
            mainWindow.center();
      }

      mainWindow.loadFile(path.join(__dirname, 'index.html'));

      // External links (window.open with target=_blank) open in default browser
      mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            if (url.startsWith('http://') || url.startsWith('https://')) {
                  shell.openExternal(url);
            }
            return { action: 'deny' };
      });

      // Prevent navigation to external URLs in the main window
      mainWindow.webContents.on('will-navigate', (event, url) => {
            if (!url.startsWith('file://')) {
                  event.preventDefault();
                  if (url.startsWith('http://') || url.startsWith('https://')) {
                        shell.openExternal(url);
                  }
            }
      });

      mainWindow.on('closed', () => {
            mainWindow = null;
      });
}

// ─────────────────────────────────────────────────────────────
// KIOSK MODE — Block escape keys in production
// ─────────────────────────────────────────────────────────────

function registerKioskShortcuts() {
      if (!IS_PRODUCTION) return;

      const blockedKeys = ['Alt+F4', 'Ctrl+W', 'F11', 'Alt+Tab', 'Super', 'Ctrl+Escape'];
      blockedKeys.forEach(key => {
            try {
                  globalShortcut.register(key, () => { /* blocked */ });
            } catch (e) {
                  // Some shortcuts may not be registerable on all platforms
            }
      });

      // Emergency exit: Ctrl+Shift+Alt+Q → requires PIN
      globalShortcut.register('Ctrl+Shift+Alt+Q', () => {
            if (!mainWindow) return;
            mainWindow.webContents.send('request-admin-pin');
      });
}

// ─────────────────────────────────────────────────────────────
// IPC — Handle PIN verification from renderer
// ─────────────────────────────────────────────────────────────

ipcMain.handle('verify-kiosk-pin', (_event, pin) => {
      return pin === MAGBO_KIOSK_PIN;
});

ipcMain.handle('exit-kiosk', () => {
      app.quit();
});

ipcMain.handle('get-config', () => {
      return {
            apiUrl: MAGBO_API_URL,
            sector: MAGBO_SECTOR,
            isProduction: IS_PRODUCTION,
            version: require('./package.json').version || '1.0.0',
      };
});

// ─────────────────────────────────────────────────────────────
// APP LIFECYCLE
// ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
      createWindow();
      registerKioskShortcuts();

      app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
});

app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
      globalShortcut.unregisterAll();
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
      app.quit();
} else {
      app.on('second-instance', () => {
            if (mainWindow) {
                  if (mainWindow.isMinimized()) mainWindow.restore();
                  mainWindow.focus();
            }
      });
}
