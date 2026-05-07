// =====================================================================
// CONNECTION MONITOR — Heartbeat + auto-reconnect
// =====================================================================
// Polls /api/health every 15 seconds. Dispatches custom events:
//   'connection-lost'     — backend became unreachable
//   'connection-restored' — backend is back online
//   'connection-status'   — every poll result { online: boolean }
// =====================================================================

(function() {
      const API_BASE = ((window.magboConfig?.getCached?.()?.apiUrl) || 'http://localhost:8080');
      const POLL_INTERVAL = 15000; // 15 seconds
      const TIMEOUT = 5000;       // 5 second timeout per health check

      let isOnline = true; // assume online at start
      let pollTimer = null;

      async function checkHealth() {
            try {
                  const controller = new AbortController();
                  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

                  const res = await fetch(`${API_BASE}/api/health`, {
                        signal: controller.signal,
                  });
                  clearTimeout(timeoutId);

                  if (res.ok) {
                        if (!isOnline) {
                              isOnline = true;
                              console.info('[ConnectionMonitor] Connection restored');
                              window.dispatchEvent(new CustomEvent('connection-restored'));
                              // Auto-reload user cache on reconnect
                              if (window.userCache?.reload) {
                                    window.userCache.reload();
                              }
                        }
                        window.dispatchEvent(new CustomEvent('connection-status', { detail: { online: true } }));
                  } else {
                        handleOffline();
                  }
            } catch (err) {
                  handleOffline();
            }
      }

      function handleOffline() {
            if (isOnline) {
                  isOnline = false;
                  console.warn('[ConnectionMonitor] Connection lost');
                  window.dispatchEvent(new CustomEvent('connection-lost'));
            }
            window.dispatchEvent(new CustomEvent('connection-status', { detail: { online: false } }));
      }

      function start() {
            if (pollTimer) return;
            checkHealth(); // immediate first check
            pollTimer = setInterval(checkHealth, POLL_INTERVAL);
      }

      function stop() {
            if (pollTimer) {
                  clearInterval(pollTimer);
                  pollTimer = null;
            }
      }

      // Expose globally
      window.connectionMonitor = {
            isOnline: () => isOnline,
            check: checkHealth,
            start: start,
            stop: stop,
      };

      // Auto-start on load
      start();
})();
