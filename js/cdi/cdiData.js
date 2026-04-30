// =====================================================================
// CDI Data — Constants, Audio, Crypto
// =====================================================================

const CDI_CAPACITY = 50;
const CDI_STORAGE = { students: 'cdi_students', present: 'cdi_present', logs: 'cdi_logs', muted: 'cdi_muted', pin: 'cdi_pin' };
const CDI_DEFAULT_PIN = '1234';
const CDI_API_URL = "http://localhost:8081/api";

// Audio
const cdiAudioCtx = { ctx: null };
const cdiPlayBeep = (freq, dur, type = 'sine') => {
      if (!cdiAudioCtx.ctx) cdiAudioCtx.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = cdiAudioCtx.ctx.createOscillator(), gain = cdiAudioCtx.ctx.createGain();
      osc.connect(gain); gain.connect(cdiAudioCtx.ctx.destination);
      osc.type = type; osc.frequency.value = freq; gain.gain.value = 0.1;
      osc.start(); gain.gain.exponentialRampToValueAtTime(0.001, cdiAudioCtx.ctx.currentTime + dur);
      osc.stop(cdiAudioCtx.ctx.currentTime + dur);
};
const CdiSound = {
      success: () => cdiPlayBeep(880, 0.15),
      exit: () => cdiPlayBeep(440, 0.2),
      error: () => { cdiPlayBeep(220, 0.1, 'square'); setTimeout(() => cdiPlayBeep(220, 0.1, 'square'), 120); }
};

// Crypto Helper
const SimpleCrypto = {
      encrypt: (text, pass) => {
            let result = '';
            for (let i = 0; i < text.length; i++) {
                  result += String.fromCharCode(text.charCodeAt(i) ^ pass.charCodeAt(i % pass.length));
            }
            return btoa(result);
      },
      decrypt: (text, pass) => {
            try {
                  let result = '';
                  const decoded = atob(text);
                  for (let i = 0; i < decoded.length; i++) {
                        result += String.fromCharCode(decoded.charCodeAt(i) ^ pass.charCodeAt(i % pass.length));
                  }
                  return result;
            } catch (e) { return null; }
      }
};
