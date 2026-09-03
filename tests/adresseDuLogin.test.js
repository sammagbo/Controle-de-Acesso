// =====================================================================
// L'ADRESSE SUR LAQUELLE PART LA CONNEXION
// =====================================================================
// ⚠️ CE FICHIER EXISTE À CAUSE D'UNE PANNE DE PRODUCTION DU 03/09/2026.
//
// Le portable reconstruit depuis `main` affichait « Identifiants invalides »
// avec le BON mot de passe, sur un serveur qui répondait. Mesuré dans
// l'Electron réel : la requête partait sur
//
//       http://192.168.1.253:8080/api/api/auth/login
//                                 ^^^^ ^^^^
//
// Spring Security refusait ce chemin (403, il n'est pas en `permitAll`), la
// requête n'atteignait JAMAIS `AuthController`, et `js/utils/auth.js`
// traduisait ce 403 en « Identifiants invalides ». Toute l'école était
// bloquée à l'écran de connexion par un `/api` en trop.
//
// ─────────────────────────────────────────────────────────────────────
// POURQUOI CE TEST DOIT CHARGER `js/api.js` — ET POURQUOI SANS LUI IL NE
// PROUVERAIT RIEN
//
// La cause racine est une croyance fausse écrite en toutes lettres dans le
// code : un commentaire de `js/utils/auth.js` affirmait que
// `window.API_BASE_URL` « n'est affecté NULLE PART dans le dépôt », au motif
// qu'un `const` de premier niveau va dans l'environnement lexical global et
// non en propriété de `window`.
//
// C'est vrai d'un `<script>` ordinaire. Ce n'en est pas un.
// `js/api.js` est chargé en `<script type="text/babel">` (index.html:73) :
// Babel le transpile AVANT de l'exécuter, `env` ramène le `const` à un `var`,
// et un `var` de premier niveau EST une propriété de `window`. La globale
// existe donc bel et bien, et sa valeur se termine DÉJÀ par `/api`.
//
// Un test qui poserait `window.API_BASE_URL` à la main prouverait seulement
// que l'auteur du test y croyait. Celui-ci fait passer le vrai fichier par le
// vrai Babel vendorisé, dans le vrai ordre de `index.html` : la globale
// apparaît toute seule, ou le premier test échoue et nous apprend que le
// mécanisme a changé.
//
// ⚠️ `js/utils/auth.js` est évalué SANS Babel, parce que `index.html:65` le
// charge en `<script>` SIMPLE — c'est l'un des rares fichiers de `js/` dans ce
// cas. Le transpiler ici testerait un autre programme que celui qui tourne.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(REPO, ...p), 'utf8');
const evaluerAuNiveauGlobal = (code) => (0, eval)(code);

// L'adresse réelle du poste administratif, telle que `magbo-poste.json` la
// portait le jour de la panne. Un port explicite : une erreur de segment se
// verrait moins bien sur une adresse sans port.
const RACINE = 'http://192.168.1.253:8080';

/** Le pont Electron, tel que `preload.js` l'expose au renderer. */
function poserLePontElectron() {
      const config = { apiUrl: RACINE, sector: 'ADMINISTRATIF', version: 1 };
      window.magboConfig = {
            getConfig: () => Promise.resolve(config),
            getCached: () => config,
            enregistrerPoste: () => Promise.resolve({ ok: true, config }),
            quitter: () => { },
      };
}

let charger;

beforeAll(() => {
      evaluerAuNiveauGlobal(lire('libs', 'babel-standalone-8.0.4.min.js'));

      // Les options EXACTES des balises `text/babel` de la page. Voir le long
      // commentaire de tests/premierLancement.test.js : avec les réglages par
      // défaut, Babel 8 choisit le runtime automatique et émet un `import`
      // que la page n'exécute jamais.
      charger = (...chemin) => evaluerAuNiveauGlobal(
            globalThis.Babel.transform(lire(...chemin), {
                  presets: [['react', { runtime: 'classic' }], 'env'],
                  sourceType: 'script'
            }).code);

      poserLePontElectron();

      // ── L'ordre de `index.html`, et il compte ────────────────────────
      // i18n.js (:60, babel) — les messages d'erreur d'`auth.js` en dépendent.
      charger('js', 'utils', 'i18n.js');
      // auth.js (:65, <script> SIMPLE, donc pas de Babel).
      evaluerAuNiveauGlobal(lire('js', 'utils', 'auth.js'));
      // api.js (:73, babel) — c'est LUI qui publie la globale, sans le vouloir.
      charger('js', 'api.js');
      // userCache.js (:116, babel) — fige son adresse au CHARGEMENT.
      charger('js', 'utils', 'userCache.js');

      // Sous jsdom, `globalThis` et `window` ne sont pas toujours le même
      // objet ; dans un navigateur, si. On rétablit l'égalité que la page a,
      // pour les seuls symboles que les fichiers viennent de déclarer.
      for (const nom of ['MagboI18n', 'auth', 'api', 'userCache', 'authHeaders', 'API_BASE_URL']) {
            if (window[nom] === undefined && globalThis[nom] !== undefined) window[nom] = globalThis[nom];
      }
      window.MagboI18n.setLang('fr');
});

