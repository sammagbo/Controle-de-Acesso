// =====================================================================
// L'ÉCRAN DE PREMIÈRE CONFIGURATION — RENDU POUR DE VRAI
// =====================================================================
// ⚠️ CE FICHIER EST LE PREMIER DE LA SUITE À RENDRE DU REACT. Il a une
// raison d'exister très précise, et elle a été mesurée : avant lui, on
// pouvait supprimer la ligne
//
//       const peutEnregistrer = !!essai && essai.ok && !!poste && …
//
// — c'est-à-dire la promesse CENTRALE de tout ce chantier, « personne ne
// peut enregistrer une configuration qui ne marche pas sans le savoir » —
// et les 766 tests du frontend restaient verts. Les 44 tests de
// `posteConfig` et `posteConfigMain` couvrent la résolution des trois
// branches et le câblage ; aucun ne touchait au bouton.
// (Panel de revue — qualité, 02/09/2026.)
//
// ⚠️ COMMENT ÇA MARCHE, puisque le projet n'a pas de bundler : on charge
// les MÊMES fichiers que `index.html` — React, ReactDOM et Babel depuis
// `libs/`, jamais depuis npm (ils n'y sont pas, et c'est voulu : R1). Le
// JSX est transformé par le Babel de l'application, pas par un autre. Ce
// que ce test exécute est donc, à la ligne près, ce que le poste exécute.
//
// L'évaluation se fait par `eval` INDIRECT — `(0, eval)(code)` — et pas
// par `new Function` : les fichiers de `js/` déclarent leurs symboles au
// niveau global (`const ACCESS_POINTS`, `function useI18n`,
// `function PremierLancement`), exactement comme un `<script>`. Dans un
// `new Function`, ces déclarations restent enfermées dans la fonction et
// le composant ne voit plus rien.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(REPO, ...p), 'utf8');
const evaluerAuNiveauGlobal = (code) => (0, eval)(code);

let React;
let ReactDOM;

beforeAll(() => {
    // Les bibliothèques de l'application, dans l'ordre de `index.html`.
    evaluerAuNiveauGlobal(lire('libs', 'react-18.3.1.min.js'));
    evaluerAuNiveauGlobal(lire('libs', 'react-dom-18.3.1.min.js'));
    evaluerAuNiveauGlobal(lire('libs', 'babel-standalone-8.0.4.min.js'));

    React = globalThis.React;
    ReactDOM = globalThis.ReactDOM;

    // ⚠️ TOUT `js/` PASSE PAR BABEL, avec les options de
    // `<script type="text/babel">` — copiées du Babel vendorisé lui-même
    // (`[["react",{runtime:"classic"}],"env"]`, sourceType « script »). Deux
    // raisons, et aucune n'est cosmétique :
    //
    //   1. C'est ce que la page fait. Transformer autrement reviendrait à
    //      tester un autre programme. Avec les réglages par DÉFAUT de
    //      `Babel.transform`, la version 8 choisit le « runtime automatique »
    //      et émet `import { jsx } from "react/jsx-runtime"` — que la page
    //      n'exécute jamais, et qui fait échouer l'évaluation.
    //
    //   2. ⚠️ `const` DANS UN `eval` NE SORT PAS DE L'`eval`. C'est la
    //      spécification : les déclarations lexicales d'un eval vivent dans un
    //      environnement déclaratif créé pour lui, même en eval indirect. Sans
    //      passage par `env` (qui ramène `const` à `var`), le
    //      `const ACCESS_POINTS` de `constants.js` disparaissait aussitôt
    //      évalué, la liste des postes du `<select>` était VIDE, et l'écran
    //      semblait refuser d'enregistrer pour une bonne raison. Un faux vert
    //      possible dans l'autre sens : un test qui ne peut pas choisir de
    //      poste prouve moins qu'il n'en a l'air.
    const charger = (...chemin) => evaluerAuNiveauGlobal(
        globalThis.Babel.transform(lire(...chemin), {
            presets: [['react', { runtime: 'classic' }], 'env'],
            sourceType: 'script'
        }).code);

    charger('js', 'utils', 'i18n.js');
    charger('js', 'utils', 'posteConfig.js');
    charger('js', 'utils', 'i18nReact.js');
    charger('js', 'data', 'constants.js');       // ACCESS_POINTS : l'autorité
    charger('js', 'components', 'PremierLancement.js');

    window.MagboI18n = globalThis.MagboI18n;
    window.MagboPosteConfig = globalThis.MagboPosteConfig;
    window.MagboI18n.setLang('fr');
});

