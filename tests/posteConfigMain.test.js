// =====================================================================
// LE CÂBLAGE DU PROCESSUS PRINCIPAL — ce que la suite ne peut pas exécuter
// =====================================================================
// ⚠️ CE QUE CE FICHIER NE PROUVE PAS, ET IL FAUT LE DIRE D'ABORD.
//
// `main.js` et `preload.js` requièrent `electron`, que Vitest ne peut pas
// charger : il n'y a ni processus principal, ni fenêtre, ni IPC. La décision
// pure est testée pour de bon dans `tests/posteConfig.test.js` ; ici on garde
// le CÂBLAGE, par lecture de la source. C'est plus faible qu'une exécution, et
// c'est assumé — c'est l'idiome que ce projet emploie déjà là où la suite ne
// peut pas exécuter (`AccessLogRepositoryQueryGuardTest`,
// `LicencePorteeGuardTest`).
//
// ⚠️ LA PREUVE RÉELLE EST AILLEURS, et elle a été faite : les quatre scénarios
// (environnement / fichier / priorité de l'environnement sur le fichier / PC
// neuf) ont été vérifiés contre l'application Electron qui tourne, en lisant la
// ligne `[MAGBO] poste=… source=…` que `main.js` écrit au démarrage. Un garde
// de source ne remplace pas ce parcours ; il empêche qu'on le défasse sans
// s'en apercevoir.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(__dirname, '..');
const lire = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

const MAIN = lire('main.js');
const PRELOAD = lire('preload.js');

/** Le code sans ses commentaires — « nommer » n'est pas « faire ». */
const sansCommentaires = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const MAIN_CODE = sansCommentaires(MAIN);
const PRELOAD_CODE = sansCommentaires(PRELOAD);
const APP_CODE = sansCommentaires(lire('js/App.js'));

/**
 * Sort UNE fonction de `main.js` et la rend appelable ici.
 *
 * ⚠️ C'est le seul moyen d'EXÉCUTER un morceau du processus principal dans
 * cette suite : `require('./main.js')` chargerait `electron`, qui n'existe pas
 * sous Vitest. `fs` et `path` sont injectés parce que, dans `main.js`, ce sont
 * des `require` de portée module — invisibles depuis une fonction reconstruite.
 *
 * Le découpage se fait en comptant les accolades : si la fonction disparaît ou
 * change de nom, l'extraction lève au lieu de passer en silence.
 */
function corpsDeFonction(source, nom) {
    const debut = source.indexOf('function ' + nom + '(');
    if (debut < 0) throw new Error('main.js ne déclare plus function ' + nom);
    let i = source.indexOf('{', debut);
    let profondeur = 0;
    for (; i < source.length; i++) {
        if (source[i] === '{') profondeur++;
        else if (source[i] === '}' && --profondeur === 0) { i++; break; }
    }
    return source.slice(debut, i);
}

function extraireFonction(source, nom, injections) {
    const inj = Object.assign({ fs: fs, path: path }, injections || {});
    const noms = Object.keys(inj);
    const code = corpsDeFonction(source, nom);
    // eslint-disable-next-line no-new-func
    return new Function(...noms, code + ' ; return ' + nom + ';')(...noms.map(n => inj[n]));
}

/**
 * `dossierDeConfiguration` et `dossierDeRepli`, exécutables ici.
 *
 * ⚠️ ELLES SONT EXTRAITES ENSEMBLE parce que la première appelle la seconde,
 * et c'est justement l'articulation des deux qui a été fausse pendant tout le
 * premier tour. `app`, `process` et `inscriptible` sont fournis par le test :
 * c'est la seule façon de faire jouer, sans Electron, les cas qui comptent —
 * dossier du portable en lecture seule, `.exe` sous Program Files, `getPath`
 * qui lève.
 */
const DEPOT_FICTIF = 'X:\\depot';

