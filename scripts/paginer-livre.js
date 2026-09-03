#!/usr/bin/env node
// =====================================================================
// LE LIVRE, PRÊT POUR L'IMPRIMEUR
// =====================================================================
// Fabrique `docs/livre/livre-complet.pdf` et, au passage, la seule chose
// qu'une feuille de style ne sait pas faire dans Chrome : les NUMÉROS DE PAGE
// de la table des matières.
//
// ─────────────────────────────────────────────────────────────────────
// POURQUOI CE SCRIPT EXISTE
//
// En CSS d'impression, numéroter un sommaire s'écrit `target-counter()`.
// MESURÉ dans Chrome 152 : la propriété n'existe pas, et l'échec est pire
// qu'un simple « pas de numéro » — le parseur jette la déclaration ENTIÈRE,
// donc le texte littéral qui accompagne l'appel disparaît lui aussi.
//
// La méthode « offsetTop du titre divisé par la hauteur d'une page » a été
// essayée et mesurée FAUSSE : 1 ancre juste sur 16, avec une erreur qui
// s'aggrave page après page (-13 à la fin) parce qu'elle ignore les sauts
// forcés et les `break-inside: avoid`. Elle n'est pas ici.
//
// Ce qui reste, et qui est exact par construction : POSER LA QUESTION AU PDF.
// Chaque chapitre commence sur une page neuve (`break-before: page`), donc la
// page où commence le chapitre k ne dépend que de ce qui le précède. On
// imprime le début du livre arrêté juste avant le chapitre k, on COMPTE les
// pages, et on sait. Aucune extraction de texte, aucune heuristique : un
// compteur de pages, qui est la mesure la plus robuste qu'un PDF sache donner.
//
// ⚠️ AUCUNE BIBLIOTHÈQUE NOUVELLE. Chrome imprime (il est sur le poste),
// `zlib` de Node décompresse les flux, `playwright-core` — déjà dans
// node_modules pour la bataille de tests de l'application — ne sert qu'au
// diagnostic quand quelque chose déborde.
//
//   node scripts/paginer-livre.js
//
// =====================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const RACINE = path.resolve(__dirname, '..');
const DOSSIER = path.join(RACINE, 'docs', 'livre');
const HTML = path.join(DOSSIER, 'livre-complet.html');
const PDF = path.join(DOSSIER, 'livre-complet.pdf');
const PAGINATION = path.join(DOSSIER, 'pagination.json');

// A4 moins les marges du gabarit : 210 − 26 (reliure) − 20 (extérieur).
const LARGEUR_UTILE_MM = 164;
const LARGEUR_UTILE_PX = Math.round(LARGEUR_UTILE_MM / 25.4 * 96); // 620

// Le facteur px→pt d'une page NON réduite. 96 px/pouce → 72 pt/pouce.
const ECHELLE_NORMALE = '0.750000';

const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'magbo-livre-'));

// ── Chrome ───────────────────────────────────────────────────────────

function trouverChrome() {
      const candidats = [
            process.env.MAGBO_CHROME,
            'C:/Program Files/Google/Chrome/Application/chrome.exe',
            'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
            path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
            'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
            'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
            '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      ].filter(Boolean);
      for (const c of candidats) { try { if (fs.existsSync(c)) return c; } catch (e) { /* suivant */ } }
      return null;
}

/**
 * Imprime un fichier HTML local en PDF.
 *
 * ⚠️ `--user-data-dir` n'est pas décoratif : sans lui, l'appel peut être
 * absorbé par le Chrome déjà ouvert de la session (« ouverture dans une
 * session existante »), qui rend la main aussitôt sans rien écrire.
 * ⚠️ `execFileSync` attend vraiment la fin du processus — c'est le point où
 * un `&` de PowerShell échouerait, parce que chrome.exe est une application
 * graphique et que PowerShell ne l'attend pas.
 */
function imprimer(chrome, fichierHtml, fichierPdf) {
      const profil = fs.mkdtempSync(path.join(travail, 'profil-'));
      execFileSync(chrome, [
            '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
            '--no-first-run', '--no-default-browser-check',
            '--disable-background-networking', '--disable-sync', '--disable-extensions',
            '--disable-component-update', '--log-level=3',
            `--user-data-dir=${profil}`,
            `--print-to-pdf=${fichierPdf}`,
            'file:///' + fichierHtml.replace(/\\/g, '/'),
      ], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180000 });
      if (!fs.existsSync(fichierPdf) || fs.statSync(fichierPdf).size === 0) {
            throw new Error('Chrome n\'a rien écrit dans ' + fichierPdf);
      }
      return fichierPdf;
}