// ── Les outils du test ────────────────────────────────────────────────

let conteneur = null;
let racine = null;

// ⚠️ PAS D'`act()` ICI, ET CE N'EST PAS UN RACCOURCI. `libs/react-18.3.1.min.js`
// est le build de PRODUCTION — le seul que le poste charge — et `act` y lève
// « act(...) is not supported in production builds of React ». Utiliser le
// build de développement demanderait de vendoriser un React de plus, que la
// page n'exécute jamais : le test cesserait de prouver quelque chose sur le
// programme livré.
//
// Ce qui remplace `act` :
//   • `flushSync` (présent en production) pour le rendu et pour tout ce qui
//     part d'un événement du DOM ;
//   • `vider()` pour la suite d'un `await` — le rendu concurrent y passe par
//     l'ordonnanceur, qui est une macro-tâche.
const rendreMaintenant = (fn) => ReactDOM.flushSync(fn);

/** Laisse tourner micro-tâches ET ordonnanceur de React. */
async function vider() {
    for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 0));
    }
}

function monter(props = {}) {
    conteneur = document.createElement('div');
    document.body.appendChild(conteneur);
    racine = ReactDOM.createRoot(conteneur);
    rendreMaintenant(() => {
        racine.render(React.createElement(globalThis.PremierLancement, props));
    });
    return conteneur;
}

afterEach(() => {
    if (racine) rendreMaintenant(() => racine.unmount());
    if (conteneur) conteneur.remove();
    racine = null;
    conteneur = null;
    vi.unstubAllGlobals();
});

const t = (cle) => globalThis.MagboI18n.t(cle);

/** Le bouton dont le texte est exactement celui de cette clé. */
function bouton(cle) {
    const attendu = t(cle);
    const trouve = [...conteneur.querySelectorAll('button')]
        .find(b => b.textContent.trim() === attendu);
    return trouve || null;
}

const champAdresse = () => conteneur.querySelector('#poste-adresse');
const champPoste = () => conteneur.querySelector('#poste-choix');
const texte = () => conteneur.textContent;

