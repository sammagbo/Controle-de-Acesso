// =====================================================================
// LE LIVRE, CE QU'IL DOIT ÊTRE POUR PARTIR CHEZ L'IMPRIMEUR
// =====================================================================
// `tests/buildLivre.test.js` garde le CONVERTISSEUR (le Markdown devient du
// HTML, et rien d'actif ne passe). Ce fichier-ci garde la MISE EN PAGE : ce
// qui distingue un long document d'un livre relié.
//
// ⚠️ Ces tests ne relancent pas Chrome. Ce qu'on peut mesurer sans lui — les
// pages liminaires, les gabarits `@page`, la table des matières, la ligne qui
// empêche le livre de rétrécir — est ici. Ce qui exige une impression réelle
// (le nombre de pages, le facteur d'échelle) est vérifié par
// `node scripts/paginer-livre.js`, qui REFUSE de finir si le livre est réduit.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(__dirname, '..');
const LIVRE = path.join(REPO, 'docs', 'livre', 'livre-complet.html');
const BUILD = path.join(REPO, 'scripts', 'build-livre.js');
const PAGINER = path.join(REPO, 'scripts', 'paginer-livre.js');

const existe = fs.existsSync(LIVRE);

// ⚠️ MESURÉ : en renommant docs/livre/livre-complet.html, la suite restait
// 22/22 VERTE — dix-neuf tests s’auto-annulaient par `if (!existe) return;`.
// Un fichier absent est le premier défaut à voir, pas celui qu’on saute.
const html = existe ? fs.readFileSync(LIVRE, 'utf8') : '';
const source = fs.readFileSync(BUILD, 'utf8');

