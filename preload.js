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

// ⚠️⚠️ LA CONFIGURATION EST LUE DE FACON SYNCHRONE, ET C'EST UNE CORRECTION,
// PAS UN CHOIX DE STYLE.
//
// La version precedente lancait `ipcRenderer.invoke('get-config')` sans
// l'attendre, en esperant que la reponse arrive avant les scripts de la page.
// Or HUIT fichiers de `js/` lisent l'adresse AU CHARGEMENT DU SCRIPT :
//
//     const API_BASE = ((window.magboConfig?.getCached?.()?.apiUrl)
//                       || 'http://localhost:8080') + '/api';
//
// Quand la reponse n'etait pas encore la, `getCached()` rendait `null` et
// TOUTE l'application partait sur localhost : un ecran sans donnees, sans
// aucune erreur, sur un poste pourtant bien configure. C'est le symptome que
// l'on attribuait au fait d'ouvrir le .exe au lieu du .bat — le .bat n'y
// pouvait rien, la course etait la meme.
//
// `sendSync` bloque le preload le temps d'un aller-retour local (moins d'une
// milliseconde), AVANT que la page n'existe. C'est le seul endroit du projet
// ou bloquer est la bonne reponse : cela arrive une fois, et rien n'est encore
// affiche. En echange, `getCached()` n'est plus JAMAIS null.
let cachedConfig = null;

try {
      cachedConfig = ipcRenderer.sendSync('get-config-sync');
} catch (e) {
      // Le canal n'a pas repondu (version depareillee du processus principal).
      // On laisse `null` et la voie asynchrone ci-dessous rattrapera : mieux
      // vaut une seconde de retard qu'une fenetre qui ne s'ouvre pas.
      cachedConfig = null;
}

async function loadConfig() {
      if (!cachedConfig) {
            cachedConfig = await ipcRenderer.invoke('get-config');
            // ⚠️ ET ON PREVIENT LA PAGE. Sans cet evenement, le « rattrapage »
            // annonce trois lignes plus haut ne rattrapait que le cache DU
            // PRELOAD : `js/App.js` lit `getCached()` une seule fois, dans
            // l'initialiseur d'un useState, et restait donc sur l'ecran de
            // premiere configuration alors que le poste etait correctement
            // regle. Un commentaire decrivait un filet qui n'existait pas de
            // ce cote-ci. (Panel de revue — qualite, 2e tour, 02/09/2026.)
            if (cachedConfig) {
                  try { window.dispatchEvent(new Event('magbo-config-prete')); }
                  catch (e2) { /* la page n'existe pas encore : sans effet */ }
            }
      }
      return cachedConfig;
}

// ⚠️ `.catch` OBLIGATOIRE : appele sans `await`, un rejet ici devient un rejet
// de promesse non gere, qui n'apparait nulle part.
if (!cachedConfig) loadConfig().catch(() => { /* la page redemandera */ });

// ─────────────────────────────────────────────────────────────
// Exposed APIs
// ─────────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('magboConfig', {
      /**
       * La configuration complete :
       * { apiUrl, sector, source, doitConfigurer, isProduction, cheminFichier, version }
       */
      getConfig: () => loadConfig(),

      /**
       * Acces synchrone. ⚠️ N'est plus jamais `null` : la valeur est lue par
       * `sendSync` avant que la page n'existe (voir plus haut).
       */
      getCached: () => cachedConfig,

      /**
       * Enregistre la configuration du poste dans le fichier a cote du .exe.
       *
       * ⚠️ Rend `{ok:false, motif:'environnement'}` quand un `.bat` gouverne le
       * poste : ecrire un fichier que les variables d'environnement
       * ecraseraient a la prochaine ouverture donnerait un « enregistre » qui
       * ment. L'ecran doit le dire, pas le cacher.
       */
      enregistrerPoste: (cfg) => ipcRenderer.invoke('enregistrer-config-poste', cfg)
            .then(r => {
                  if (r && r.ok && r.config) cachedConfig = r.config;
                  return r;
            }),

      /**
       * Ferme l'application.
       *
       * ⚠️ N'EST OFFERT QUE PAR L'ECRAN DE PREMIERE CONFIGURATION, et c'est la
       * seule issue de cet ecran-la : il n'a pas de bouton « Annuler » parce
       * qu'il n'y a rien derriere lui. Sans cette sortie, un poste en quiosque
       * dont la page croit devoir configurer — canal muet, version
       * depareillee — n'a plus ni enregistrement possible, ni retour, ni
       * fermeture. Sur cet ecran il n'y a rien a proteger : le poste n'est pas
       * encore regle.
       */
      quitter: () => ipcRenderer.invoke('quitter-application'),
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