/** Saisit une adresse comme le ferait quelqu'un au clavier. */
function taper(valeur) {
    rendreMaintenant(() => {
        const input = champAdresse();
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, valeur);
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
}

function choisirPoste(id) {
    rendreMaintenant(() => {
        const select = champPoste();
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLSelectElement.prototype, 'value').set;
        setter.call(select, id);
        select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
}

async function cliquer(el) {
    rendreMaintenant(() => {
        el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await vider();
}

/** Un serveur MAGBO qui répond bien. */
const SERVEUR_OK = () => ({
    ok: true,
    json: async () => ({ service: 'MAGBO Access Control', database: 'CONNECTED' })
});

function poserFetch(implementation) {
    const espion = vi.fn(implementation);
    vi.stubGlobal('fetch', espion);
    return espion;
}

/** Le pont du preload, tel que `preload.js` l'expose. */
function poserPont(enregistrerPoste) {
    window.magboConfig = { enregistrerPoste };
}

beforeEach(() => {
    poserPont(async () => ({ ok: true, config: {} }));
});

// ══════════════════════════════════════════════════════════════════════
describe('L\'écran de première configuration — la promesse centrale', () => {

    it('★★ le bouton d\'enregistrement est FERMÉ tant que le test n\'a pas réussi', async () => {
        poserFetch(SERVEUR_OK);
        monter({ configInitiale: { apiUrl: 'http://192.168.1.253:8080', sector: '' } });

        // Poste choisi, adresse valide — et pourtant : rien n'a été testé.
        choisirPoste('BIBLIO');
        expect(bouton('poste.enregistrer').disabled).toBe(true);

        await cliquer(bouton('poste.test.bouton'));
        expect(bouton('poste.enregistrer').disabled).toBe(false);
    });

    it('★★ un serveur injoignable laisse le bouton fermé et DIT pourquoi', async () => {
        poserFetch(async () => { throw new TypeError('Failed to fetch'); });
        monter({ configInitiale: { apiUrl: 'http://192.168.1.99:8080', sector: '' } });
        choisirPoste('BIBLIO');

        await cliquer(bouton('poste.test.bouton'));

        expect(texte()).toContain(t('poste.test.injoignable'));
        // ⚠️ Le message ne suffit pas : il faut aussi dire QUOI FAIRE. Une
        // AED devant « Aucune réponse » sans la suite appelle le Sam qui
        // n'est plus là.
        expect(texte()).toContain(t('poste.test.quoi.faire'));
        expect(bouton('poste.enregistrer').disabled).toBe(true);
    });

    it('★★ quelque chose qui répond sans être MAGBO ne compte pas comme un succès', async () => {
        // Le cas réel : l'adresse de l'imprimante réseau, ou le HikCentral en
        // .90. Les deux répondent 200 à /api/health avec du JSON.
        poserFetch(async () => ({ ok: true, json: async () => ({ status: 'ok' }) }));
        monter({ configInitiale: { apiUrl: 'http://192.168.1.90:8080', sector: '' } });
        choisirPoste('BIBLIO');

        await cliquer(bouton('poste.test.bouton'));

        expect(texte()).toContain(t('poste.test.pas.magbo'));
        expect(bouton('poste.enregistrer').disabled).toBe(true);
    });

    it('★★ MODIFIER L\'ADRESSE APRÈS UN TEST RÉUSSI REFERME LE BOUTON', async () => {
        poserFetch(SERVEUR_OK);
        monter({ configInitiale: { apiUrl: 'http://192.168.1.253:8080', sector: '' } });
        choisirPoste('BIBLIO');
        await cliquer(bouton('poste.test.bouton'));
        expect(bouton('poste.enregistrer').disabled).toBe(false);

        taper('http://192.168.1.99:8080');

        // Sans cela, on enregistrerait une adresse jamais testée sur la foi
        // du test de la précédente : le défaut exact que l'écran empêche.
        expect(bouton('poste.enregistrer').disabled).toBe(true);
        expect(texte()).toContain(t('poste.test.obligatoire'));
    });

    it('★★ une réponse ARRIVÉE EN RETARD ne valide pas l\'adresse courante', async () => {
        // Le test part sur la bonne adresse ; pendant les six secondes,
        // quelqu'un en tape une autre ; la réponse verte arrive.
        let debloquer;
        const attente = new Promise(r => { debloquer = r; });
        poserFetch(async () => { await attente; return SERVEUR_OK(); });

        monter({ configInitiale: { apiUrl: 'http://192.168.1.253:8080', sector: '' } });
        choisirPoste('BIBLIO');

        await cliquer(bouton('poste.test.bouton'));
        taper('http://192.168.1.99:8080');
        debloquer();
        await vider();

        expect(bouton('poste.enregistrer').disabled).toBe(true);
        expect(texte()).not.toContain(t('poste.test.ok'));
    });

    it('★ sans poste choisi, un test réussi ne suffit pas — et le pied de page NOMME ce qui manque', async () => {
        poserFetch(SERVEUR_OK);
        monter({ configInitiale: { apiUrl: 'http://192.168.1.253:8080', sector: '' } });

        expect(texte()).toContain(t('poste.pas.pret.poste'));

        await cliquer(bouton('poste.test.bouton'));
        expect(bouton('poste.enregistrer').disabled).toBe(true);
        // Le serveur répond : ce qui reste, c'est le poste — et l'écran le dit.
        expect(texte()).toContain(t('poste.pas.pret.poste'));
        expect(texte()).not.toContain(t('poste.pas.pret.test'));
    });

    it('★ poste choisi mais pas testé : le pied de page nomme LE TEST', () => {
        poserFetch(SERVEUR_OK);
        monter({ configInitiale: { apiUrl: 'http://192.168.1.253:8080', sector: '' } });
        choisirPoste('BIBLIO');

        expect(texte()).toContain(t('poste.pas.pret.test'));
        expect(texte()).not.toContain(t('poste.pas.pret.poste'));
    });

    it('★ une base de données muette prévient mais n\'empêche pas d\'enregistrer', async () => {
        poserFetch(async () => ({
            ok: true,
            json: async () => ({ service: 'MAGBO Access Control', database: 'DOWN' })
        }));
        monter({ configInitiale: { apiUrl: 'http://192.168.1.253:8080', sector: '' } });
        choisirPoste('BIBLIO');

        await cliquer(bouton('poste.test.bouton'));

        // L'adresse est bonne ; c'est le serveur qui a un problème. Interdire
        // obligerait à revenir configurer le poste une fois la base réparée.
        expect(texte()).toContain(t('poste.test.ok.base'));
        expect(bouton('poste.enregistrer').disabled).toBe(false);
    });
});

// ══════════════════════════════════════════════════════════════════════
describe('L\'écran — la liste des postes', () => {

    it('★★ les postes viennent d\'ACCESS_POINTS et portent le nom que les gens disent', () => {
        poserFetch(SERVEUR_OK);
        monter({ configInitiale: { apiUrl: 'http://192.168.1.253:8080', sector: '' } });

        const options = [...champPoste().querySelectorAll('option')]
            .filter(o => o.value !== '');
        const ids = options.map(o => o.value);

        expect(ids).toContain('PORT1');
        expect(ids).toContain('BIBLIO');
        // ⚠️ `CDI`, pas `BIBLIO` : `ACCESS_POINTS` est écrit en portugais et le
        // champ du libellé s'appelle `nome`. Lire `p.nom` renvoyait `undefined`
        // et la liste retombait sur l'identifiant technique — on aurait demandé
        // à une AED de choisir « BIBLIO » dans une école où ce lieu s'appelle
        // le CDI.
        const cdi = options.find(o => o.value === 'BIBLIO');
        expect(cdi.textContent).toBe('CDI');
    });

    it('★ les écrans de supervision ne sont pas des postes', () => {
        poserFetch(SERVEUR_OK);
        monter({ configInitiale: { apiUrl: 'http://192.168.1.253:8080', sector: '' } });

        const ids = [...champPoste().querySelectorAll('option')].map(o => o.value);
        for (const p of globalThis.ACCESS_POINTS.filter(x => x.category === 'monitor')) {
            expect(ids).not.toContain(p.id);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════
describe('L\'écran — le mode correction (engrenage → Poste)', () => {

    it('★★ IL Y A UN BOUTON « ANNULER », et il rend la main', async () => {
        // Sans lui, l'écran est un piège : sur un poste gouverné par un
        // `.bat` — le cas le plus fréquent du parc — l'enregistrement est
        // refusé, donc l'écran ne se referme jamais, et en quiosque Alt+F4
        // est bloqué.
        poserFetch(SERVEUR_OK);
        const annule = vi.fn();
        monter({
            mode: 'correction',
            onAnnuler: annule,
            configInitiale: {
                apiUrl: 'http://192.168.1.253:8080', sector: 'PORT1',
                source: 'fichier', cheminFichier: 'C:\\MAGBO\\magbo-poste.json'
            }
        });

        const annuler = bouton('poste.annuler');
        expect(annuler).not.toBeNull();
        await cliquer(annuler);
        expect(annule).toHaveBeenCalledTimes(1);
    });

    it('★ au PREMIER lancement il n\'y a pas d\'« Annuler » — il n\'y a nulle part où revenir', () => {
        poserFetch(SERVEUR_OK);
        monter({ configInitiale: { apiUrl: 'http://192.168.1.253:8080', sector: '' } });
        expect(bouton('poste.annuler')).toBeNull();
    });

    it('★★ un poste gouverné par une variable d\'environnement le DIT, et n\'enregistre pas', async () => {
        poserFetch(SERVEUR_OK);
        monter({
            mode: 'correction',
            onAnnuler: () => {},
            configInitiale: {
                apiUrl: 'http://192.168.1.253:8080', sector: 'PORT1',
                source: globalThis.MagboPosteConfig.SOURCES.ENVIRONNEMENT
            }
        });

        // Dit AVANT — pas après six secondes de test et un clic sur un
        // bouton qui répondra « refusé ».
        expect(texte()).toContain(t('poste.err.environnement'));
        expect(champAdresse().disabled).toBe(true);
        expect(champPoste().disabled).toBe(true);

        await cliquer(bouton('poste.test.bouton'));
        expect(bouton('poste.enregistrer').disabled).toBe(true);
        expect(texte()).toContain(t('poste.pas.pret.env'));
    });

    it('★ le mode correction annonce le rechargement AVANT de le faire', () => {
        poserFetch(SERVEUR_OK);
        monter({
            mode: 'correction',
            onAnnuler: () => {},
            configInitiale: {
                apiUrl: 'http://192.168.1.253:8080', sector: 'PORT1', source: 'fichier'
            }
        });
        // Le jeton vit en mémoire : enregistrer déconnecte.
        expect(texte()).toContain(t('poste.rechargement'));
    });

    it('★ le premier lancement ne parle pas de rechargement (personne n\'est connecté)', () => {
        poserFetch(SERVEUR_OK);
        monter({ configInitiale: { apiUrl: 'http://192.168.1.253:8080', sector: '' } });
        expect(texte()).not.toContain(t('poste.rechargement'));
    });
});

// ══════════════════════════════════════════════════════════════════════
describe('L\'écran — l\'enregistrement', () => {

    it('★★ enregistre l\'adresse NORMALISÉE et le poste choisi, puis rend la main', async () => {
        poserFetch(SERVEUR_OK);
        const enregistre = vi.fn(async () => ({
            ok: true,
            config: { apiUrl: 'http://192.168.1.253:8080', sector: 'BIBLIO' }
        }));
        poserPont(enregistre);
        const termine = vi.fn();

        monter({ configInitiale: { apiUrl: '', sector: '' }, onTermine: termine });

        taper('  192.168.1.253:8080/  ');
        choisirPoste('BIBLIO');
        await cliquer(bouton('poste.test.bouton'));
        await cliquer(bouton('poste.enregistrer'));

        expect(enregistre).toHaveBeenCalledWith({
            apiUrl: 'http://192.168.1.253:8080',
            sector: 'BIBLIO'
        });
        expect(termine).toHaveBeenCalledTimes(1);
    });

    it('★★ un refus d\'écriture est AFFICHÉ — l\'écran ne se referme pas sur un mensonge', async () => {
        poserFetch(SERVEUR_OK);
        poserPont(async () => ({
            ok: false, motif: 'ecriture', chemin: 'D:\\MAGBO\\magbo-poste.json'
        }));
        const termine = vi.fn();

        monter({ configInitiale: { apiUrl: 'http://192.168.1.253:8080', sector: '' },
                 onTermine: termine });
        choisirPoste('BIBLIO');
        await cliquer(bouton('poste.test.bouton'));
        await cliquer(bouton('poste.enregistrer'));

        expect(termine).not.toHaveBeenCalled();
        expect(texte()).toContain(t('poste.err.ecriture'));
        expect(texte()).toContain('D:\\MAGBO\\magbo-poste.json');
    });

    it('★ le pont qui lève ne laisse pas l\'écran figé sur « Test en cours »', async () => {
        poserFetch(SERVEUR_OK);
        poserPont(async () => { throw new Error('canal fermé'); });

        monter({ configInitiale: { apiUrl: 'http://192.168.1.253:8080', sector: '' } });
        choisirPoste('BIBLIO');
        await cliquer(bouton('poste.test.bouton'));
        await cliquer(bouton('poste.enregistrer'));

        expect(texte()).toContain(t('poste.err.ecriture'));
        expect(bouton('poste.enregistrer').disabled).toBe(false);
    });
});

// ══════════════════════════════════════════════════════════════════════
describe('L\'écran — l\'adresse mal formée', () => {

    it('★ une adresse sans port est refusée AVANT le test, avec l\'exemple attendu', () => {
        poserFetch(SERVEUR_OK);
        monter({ configInitiale: { apiUrl: 'http://192.168.1.253:8080', sector: '' } });

        taper('192.168.1.253');

        expect(texte()).toContain(t('poste.err.url.port'));
        expect(bouton('poste.test.bouton').disabled).toBe(true);
    });

    it('★ un champ vidé n\'affiche pas d\'erreur rouge tant qu\'on n\'a rien écrit', () => {
        poserFetch(SERVEUR_OK);
        monter({ configInitiale: { apiUrl: 'http://192.168.1.253:8080', sector: '' } });

        taper('   ');

        expect(texte()).not.toContain(t('poste.err.url.vide'));
        expect(bouton('poste.test.bouton').disabled).toBe(true);
    });
});

// ══════════════════════════════════════════════════════════════════════
describe('L\'écran — les branches que le chemin normal ne traverse pas', () => {

    it('★★ un serveur qui refuse la demande n’est pas un succès', () => {
        // HTTP 401/403/500 : quelque chose répond, mais pas ce qu'il faut.
        // Branche jamais exercée avant le 2e tour de revue.
        poserFetch(async () => ({ ok: false, status: 503, json: async () => ({}) }));
        monter({ configInitiale: { apiUrl: 'http://192.168.1.253:8080', sector: '' } });
        choisirPoste('BIBLIO');

        return cliquer(bouton('poste.test.bouton')).then(() => {
            expect(texte()).toContain(t('poste.test.repond.mal'));
            expect(texte()).toContain('HTTP 503');
            expect(bouton('poste.enregistrer').disabled).toBe(true);
        });
    });

    it('★★ un serveur qui ne répond pas à temps le DIT, et n’ouvre pas le bouton', async () => {
        // ⚠️ Six secondes, pas l'infini : une adresse fausse sur le bon réseau
        // peut bloquer très longtemps, et l'écran doit rendre la main.
        vi.useFakeTimers();
        try {
            poserFetch((_url, opts) => new Promise((_res, rej) => {
                opts.signal.addEventListener('abort', () => {
                    const e = new Error('aborted');
                    e.name = 'AbortError';
                    rej(e);
                });
            }));
            monter({ configInitiale: { apiUrl: 'http://192.168.1.99:8080', sector: '' } });
            choisirPoste('BIBLIO');

            rendreMaintenant(() => {
                bouton('poste.test.bouton').dispatchEvent(
                      new window.MouseEvent('click', { bubbles: true }));
            });
            expect(texte()).toContain(t('poste.test.encours'));

            await vi.advanceTimersByTimeAsync(6100);

            // ⚠️ On repasse aux vraies horloges AVANT de vider : le rendu
            // concurrent de React passe par son ordonnanceur, que les
            // fausses horloges ne pilotent pas.
            vi.useRealTimers();
            await vider();

            expect(texte()).toContain(t('poste.test.delai'));
            expect(bouton('poste.enregistrer').disabled).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it('★ un test en vol est abandonné quand l’écran disparaît', async () => {
        // Depuis l'ajout d'« Annuler », l'écran peut être démonté pendant les
        // six secondes : la requête doit être abandonnée, pas laissée courir.
        let signal = null;
        poserFetch((_url, opts) => {
            signal = opts.signal;
            return new Promise(() => { /* jamais résolue */ });
        });
        monter({
            mode: 'correction', onAnnuler: () => {},
            configInitiale: { apiUrl: 'http://192.168.1.253:8080', sector: 'PORT1', source: 'fichier' }
        });
        await cliquer(bouton('poste.test.bouton'));
        expect(signal.aborted).toBe(false);

        rendreMaintenant(() => racine.unmount());
        racine = null;

        expect(signal.aborted).toBe(true);
    });

    it('★★ au premier lancement, il y a toujours une SORTIE', async () => {
        // ⚠️ Cet écran n'a pas d'« Annuler » — il n'y a rien derrière lui.
        // Mais il existe un état où il s'affiche ET où l'enregistrement sera
        // refusé pour toujours : le canal muet sur un poste que des variables
        // gouvernent. La fenêtre, elle, a été créée en quiosque. Sans cette
        // sortie, plus rien n'est possible : ni enregistrer, ni revenir, ni
        // fermer. (Panel de revue — qualité, 2e tour, 02/09/2026.)
        poserFetch(SERVEUR_OK);
        const quitter = vi.fn();
        monter({ configInitiale: { doitConfigurer: true }, onQuitter: quitter });

        const sortie = bouton('poste.quitter');
        expect(sortie).not.toBeNull();
        await cliquer(sortie);
        expect(quitter).toHaveBeenCalledTimes(1);
    });

    it('★ en mode correction, la sortie est « Annuler » — pas « Fermer l’application »', () => {
        poserFetch(SERVEUR_OK);
        monter({
            mode: 'correction', onAnnuler: () => {}, onQuitter: () => {},
            configInitiale: { apiUrl: 'http://192.168.1.253:8080', sector: 'PORT1', source: 'fichier' }
        });
        expect(bouton('poste.annuler')).not.toBeNull();
        expect(bouton('poste.quitter')).toBeNull();
    });

    it('★ le message de l’OS est affiché quand l’écriture échoue', async () => {
        // Sur un disque plein, l'écran ne nommait que « lecture seule » — la
        // seule cause qui n'était pas la bonne.
        poserFetch(SERVEUR_OK);
        poserPont(async () => ({
            ok: false, motif: 'ecriture', detail: 'ENOSPC: no space left on device',
            chemin: 'C:\\MAGBO\\magbo-poste.json'
        }));
        monter({ configInitiale: { apiUrl: 'http://192.168.1.253:8080', sector: '' } });
        choisirPoste('BIBLIO');
        await cliquer(bouton('poste.test.bouton'));
        await cliquer(bouton('poste.enregistrer'));

        expect(texte()).toContain('ENOSPC');
    });

    it('★ le chemin du fichier est visible MÊME quand un lanceur gouverne', () => {
        // C'est pendant une migration qu'on en a besoin, c'est-à-dire
        // exactement le cas où il était masqué.
        poserFetch(SERVEUR_OK);
        monter({
            mode: 'correction', onAnnuler: () => {},
            configInitiale: {
                apiUrl: 'http://192.168.1.253:8080', sector: 'PORT1',
                source: globalThis.MagboPosteConfig.SOURCES.ENVIRONNEMENT,
                cheminFichier: 'C:\\MAGBO\\magbo-poste.json'
            }
        });
        expect(texte()).toContain('C:\\MAGBO\\magbo-poste.json');
        expect(texte()).toContain(t('poste.actuel.fichier.inutilise'));
    });
});
