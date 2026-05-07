const { contextBridge, ipcRenderer } = require('electron');

// =====================================================================
// MAGBO Access Control — Preload Script (Secure Bridge)
// =====================================================================
// Exposes a safe, minimal API to the renderer process via contextBridge.
// The renderer accesses this as `window.magboConfig` and `window.magboIpc`.
// =====================================================================

// ─────────────────────────────────────────────────────────────
// Configuration — loaded once at startup from main process
// ─────────────────────────────────────────────────────────────

let cachedConfig = null;

async function loadConfig() {
      if (!cachedConfig) {
            cachedConfig = await ipcRenderer.invoke('get-config');
      }
      return cachedConfig;
}

// Pre-load config so it's available synchronously after first access
loadConfig();

// ─────────────────────────────────────────────────────────────
// Exposed APIs
// ─────────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('magboConfig', {
      /** Get full config object: { apiUrl, sector, isProduction, version } */
      getConfig: () => loadConfig(),

      /** Synchronous access to cached config (may be null on first call) */
      getCached: () => cachedConfig,
});

contextBridge.exposeInMainWorld('magboIpc', {
      /** Verify PIN for kiosk exit */
      verifyKioskPin: (pin) => ipcRenderer.invoke('verify-kiosk-pin', pin),

      /** Exit kiosk mode (after PIN verification) */
      exitKiosk: () => ipcRenderer.invoke('exit-kiosk'),

      /** Listen for admin PIN request from main process (Ctrl+Shift+Alt+Q) */
      onRequestAdminPin: (callback) => {
            ipcRenderer.on('request-admin-pin', () => callback());
      },
});