/** Les chapitres numérotés, dans l'ordre où le livre les pose. */
function chapitresNumerotes() {
      const out = [];
      const re = /<section class="chapitre" data-fichier="([^"]+)" data-page="([^"]+)"/g;
      let m;
      while ((m = re.exec(html)) !== null) if (m[2] !== 'liminaire') out.push(m);
      return out;
}

describe('le livre existe', () => {
      // ⚠️ CE TEST N’A PAS DE GARDE `if (!existe) return;`, ET C’EST TOUT SON
      // OBJET. Mesuré : en renommant docs/livre/livre-complet.html, la suite
      // restait 22/22 VERTE — dix-neuf tests s’auto-annulaient. Un livre absent
      // est le premier défaut à voir, pas celui qu’on saute.
      it('★ docs/livre/livre-complet.html est là — sinon rien d’autre ne prouve rien', () => {
            expect(existe).toBe(true);
            expect(html.length).toBeGreaterThan(50000);
      });

      // ⚠️ Le sommaire numéroté n’est valable que pour un état précis des
      // chapitres ET de la feuille de style. `pagination.json` porte donc une
      // empreinte, et `build-livre.js` retire les numéros quand elle ne colle
      // plus. Sans cela, `node scripts/build-livre.js` lancé SEUL réinjectait
      // des numéros mesurés sur d’autres chapitres en annonçant « ✓ sommaire
      // paginé » — mesuré : huit entrées fausses sur neuf, décalées de deux
      // pages, et la suite verte. Un sommaire faux est pire qu’un sommaire sans
      // numéros : le second se voit, le premier donne confiance.
      it('★ les numéros de page portent l’empreinte de ce qui a été mesuré', () => {
            const pag = path.join(REPO, 'docs', 'livre', 'pagination.json');
            expect(fs.existsSync(pag)).toBe(true);
            const p = JSON.parse(fs.readFileSync(pag, 'utf8'));
            expect(typeof p.empreinte).toBe('string');
            expect(p.empreinte.length).toBeGreaterThan(8);

            // et le générateur la VÉRIFIE, au lieu de faire confiance au fichier
            const { empreinteDesSources } = require(path.join(REPO, 'scripts', 'build-livre.js'));
            expect(p.empreinte).toBe(empreinteDesSources());
      });
});

describe('les pages liminaires', () => {
      it('la couverture porte le titre, le lieu, l’année et l’auteur', () => {
            if (!existe) return;
            expect(html).toContain('class="couverture-livre"');
            expect(html).toMatch(/class="couv-titre">MAGBO<br>Access&nbsp;Control/);
            expect(html).toContain('Le livre du système');
            expect(html).toContain('Lycée Molière · Rio de Janeiro');
            expect(html).toContain('Sammy Kabagambe Magbo');
            expect(html).toMatch(/class="couv-annee">20\d\d</);
      });

      it('il y a une page de titre, une dédicace et un colophon', () => {
            if (!existe) return;
            expect(html).toContain('class="page-titre"');
            expect(html).toContain('class="page-dedicace"');
            expect(html).toContain('class="page-colophon"');
      });

      it('l’emplacement de la dédicace est SIGNALÉ, pour que Sam le trouve', () => {
            if (!existe) return;
            expect(html).toMatch(/DÉDICACE — À COMPOSER PAR SAMMY/);
            expect(html).toContain('class="dedicace-texte"');
      });

      it('le colophon dit la version, la date, le commit et comment régénérer', () => {
            if (!existe) return;
            const colo = html.slice(html.indexOf('class="page-colophon"'));
            expect(colo).toMatch(/version \d+\.\d+\.\d+/);
            expect(colo).toMatch(/Livre arrêté le<\/dt><dd>\d{2}\/\d{2}\/\d{4}/);
            expect(colo).toMatch(/Dernier commit<\/dt><dd><code>[0-9a-f]{7}<\/code>/);
            expect(colo).toContain('node scripts/build-livre.js');
            expect(colo).toContain('node scripts/paginer-livre.js');
      });

      it('une dédicace s’ouvre sur un recto et rien ne lui fait face', () => {
            // Deux pages blanches encadrent la dédicace : celle qui suit la page
            // de titre, et son propre verso. C'est ce qui la met sur une belle
            // page dans un volume relié en recto-verso.
            if (!existe) return;
            const avant = html.indexOf('class="page-dedicace"');
            const titre = html.indexOf('class="page-titre"');
            const entre = html.slice(titre, avant);
            expect(entre).toContain('class="page-blanche"');
            const apres = html.slice(avant, avant + 2000);
            expect(apres).toContain('class="page-blanche"');
      });
});

describe('les gabarits de page', () => {
      it('A4, avec une marge de reliure PLUS LARGE côté intérieur', () => {
            if (!existe) return;
            expect(html).toMatch(/@page\s*\{[^}]*size:\s*A4/);
            // La reliure est à gauche sur les rectos, à droite sur les versos.
            expect(html).toMatch(/@page :right\s*\{[\s\S]*?margin-left: var\(--reliure\)/);
            expect(html).toMatch(/@page :left\s*\{[\s\S]*?margin-right: var\(--reliure\)/);
            const reliure = html.match(/--reliure:\s*(\d+)mm/);
            const exterieur = html.match(/--exterieur:\s*(\d+)mm/);
            expect(reliure).not.toBeNull();
            expect(exterieur).not.toBeNull();
            expect(Number(reliure[1])).toBeGreaterThan(Number(exterieur[1]));
      });

      it('le folio est toujours du côté extérieur', () => {
            if (!existe) return;
            expect(html).toMatch(/@page :right\s*\{[\s\S]*?@bottom-right\s*\{\s*content: counter\(page\)/);
            expect(html).toMatch(/@page :left\s*\{[\s\S]*?@bottom-left\s*\{\s*content: counter\(page\)/);
      });

      it('les liminaires ne portent pas de numéro et NE COMPTENT PAS', () => {
            // ⚠️ `counter-reset: page 1` est ignoré par Chrome (mesuré). Le seul
            // mécanisme qui fait démarrer la pagination au chapitre 1 est
            // `counter-increment: page 0` sur le gabarit des liminaires.
            if (!existe) return;
            expect(html).toMatch(/@page liminaire\s*\{[\s\S]*?counter-increment: page 0/);
            expect(html).toMatch(/@page couverture\s*\{[\s\S]*?counter-increment: page 0/);
      });

      it('chaque chapitre a son titre courant, et aucun ne reste orphelin', () => {
            if (!existe) return;
            const chapitres = chapitresNumerotes();
            expect(chapitres.length).toBeGreaterThanOrEqual(9);
            for (const c of chapitres) {
                  const gabarit = c[2];
                  expect(gabarit).toMatch(/^chapitre-\d{2}$/);
                  // la règle @page qui porte le titre courant
                  expect(html).toContain(`@page ${gabarit}:right`);
                  // et le rattachement de la section à ce gabarit
                  expect(html).toContain(`.chapitre[data-page="${gabarit}"] { page: ${gabarit} }`);
            }
      });

      it('un titre ne reste jamais seul en bas de page', () => {
            if (!existe) return;
            expect(html).toMatch(/h1, h2, h3, h4 \{[\s\S]*?break-after: avoid/);
            expect(html).toMatch(/h1 \+ \*, h2 \+ \*, h3 \+ \*, h4 \+ \* \{ break-before: avoid/);
            expect(html).toMatch(/orphans: 3; widows: 3/);
      });
});

describe('la largeur : ce qui empêche le livre de rétrécir', () => {
      // ⚠️ MESURÉ, ET C'EST LE DÉFAUT LE PLUS COÛTEUX DE CE LIVRE. Quand un
      // élément dépasse la largeur imprimable, Chrome ne le coupe pas : il
      // RÉDUIT TOUT LE DOCUMENT, sans rien dire. Le livre d'avant sortait à
      // 80,7 % — un corps déclaré à 10,5 pt imprimé à 8,5 pt sur 84 pages.
      // Le coupable n'était pas le code (0 débordement sur 38 blocs) mais les
      // TABLEAUX : 51 éléments dépassaient.
      it('les tableaux ont une largeur fixe — la ligne qui a corrigé le défaut', () => {
            if (!existe) return;
            expect(html).toMatch(/@media print \{[\s\S]*?table \{[^}]*table-layout: fixed/);
            expect(html).toMatch(/th, td \{[^}]*overflow-wrap: anywhere/);
      });

      it('les blocs de code se replient au lieu de déborder', () => {
            if (!existe) return;
            expect(html).toMatch(/pre\.code \{[^}]*white-space: pre-wrap/);
            expect(html).toMatch(/pre\.code \{[^}]*overflow-wrap: anywhere/);
      });

      it('les encadrés gardent leur couleur à l’impression', () => {
            if (!existe) return;
            // ⚠️ ON CHERCHE DANS LA FEUILLE DE STYLE, PAS DANS LE LIVRE.
            // `expect(html).toContain('print-color-adjust: exact')` était VRAI
            // sans aucune règle CSS : la chaîne est écrite deux fois dans la
            // PROSE du livre (00-sommaire.md, 05-administration.md). Mesuré en
            // supprimant la règle entière — l’assertion passait quand même.
            // C’est le piège que le test de `target-counter` documente avoir
            // payé plus bas ; la leçon n’avait été appliquée qu’à lui.
            // ⚠️ Et on asserte un BOOLÉEN : sur échec, `toContain` recrache le
            // livre entier dans le diff — c’est ce qui avait tué la suite en
            // « Fatal process out of memory ».
            const css = (html.match(/<style>([^]*?)<[/]style>/) || ['', ''])[1];
            expect(css.includes('print-color-adjust: exact')).toBe(true);
            expect(css.includes('-webkit-print-color-adjust: exact')).toBe(true);
      });
});

describe('la table des matières', () => {
      it('elle liste tous les chapitres numérotés, et rien d’autre', () => {
            if (!existe) return;
            const bloc = html.slice(html.indexOf('class="page-sommaire"'),
                  html.indexOf('</ol>', html.indexOf('class="page-sommaire"')));
            const entrees = bloc.match(/<span class="somm-titre">/g) || [];
            expect(entrees.length).toBe(chapitresNumerotes().length);
      });

      it('chaque entrée pointe sur une ancre qui existe VRAIMENT dans le livre', () => {
            // Une table des matières qui renvoie dans le vide est pire qu'absente :
            // elle a l'air de marcher.
            if (!existe) return;
            const bloc = html.slice(html.indexOf('class="page-sommaire"'),
                  html.indexOf('</ol>', html.indexOf('class="page-sommaire"')));
            const cibles = [...bloc.matchAll(/<a href="#([^"]+)"/g)].map(m => m[1]);
            expect(cibles.length).toBeGreaterThan(0);
            for (const c of cibles) expect(html).toContain(`id="${c}"`);
      });

      it('quand la pagination a été mesurée, chaque entrée porte son numéro', () => {
            if (!existe) return;
            const fichier = path.join(REPO, 'docs', 'livre', 'pagination.json');
            if (!fs.existsSync(fichier)) return;   // sommaire dégradé : c'est permis
            const mesure = JSON.parse(fs.readFileSync(fichier, 'utf8'));
            const bloc = html.slice(html.indexOf('class="page-sommaire"'),
                  html.indexOf('</ol>', html.indexOf('class="page-sommaire"')));
            const numeros = [...bloc.matchAll(/<span class="somm-page">(\d*)<\/span>/g)].map(m => m[1]);
            expect(numeros.length).toBe(chapitresNumerotes().length);
            expect(numeros.every(n => n !== '')).toBe(true);
            // et ils montent : un sommaire dont les pages reculent est faux.
            const suite = numeros.map(Number);
            for (let i = 1; i < suite.length; i++) expect(suite[i]).toBeGreaterThan(suite[i - 1]);
            expect(suite[0]).toBe(1);
            expect(Object.keys(mesure.pages).length).toBe(suite.length);
      });

      it('target-counter() ne doit JAMAIS revenir : Chrome ne le connaît pas', () => {
            // Mesuré dans Chrome 152 : la déclaration entière est jetée par le
            // parseur — on ne perd pas seulement le numéro, on perd aussi le
            // texte littéral qui l'accompagne. Un sommaire qui l'emploie a l'air
            // de marcher chez celui qui l'écrit et sort vide à l'impression.
            // ⚠️ ON NE REGARDE QUE LA FEUILLE DE STYLE, et la première version
            // de ce test l'a appris de la pire façon : elle cherchait dans TOUT
            // le HTML, et le livre PARLE de target-counter — le chapitre 0
            // explique justement pourquoi on ne s'en sert pas. Le test échouait
            // donc sur sa propre documentation. Pire, l'échec portait sur une
            // chaîne de 330 Ko : vitest a essayé d'en faire un diff et le
            // processus est mort en « Fatal process out of memory: Zone »,
            // c'est-à-dire un plantage sans message utile, qui emportait la
            // suite ENTIÈRE. D'où les booléens ci-dessous : un test qui échoue
            // doit dire « true au lieu de false », jamais recracher un livre.
            const styleDuLivre = existe
                  ? (html.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1] : '';
            expect(/target-counter\s*\(/.test(styleDuLivre)).toBe(false);

            // Et dans le script, le CSS est le litéral `const STYLE`. Les
            // commentaires du script, eux, ont le droit d'expliquer pourquoi.
            const litteral = (source.match(/const STYLE = `([\s\S]*?)\n`;/) || ['', ''])[1];
            expect(litteral.length).toBeGreaterThan(1000);
            expect(/target-counter\s*\(/.test(litteral)).toBe(false);
      });
});

describe('les deux scripts ne peuvent pas se désynchroniser', () => {
      it('l’ancre est calculée à UN SEUL endroit', () => {
            // Deux copies de la formule, c'est un sommaire qui perd ses numéros
            // en silence le jour où l'une des deux change.
            expect(source).toMatch(/module\.exports = \{[^}]*\bancre\b[^}]*\}/);
            const paginer = fs.readFileSync(PAGINER, 'utf8');
            expect(paginer).toMatch(/require\('\.\/build-livre\.js'\)/);
            // ⚠️ LA FORME RÉELLE EST `const ancre = (t) => …`, pas `function`.
            // Le garde ne cherchait que `function ancre` : une copie divergente
            // écrite `const ancre =` passait 22/22. Mesuré — avec une copie qui
            // ne retirait pas les accents, huit clés sur neuf ne correspondaient
            // plus et le sommaire perdait ses numéros EN SILENCE.
            expect(paginer).not.toMatch(new RegExp('(function|const|let|var)[ ]+ancre[^a-zA-Z0-9_]'));
      });

      it('le paginateur refuse un livre réduit', () => {
            const paginer = fs.readFileSync(PAGINER, 'utf8');
            expect(paginer).toContain("ECHELLE_NORMALE = '0.750000'");
            expect(paginer).toMatch(/process\.exit\(2\)/);
      });

      it('le paginateur vérifie son compteur de pages avant de s’y fier', () => {
            const paginer = fs.readFileSync(PAGINER, 'utf8');
            expect(paginer).toMatch(/temoin/i);
            expect(paginer).toMatch(/nTemoin !== 5/);
      });
});

describe('le convertisseur : un élément de liste sur plusieurs lignes', () => {
      // ⚠️ Mesuré sur le dépôt : 164 des 199 éléments de liste étaient coupés.
      // La deuxième ligne tombait dans la branche « paragraphe », qui FERME la
      // liste, et l'élément suivant rouvrait un <ol> repartant de 1 : le lecteur
      // voyait « 1. 1. 1. » là où le texte dit « 1. 2. 3. ».
      const { versHtml } = require('../scripts/build-livre.js');

      it('la suite indentée reste DANS le même <li>', () => {
            const rendu = versHtml('1. premier point\n   qui continue ici\n2. deuxième point\n');
            expect((rendu.match(/<li>/g) || []).length).toBe(2);
            expect((rendu.match(/<ol>/g) || []).length).toBe(1);
            expect(rendu).toContain('premier point qui continue ici');
      });

      it('une ligne indentée qui ouvre un bloc de code ne se fait pas avaler', () => {
            const rendu = versHtml('- un point\n```\ndu code\n```\n');
            expect(rendu).toContain('<li>un point</li>');
            expect(rendu).toContain('du code');
      });
});
