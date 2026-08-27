// =====================================================================
// CDI Data — Constants, Audio, Crypto
// =====================================================================

// ⚠️ Le DÉFAUT seulement. La capacité réelle vient du serveur
// (`magbo.cdi.capacidade`, réglable à l'écran) ; ce nombre est le repli quand
// la requête échoue — la salle ne doit jamais se retrouver « sans capacité ».
const CDI_CAPACITY = 50;
const CDI_STORAGE = { students: 'cdi_students', present: 'cdi_present', logs: 'cdi_logs', muted: 'cdi_muted', pin: 'cdi_pin' };
const CDI_DEFAULT_PIN = '1234';
const CDI_API_URL = ((window.magboConfig?.getCached?.()?.apiUrl) || 'http://localhost:8080') + '/api';

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
      error: () => { cdiPlayBeep(220, 0.1, 'square'); setTimeout(() => cdiPlayBeep(220, 0.1, 'square'), 120); },

      // ⚠️ TROIS SONS QUI NE SE CONFONDENT PAS, parce qu'ils veulent dire
      // trois choses différentes et que l'opérateur les entend sans regarder
      // l'écran. Le grave descendant se distingue du double-bip d'erreur ; le
      // triple aigu ne ressemble ni à l'un ni à l'autre.
      //
      // ⚠️ AUCUN de ces sons n'empêche quoi que ce soit. Le terminal a déjà
      // ouvert la porte (ADR-003) : on informe l'adulte, on ne barre personne.

      /** CDI plein : deux notes DESCENDANTES, plus graves que le succès. */
      complet: () => { cdiPlayBeep(520, 0.18); setTimeout(() => cdiPlayBeep(390, 0.28), 190); },

      /** Personne exclue : trois notes AIGUËS et brèves — impossible à rater. */
      exclu: () => {
            cdiPlayBeep(1180, 0.12, 'triangle');
            setTimeout(() => cdiPlayBeep(1180, 0.12, 'triangle'), 150);
            setTimeout(() => cdiPlayBeep(1180, 0.22, 'triangle'), 300);
      }
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
