const { app, BrowserWindow, globalShortcut, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// ⚠️ MÊME MODULE QUE LA PAGE. `js/utils/posteConfig.js` est un module UMD : il
// publie `window.MagboPosteConfig` dans le navigateur ET `module.exports` ici.
// Une seule règle de résolution, chargée deux fois — pas deux copies à tenir
// d'accord. Voir le long commentaire en tête de ce fichier-là.
const posteConfig = require('./js/utils/posteConfig.js');

// =====================================================================
// MAGBO Access Control — Electron Main Process
// =====================================================================
// L'APPLICATION S'OUVRE PAR SON .EXE, comme n'importe quelle application.
//
// Ordre de résolution de la configuration du poste — et cet ordre EST le
// contrat de compatibilité du parc :
//
//   1. VARIABLES D'ENVIRONNEMENT (MAGBO_API_URL / MAGBO_SECTOR)
//      Posées par `Abrir-MAGBO.bat`. ⚠️ ELLES PRIMENT SUR TOUT. Un poste déjà
//      installé et non touché continue de se comporter exactement comme
//      avant ce chantier. Distribuer un .exe qui les ignorerait casserait
//      chaque poste du parc le jour de la mise à jour.
//   2. FICHIER `magbo-poste.json`, à côté du .exe.
//   3. ÉCRAN DE PREMIÈRE CONFIGURATION, rendu par la page.
//
// Autres variables, inchangées :
//   MAGBO_KIOSK_PIN — code de sortie du mode kiosque (défaut : 1234)
//   NODE_ENV        — 'production' active le mode kiosque
// =====================================================================

const MAGBO_KIOSK_PIN = process.env.MAGBO_KIOSK_PIN || '1234';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * LE DOSSIER OÙ VIT `magbo-poste.json` — « à côté du .exe ».
 *
 * ⚠️ TROIS CAS, ET LE PREMIER EST UN PIÈGE.
 *
 *  • **Portable** : le .exe s'auto-extrait dans un dossier TEMPORAIRE.
 *    `process.execPath` et `app.getPath('exe')` pointent donc vers ce temp,
 *    qui est effacé — un fichier écrit là disparaîtrait à la fermeture, et
 *    l'écran de configuration reviendrait à chaque ouverture. electron-builder
 *    pose `PORTABLE_EXECUTABLE_DIR` = le dossier du VRAI .exe (vérifié dans
 *    `node_modules/app-builder-lib/templates/nsis/portable.nsi`, qui fait
 *    `SetEnvironmentVariable("PORTABLE_EXECUTABLE_DIR", "$EXEDIR")`).
 *  • **Installé (NSIS)** : le dossier du .exe est réel, mais il est sous
 *    `Program Files` — non inscriptible sans élévation. On retombe donc sur
 *    `userData`, qui est le bon endroit pour une installation par machine.
 *  • **Développement** (`npm start`) : `app.getPath('exe')` est le binaire
 *    d'Electron dans `node_modules`. On écrit à la racine du dépôt, qui est
 *    ignorée par git.
 */
/**
 * Peut-on VRAIMENT écrire dans ce dossier ?
 *
 * ⚠️ ON ÉCRIT POUR LE SAVOIR, on ne demande pas. `fs.accessSync(dir, W_OK)` ne
 * dit pas la vérité sous Windows pour un RÉPERTOIRE : libuv n'y regarde que
 * l'attribut `FILE_ATTRIBUTE_READONLY`, qui n'a pas de sens sur un dossier, et
 * ne consulte pas les ACL NTFS. Sur une installation dans `Program Files`, la
 * question répondait donc « oui » à un utilisateur non-administrateur, le repli
 * vers `userData` n'était jamais choisi, et l'écriture échouait plus tard en
 * EPERM — l'opérateur recevait une erreur au lieu du repli silencieux.
 * (Panel de revue — qualité, 02/09/2026.)
 */
function inscriptible(dir) {
      if (!dir) return false;
      // ⚠️ LE NOM PORTE LE NUMÉRO DU PROCESSUS. Avec un nom fixe, deux sondes
      // simultanées — deux instances, ou une instance et un antivirus qui
      // ouvre le fichier qui vient de naître — se supprimaient le fichier
      // l'une de l'autre : `unlinkSync` levait ENOENT et la sonde répondait
      // « non inscriptible » sur un dossier parfaitement inscriptible. Le
      // réglage partait alors dans `userData` et n'était plus retrouvé à
      // côté du `.exe` à l'ouverture suivante.
      // (Panel de revue — qualité, 2e tour, 02/09/2026.)
      const sonde = path.join(dir, '.magbo-ecriture-test-' + process.pid);
      try {
            fs.writeFileSync(sonde, '');
            fs.unlinkSync(sonde);
            return true;
      } catch (e) {
            return false;
      }
}

function dossierDeConfiguration() {
      // ⚠️ Le dossier du portable est SONDÉ lui aussi. Une clé USB protégée en
      // écriture, un partage réseau en lecture seule, un `.exe` déposé dans
      // Program Files : sans cette sonde, l'écriture échouait sans repli et
      // l'écran de configuration revenait à chaque ouverture. Le repli existait
      // quinze lignes plus bas et n'était jamais atteint.
      const portable = process.env.PORTABLE_EXECUTABLE_DIR;
      if (portable) {
            // ⚠️⚠️ EN PORTABLE, ON NE DESCEND JAMAIS VERS `getPath('exe')`.
            //
            // C'est le piège documenté quinze lignes plus haut, et la version
            // précédente tombait dedans : quand le dossier du `.exe` refusait
            // l'écriture (clé USB verrouillée, partage réseau, `Program
            // Files`), on passait à `path.dirname(app.getPath('exe'))` — qui,
            // en portable, EST le dossier d'auto-extraction temporaire. Celui-
            // là est parfaitement inscriptible, donc il était choisi, donc le
            // réglage y était écrit… et effacé à la fermeture. `userData`
            // n'était jamais atteint. L'opérateur voyait « enregistré », puis
            // l'écran de configuration revenir tous les matins, et les deux
            // pistes de diagnostic du guide — « à côté du .exe » puis « dans
            // AppData » — menaient toutes les deux au vide.
            // (Panel de revue — opérateur, 2e tour, 02/09/2026.)
            return inscriptible(portable) ? portable : dossierDeRepli();
      }

      if (!app.isPackaged) return __dirname;

      const aCoteDuExe = path.dirname(app.getPath('exe'));
      if (inscriptible(aCoteDuExe)) return aCoteDuExe;

      // Program Files : on ne demande pas l'élévation pour deux champs.
      return dossierDeRepli();
}

/**
 * Le dernier endroit où écrire quand le dossier du programme refuse.
 *
 * ⚠️ PAS `__dirname` : dans un `.exe` empaqueté, c'est
 * `…/resources/app.asar`, qui n'est pas un vrai dossier et n'est pas
 * inscriptible. Le filet ne pouvait donc jamais servir dans le seul cas où il
 * se déclenche. `getPath('temp')` existe toujours et est inscriptible ; le
 * réglage n'y survivra pas au redémarrage, mais l'application s'ouvre et pose
 * sa question, ce qui vaut mieux qu'une fenêtre blanche.
 * (Panel de revue — qualité, 2e tour, 02/09/2026.)
 */
function dossierDeRepli() {
      try {
            return app.getPath('userData');
      } catch (e) {
            try {
                  return app.getPath('temp');
            } catch (e2) {
                  return __dirname;
            }
      }
}

/**
 * ⚠️ SONDÉ UNE FOIS, PUIS MÉMORISÉ. `configurationCourante()` est appelée au
 * moins quatre fois au démarrage (journal, décision de quiosque, titre,
 * canal synchrone) et à chaque `get-config` : sans ce cache, chaque appel
 * redescendait jusqu'à deux écritures-sondes sur le disque, dont une sur le
 * chemin de `sendSync`, le seul qu'on a délibérément rendu bloquant. Le
 * dossier ne peut pas changer pendant une session.
 * (Panel de revue — qualité, 2e tour, 02/09/2026.)
 */
let dossierMemo = null;
function dossierDeConfigurationMemo() {
      if (dossierMemo === null) dossierMemo = dossierDeConfiguration();
      return dossierMemo;
}

function cheminDuFichier() {
      return path.join(dossierDeConfigurationMemo(), posteConfig.NOM_FICHIER);
}

/**
 * Lit le fichier. ⚠️ NE LÈVE JAMAIS : absent, illisible, JSON cassé, dossier
 * en lecture seule — tout cela rend `null`, et l'application demande la
 * configuration au lieu de refuser de démarrer. Un poste qui ne s'ouvre pas
 * est pire qu'un poste qui pose une question.
 */
function lireFichier() {
      try {
            const brut = fs.readFileSync(cheminDuFichier(), 'utf8');
            const objet = JSON.parse(brut);
            return objet && typeof objet === 'object' ? objet : null;
      } catch (e) {
            return null;
      }
}

/** Écrit le fichier. Rend `null` si tout va bien, sinon le message d'erreur. */
function ecrireFichier(apiUrl, sector) {
      try {
            fs.writeFileSync(
                  cheminDuFichier(),
                  JSON.stringify(posteConfig.aEcrire(apiUrl, sector), null, 2) + '\n',
                  'utf8');
            return null;
      } catch (e) {
            return String(e && e.message ? e.message : e);
      }
}

/**
 * La configuration effective, recalculée à la demande.
 *
 * ⚠️ RELUE À CHAQUE OUVERTURE, jamais figée au build : c'est ce qui permet de
 * corriger une erreur d'installation sans réinstaller.
 */
function configurationCourante() {
      const resolue = posteConfig.resoudre({ env: process.env, fichier: lireFichier() });
      return {
            apiUrl: resolue.apiUrl,
            sector: resolue.sector,
            source: resolue.source,
            doitConfigurer: resolue.doitConfigurer,
            isProduction: IS_PRODUCTION,
            cheminFichier: cheminDuFichier(),
            version: require('./package.json').version || '1.0.0',
      };
}

let mainWindow = null;

/**
 * Le titre porte le poste : c'est ce qui permet de dire au téléphone « le PC
 * du CDI affiche… » sans se déplacer. Quand le poste n'est pas encore choisi,
 * on ne met pas un identifiant inventé dans la barre de titre.
 */
function titreFenetre() {
      const c = configurationCourante();
      return c.doitConfigurer
            ? 'MAGBO Access Control'
            : `MAGBO Access Control — ${c.sector}`;
}

function createWindow() {
      // ⚠️⚠️ JAMAIS DE QUIOSQUE VERROUILLÉ SUR L'ÉCRAN DE CONFIGURATION.
      //
      // `kiosk` bloque Alt+F4, Ctrl+W, F11, Alt+Tab (voir registerKioskShortcuts).
      // Un poste en quiosque dont le réglage manque — installation neuve, ou
      // fichier effacé — ouvrirait donc l'écran de configuration EN PLEIN ÉCRAN,
      // touches de sortie bloquées. Et si le serveur ne répond pas, le bouton
      // « Enregistrer » ne s'ouvre jamais : la machine devient un écran sans
      // issue, à la cantine, à 11h50, récupérable seulement par le gestionnaire
      // des tâches. Aucun AED ne fera ça.
      //
      // Le quiosque s'applique donc à l'ouverture SUIVANTE, une fois le poste
      // nommé. (Panel de revue — Vie Scolaire, 02/09/2026.)
      // ⚠️ LA RÈGLE VIT DANS LE MODULE PARTAGÉ, exécutée par la suite de
      // tests — voir `posteConfig.verrouillable`. Elle est appliquée ici ET
      // dans `registerKioskShortcuts` ; c'est en la recopiant que le premier
      // tour n'avait corrigé que la moitié du défaut.
      const quiosque = posteConfig.verrouillable(IS_PRODUCTION, configurationCourante());

      mainWindow = new BrowserWindow({
            width: 1920,
            height: 1080,
            kiosk: quiosque,
            fullscreen: quiosque,
            autoHideMenuBar: true,
            title: titreFenetre(),
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

      // ⚠️ SANS CETTE LIGNE, LE TITRE NE PORTE JAMAIS LE POSTE.
      // `index.html` contient `<title>MAGBO Access Control — Lycée Molière</title>`,
      // et Electron laisse le document écraser l'option `title` du
      // BrowserWindow dès qu'il en définit un. `titreFenetre()` n'avait donc
      // aucun effet à l'ouverture — alors que le guide fait cocher « la barre de
      // titre porte le nom du poste », que l'aide de l'écran le promet, et que
      // c'est le SEUL effet observable du choix du poste. Trois documents
      // affirmaient une chose que le code ne faisait pas.
      // (Panel de revue — qualité, 02/09/2026. Défaut antérieur au chantier,
      // rendu visible par lui.)
      mainWindow.on('page-title-updated', (e) => e.preventDefault());

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
      // ⚠️⚠️ LA MÊME DÉCISION QUE LA FENÊTRE, ET IL A FALLU DEUX TOURS.
      //
      // Le premier tour a désarmé le quiosque de la BrowserWindow tant que le
      // poste n'est pas réglé — mais pas ceci, qui est un tout autre
      // mécanisme : `globalShortcut` confisque les touches AU NIVEAU DU
      // SYSTÈME. Le résultat était pire que le défaut d'origine : sur un PC
      // neuf en production, l'écran de configuration s'ouvrait bien en
      // fenêtre, mais Alt+F4, Ctrl+W, F11 et Alt+Tab ne fonctionnaient plus
      // DANS AUCUNE APPLICATION du poste. L'AED à qui le guide fait ouvrir un
      // navigateur pour vérifier `/api/health` ne pouvait plus le fermer.
      // (Panel de revue — Vie Scolaire ET qualité, 2e tour, 02/09/2026.)
      if (!posteConfig.verrouillable(IS_PRODUCTION, configurationCourante())) return;

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

/**
 * ⚠️ LA SORTIE DE L'ÉCRAN DE CONFIGURATION, ET ELLE FERME TOUTE UNE FAMILLE
 * DE PIÈGES.
 *
 * Le mode « premier lancement » n'a pas de bouton « Annuler » — il n'y a
 * rien derrière lui, c'est délibéré. Mais il existe un état où cet écran
 * s'affiche ET où l'enregistrement sera refusé pour toujours : quand le canal
 * de configuration ne répond pas, la page retombe sur `doitConfigurer: true`
 * (`js/App.js`) alors qu'un `.bat` gouverne réellement le poste. La fenêtre,
 * elle, a été créée en quiosque parce que le processus principal, lui, sait
 * que le poste est réglé. Personne ne peut plus ni enregistrer, ni revenir,
 * ni fermer.
 *
 * Plutôt que d'énumérer ces états, on donne une issue : fermer l'application.
 * Sur cet écran il n'y a rien à protéger — le poste n'est pas encore réglé.
 * (Panel de revue — qualité, 2e tour, 02/09/2026.)
 */
ipcMain.handle('quitter-application', () => {
      app.quit();
      return { ok: true };
});

ipcMain.handle('get-config', () => {
      // ⚠️ Même durcissement que le canal synchrone : le premier tour n'avait
      // protégé que celui-là, et `preload.js` appelle celui-ci SANS `.catch`.
      // Une exception ici devenait un rejet non géré.
      try {
            return configurationCourante();
      } catch (e) {
            console.error('[MAGBO] configuration illisible :', e && e.message);
            return null;
      }
});

// ⚠️⚠️ LA VOIE SYNCHRONE, ET ELLE CORRIGE UN DÉFAUT RÉEL.
//
// `get-config` est asynchrone, et le preload ne l'attendait pas : huit
// fichiers de `js/` lisent `magboConfig.getCached()` AU CHARGEMENT DU SCRIPT
// (`const API_BASE = (...getCached()?.apiUrl) || 'http://localhost:8080'`).
// Quand la réponse IPC n'était pas encore arrivée, `getCached()` rendait
// `null` et toute l'application partait sur **localhost** — un écran sans
// données, sans erreur, sur un poste correctement configuré. C'est le symptôme
// qu'on attribuait au fait d'ouvrir le .exe au lieu du .bat.
//
// `sendSync` bloque le preload le temps d'un aller-retour local (moins d'une
// milliseconde) et garantit que `getCached()` n'est JAMAIS null quand le
// premier script de la page s'exécute. C'est le seul endroit du projet où le
// blocage synchrone est le bon choix : il se produit une fois, avant qu'il n'y
// ait quoi que ce soit à l'écran.
ipcMain.on('get-config-sync', (event) => {
      // ⚠️ UNE RÉPONSE, TOUJOURS. `sendSync` bloque le preload jusqu'à ce que
      // `returnValue` soit posé : si ce handler levait, la valeur ne serait
      // jamais écrite et la fenêtre resterait BLANCHE pour toujours, sans
      // message. Le try/catch n'est pas de la prudence décorative — c'est ce
      // qui garantit qu'un blocage synchrone se termine.
      // (Panel de revue — qualité, 02/09/2026.)
      try {
            event.returnValue = configurationCourante();
      } catch (e) {
            console.error('[MAGBO] configuration illisible :', e && e.message);
            event.returnValue = null;
      }
});

/**
 * Enregistre la configuration du poste depuis l'écran de première
 * configuration (ou depuis l'engrenage).
 *
 * ⚠️ REFUSE D'ÉCRIRE quand des variables d'environnement gouvernent le poste.
 * Sans ce refus, un administrateur corrigerait l'adresse à l'écran, verrait
 * « enregistré », et retrouverait l'ancienne valeur à la réouverture — parce
 * que le `.bat` la repose. Mieux vaut dire pourquoi.
 */
ipcMain.handle('enregistrer-config-poste', (_event, cfg) => {
      // ⚠️ UN SEUL CHEMIN, CAPTURÉ UNE FOIS. Le rappeler pour composer le
      // message d'erreur pouvait rendre un dossier différent de celui où
      // l'écriture venait d'échouer.
      const chemin = cheminDuFichier();

      const courante = configurationCourante();
      if (courante.source === posteConfig.SOURCES.ENVIRONNEMENT) {
            return { ok: false, motif: 'environnement', chemin: chemin };
      }

      // ⚠️ CE QUI EST ÉCRIT DOIT ÊTRE RELISIBLE COMME UNE CONFIGURATION.
      // `aEcrire('', '')` produit un JSON parfaitement valide que `resoudre`
      // relit en `doitConfigurer: true` : le fichier partait sur le disque,
      // l'écran répondait « enregistré », la page se rechargeait — et
      // revenait sur l'écran de configuration, sans un mot. C'est
      // « l'enregistré qui ment » que ce chantier existe pour supprimer,
      // déplacé d'un cran. (Panel de revue — qualité, 2e tour, 02/09/2026.)
      const propose = posteConfig.aEcrire(cfg && cfg.apiUrl, cfg && cfg.sector);
      if (!posteConfig.utilisable(propose)) {
            return { ok: false, motif: 'ecriture', detail: 'incomplet', chemin: chemin };
      }

      const erreur = ecrireFichier(cfg && cfg.apiUrl, cfg && cfg.sector);
      if (erreur) return { ok: false, motif: 'ecriture', detail: erreur, chemin: chemin };

      const nouvelle = configurationCourante();

      // ⚠️ ON RELIT AVANT DE DIRE OUI. Le disque a pu refuser à moitié, un
      // antivirus a pu reprendre le fichier, le dossier a pu changer sous nos
      // pieds : si ce qui se relit n'est pas une configuration, c'est un échec
      // d'écriture, et il doit se dire.
      if (nouvelle.doitConfigurer) {
            return { ok: false, motif: 'ecriture', detail: 'relecture', chemin: chemin };
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
            // Le titre porte le poste : il doit suivre immédiatement.
            mainWindow.setTitle(titreFenetre());

            // ═══════════════════════════════════════════════════════════
            // ⚠️⚠️ RECHARGER LA PAGE — SANS CELA, RIEN DE TOUT CECI NE SERT
            // ═══════════════════════════════════════════════════════════
            // Cinq fichiers de `js/` figent l'adresse AU CHARGEMENT DU SCRIPT,
            // dans un `const` :
            //     const API_BASE = ((...getCached()?.apiUrl) || '…') + '/api';
            // (js/api.js, js/utils/api.js, js/utils/userCache.js,
            //  js/utils/connectionMonitor.js, js/cdi/cdiData.js)
            //
            // Mettre à jour le cache du preload ne les change PAS. Sans
            // rechargement : l'installateur corrige l'adresse parce que la VM a
            // déménagé, le test répond VERT sur la nouvelle, il enregistre — et
            // l'application parle à l'ANCIENNE pour toute la session. Écran
            // vide juste après un test réussi, sans erreur. C'est très
            // exactement le « enregistré qui ment » que ce chantier existe pour
            // supprimer, déplacé d'un cran.
            //
            // Trouvé indépendamment par les trois relecteurs du panel
            // (02/09/2026), et par aucun test — voir `tests/premierLancement`.
            //
            // ⚠️ Au premier lancement c'est gratuit : personne n'est connecté.
            // Depuis l'engrenage, cela DÉCONNECTE (le jeton vit en mémoire) —
            // l'écran l'annonce avant, par `poste.rechargement`.
            mainWindow.webContents.reload();

            // ⚠️⚠️ RÉARMER LE QUIOSQUE. La décision de verrouiller est prise
            // à la CRÉATION de la fenêtre, une seule fois : sur un poste de
            // portail lancé par son `.bat` quiosque, un opérateur qui suit la
            // section 9b du guide (« supprimer magbo-poste.json, rouvrir »)
            // répondait aux deux questions et se retrouvait avec une fenêtre
            // NORMALE — barre de titre, croix, Alt+Tab — pour toute la
            // journée, devant les élèves. Rien ne le lui disait.
            // (Panel de revue — Vie Scolaire, 2e tour, 02/09/2026.)
            if (IS_PRODUCTION) {
                  mainWindow.setKiosk(true);
                  mainWindow.setFullScreen(true);
                  registerKioskShortcuts();
            }
      }
      return { ok: true, config: nouvelle };
});

// ─────────────────────────────────────────────────────────────
// APP LIFECYCLE
// ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
      // ⚠️ UNE LIGNE AU DÉMARRAGE, et elle vaut une visite sur place. Quand un
      // poste « n'a pas de données », la première question est toujours « quelle
      // adresse utilise-t-il, et d'où la tient-il ? ». La réponse est ici.
      const c = configurationCourante();
      console.log(`[MAGBO] poste=${c.sector || '(non configuré)'} `
            + `serveur=${c.apiUrl} source=${c.source} fichier=${c.cheminFichier}`);

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