// ── Lecture du PDF, sans bibliothèque ────────────────────────────────

/** Le brut, plus tous les flux que zlib sait décompresser. */
function textePdf(fichier) {
      const buf = fs.readFileSync(fichier);
      const brut = buf.toString('latin1');
      let tout = brut;
      const re = /stream\r?\n/g;
      let m;
      while ((m = re.exec(brut)) !== null) {
            const debut = m.index + m[0].length;
            const fin = brut.indexOf('endstream', debut);
            if (fin < 0) continue;
            try { tout += '\n' + zlib.inflateSync(buf.subarray(debut, fin)).toString('latin1'); }
            catch (e) { /* image ou police : sans intérêt ici */ }
      }
      return tout;
}

/**
 * Le nombre de pages.
 *
 * ⚠️ `/Type /Page` DOIT être suivi d'un caractère non alphabétique, sinon on
 * compte aussi les nœuds `/Type /Pages` de l'arbre. Et on ne lit PAS le
 * `/Count` du premier nœud rencontré : une première version le faisait et
 * annonçait 8 pages pour un livre de 84, parce qu'elle attrapait un nœud
 * intermédiaire de l'arbre au lieu de la racine.
 */
function nombreDePages(fichier) {
      return (textePdf(fichier).match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
}

/**
 * Le facteur d'échelle réellement appliqué par Chrome.
 *
 * ⚠️ C'EST LA MESURE LA PLUS IMPORTANTE DE CE SCRIPT. Quand le contenu dépasse
 * la largeur imprimable, Chrome ne coupe pas et n'avertit pas : il RÉDUIT TOUT
 * LE DOCUMENT. Le livre d'avant ce chantier sortait à 80,7 % — un corps
 * déclaré à 10,5 pt imprimé à 8,5 pt, sur les 84 pages, et rien nulle part
 * pour le dire. Une page saine vaut exactement 0,750000.
 */
function echelles(fichier) {
      const buf = fs.readFileSync(fichier);
      const brut = buf.toString('latin1');
      const vues = {};
      const re = /stream\r?\n/g;
      let m;
      while ((m = re.exec(brut)) !== null) {
            const debut = m.index + m[0].length;
            const fin = brut.indexOf('endstream', debut);
            if (fin < 0) continue;
            let t;
            try { t = zlib.inflateSync(buf.subarray(debut, fin)).toString('latin1'); }
            catch (e) { continue; }
            const peripherique = t.match(/^\s*([.\d-]+) 0 0 -?[.\d-]+ 0 [.\d]+ cm/m);
            const reduction = t.match(/\n([.\d]+) 0 0 \1 [.\d-]+ [.\d-]+ cm/);
            if (peripherique && reduction) {
                  const e = (Number(peripherique[1]) * Number(reduction[1])).toFixed(6);
                  vues[e] = (vues[e] || 0) + 1;
            }
      }
      return vues;
}

// ── Découpe du livre en préfixes ─────────────────────────────────────

/**
 * Le livre arrêté juste avant la n-ième section `chapitre` NUMÉROTÉE.
 * `n = 0` rend les seules pages liminaires (couverture … table des matières,
 * plus la section 00 qui est liminaire elle aussi).
 */
function prefixe(html, sectionsAvant) {
      const marque = '<section class="chapitre"';
      const morceaux = html.split(marque);
      const tete = morceaux[0];
      const gardees = morceaux.slice(1, 1 + sectionsAvant).map(s => marque + s);
      return tete + gardees.join('') + '\n</body>\n</html>\n';
}

/** Les sections `chapitre`, dans l'ordre, avec leur fichier et leur gabarit. */
function sections(html) {
      const out = [];
      const re = /<section class="chapitre" data-fichier="([^"]+)" data-page="([^"]+)"/g;
      let m;
      while ((m = re.exec(html)) !== null) out.push({ fichier: m[1], gabarit: m[2] });
      return out;
}

// ── Diagnostic : qui déborde ? ───────────────────────────────────────

async function coupables() {
      let playwright;
      try { playwright = require('playwright-core'); }
      catch (e) { return null; }
      const navigateur = await playwright.chromium.launch({ executablePath: trouverChrome() });
      try {
            const page = await navigateur.newPage({ viewport: { width: LARGEUR_UTILE_PX, height: 1000 } });
            await page.goto('file:///' + HTML.replace(/\\/g, '/'));
            await page.emulateMedia({ media: 'print' });
            return await page.evaluate((limite) => {
                  const trop = [];
                  for (const el of document.querySelectorAll('body *')) {
                        const r = el.getBoundingClientRect();
                        if (r.width > 0 && r.right > limite + 1) {
                              trop.push({
                                    balise: el.tagName,
                                    classe: el.className || '',
                                    droite: Math.round(r.right),
                                    texte: (el.textContent || '').trim().slice(0, 70),
                              });
                        }
                  }
                  return { scrollWidth: document.body.scrollWidth, elements: trop.slice(0, 25), total: trop.length };
            }, LARGEUR_UTILE_PX);
      } finally { await navigateur.close(); }
}

// ── Le travail ───────────────────────────────────────────────────────

async function principal() {
      const chrome = trouverChrome();
      if (!chrome) {
            console.error('✗ Chrome introuvable. Poser MAGBO_CHROME sur le chemin de chrome.exe.');
            console.error('  Le livre reste utilisable : docs/livre/livre-complet.html s\'imprime');
            console.error('  à la main (Ctrl+P, A4, « Graphiques d\'arrière-plan » coché), mais la');
            console.error('  table des matières restera SANS numéros de page.');
            process.exit(1);
      }
      console.log('Chrome : ' + chrome);

      // ⚠️ `ancre` vient du MÊME module que la table des matières : deux copies
      // de la formule donneraient un sommaire sans numéros, en silence.
      const { construire, ancre } = require('./build-livre.js');

      // ── 1. Le livre tel qu'il est, et la vérification qui commande tout.
      console.log('\n① Assemblage et première impression…');
      construire();
      let html = fs.readFileSync(HTML, 'utf8');
      const essai = imprimer(chrome, HTML, path.join(travail, 'essai.pdf'));
      const ech = echelles(essai);
      const clefs = Object.keys(ech);
      console.log('   échelle px→pt mesurée : ' + JSON.stringify(ech));

      if (!(clefs.length === 1 && clefs[0] === ECHELLE_NORMALE)) {
            console.error('\n✗ LE LIVRE EST RÉDUIT PAR CHROME.');
            console.error('  Une page saine vaut ' + ECHELLE_NORMALE + '. Mesuré : ' + clefs.join(', ') + '.');
            console.error('  Chrome ne coupe pas ce qui dépasse : il réduit TOUT le document, en');
            console.error('  silence. Le corps déclaré à 10,5 pt sortirait plus petit, sur toutes');
            console.error('  les pages. Il faut trouver ce qui dépasse ' + LARGEUR_UTILE_MM + ' mm et le corriger.\n');
            const qui = await coupables();
            if (qui) {
                  console.error('  Largeur du corps : ' + qui.scrollWidth + ' px pour ' + LARGEUR_UTILE_PX + ' px imprimables.');
                  console.error('  ' + qui.total + ' élément(s) dépassent. Les premiers :');
                  for (const e of qui.elements) {
                        console.error(`    ${e.balise}.${e.classe} → ${e.droite} px · « ${e.texte} »`);
                  }
            } else {
                  console.error('  (playwright-core absent : diagnostic détaillé indisponible)');
            }
            process.exit(2);
      }
      console.log('   ✓ aucune réduction : le livre s\'imprime à sa taille réelle.');

      // ── 2. Le compteur de pages, vérifié avant d'être cru.
      const temoin = path.join(travail, 'temoin.html');
      fs.writeFileSync(temoin,
            '<!doctype html><html><head><meta charset="utf-8">'
            + '<style>@page{size:A4;margin:10mm}div{break-after:page}</style></head><body>'
            + '<div>un</div><div>deux</div><div>trois</div><div>quatre</div><div>cinq</div>'
            + '</body></html>', 'utf8');
      const nTemoin = nombreDePages(imprimer(chrome, temoin, path.join(travail, 'temoin.pdf')));
      if (nTemoin !== 5) {
            console.error(`✗ Le compteur de pages est faux : ${nTemoin} au lieu de 5 sur un témoin connu.`);
            process.exit(3);
      }
      console.log('   ✓ compteur de pages vérifié sur un témoin à 5 pages.');

      // ── 3. Où commence chaque chapitre.
      const secs = sections(html);
      const numerotes = secs.filter(s => s.gabarit !== 'liminaire');
      console.log(`\n② Mesure des numéros de page — ${numerotes.length} chapitres, `
            + `${secs.length - numerotes.length + 1} impressions de plus…`);

      // Toutes les sections liminaires (dont 00-sommaire) précèdent les
      // chapitres numérotés : elles forment le préfixe de base.
      const avantChapitres = secs.length - numerotes.length;
      const compter = (nbSections) => {
            const f = path.join(travail, `p${nbSections}.html`);
            fs.writeFileSync(f, prefixe(html, nbSections), 'utf8');
            return nombreDePages(imprimer(chrome, f, path.join(travail, `p${nbSections}.pdf`)));
      };

      const liminairesPages = compter(avantChapitres);
      console.log(`   pages liminaires (non numérotées) : ${liminairesPages}`);

      const pages = {};
      const debuts = [];
      let cumul = liminairesPages;
      for (let k = 0; k < numerotes.length; k++) {
            const folio = cumul - liminairesPages + 1;
            const titre = titreDe(html, numerotes[k].fichier);
            pages[ancre(titre)] = folio;
            debuts.push({ fichier: numerotes[k].fichier, titre, folio });
            process.stdout.write(`   ${numerotes[k].fichier} → page ${folio}\n`);
            if (k < numerotes.length - 1) cumul = compter(avantChapitres + k + 1);
      }

      // ── 4. Réinjection, puis le PDF définitif.
      fs.writeFileSync(PAGINATION, JSON.stringify({
            mesure_le: new Date().toISOString().slice(0, 10),
            methode: 'impression de prefixes et comptage des pages du PDF (Chrome)',
            pages_liminaires: liminairesPages,
            pages,
      }, null, 2) + '\n', 'utf8');
      console.log('\n③ Réassemblage avec la table des matières paginée…');
      construire();

      imprimer(chrome, HTML, PDF);
      const total = nombreDePages(PDF);
      const echFinale = Object.keys(echelles(PDF));
      if (!(echFinale.length === 1 && echFinale[0] === ECHELLE_NORMALE)) {
            console.error('✗ Le PDF final est réduit (' + echFinale.join(', ') + ').');
            process.exit(2);
      }

      console.log(`\n✓ ${path.relative(RACINE, PDF)}`);
      console.log(`  ${total} pages A4 — dont ${liminairesPages} liminaires non numérotées,`);
      console.log(`  la pagination court de 1 à ${total - liminairesPages - 1} (le colophon ferme sans numéro).`);
      console.log(`  échelle ${echFinale[0]} : taille réelle, aucune réduction.`);
      console.log('\n  Pour l\'imprimeur : A4, recto-verso, reliure côté long, « Taille réelle ».');
}

function titreDe(html, fichier) {
      const i = html.indexOf(`data-fichier="${fichier}"`);
      const m = html.slice(i).match(/<h1 id="[^"]*">([\s\S]*?)<\/h1>/);
      return m ? m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim() : fichier;
}

principal()
      .catch(e => { console.error('✗ ' + (e && e.message || e)); process.exit(1); })
      .finally(() => { try { fs.rmSync(travail, { recursive: true, force: true }); } catch (e) { } });