// ── Un serveur d'essai qui note ce qu'on lui demande ──────────────────

let urlsVues;
let reponseDuServeur;

beforeEach(() => {
      urlsVues = [];
      reponseDuServeur = {
            ok: true,
            status: 200,
            json: async () => ({
                  token: 'jeton-de-test', username: 'admin', nomeCompleto: 'Test',
                  role: 'ADMIN', setoresPermitidos: '*', permissoes: '*'
            })
      };
      const espion = vi.fn(async (url) => { urlsVues.push(String(url)); return reponseDuServeur; });
      globalThis.fetch = espion;
      window.fetch = espion;
});

afterEach(() => { vi.restoreAllMocks(); });

describe("la prémisse : ce que la page publie réellement sur window", () => {
      // ⚠️ Ce test ne garde pas la correction — il garde la RAISON de la
      // correction. Le jour où quelqu'un réécrira `js/api.js` autrement, ou
      // changera le préréglage de Babel, c'est ici qu'il l'apprendra, et non
      // en production sur l'écran de connexion de toute une école.
      it("js/api.js publie window.API_BASE_URL, et elle se termine DÉJÀ par /api", () => {
            const valeur = window.API_BASE_URL !== undefined
                  ? window.API_BASE_URL : globalThis.API_BASE_URL;
            expect(typeof valeur).toBe('string');
            expect(valeur).toBe(RACINE + '/api');
      });

      // ⚠️ DEUX ÉCRANS DÉPENDENT DE CET ACCIDENT, et il faut le savoir avant
      // d'assainir js/api.js. `js/components/AdminPinModal.js` et
      // `js/components/UserManagement.js` lisent l'identifiant NU
      // `API_BASE_URL` — la globale publiée sans le vouloir par le `const` de
      // js/api.js. Ils sont corrects aujourd'hui (ils ne redoublent pas le
      // `/api`), mais le jour où quelqu'un enfermera js/api.js dans une IIFE
      // ou le passera en module, la globale disparaît et SIX `fetch`
      // d'administration cassent en silence. Les recâbler sur `window.api`
      // est le vrai correctif ; ce commentaire est là pour qu'on ne
      // l'apprenne pas en production.
      it("le commentaire qui affirmait le contraire ne doit pas revenir", () => {
            const source = lire('js', 'utils', 'auth.js');
            expect(source).not.toMatch(/n'est affecte NULLE PART|nao e atribuida em lugar nenhum/i);
      });
});

describe("l'adresse de la connexion", () => {
      it("part sur <racine>/api/auth/login — avec UN SEUL /api", async () => {
            await window.auth.login('admin', 'peu-importe');

            expect(urlsVues).toHaveLength(1);
            expect(urlsVues[0]).toBe(`${RACINE}/api/auth/login`);
      });

      it("ne double JAMAIS le segment /api — c'est la panne du 03/09/2026", async () => {
            await window.auth.login('admin', 'peu-importe');
            expect(urlsVues[0]).not.toContain('/api/api');
      });

      // ⚠️ CE TEST NE GARDE PAS LA RÉGRESSION DU 03/09 — il garde le REPLI, et
      // il passe à l'identique sur le code d'avant le correctif. Il est ici
      // pour que le repli hors Electron reste un seul `/api`, pas pour prouver
      // la correction : ce sont les deux tests précédents qui la prouvent.
      it("REPLI (ne prouve pas la correction) : hors Electron, localhost avec un seul /api", async () => {
            const pont = window.magboConfig;
            const globale = window.API_BASE_URL;
            try {
                  delete window.magboConfig;
                  window.magboConfig = undefined;
                  window.API_BASE_URL = undefined;
                  await window.auth.login('admin', 'peu-importe');
                  expect(urlsVues[0]).toBe('http://localhost:8080/api/auth/login');
            } finally {
                  window.magboConfig = pont;
                  window.API_BASE_URL = globale;
            }
      });
});

describe("le défaut jumeau : le cache des personnes", () => {
      // Mesuré dans l'Electron réel le 03/09/2026 : une fois la connexion
      // réparée, `GET /api/api/users` répondait 404 — et `reloadUserCache`
      // avale ses erreurs. L'écran s'ouvrait VIDE, sans un mot.
      it("recharge sur <racine>/api/users — avec UN SEUL /api", async () => {
            window.auth.login && await window.auth.login('admin', 'peu-importe');
            urlsVues.length = 0;
            reponseDuServeur = { ok: true, status: 200, json: async () => ({ users: [] }) };

            await window.userCache.reload();

            expect(urlsVues).toHaveLength(1);
            expect(urlsVues[0]).toContain('/api/users');
            expect(urlsVues[0]).not.toContain('/api/api');
      });
});

describe("le message d'erreur ne doit pas mentir sur la nature de la panne", () => {
      // ⚠️ C'est le second défaut de la même panne, et il a coûté la journée
      // de diagnostic : `throw new Error(traduzido || …)` — `traduzido` étant
      // TOUJOURS renseigné dès que l'i18n est chargé, N'IMPORTE QUEL statut
      // non-2xx s'affichait « Identifiants invalides ». Un 403, un 404 et un
      // 500 disaient tous les trois à l'AED que son mot de passe était faux.
      const casNonAuthentification = [
            [403, 'refusé par la sécurité'],
            [404, 'route inexistante'],
            [500, 'panne du serveur'],
      ];

      it('un 401 dit bien que les identifiants sont invalides', async () => {
            reponseDuServeur = { ok: false, status: 401, json: async () => ({ error: 'Credenciais inválidas' }) };
            await expect(window.auth.login('admin', 'mauvais')).rejects.toThrow('Identifiants invalides');
      });

      for (const [statut, quoi] of casNonAuthentification) {
            it(`un ${statut} (${quoi}) ne dit PAS « Identifiants invalides »`, async () => {
                  reponseDuServeur = { ok: false, status: statut, json: async () => ({}) };
                  let message = null;
                  try { await window.auth.login('admin', 'bon'); } catch (e) { message = e.message; }

                  expect(message).not.toBeNull();
                  expect(message).not.toBe('Identifiants invalides');
                  // et il doit porter le statut, pour que le diagnostic soit
                  // possible depuis la capture d'écran d'un AED.
                  expect(message).toContain(String(statut));
            });
      }
});

// =====================================================================
// LA MÊME PANNE, MAIS PAR LA PORTE D'À CÔTÉ : UNE ADRESSE QUI PORTE /api
// =====================================================================
// ⚠️ Le correctif ci-dessus ferme la panne du 03/09 telle qu'elle s'est
// produite — par le CODE. Elle peut revenir par une SAISIE : il suffit qu'un
// poste soit réglé sur « http://…:8080/api ». Le programme ajoute son propre
// `/api`, et on retombe exactement sur `/api/api/auth/login`.
//
// L'écran de premier lancement s'en protège tout seul (il exige un
// `GET {base}/api/health` réussi avant d'activer Enregistrer, donc l'adresse
// doublée échoue au test et le bouton reste fermé). Mais DEUX portes ne
// passent pas par cet écran : la variable `MAGBO_API_URL` d'un `.bat` — qui
// est PRIORITAIRE et n'est jamais testée — et un `magbo-poste.json` édité à la
// main, ce que le guide d'installation invite explicitement à faire.
//
// Les deux traversent `normaliserUrl`. C'est donc là que la coupe est faite.
describe("une adresse réglée avec /api ne peut plus doubler le segment", () => {
      const posteConfig = (() => {
            const src = lire('js', 'utils', 'posteConfig.js');
            const mod = { exports: {} };
            new Function('module', 'exports', 'window', 'console', src)(
                  mod, mod.exports, undefined, { warn() {} });
            return mod.exports;
      })();

      it("retire le /api final — c'est la panne du 03/09 par la voie de la saisie", () => {
            expect(posteConfig.normaliserUrl('http://192.168.1.253:8080/api'))
                  .toBe('http://192.168.1.253:8080');
      });

      it("le retire aussi avec barre finale, sans schéma, et en majuscules", () => {
            expect(posteConfig.normaliserUrl('192.168.1.253:8080/api/'))
                  .toBe('http://192.168.1.253:8080');
            expect(posteConfig.normaliserUrl('http://h:8080/API'))
                  .toBe('http://h:8080');
      });

      it("⚠️ ne touche PAS à un chemin qui commence seulement par api", () => {
            // `/apiX` n'est pas `/api` : couper ici casserait une adresse
            // légitime pour réparer une faute qui n'a pas été commise.
            expect(posteConfig.normaliserUrl('http://h:8080/apiX'))
                  .toBe('http://h:8080/apiX');
      });

      it("garde le reste du chemin quand le serveur vit sous un préfixe", () => {
            expect(posteConfig.normaliserUrl('http://h:8080/magbo/api'))
                  .toBe('http://h:8080/magbo');
      });

      it("★ une adresse déjà correcte n'est pas modifiée", () => {
            expect(posteConfig.normaliserUrl('http://192.168.1.253:8080'))
                  .toBe('http://192.168.1.253:8080');
      });

      it("★ la coupe SE DIT — elle n'est pas silencieuse", () => {
            // Un réglage corrigé sans le dire ne ressemble plus à ce qui a été
            // tapé, et la personne suivante cherche longtemps.
            const src = lire('js', 'utils', 'posteConfig.js');
            const dit = [];
            const mod = { exports: {} };
            new Function('module', 'exports', 'window', 'console', src)(
                  mod, mod.exports, undefined, { warn: (m) => dit.push(String(m)) });
            mod.exports.normaliserUrl('http://h:8080/api');
            expect(dit.join(' ')).toMatch(/\/api/);
      });
});