function dossierAvec(cas) {
    const inscriptible = (d) => !!d && (cas.inscriptibles || []).indexOf(d) >= 0;
    const app = {
        isPackaged: !!cas.packaged,
        getPath: (quoi) => {
            if (quoi === 'exe') return cas.cheminExe;
            if (quoi === 'userData') {
                if (cas.userData === 'LEVE') throw new Error('userData indisponible');
                return cas.userData;
            }
            if (quoi === 'temp') {
                if (cas.temp === 'LEVE') throw new Error('temp indisponible');
                return cas.temp;
            }
            throw new Error('chemin inattendu : ' + quoi);
        }
    };
    const fauxProcess = {
        env: cas.portable ? { PORTABLE_EXECUTABLE_DIR: cas.portable } : {},
        pid: 4242
    };
    const repli = extraireFonction(MAIN, 'dossierDeRepli',
        { app: app, __dirname: DEPOT_FICTIF });
    return extraireFonction(MAIN, 'dossierDeConfiguration', {
        app: app,
        process: fauxProcess,
        inscriptible: inscriptible,
        dossierDeRepli: repli,
        __dirname: DEPOT_FICTIF
    })();
}

// ═════════════════════════════════════════════════════════════════════
describe('★★ une seule règle de résolution, pas deux copies', () => {

    /**
     * ⚠️ Si le processus principal réimplémentait l'ordre de résolution, il
     * divergerait de la page au premier changement — et le désaccord serait
     * invisible : chacun aurait raison de son côté.
     */
    it('★★ main.js REQUIERT le module partagé', () => {
        expect(MAIN_CODE).toMatch(/require\(['"]\.\/js\/utils\/posteConfig\.js['"]\)/);
    });

    it('★★ main.js ne réimplémente pas l’ordre lui-même', () => {
        // La marque d'une réimplémentation : lire les deux variables et choisir.
        // main.js ne doit plus lire MAGBO_API_URL / MAGBO_SECTOR du tout — c'est
        // `posteConfig.resoudre` qui reçoit `process.env` et tranche.
        expect(MAIN_CODE).not.toMatch(/process\.env\.MAGBO_API_URL/);
        expect(MAIN_CODE).not.toMatch(/process\.env\.MAGBO_SECTOR/);
        expect(MAIN_CODE).toMatch(/posteConfig\.resoudre\(/);
    });

    /**
     * ⚠️ Le module partagé doit rester chargeable par Node. S'il se mettait à
     * toucher `window` ou `document` au chargement, `main.js` ne démarrerait
     * plus — et la panne serait au lancement, sur chaque poste.
     */
    it('★★ le module partagé se charge vraiment côté Node', async () => {
        const PC = (await import('../js/utils/posteConfig.js')).default;
        expect(typeof PC.resoudre).toBe('function');
        expect(PC.NOM_FICHIER).toBe('magbo-poste.json');
    });
});

// ═════════════════════════════════════════════════════════════════════
describe('★★ le fichier va à côté du .exe, jamais dans le temporaire', () => {

    /**
     * ⚠️ LE PIÈGE DU PORTABLE. Un `.exe` portable s'auto-extrait dans un
     * dossier temporaire : `process.execPath` et `app.getPath('exe')` pointent
     * là, et ce dossier est effacé à la fermeture. Un fichier écrit là
     * disparaîtrait, et l'écran de configuration reviendrait à CHAQUE
     * ouverture.
     *
     * `electron-builder` pose `PORTABLE_EXECUTABLE_DIR` — vérifié à la source
     * dans ce dépôt : `node_modules/app-builder-lib/templates/nsis/portable.nsi`
     * fait `SetEnvironmentVariable("PORTABLE_EXECUTABLE_DIR", "$EXEDIR")`.
     */
    it('★★ PORTABLE_EXECUTABLE_DIR est consulté, et EN PREMIER', () => {
        expect(MAIN_CODE).toMatch(/PORTABLE_EXECUTABLE_DIR/);

        const iPortable = MAIN_CODE.indexOf('PORTABLE_EXECUTABLE_DIR');
        const iExe = MAIN_CODE.indexOf("getPath('exe')");
        expect(iPortable).toBeGreaterThan(-1);
        expect(iExe).toBeGreaterThan(-1);
        expect(iPortable,
            'le dossier du portable doit être consulté AVANT getPath(\'exe\'), '
            + 'sinon le réglage part dans le temporaire et disparaît').toBeLessThan(iExe);
    });

    /**
     * ⚠️ Sous NSIS, le .exe vit dans `Program Files` — non inscriptible sans
     * élévation. Écrire là échouerait à chaque enregistrement. On vérifie
     * l'écriture avant de choisir, et on retombe sur `userData`.
     *
     * ⚠️ CE TEST A DÉJÀ ÉTÉ VIDE DE SON SENS UNE FOIS. Il se contentait de
     * `expect(MAIN_CODE).toMatch(/accessSync/)` : il ne disait pas où
     * `accessSync` était appelé, ni sur quoi, ni ce qu'on faisait du résultat.
     * Un `fs.accessSync` oublié dans une fonction sans rapport l'aurait laissé
     * vert. Pire, il exigeait précisément l'appel qu'il a fallu SUPPRIMER —
     * voir plus bas. Ici on exécute la sonde pour de vrai.
     * (Panel de revue — qualité, 02/09/2026.)
     */
    it('★★ la sonde d’écriture ÉCRIT VRAIMENT — et ne laisse rien derrière elle', () => {
        const sonder = extraireFonction(MAIN, 'inscriptible');

        const dossierReel = fs.mkdtempSync(path.join(os.tmpdir(), 'magbo-sonde-'));
        expect(sonder(dossierReel)).toBe(true);
        // Une sonde qui laisse son fichier salirait le dossier du .exe à
        // chaque ouverture — le premier endroit que quelqu'un regarde.
        expect(fs.readdirSync(dossierReel)).toEqual([]);
        fs.rmSync(dossierReel, { recursive: true, force: true });

        expect(sonder(path.join(os.tmpdir(), 'magbo-inexistant-' + Date.now()))).toBe(false);
        // ⚠️ `PORTABLE_EXECUTABLE_DIR` peut ne pas être posé du tout : la
        // sonde reçoit alors `undefined` et ne doit pas lever — sinon le
        // canal synchrone du preload reste sans réponse, fenêtre blanche.
        expect(sonder(undefined)).toBe(false);
        expect(sonder('')).toBe(false);
    });

    /**
     * ⚠️ `fs.accessSync(dir, W_OK)` NE DIT PAS LA VÉRITÉ SOUS WINDOWS pour un
     * RÉPERTOIRE : libuv n'y consulte que l'attribut `FILE_ATTRIBUTE_READONLY`,
     * qui n'a pas de sens sur un dossier, et ignore les ACL NTFS. Sur une
     * installation dans `Program Files`, il répondait donc « oui » à un
     * utilisateur non-administrateur : le repli vers `userData` n'était jamais
     * choisi et l'écriture échouait plus tard en EPERM.
     */
    it('★★ la décision ne repose PAS sur accessSync', () => {
        expect(MAIN_CODE).not.toMatch(/accessSync/);
        expect(MAIN_CODE).toMatch(/userData/);
    });

    it('la source de vérité du nom de fichier est le module, pas une chaîne', () => {
        expect(MAIN_CODE).toMatch(/posteConfig\.NOM_FICHIER/);
        expect(MAIN_CODE).not.toMatch(/['"]magbo-poste\.json['"]/);
    });
});

// ═════════════════════════════════════════════════════════════════════
describe('★★ rien ne peut empêcher un poste de s’ouvrir', () => {

    /**
     * ⚠️ Un poste qui ne s'ouvre pas est pire qu'un poste qui pose une
     * question. Fichier absent, illisible, JSON cassé, dossier en lecture
     * seule : tout cela doit produire un ÉTAT, jamais une exception au
     * démarrage.
     */
    it('★★ la lecture du fichier est sous try/catch', () => {
        const bloc = MAIN_CODE.match(/function lireFichier\(\)[\s\S]*?\n}/);
        expect(bloc, 'lireFichier introuvable').toBeTruthy();
        expect(bloc[0]).toMatch(/try\s*\{/);
        expect(bloc[0]).toMatch(/catch/);
    });

    it('★★ l’écriture du fichier est sous try/catch', () => {
        const bloc = MAIN_CODE.match(/function ecrireFichier\([\s\S]*?\n}/);
        expect(bloc, 'ecrireFichier introuvable').toBeTruthy();
        expect(bloc[0]).toMatch(/try\s*\{/);
        expect(bloc[0]).toMatch(/catch/);
    });

    it('★ le dossier de configuration ne peut pas lever non plus', () => {
        // `getPath('userData')` PEUT lever ; sans filet, l'exception remontait
        // jusqu'au canal synchrone du preload, qui ne répondait alors jamais.
        expect(() => dossierAvec({
            packaged: true, cheminExe: 'C:\\Program Files\\MAGBO\\m.exe',
            inscriptibles: [], userData: 'LEVE', temp: 'C:\\Temp'
        })).not.toThrow();
    });
});

// ═════════════════════════════════════════════════════════════════════
describe('★★ où va le fichier — exécuté, pas relu', () => {

    it('portable, dossier inscriptible → à côté du .exe', () => {
        expect(dossierAvec({
            portable: 'E:\\MAGBO', packaged: true,
            cheminExe: 'C:\\Temp\\2F3A\\m.exe',
            inscriptibles: ['E:\\MAGBO', 'C:\\Temp\\2F3A'],
            userData: 'C:\\Users\\x\\AppData\\Roaming\\MAGBO'
        })).toBe('E:\\MAGBO');
    });

    /**
     * ⚠️★★ LE DÉFAUT DU PREMIER TOUR, ET IL ÉTAIT SILENCIEUX.
     *
     * Clé USB verrouillée, partage réseau, `.exe` déposé dans Program Files :
     * la sonde échouait sur le dossier du portable, et le code descendait vers
     * `path.dirname(app.getPath('exe'))` — qui, en portable, EST le dossier
     * d'auto-extraction temporaire. Celui-là est inscriptible, donc il était
     * choisi, donc le réglage y était écrit… et effacé à la fermeture.
     * L'opérateur voyait « enregistré », puis l'écran de configuration revenir
     * tous les matins, et les deux pistes de diagnostic du guide — « à côté du
     * .exe » puis « dans AppData » — menaient toutes les deux au vide.
     * (Panel de revue — opérateur, 2e tour, 02/09/2026.)
     */
    it('★★ portable, dossier en lecture seule → userData, JAMAIS le temporaire', () => {
        const ou = dossierAvec({
            portable: 'E:\\MAGBO', packaged: true,
            cheminExe: 'C:\\Temp\\2F3A\\m.exe',
            inscriptibles: ['C:\\Temp\\2F3A'],          // seul le temporaire l'est
            userData: 'C:\\Users\\x\\AppData\\Roaming\\MAGBO'
        });
        expect(ou).toBe('C:\\Users\\x\\AppData\\Roaming\\MAGBO');
        expect(ou).not.toContain('Temp');
    });

    it('développement → la racine du dépôt', () => {
        expect(dossierAvec({ packaged: false, inscriptibles: [] })).toBe(DEPOT_FICTIF);
    });

    it('installé (NSIS), dossier du .exe inscriptible → à côté du .exe', () => {
        expect(dossierAvec({
            packaged: true, cheminExe: 'C:\\MAGBO\\m.exe',
            inscriptibles: ['C:\\MAGBO'],
            userData: 'C:\\Users\\x\\AppData'
        })).toBe('C:\\MAGBO');
    });

    it('installé sous Program Files → userData', () => {
        expect(dossierAvec({
            packaged: true, cheminExe: 'C:\\Program Files\\MAGBO\\m.exe',
            inscriptibles: [], userData: 'C:\\Users\\x\\AppData'
        })).toBe('C:\\Users\\x\\AppData');
    });

    /**
     * ⚠️ Le dernier filet ne peut pas être `__dirname` : dans un `.exe`
     * empaqueté, c'est `…/resources/app.asar`, qui n'est pas un vrai dossier et
     * n'est pas inscriptible. Le réglage ne survivra pas au redémarrage, mais
     * l'application s'ouvre et pose sa question — ce qui vaut mieux qu'une
     * fenêtre blanche.
     */
    it('★ userData indisponible → le temporaire, pas l’asar', () => {
        expect(dossierAvec({
            packaged: true, cheminExe: 'C:\\Program Files\\MAGBO\\m.exe',
            inscriptibles: [], userData: 'LEVE', temp: 'C:\\Temp'
        })).toBe('C:\\Temp');
    });
});

// ═════════════════════════════════════════════════════════════════════
describe('★★ ce qu’une suppression d’une ligne doit faire rougir', () => {

    /**
     * ⚠️ CES GARDES SONT NÉS D'UNE MESURE. Au 2e tour, huit mutations d'une
     * ligne ont été appliquées à `main.js`, `preload.js`, `js/App.js` et à
     * l'écran, puis la suite entière relancée : **tout est resté vert**. Trois
     * de ces mutations défaisaient des corrections du premier tour. Ce ne sont
     * que des gardes de FORME — ils ne prouvent pas le comportement, ils
     * empêchent qu'une ligne disparaisse sans bruit dans un merge.
     */
    it('★★ la page est rechargée après un enregistrement', () => {
        // Sans cela, cinq `const API_BASE` figés au chargement continuent de
        // parler à l'ANCIENNE adresse pour toute la session : écran vide juste
        // après un test réussi, sans erreur.
        expect(MAIN_CODE).toMatch(/webContents\.reload\(\)/);
    });

    it('★★ le quiosque est réarmé après un enregistrement', () => {
        expect(MAIN_CODE).toMatch(/setKiosk\(true\)/);
        expect(MAIN_CODE).toMatch(/setFullScreen\(true\)/);
    });

    it('★★ le document ne peut pas reprendre le titre de la fenêtre', () => {
        // `index.html` pose un <title> ; sans ce garde-fou, `titreFenetre()`
        // n'a aucun effet et le poste n'apparaît nulle part.
        expect(MAIN_CODE).toMatch(/page-title-updated/);
        expect(MAIN_CODE).toMatch(/preventDefault/);
    });

    it('★★ le verdict de verrouillage vient du module partagé, aux DEUX endroits', () => {
        // Le premier tour n'avait corrigé que la fenêtre ; les raccourcis
        // globaux confisquaient encore les touches de tout le système.
        const appels = MAIN_CODE.match(/posteConfig\.verrouillable\(/g) || [];
        expect(appels.length).toBeGreaterThanOrEqual(2);
        expect(MAIN_CODE).not.toMatch(/kiosk:\s*IS_PRODUCTION/);
    });

    it('★★ ce qui est écrit est relu avant de répondre « enregistré »', () => {
        expect(MAIN_CODE).toMatch(/posteConfig\.utilisable\(/);
        expect(MAIN_CODE).toMatch(/nouvelle\.doitConfigurer/);
    });

    it('★★ l’écran de première configuration a une sortie', () => {
        expect(MAIN_CODE).toMatch(/ipcMain\.handle\(\s*'quitter-application'/);
        expect(PRELOAD_CODE).toMatch(/quitter:/);
    });

    it('★ le preload prévient la page quand la voie asynchrone a rattrapé', () => {
        expect(PRELOAD_CODE).toMatch(/magbo-config-prete/);
        expect(APP_CODE).toMatch(/magbo-config-prete/);
    });

    it('★ la page décide par le module partagé, pas par une copie de la règle', () => {
        expect(APP_CODE).toMatch(/MagboPosteConfig\.resoudreDuPont\(/);
    });
});

// ═════════════════════════════════════════════════════════════════════
describe('★★ la compatibilité du parc, gardée dans le câblage', () => {

    /**
     * ⚠️ LE REFUS D'ÉCRIRE EN MODE ENVIRONNEMENT. Sans lui, un administrateur
     * corrigerait l'adresse à l'écran, verrait « enregistré », et retrouverait
     * l'ancienne valeur à la réouverture — parce que le `.bat` la repose. Un
     * « enregistré » qui ment coûte plus cher que l'impossibilité d'enregistrer.
     */
    it('★★ l’enregistrement REFUSE quand un .bat gouverne le poste', () => {
        const bloc = MAIN_CODE.match(/enregistrer-config-poste[\s\S]*?\n\}\);/);
        expect(bloc, 'le handler introuvable').toBeTruthy();
        expect(bloc[0]).toMatch(/SOURCES\.ENVIRONNEMENT/);
        expect(bloc[0]).toMatch(/environnement/);
        // Le refus doit précéder l'écriture, sinon il ne refuse rien.
        expect(bloc[0].indexOf('SOURCES.ENVIRONNEMENT'))
            .toBeLessThan(bloc[0].indexOf('ecrireFichier'));
    });
});

// ═════════════════════════════════════════════════════════════════════
describe('★★ la course qui envoyait tout le monde sur localhost', () => {

    /**
     * ⚠️★★ LE DÉFAUT QUE CE CHANTIER A TROUVÉ EN CHEMIN.
     *
     * Huit fichiers de `js/` lisent l'adresse AU CHARGEMENT DU SCRIPT :
     *     const API_BASE = ((window.magboConfig?.getCached?.()?.apiUrl)
     *                       || 'http://localhost:8080') + '/api';
     *
     * `preload.js` remplissait ce cache par un `invoke` ASYNCHRONE qu'il
     * n'attendait pas. Quand la réponse arrivait après le premier script,
     * `getCached()` rendait `null` et TOUTE l'application partait sur
     * localhost — écran vide, aucune erreur, sur un poste correctement
     * configuré. Le `.bat` n'y pouvait rien : la course était la même avec lui.
     *
     * Revenir à `invoke` sans attendre ressusciterait le défaut en silence.
     */
    it('★★ preload.js lit la configuration de façon SYNCHRONE', () => {
        expect(PRELOAD_CODE).toMatch(/sendSync\(['"]get-config-sync['"]\)/);

        const iSync = PRELOAD_CODE.indexOf('sendSync');
        const iExpose = PRELOAD_CODE.indexOf('exposeInMainWorld');
        expect(iSync,
            'la lecture synchrone doit précéder l\'exposition du pont : sinon '
            + 'getCached() peut être lu avant d\'être rempli').toBeLessThan(iExpose);
    });

    it('★★ main.js sert bien ce canal synchrone', () => {
        expect(MAIN_CODE).toMatch(/ipcMain\.on\(['"]get-config-sync['"]/);
        expect(MAIN_CODE).toMatch(/event\.returnValue/);
    });

    /**
     * ⚠️ Le repli `localhost` des huit fichiers de `js/` n'est pas retiré : il
     * reste le dernier filet si le pont n'existe pas du tout (page ouverte hors
     * Electron). Mais il ne doit JAMAIS être atteint sur un vrai poste — et il
     * n'a rien à faire dans le processus principal, qui connaît la vraie
     * adresse.
     */
    it('★ ni main.js ni preload.js ne mentionnent localhost', () => {
        expect(MAIN_CODE).not.toMatch(/localhost/);
        expect(PRELOAD_CODE).not.toMatch(/localhost/);
    });
});

// ═════════════════════════════════════════════════════════════════════
describe('la ligne de journal qui vaut une visite sur place', () => {

    /**
     * ⚠️ Quand un poste « n'a pas de données », la première question est
     * toujours « quelle adresse utilise-t-il, et d'où la tient-il ? ». Cette
     * ligne y répond sans se déplacer, et c'est elle qui a servi à prouver les
     * trois branches contre l'application réelle.
     */
    it('★ le démarrage journalise le poste, l’adresse ET la source', () => {
        expect(MAIN_CODE).toMatch(/\[MAGBO\]/);
        // ⚠️ La ligne est écrite sur DEUX littéraux concaténés (elle ne tient
        // pas en 100 colonnes). On capture donc l'appel entier jusqu'au `);`,
        // pas le premier gabarit — sinon le test mesure la mise en page du
        // code au lieu du contenu du message.
        const appel = MAIN_CODE.match(/console\.log\(`\[MAGBO\][\s\S]*?\);/);
        expect(appel, 'la ligne de démarrage introuvable').toBeTruthy();
        for (const champ of ['poste=', 'serveur=', 'source=', 'fichier=']) {
            expect(appel[0], `le champ ${champ} manque`).toContain(champ);
        }
    });
});

// ═════════════════════════════════════════════════════════════════════
describe('l’écran et sa permission', () => {

    it('★★ l’onglet « Poste » est derrière CONFIG_WRITE, pas visible à tous', () => {
        const modal = sansCommentaires(lire('js/components/AppSettingsModal.js'));
        const i = modal.indexOf("open-poste-config");
        expect(i, 'le bouton de l\'onglet Poste introuvable').toBeGreaterThan(-1);

        // Le bouton doit être dans un bloc gardé par `podeConfig`.
        const avant = modal.slice(Math.max(0, i - 400), i);
        expect(avant,
            'le bouton doit être rendu conditionnellement par podeConfig — sinon '
            + 'un opérateur peut changer le poste par mégarde').toMatch(/podeConfig\s*&&/);
    });

    it('★ le même composant sert la première configuration et la correction', () => {
        const app = sansCommentaires(lire('js/App.js'));
        const occurrences = app.match(/<PremierLancement/g) || [];
        expect(occurrences.length,
            'deux composants distincts divergeraient au premier changement de libellé')
            .toBe(2);
        expect(app).toMatch(/mode="premier"/);
        expect(app).toMatch(/mode="correction"/);
    });

    /**
     * ⚠️ L'écran passe AVANT le login, et ce n'est pas un choix : sans adresse
     * de serveur, il n'y a personne à qui demander un mot de passe.
     */
    it('★★ l’écran de première configuration précède l’écran de connexion', () => {
        const app = sansCommentaires(lire('js/App.js'));
        const iPoste = app.indexOf('poste.doitConfigurer');
        const iLogin = app.indexOf('<LoginScreen');
        expect(iPoste).toBeGreaterThan(-1);
        expect(iLogin).toBeGreaterThan(-1);
        expect(iPoste,
            'sans adresse de serveur, il n\'y a personne à qui demander un mot de passe')
            .toBeLessThan(iLogin);
    });
});

// ═════════════════════════════════════════════════════════════════════
describe('★★ le titre de la fenêtre — exécuté, pas relu', () => {

    /**
     * ⚠️ LE TITRE EST LE SEUL ENDROIT OÙ LE POSTE CHOISI SE VOIT. Aucun
     * fichier de `js/` ne lit `config.sector` : il ne pilote rien d'autre.
     * C'est précisément pour cela qu'il doit être honnête — « MAGBO Access
     * Control — PORT1 » sur le PC de la direction finit par faire croire que
     * ce PC enregistre des passages au portail.
     */
    const titreAvec = (config) => extraireFonction(MAIN, 'titreFenetre', {
        configurationCourante: () => config,
        posteConfig: require('../js/utils/posteConfig.js')
    })();

    it('un poste réglé porte son code', () => {
        expect(titreAvec({ doitConfigurer: false, sector: 'BIBLIO' }))
            .toBe('MAGBO Access Control — BIBLIO');
    });

    it('★★ une machine administrative ne porte AUCUN code de point', () => {
        const titre = titreAvec({ doitConfigurer: false, sector: 'ADMINISTRATIF' });
        expect(titre).toBe('MAGBO Access Control — Poste administratif');
        for (const code of ['PORT1', 'PORT2', 'PORT3', 'BIBLIO', 'ENFERM', 'REFEI1', 'REFEI2']) {
            expect(titre).not.toContain(code);
        }
    });

    /**
     * ⚠️ ET IL N'EST PAS NU. Un titre réduit à « MAGBO Access Control » ne se
     * distinguerait pas de celui d'un poste pas encore réglé : on ne saurait
     * plus, en regardant la fenêtre, si la machine est administrative ou si
     * quelqu'un a effacé son fichier de configuration.
     */
    it('★★ et il ne se confond pas avec un poste pas encore réglé', () => {
        const administratif = titreAvec({ doitConfigurer: false, sector: 'ADMINISTRATIF' });
        const pasReglé = titreAvec({ doitConfigurer: true, sector: '' });
        expect(pasReglé).toBe('MAGBO Access Control');
        expect(administratif).not.toBe(pasReglé);
    });

    it('★ la comparaison passe par le module partagé, pas par une chaîne recopiée', () => {
        // Deux copies d'une comparaison, c'est une copie qu'on oublie — la
        // leçon du verrouillage de quiosque, au chantier précédent.
        expect(MAIN_CODE).toMatch(/posteConfig\.estAdministratif\(/);
        expect(MAIN_CODE).not.toMatch(/===\s*['"]ADMINISTRATIF['"]/);
    });
});

// ═════════════════════════════════════════════════════════════════════
describe('★★ un fichier écrit à la main reste lisible', () => {

    /**
     * ⚠️★★ UNE MARQUE D'ORDRE DES OCTETS FAIT PERDRE LE RÉGLAGE EN SILENCE,
     * et le guide conduit droit dedans. La section 7 fait ouvrir
     * `magbo-poste.json` au Bloc-notes pour corriger l'adresse quand la VM a
     * déménagé. « UTF-8 avec BOM » place U+FEFF en tête, « Unicode » écrit de
     * l'UTF-16 — et la redirection `>` de PowerShell 5.1 aussi (mesuré sur le
     * shell de l'école : `FF FE 7B 00`). `JSON.parse` refuse les trois,
     * `lireFichier` rendait `null`, et le poste reposait sa question à chaque
     * ouverture sans qu'aucun message ne dise pourquoi.
     *
     * Trouvé par accident : la première mesure du titre de fenêtre rendait le
     * même titre pour les trois configurations, parce que le harnais avait
     * écrit les trois fichiers avec un BOM. La mesure était fausse ; le
     * défaut qu'elle a révélé ne l'était pas. Une première correction ne
     * traitait que l'UTF-8 et nommait le mauvais outil — le panel a reproduit
     * les deux autres cas.
     *
     * ⚠️ Ce défaut est ANTÉRIEUR au poste administratif et n'a rien à voir
     * avec lui — il vit dans son propre commit, détachable.
     */
    let avertissements = [];
    const lireAvec = (chemin) => {
        avertissements = [];
        return extraireFonction(MAIN, 'lireFichier', {
            cheminDuFichier: () => chemin,
            decoderTexte: extraireFonction(MAIN, 'decoderTexte'),
            posteConfig: require('../js/utils/posteConfig.js'),
            console: { warn: (m) => avertissements.push(String(m)) }
        })();
    };

    const ecrire = (nom, octets) => {
        const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'magbo-bom-'));
        const chemin = path.join(dossier, nom);
        fs.writeFileSync(chemin, octets);
        return chemin;
    };

    const CORPS = '{"apiUrl":"http://192.168.1.253:8080","sector":"BIBLIO","version":1}';

    it('sans BOM — le cas que le programme écrit lui-même', () => {
        const lu = lireAvec(ecrire('magbo-poste.json', Buffer.from(CORPS, 'utf8')));
        expect(lu).not.toBeNull();
        expect(lu.sector).toBe('BIBLIO');
    });

    it('★★ UTF-8 avec BOM — « Enregistrer sous » du Bloc-notes, Out-File -Encoding utf8', () => {
        const avecBom = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(CORPS, 'utf8')]);
        const lu = lireAvec(ecrire('magbo-poste.json', avecBom));
        expect(lu).not.toBeNull();
        expect(lu.sector).toBe('BIBLIO');
    });

    it('★★ UTF-16 LE — la redirection `>` de PowerShell 5.1, « Unicode » du Bloc-notes', () => {
        const utf16le = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(CORPS, 'utf16le')]);
        const lu = lireAvec(ecrire('magbo-poste.json', utf16le));
        expect(lu).not.toBeNull();
        expect(lu.sector).toBe('BIBLIO');
    });

    it('★ UTF-16 BE — « Unicode big endian » du Bloc-notes', () => {
        const utf16be = Buffer.concat([Buffer.from([0xFE, 0xFF]), Buffer.from(CORPS, 'utf16le').swap16()]);
        const lu = lireAvec(ecrire('magbo-poste.json', utf16be));
        expect(lu).not.toBeNull();
        expect(lu.sector).toBe('BIBLIO');
    });

    it('un fichier vraiment cassé rend toujours null — on redemande, on ne lève pas', () => {
        expect(lireAvec(ecrire('magbo-poste.json', Buffer.from('{ ceci n’est pas du JSON', 'utf8')))).toBeNull();
        expect(lireAvec(path.join(os.tmpdir(), 'magbo-inexistant-' + CORPS.length + '.json'))).toBeNull();
    });

    /**
     * ⚠️ « ABSENT » ET « ILLISIBLE » NE DOIVENT PLUS SE RESSEMBLER. Avant,
     * le journal disait `source=aucune` dans les deux cas et le catch ne
     * disait rien : personne ne pouvait savoir qu'un fichier existait mais ne
     * se lisait pas. Le fichier absent reste silencieux — c'est le cas normal
     * d'un PC neuf.
     */
    it('★★ un fichier illisible laisse UNE ligne — jamais son contenu ; un fichier absent, aucune', () => {
        const casse = ecrire('magbo-poste.json', Buffer.from('{ "apiUrl": "SECRET-QUI-NE-DOIT-PAS-SORTIR"', 'utf8'));
        expect(lireAvec(casse)).toBeNull();
        expect(avertissements).toHaveLength(1);
        expect(avertissements[0]).toContain('magbo-poste.json');
        expect(avertissements[0]).toContain(casse);
        expect(avertissements[0]).not.toContain('SECRET-QUI-NE-DOIT-PAS-SORTIR');

        expect(lireAvec(path.join(os.tmpdir(), 'magbo-absent-' + CORPS.length + '.json'))).toBeNull();
        expect(avertissements).toHaveLength(0);
    });
});
