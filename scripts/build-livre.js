#!/usr/bin/env node
// =====================================================================
// build-livre.js — assemble docs/livre/*.md en un seul HTML imprimable
// =====================================================================
// Usage : node scripts/build-livre.js
// Sortie : docs/livre/livre-complet.html
//
// ⚠️ AUCUNE DÉPENDANCE NOUVELLE, et c'est délibéré. Le projet n'a pas de
// bundler, ne charge aucun CDN (R1), et embarque ses bibliothèques dans
// `libs/`. Ajouter `marked` ou une bibliothèque PDF pour produire un document
// que le navigateur sait déjà imprimer ajouterait une dépendance à maintenir
// pour un gain nul. Le convertisseur Markdown vit ici, il fait exactement ce
// dont le livre a besoin, et `tests/buildLivre.test.js` le tient.
//
// ⚠️ `print-color-adjust: exact` (et son préfixe -webkit-) : sans lui, le
// navigateur JETTE les fonds colorés à l'impression et le livre sort en gris.
// C'est la même ligne qui fait la couleur de l'affiche cantine — la leçon a
// déjà été payée une fois, le 28/08.
//
// ⚠️ Le HTML produit est AUTONOME : polices système, aucun `<script>`, aucune
// requête réseau. On doit pouvoir l'ouvrir depuis une clé USB, sur un poste
// hors ligne, et l'imprimer.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.resolve(__dirname, '..');
const DOSSIER = path.join(RACINE, 'docs', 'livre');
const SORTIE = path.join(DOSSIER, 'livre-complet.html');
// Les numeros de page mesures par scripts/paginer-livre.js. Absent = sommaire
// sans numeros, jamais un numero faux.
const PAGINATION = path.join(DOSSIER, 'pagination.json');

// ── Échappement ──────────────────────────────────────────────────────
// Le contenu du livre cite du code, des chemins et des balises. Tout passe
// par ici AVANT toute mise en forme : un `<script>` cité dans un chapitre
// doit s'afficher, pas s'exécuter.
function esc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Mise en forme DANS une ligne : code, gras, italique, liens.
 *
 * ⚠️ Le code inline est traité EN PREMIER et mis de côté : sans ça, un
 * `**` à l'intérieur d'un `` `bloc de code` `` deviendrait du gras, et une
 * commande shell citée dans le livre s'afficherait à moitié en italique.
 */
// ⚠️ LA SENTINELLE N'EST PAS UN NUL, ET C'EST DÉLIBÉRÉ. Elle l'a été, et git
// classait alors CE FICHIER COMME BINAIRE : `git show --stat` annonçait « Bin
// 17692 -> 41801 bytes, 0 insertion, 0 suppression » pour le commit qui
// réécrivait toute la feuille de style, `git diff` ne montrait rien, et `grep`
// répondait « Binary file matches ». Le fichier le plus important du chantier
// était illisible pour les outils avec lesquels on le relit.
// U+E000 est dans la zone à usage privé : il ne peut pas venir d'un chapitre,
// et il laisse le fichier en texte.
const SENTINELLE = String.fromCharCode(0xE000);

function inline(s) {
    const codes = [];
    let t = String(s).replace(/`([^`]+)`/g, (_, c) => {
        codes.push(c);
        return SENTINELLE + (codes.length - 1) + SENTINELLE;
    });

    t = esc(t);
    // [texte](cible) — les liens internes restent relatifs, ils marchent
    // depuis le dossier docs/livre/ comme dans le dépôt.
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, href) =>
        `<a href="${href}">${txt}</a>`);
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

    return t.replace(new RegExp(SENTINELLE + '([0-9]+)' + SENTINELLE, 'g'),
        (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
}

/** Une ligne de tableau `| a | b |` → les cellules, sans les barres vides. */
function cellules(ligne) {
    return ligne.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
}

const EST_SEPARATEUR = l => /^\s*\|?[\s:-]*-[-\s:|]*\|?\s*$/.test(l) && l.includes('-');

/**
 * Markdown → HTML. Ce qui est couvert, et rien de plus :
 * titres, paragraphes, listes (à puces et numérotées), tableaux, blocs de
 * code clôturés, citations, règles horizontales, et la convention [CAPTURE:].
 */
function versHtml(md) {
    // ⚠️ ON RETIRE LE SÉLECTEUR DE VARIANTE EMOJI (U+FE0F), ET C'EST CE QUI
    // DÉCIDE SI L'IMPRIMEUR PEUT TRAVAILLER. Le livre porte 223 fois « ⚠ »
    // suivi de U+FE0F ; ce caractère invisible EXIGE la présentation couleur,
    // Chrome va donc chercher Segoe UI Emoji — une police que le PDF
    // N'EMBARQUE PAS (mesuré). Sur la machine de l'imprimeur, qui ne l'a pas,
    // le RIP substitue : le triangle devient un carré vide. Et U+FE0F l'emporte
    // sur `font-variant-emoji: text` — mesuré caractère par caractère : sans
    // lui, ⚠ ✅ 🔴 ⚙ viennent tous de Segoe UI Symbol, qui s'embarque.
    // Le caractère de fond ne change pas ; seule sa PRÉSENTATION passe de
    // couleur à noir, ce qui est de toute façon ce qu'on veut d'un livre
    // imprimé en noir. Gardé par tests/livreImprimable.test.js.
    md = String(md).replace(/️/g, '');
    const lignes = String(md).replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let i = 0;

    const fermerListe = (etat) => {
        while (etat.length) out.push(`</${etat.pop()}>`);
    };
    const listes = [];

    while (i < lignes.length) {
        const l = lignes[i];

        // ── bloc de code clôturé ─────────────────────────────────────
        const fence = l.match(/^```(\w*)\s*$/);
        if (fence) {
            fermerListe(listes);
            const lang = fence[1] || '';
            const corps = [];
            i++;
            while (i < lignes.length && !/^```\s*$/.test(lignes[i])) corps.push(lignes[i++]);
            i++;   // la clôture
            out.push(`<pre class="code"${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${esc(corps.join('\n'))}</code></pre>`);
            continue;
        }

        // ── [CAPTURE: ...] — la convention du manuel ─────────────────
        // Rendue VISIBLE et non silencieusement avalée : une capture promise
        // et absente doit se voir sur le papier, sinon personne ne la prendra.
        // ⚠️ Tolérant sur la FORME du marqueur : accents graves optionnels et
        // espace français avant le deux-points. Sept captures étaient annoncées
        // dans les chapitres et UNE SEULE était rendue — le convertisseur les
        // avalait en silence, ce qui est exactement le défaut contre lequel la
        // case existe.
        const cap = l.match(/^\s*`?\[CAPTURE\s*:\s*(.+?)\]`?\s*$/i);
        if (cap) {
            fermerListe(listes);
            out.push(`<div class="capture"><span class="capture-etiq">Capture d'écran attendue</span>${inline(cap[1])}</div>`);
            i++;
            continue;
        }

        // ── tableau ──────────────────────────────────────────────────
        if (/^\s*\|/.test(l) && i + 1 < lignes.length && EST_SEPARATEUR(lignes[i + 1])) {
            fermerListe(listes);
            const entetes = cellules(l);
            i += 2;
            const corps = [];
            while (i < lignes.length && /^\s*\|/.test(lignes[i])) corps.push(cellules(lignes[i++]));
            out.push('<table><thead><tr>'
                + entetes.map(c => `<th>${inline(c)}</th>`).join('')
                + '</tr></thead><tbody>'
                + corps.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('')
                + '</tbody></table>');
            continue;
        }

        // ── titres ───────────────────────────────────────────────────
        const h = l.match(/^(#{1,6})\s+(.*)$/);
        if (h) {
            fermerListe(listes);
            const n = h[1].length;
            const texte = inline(h[2]);
            // Une ancre stable par titre : la table des matières y renvoie.
            const id = h[2].toLowerCase()
                .normalize('NFD').replace(/[̀-ͯ]/g, '')
                .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            out.push(`<h${n} id="${id}">${texte}</h${n}>`);
            i++;
            continue;
        }

        // ── règle horizontale ────────────────────────────────────────
        if (/^\s*(---+|\*\*\*+)\s*$/.test(l)) {
            fermerListe(listes);
            out.push('<hr>');
            i++;
            continue;
        }

        // ── citation ─────────────────────────────────────────────────
        if (/^\s*>\s?/.test(l)) {
            fermerListe(listes);
            const corps = [];
            while (i < lignes.length && /^\s*>\s?/.test(lignes[i])) {
                corps.push(lignes[i].replace(/^\s*>\s?/, ''));
                i++;
            }
            out.push(`<blockquote>${versHtml(corps.join('\n'))}</blockquote>`);
            continue;
        }

        // ── listes (à puces et numérotées, un niveau d'imbrication) ──
        const li = l.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        if (li) {
            const profondeur = Math.floor(li[1].length / 2);
            const type = /\d/.test(li[2]) ? 'ol' : 'ul';
            while (listes.length > profondeur + 1) out.push(`</${listes.pop()}>`);
            if (listes.length === profondeur) { out.push(`<${type}>`); listes.push(type); }
            // ⚠️ UN ÉLÉMENT DE LISTE PEUT TENIR SUR PLUSIEURS LIGNES. Le
            // Markdown du livre indente la suite ; sans ce ramassage, la
            // deuxième ligne tombait dans la branche « paragraphe », qui FERME
            // la liste — et l'élément d'après rouvrait un <ol> repartant de 1.
            // Mesuré sur le dépôt : 164 des 199 éléments étaient coupés, et le
            // lecteur voyait « 1. 1. 1. » là où le texte dit « 1. 2. 3. ».
            // ⚠️ ET L'INCRÉMENT VIENT AVANT LA BOUCLE, sinon le ramassage
            // regarde la ligne du <li> lui-même — qui est un élément de liste,
            // donc rejetée par le garde ci-dessous — et ne ramasse JAMAIS rien.
            // La première version faisait exactement cela : elle avait l'air
            // d'une correction et ne corrigeait rien. C'est
            // tests/livreImprimable.test.js qui l'a montré, pas la relecture.
            const suite = [li[3]];
            i++;
            while (i < lignes.length && lignes[i].trim()
                   && /^\s+\S/.test(lignes[i])
                   && !/^\s*([-*+]|\d+\.)\s+/.test(lignes[i])
                   && !/^\s*(```|>|\||#{1,6}\s)/.test(lignes[i])
                   && !/^\s*\[CAPTURE\s*:/i.test(lignes[i])) {
                suite.push(lignes[i].trim());
                i++;
            }
            out.push(`<li>${inline(suite.join(' '))}</li>`);
            continue;
        }

        // ── ligne vide ───────────────────────────────────────────────
        if (!l.trim()) { fermerListe(listes); i++; continue; }

        // ── paragraphe : les lignes suivantes se recollent ───────────
        fermerListe(listes);
        const para = [l];
        i++;
        while (i < lignes.length && lignes[i].trim()
               && !/^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+\.\s|\s*>|\s*\|)/.test(lignes[i])
               && !/^\s*(---+|\*\*\*+)\s*$/.test(lignes[i])
               && !/^\s*\[CAPTURE\s*:/i.test(lignes[i])) {
            para.push(lignes[i++]);
        }
        out.push(`<p>${inline(para.join(' '))}</p>`);
    }
    fermerListe(listes);
    return out.join('\n');
}

// ── La feuille de style : écran ET papier ────────────────────────────
// La palette est celle de l'application (navy/gold), pour que le livre et les
// écrans se ressemblent.
//
// ⚠️⚠️ CE QUI SUIT A ÉTÉ MESURÉ DANS CHROME 152, PAS SUPPOSÉ. Les trois
// décisions qui commandent tout le reste :
//
//   1. `target-counter()` N'EXISTE PAS dans Chrome. Mesuré : la déclaration
//      entière est jetée par le parseur — on ne perd pas seulement le numéro,
//      on perd aussi le texte littéral qui l'accompagne. Les numéros de page
//      du sommaire sont donc calculés en DEUX PASSES par
//      `scripts/paginer-livre.js`, qui lit les vraies pages dans le PDF.
//
//   2. Les BOÎTES DE MARGE `@page` (`@bottom-right`, `@top-left`…) MARCHENT,
//      avec `counter(page)`, `@page:left`/`:right` et les pages nommées.
//      Le folio et le titre courant sont donc du CSS pur, sans script.
//
//   3. La numérotation ne repart PAS à 1 avec `counter-reset: page 1`
//      (ignoré, mesuré). Ce qui marche : `counter-increment: page 0` sur le
//      gabarit des liminaires — elles ne comptent pas, et le chapitre 1
//      s'ouvre bien sur la page 1.
//
// ⚠️ ET LA MESURE QUI A TOUT DÉCIDÉ : un document dont le contenu dépasse la
// largeur imprimable n'est pas COUPÉ par Chrome, il est RÉDUIT EN ENTIER. Le
// livre d'avant sortait à 80,7 % (facteur px→pt de 0,6055 au lieu de 0,7500),
// c'est-à-dire un corps de 10,5 pt imprimé à 8,5 pt, sur les 84 pages. Le
// coupable n'était pas le code — 0 débordement sur 38 blocs, le plus long
// extrait fait 104 caractères — mais les TABLEAUX : 51 éléments TABLE/TR/TD
// débordaient. D'où `table-layout: fixed` ci-dessous, qui est la ligne la plus
// importante de cette feuille. Vérification : `node scripts/paginer-livre.js`
// refuse de finir si le facteur d'échelle n'est pas exactement 0,750000.
const STYLE = `
:root {
  --navy: #1e3a5f; --navy-clair: #2d5280; --or: #b8860b;
  --rouge: #b91c1c; --ambre: #92400e; --ambre-fond: #fffbeb;
  --texte: #0f172a; --gris: #64748b; --bord: #e2e8f0; --fond-doux: #f8fafc;
  /* Marges de reliure : le grand côté est TOUJOURS celui du dos. */
  --reliure: 26mm; --exterieur: 20mm;
}
* { box-sizing: border-box; }
body {
  margin: 0 auto; padding: 0 2rem 4rem; max-width: 52rem; background: #fff;
  font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 11.5pt; line-height: 1.6; color: var(--texte);
}

/* ══ GABARITS DE PAGE ═══════════════════════════════════════════════ */
@page {
  size: A4;
  margin-top: 20mm; margin-bottom: 22mm;
  @top-left { content: "" } @top-center { content: "" } @top-right { content: "" }
  @bottom-left { content: "" } @bottom-center { content: "" } @bottom-right { content: "" }
}
/* Le folio est toujours du côté EXTÉRIEUR : à droite sur les rectos, à
   gauche sur les versos. C'est ce qu'on cherche du pouce en feuilletant. */
@page :right {
  margin-left: var(--reliure); margin-right: var(--exterieur);
  @bottom-right { content: counter(page);
    font-family: Cambria, Georgia, serif; font-size: 9pt; color: #334455 }
}
@page :left {
  margin-left: var(--exterieur); margin-right: var(--reliure);
  @bottom-left { content: counter(page);
    font-family: Cambria, Georgia, serif; font-size: 9pt; color: #334455 }
  @top-left { content: "MAGBO Access Control";
    font-family: Cambria, Georgia, serif; font-size: 8.5pt; letter-spacing: .04em; color: #667788 }
}
/* Liminaires : ni folio, ni titre courant, et surtout PAS D'INCRÉMENT — c'est
   ce qui fait que le chapitre 1 s'ouvre sur la page 1. */
@page liminaire {
  counter-increment: page 0;
  margin-left: 23mm; margin-right: 23mm;
  @top-left { content: "" } @top-right { content: "" }
  @bottom-left { content: "" } @bottom-right { content: "" }
}
@page couverture {
  counter-increment: page 0; margin: 0;
  @top-left { content: "" } @top-right { content: "" }
  @bottom-left { content: "" } @bottom-right { content: "" }
}

/* ══ CORPS ══════════════════════════════════════════════════════════ */
h1, h2, h3, h4 { color: var(--navy); line-height: 1.25; font-weight: 700; }
h1 { font-size: 2rem; margin: 2.5rem 0 1rem; padding-bottom: .5rem;
     border-bottom: 3px solid var(--navy); }
h2 { font-size: 1.45rem; margin: 2rem 0 .75rem; }
h3 { font-size: 1.15rem; margin: 1.5rem 0 .5rem; }
h4 { font-size: 1rem; margin: 1.25rem 0 .4rem; color: var(--navy-clair); }
p { margin: .7rem 0; }
a { color: var(--navy-clair); }
code { font-family: Consolas, "Cascadia Mono", "Courier New", monospace;
  font-size: .88em; background: var(--fond-doux); border: 1px solid var(--bord);
  border-radius: 3px; padding: .05em .3em; }
pre.code { background: var(--fond-doux); border: 1px solid var(--bord);
  border-left: 4px solid var(--navy-clair); border-radius: 4px;
  padding: .8rem 1rem; overflow-x: auto; font-size: .85em; line-height: 1.45; }
pre.code code { background: none; border: 0; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: .92em; }
th, td { border: 1px solid var(--bord); padding: .45rem .6rem;
  text-align: left; vertical-align: top; }
th { background: var(--navy); color: #fff; font-weight: 600; }
tbody tr:nth-child(even) { background: var(--fond-doux); }
blockquote { margin: 1rem 0; padding: .6rem 1rem;
  border-left: 4px solid var(--or); background: var(--ambre-fond); }
blockquote p { margin: .35rem 0; }
hr { border: 0; border-top: 1px solid var(--bord); margin: 2rem 0; }
ul, ol { margin: .7rem 0; padding-left: 1.6rem; }
li { margin: .3rem 0; }
.avert { margin: 1.5rem 0; padding: 1rem 1.2rem; border: 2px solid var(--rouge);
  border-radius: 6px; background: #fef2f2; }
.avert strong { color: var(--rouge); }
.capture { margin: 1rem 0; padding: .9rem 1rem; border: 2px dashed var(--gris);
  border-radius: 6px; background: var(--fond-doux); color: var(--gris);
  font-style: italic; font-size: .92em; }
.capture-etiq { display: block; font-style: normal; font-weight: 700;
  font-size: .75em; letter-spacing: .08em; text-transform: uppercase;
  color: var(--navy-clair); margin-bottom: .25rem; }

/* ══ PAGES LIMINAIRES ═══════════════════════════════════════════════ */
.couverture-livre, .page-titre, .page-avertissement, .page-dedicace,
.page-sommaire, .page-colophon, .page-blanche {
  font-family: Cambria, "Palatino Linotype", "Book Antiqua", Georgia,
               "Times New Roman", serif;
}
.couverture-livre { display: flex; flex-direction: column;
  justify-content: space-between; text-align: center;
  padding: 30mm 26mm 22mm; min-height: 297mm; }
.couv-marque { font-size: 9pt; letter-spacing: .42em; text-transform: uppercase;
  color: #667788; margin: 0; }
.couv-milieu { margin-top: -16mm; }
.couv-titre { font-size: 34pt; line-height: 1.1; letter-spacing: .015em;
  color: var(--navy); margin: 0; font-weight: 400; }
.couv-filet { width: 44mm; border-top: .7pt solid var(--navy); margin: 10mm auto; }
.couv-sstitre { font-size: 13pt; font-style: italic; color: #334455; margin: 0; }
.couv-lieu { font-size: 10pt; letter-spacing: .16em; text-transform: uppercase;
  color: #445566; margin: 0 0 6mm; }
.couv-auteur { font-size: 13.5pt; color: var(--texte); margin: 0 0 3mm; }
.couv-annee { font-size: 10pt; color: #667788; margin: 0; }

.page-titre { text-align: center; padding-top: 70mm; }
.pt-titre { font-size: 23pt; color: var(--navy); margin: 0 0 4mm; }
.pt-sstitre { font-size: 12pt; font-style: italic; color: #334455; margin: 0; }
.pt-filet { width: 28mm; border-top: .6pt solid #99a3ae; margin: 14mm auto; }
.pt-auteur { font-size: 12.5pt; margin: 0 0 8mm; }
.pt-etab { font-size: 10pt; letter-spacing: .1em; text-transform: uppercase;
  color: #556677; margin: 0 0 2mm; }
.pt-annee { font-size: 10pt; color: #667788; margin: 0; }

.lim-titre { font-size: 11pt; letter-spacing: .24em; text-transform: uppercase;
  color: #667788; font-weight: 400; border: 0; margin: 0 0 10mm; padding: 0;
  font-family: inherit; }
.page-avertissement { padding-top: 45mm; max-width: 120mm; margin-inline: auto;
  font-size: 10.5pt; line-height: 1.7; }
.page-dedicace { display: flex; align-items: center; justify-content: flex-end;
  min-height: 230mm; }
.dedicace-texte { font-style: italic; font-size: 11.5pt; color: #334455;
  text-align: right; max-width: 84mm; line-height: 1.8; }
.page-blanche { min-height: 230mm; }

/* Le sommaire paginé. Les points de conduite sont un fond répété, pas une
   suite de caractères : ils s'arrêtent pile où commence le numéro. */
.page-sommaire { padding-top: 40mm; }
.somm { list-style: none; padding: 0; margin: 0; font-size: 11pt; }
.somm li { margin: 0 0 5mm; }
.somm a { display: flex; align-items: baseline; gap: .4em;
  text-decoration: none; color: var(--texte); }
.somm-titre { flex: 0 1 auto; }
.somm-points { flex: 1 1 auto; min-width: 1.5em; height: 1px;
  border-bottom: 1px dotted #99a3ae; transform: translateY(-.28em); }
.somm-page { flex: 0 0 auto; font-variant-numeric: tabular-nums; color: #334455; }
.somm-page:empty::before { content: "·"; color: #b0b8c0; }

.page-colophon { text-align: center; padding-top: 50mm; max-width: 118mm;
  margin-inline: auto; font-size: 9.5pt; color: #334455; line-height: 1.75; }
.colo-titre { font-size: 10pt; letter-spacing: .24em; text-transform: uppercase;
  color: #667788; font-weight: 400; border: 0; margin: 0; padding: 0;
  font-family: inherit; }
.colo-filet { width: 24mm; border-top: .6pt solid #99a3ae; margin: 9mm auto; }
.colo-liste { display: grid; grid-template-columns: auto auto; gap: 1.5mm 7mm;
  justify-content: center; text-align: left; margin: 0; }
.colo-liste dt { color: #778899; }
.colo-liste dd { margin: 0; }
.colo-note { text-align: left; margin: 0 0 4mm; }
.colo-marque { margin-top: 12mm; font-size: 8.5pt; letter-spacing: .3em;
  text-transform: uppercase; color: #8899aa; }

/* ══════════════════════════════════════════════════════════════════
   IMPRESSION
   ══════════════════════════════════════════════════════════════════ */
@media print {
  /* ⚠️ La chaîne « print-color-adjust: exact » est cherchée LITTÉRALEMENT
     par tests/buildLivre.test.js — espace après le deux-points compris.
     Sans elle, les encadrés et les en-têtes de tableau sortent en gris. */
  html, body, body * {
    print-color-adjust: exact !important;
    -webkit-print-color-adjust: exact !important;
  }

  /* ⚠️ LES PICTOGRAMMES, ET POURQUOI UN IMPRIMEUR AURAIT REFUSÉ LE FICHIER.
     Le livre porte 476 pictogrammes (221 fois le triangle d'avertissement).
     Rendus en emoji couleur, Chrome les prend dans Segoe UI Emoji — une police
     que le PDF N'EMBARQUE PAS (mesuré : 3 descripteurs sur 16 sans FontFile).
     Sur la machine de l'imprimeur, qui ne l'a pas, le RIP substitue : le
     triangle devient un carré vide, ou disparaît.
     font-variant-emoji: text demande la forme TEXTE du même caractère, que
     Chrome va chercher dans une police monochrome — et celle-là s'embarque.
     Le triangle sort en noir, ce qui est de toute façon ce qu'on veut d'un
     livre imprimé en noir. Vérifié : plus aucune police non embarquée. */
  html, body, body * { font-variant-emoji: text; }

  body { max-width: none; padding: 0; margin: 0;
    font-family: Cambria, "Palatino Linotype", "Book Antiqua", Georgia,
                 "Times New Roman", serif;
    font-size: 10.5pt; line-height: 1.5; orphans: 3; widows: 3; }

  /* Pas de veuve, pas d'orpheline : trois lignes minimum de part et d'autre
     d'une coupure. Mesuré : les deux propriétés changent réellement la
     coupure dans Chrome. */
  p, li, blockquote, td, th { orphans: 3; widows: 3; }
  p { margin: 0 0 3.2mm; }

  /* ⚠️ LE TEXTE COURANT EST JUSTIFIÉ — ET LA CÉSURE, ELLE, NE MARCHE PAS.
     « hyphens: auto » est posé ci-dessous et « lang=fr » est sur le <html>
     depuis toujours : ce n'est donc PAS un oubli de langue. Mesuré le
     04/09/2026 dans le Chrome qui imprime ce livre :
     « anticonstitutionnellement » dans une colonne de 24 mm tient sur UNE
     ligne, et un paragraphe français rend 14 lignes avec ET sans césure.
     Chrome livre ses dictionnaires de coupure par le composant updater ;
     celui du français n'est pas là.
     On pose la déclaration quand même : le jour où le dictionnaire arrive,
     le livre s'améliore sans que personne ait à re-décider. */
  .chapitre p, .chapitre li, .page-avertissement p {
    text-align: justify;
    hyphens: auto; -webkit-hyphens: auto;

    /* ⚠⚠ NE PAS SUPPRIMER CES 0,1 px. Ils ne sont pas un reste de mise au
       point : ils sont ce qui empêche Chrome de réduire tout le livre.
       La colonne imprimable vaut 164 mm = 619,84 px — pas un compte rond.
       Justifier pose le dernier glyphe EXACTEMENT sur la marge, et l'arrondi
       sous-pixel le fait déborder d'un cheveu : mesuré le 04/09/2026,
       échelle 0,749962 au lieu de 0,750000, sur les 109 pages, et
       paginer-livre.js refuse alors de finir — à juste titre, c'est le même
       mécanisme silencieux qui sortait le livre à 80,7 %.
       Mesuré aussi : 0,1 px suffit et garde 109 pages ; 0,5 px et 1 px
       rétablissent l'échelle mais font passer le livre à 110 pages.
       0,1 px vaut 0,026 mm : aucune presse ne l'imprime. */
    padding-right: 0.1px; }

  /* ⚠⚠ ON NE JUSTIFIE PAS AUTOUR D'UN CHEMIN DE FICHIER — et c'est la
     règle qui décide si ce livre est imprimable.
     Un paragraphe qui cite du code dans le fil du texte
     (backend/src/main/java/com/magbo/access/controllers/…) porte des jetons
     insécables de 200 px. Ils ne tiennent pas sur la fin d'une ligne, passent
     entièrement à la suivante, et la justification étire alors la poignée de
     mots restée derrière jusqu'à la marge. Au fer à gauche le défaut ne se
     voyait pas : une ligne courte restait courte.
     MESURÉ le 04/09/2026 sur les 1320 lignes justifiables du livre, en
     comparant l'espace réellement rendu à l'espace naturel (3,09 px) :
        tout justifié        — 21,1 % des lignes à ≥ 2x, 8,7 % à ≥ 3x
        avec cette exception —  4,9 % à ≥ 2x, 2,2 % à ≥ 3x
        témoin au fer à gauche — 3,3 % à ≥ 2x, 2,0 % à ≥ 3x
     Autrement dit : le texte de prose se justifie proprement, les paragraphes
     truffés de code ne le peuvent pas, et l'exception les ramène au niveau du
     témoin. 109 pages et échelle 0,750000 dans les trois cas.
     ⚠️ MESURÉ AUSSI, ET ÇA NE MARCHE PAS : rendre le code coupable partout
     (overflow-wrap: anywhere sur le code en ligne) ne change RIEN — chiffres
     identiques à la virgule près. La coupure ne se déclenche que si le jeton
     ne tient pas SEUL sur une ligne ; ici il tient. Ne pas réessayer. */
  .chapitre p:has(code), .chapitre li:has(code) {
    text-align: left; }

  /* Assurance, et rien de plus : un jeton plus large que la colonne ferait
     réduire TOUT le document par Chrome (voir table-layout: fixed plus bas).
     ⚠️ Cette ligne ne corrige AUCUN trou de justification — c'est mesuré
     ci-dessus. Ne pas lui prêter ce rôle.
     « break-word » et NON « anywhere » : « anywhere » change la largeur
     minimale de l'élément, ce qui est exactement le mécanisme du rétrécissement
     à 80,7 %. */
  .chapitre p code, .chapitre li code { overflow-wrap: break-word; }

  /* ⚠️ RESTENT AU FER À GAUCHE, SANS EXCEPTION — ce n'est pas du texte
     courant. Un chemin de fichier ne se coupe pas, et justifier autour de lui
     ouvre des trous ; un tableau, un titre, une légende ou un encadré court
     n'a pas assez de lignes pour qu'une marge droite régulière ait un sens.
     Plusieurs de ces règles sont redéclarées alors qu'elles seraient déjà
     vraies par héritage : c'est voulu, pour qu'un futur « text-align » posé plus
     haut ne les emporte pas en silence. */
  pre, pre.code, code, table, th, td,
  h1, h2, h3, h4, figcaption,
  .capture, .capture-etiq, .avert, .avert p,
  .chapitre blockquote, .chapitre blockquote p {
    text-align: left; hyphens: none; -webkit-hyphens: none; }

  h1, h2, h3, h4 { font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    break-after: avoid; page-break-after: avoid; }
  h2, h3, h4 { break-inside: avoid; }
  /* Un titre ne reste jamais seul en bas de page : ce qui le suit refuse de
     commencer une nouvelle page sans lui. */
  h1 + *, h2 + *, h3 + *, h4 + * { break-before: avoid; page-break-before: avoid; }
  h1 { font-size: 19pt; margin: 0 0 7mm; padding-bottom: 3mm;
       border-bottom: 1.2pt solid var(--navy); }
  h2 { font-size: 13pt; margin: 8mm 0 2mm; }
  h3 { font-size: 11.5pt; margin: 6mm 0 1.5mm; }
  h4 { font-size: 10.5pt; margin: 5mm 0 1.2mm; }

  .couverture-livre { page: couverture; min-height: 0; height: 297mm; }
  .page-titre, .page-avertissement, .page-dedicace, .page-sommaire,
  .page-colophon, .page-blanche { page: liminaire; }
  .couverture-livre, .page-titre, .page-avertissement, .page-dedicace,
  .page-sommaire, .page-colophon, .page-blanche {
    break-after: page; page-break-after: always; min-height: 0; }
  .page-blanche { height: 1mm; }
  .page-dedicace { height: calc(297mm - 42mm); }
  .page-sommaire { padding-top: 12mm; }

  .chapitre { break-before: page; page-break-before: always; }

  /* ⚠️⚠️ LA LIGNE QUI EMPÊCHE LE LIVRE DE RÉTRÉCIR. Sans table-layout: fixed,
     la largeur minimale d'un tableau est celle de son contenu le plus large ;
     51 éléments dépassaient les 164 mm imprimables, et Chrome réduisait TOUT
     LE DOCUMENT à 80,7 % — pas seulement le tableau. Le corps déclaré à
     10,5 pt sortait à 8,5 pt sur 84 pages, sans que rien ne l'annonce.
     La propriete overflow-wrap: anywhere fait le reste : une matricule ou un chemin de
     fichier trop long se coupe dans sa cellule au lieu de la pousser. */
  table { table-layout: fixed; width: 100%; break-inside: auto;
    font-size: 8.8pt; line-height: 1.35; margin: 3.5mm 0; }
  th, td { padding: 1.1mm 1.6mm; border-color: #b9c3d0; border-width: .5pt;
    overflow-wrap: anywhere; word-break: break-word; }
  th code, td code { overflow-wrap: anywhere; }
  /* Un tableau qui traverse une page reprend ses en-têtes sur la suivante. */
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }

  /* Le code se replie au lieu de déborder. Mesuré : aucun des 38 blocs ne
     dépassait déjà, mais la ligne la plus longue fait 104 caractères et rien
     ne garantit que la prochaine sera aussi sage. */
  pre.code { break-inside: auto; white-space: pre-wrap; overflow-wrap: anywhere;
    word-break: break-word; overflow: visible; font-size: 8.4pt;
    line-height: 1.38; padding: 2.5mm 3mm; margin: 3.5mm 0; border-radius: 0;
    border-width: .5pt; border-left-width: 2.4pt; }

  blockquote, .capture, .avert { break-inside: avoid; page-break-inside: avoid;
    border-radius: 0; }
  blockquote { margin: 3.5mm 0; padding: 2mm 3mm; border-left-width: 2.4pt; }
  .avert { margin: 4mm 0; padding: 2.5mm 3mm; border-width: .8pt; }
  .capture { margin: 3.5mm 0; padding: 3mm; border-width: .8pt; font-size: 9pt; }
  ul, ol { margin: 0 0 3.2mm; padding-left: 6mm; }
  li { margin: 0 0 1mm; }

  /* Sur papier un lien ne se clique pas : on écrit où il mène. Sauf dans le
     sommaire, où l'ancre interne n'apprendrait rien à personne. */
  a { color: var(--navy); text-decoration: none; }
  a[href^="http"]::after, a[href^="../"]::after, a[href^="./"]::after {
    content: " (" attr(href) ")"; font-size: .78em; color: var(--gris);
    overflow-wrap: anywhere; }
  .somm a::after { content: none; }
  .no-print { display: none !important; }
}
`;

// ── Assemblage ───────────────────────────────────────────────────────
function chapitres() {
    if (!fs.existsSync(DOSSIER)) return [];
    return fs.readdirSync(DOSSIER)
        .filter(f => /^\d{2}-.+\.md$/.test(f))
        .sort()
        .map(f => {
            const md = fs.readFileSync(path.join(DOSSIER, f), 'utf8');
            const t = md.match(/^#\s+(.+)$/m);
            return { fichier: f, titre: t ? t[1].trim() : f.replace(/\.md$/, ''), md };
        });
}

/**
 * Les numéros de page du sommaire, mesurés lors d'un passage précédent.
 *
 * ⚠️ ILS NE SONT PAS CALCULÉS ICI, ET C'EST LE POINT TECHNIQUE DE TOUT LE
 * CHANTIER. En CSS d'impression, numéroter un sommaire demande
 * `target-counter()`, que Chrome ne connaît pas : mesuré, la déclaration
 * entière est jetée par le parseur. La seule méthode fiable est de POSER LA
 * QUESTION AU PDF — imprimer une fois, lire sur quelle page chaque chapitre
 * est réellement tombé, et réinjecter. C'est le travail de
 * `scripts/paginer-livre.js`, qui écrit ce fichier.
 *
 * ⚠️ La méthode « offsetTop divisé par la hauteur de page » a été essayée et
 * MESURÉE FAUSSE : 1 ancre juste sur 16, une erreur qui s'aggrave page après
 * page (-13 pages à la fin) parce qu'elle ignore les sauts forcés et les
 * `break-inside: avoid`. Elle n'est pas ici.
 *
 * Sans ce fichier, le sommaire renvoie aux chapitres SANS numéro — c'est
 * volontairement dégradé et lisible, jamais un numéro faux.
 */
/**
 * L'EMPREINTE DE CE QUI A ÉTÉ MESURÉ.
 *
 * ⚠️ Elle existe parce que le contraire a été fabriqué en quarante secondes :
 * on ajoute une page à un chapitre, on lance `node scripts/build-livre.js`
 * SEUL, et le livre repart avec les anciens numéros — huit entrées fausses sur
 * neuf, décalées de deux pages — pendant que la console affiche
 * « ✓ … sommaire paginé (9 entrées) » et que la suite de tests reste verte.
 *
 * Un sommaire faux est pire qu'un sommaire sans numéros : le second se voit,
 * le premier envoie quelqu’un à la mauvaise page en lui donnant confiance.
 *
 * Les numéros ne valent que pour un état précis des chapitres ET de la feuille
 * de style (la hauteur d'un titre déplace tout ce qui suit). L'empreinte couvre
 * donc les deux. Quand elle ne correspond plus, on retombe dans le mode
 * dégradé qui existait déjà : le sommaire garde ses liens et perd ses numéros.
 */
function empreinteDesSources() {
    const h = crypto.createHash('sha256');
    for (const c of chapitres()) { h.update(c.fichier); h.update(c.md); }
    h.update(STYLE);
    return h.digest('hex').slice(0, 16);
}
function paginationConnue() {
    try {
        const brut = fs.readFileSync(PAGINATION, 'utf8');
        const p = JSON.parse(brut);
        const pages = (p && typeof p.pages === 'object' && p.pages) || {};
        if (!Object.keys(pages).length) return {};

        const attendue = empreinteDesSources();
        if (p.empreinte !== attendue) {
            const dit = (m) => console.warn(m);
            dit('');
            dit('⚠️  LES NUMÉROS DE PAGE SONT PÉRIMÉS — ils ne sont PAS écrits.');
            dit('   Les chapitres ou la feuille de style ont changé depuis la'
                + ' mesure' + (p.mesure_le ? ' du ' + p.mesure_le : '') + '.');
            dit('   empreinte mesurée  : ' + (p.empreinte || '(absente)'));
            dit('   empreinte actuelle : ' + attendue);
            dit('   Le sommaire garde ses liens et perd ses numéros : c’est le mode');
            dit('   dégradé, et il est correct. Pour les retrouver :');
            dit('       node scripts/paginer-livre.js');
            dit('');
            return {};
        }
        return pages;
    } catch (e) {
        return {};
    }
}

const ancre = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Une chaîne posée dans une valeur CSS `content`, sans échappement \\XXXX. */
// ⚠️ Pas de séquence \\XXXX : en CSS « \\2014 » avale l'espace qui suit et
// « \\2019e » devient U+2019E. Le fichier est en UTF-8, les caractères passent
// tels quels ; il n'y a que la barre oblique inverse et le guillemet à fuir.
const pourCss = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

function construire() {
    const chs = chapitres();
    if (!chs.length) {
        console.error('Aucun chapitre dans ' + DOSSIER + ' (attendu : 01-*.md … 09-*.md)');
        process.exit(1);
    }

    const pages = paginationConnue();
    const liminaires = chs.filter(c => /^00-/.test(c.fichier));
    const numerotes = chs.filter(c => !/^00-/.test(c.fichier));

    // Un gabarit @page par chapitre : c'est ce qui donne le titre courant du
    // bon côté. ⚠️ `string-set` / `string()` ne marchent pas dans Chrome
    // (mesuré) : il n'y a pas d'en-tête « automatique », il faut ÉCRIRE une
    // règle par chapitre. D'où cette génération.
    const gabarits = [];
    const rattachements = [];
    numerotes.forEach((c, idx) => {
        const nom = `chapitre-${String(idx + 1).padStart(2, '0')}`;
        c.gabarit = nom;
        gabarits.push(`@page ${nom}:right { @top-right { content: "${pourCss(c.titre)}";`
            + ` font-family: Cambria, Georgia, serif; font-size: 8.5pt;`
            + ` letter-spacing: .04em; color: #667788 } }`);
        // ⚠️ La page nommée est portée par l'attribut data-page, JAMAIS par une
        // classe supplémentaire : tests/buildLivre.test.js compte les
        // occurrences exactes de class="chapitre", et class="chapitre X" le
        // ferait échouer.
        rattachements.push(`  .chapitre[data-page="${nom}"] { page: ${nom} }`);
    });

    const sommaire = numerotes.map(c => {
        const n = pages[ancre(c.titre)];
        return `      <li><a href="#${ancre(c.titre)}">`
            + `<span class="somm-titre">${esc(c.titre)}</span>`
            + `<span class="somm-points"></span>`
            + `<span class="somm-page">${n ? esc(String(n)) : ''}</span></a></li>`;
    }).join('\n');

    const corps = chs.map(c =>
        `<section class="chapitre" data-fichier="${esc(c.fichier)}"`
        + ` data-page="${c.gabarit || 'liminaire'}">\n${versHtml(c.md)}\n</section>`
    ).join('\n\n');

    const aujourdhui = new Date();
    const p = n => String(n).padStart(2, '0');
    const date = `${p(aujourdhui.getDate())}/${p(aujourdhui.getMonth() + 1)}/${aujourdhui.getFullYear()}`;
    const commit = dernierCommit();

    const css = STYLE
        + '\n/* ── Titres courants, un gabarit par chapitre (généré) ── */\n'
        + gabarits.join('\n')
        + '\n@media print {\n' + rattachements.join('\n')
        + '\n  .chapitre[data-page="liminaire"] { page: liminaire }\n}\n';

    const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MAGBO Access Control — Le livre du système</title>
<style>${css}</style>
</head>
<body>

<!-- ═══════════════════════════════════════════════════════════════════
     PAGES LIMINAIRES — ni titre courant, ni folio.
     Le gabarit « liminaire » porte counter-increment: page 0 : elles ne
     comptent pas, et le chapitre 1 s'ouvre bien sur la page 1.
     ═══════════════════════════════════════════════════════════════════ -->

<section class="couverture-livre">
  <div class="couv-haut">
    <p class="couv-marque">MAGBO Studio</p>
  </div>
  <div class="couv-milieu">
    <p class="couv-titre">MAGBO<br>Access&nbsp;Control</p>
    <div class="couv-filet"></div>
    <p class="couv-sstitre">Le livre du système</p>
  </div>
  <div class="couv-bas">
    <p class="couv-lieu">Lycée Molière · Rio de Janeiro</p>
    <p class="couv-auteur">Sammy Kabagambe Magbo</p>
    <p class="couv-annee">${aujourdhui.getFullYear()}</p>
  </div>
</section>

<section class="page-blanche"></section>

<section class="page-titre">
  <p class="pt-titre">MAGBO Access Control</p>
  <p class="pt-sstitre">Le livre du système</p>
  <div class="pt-filet"></div>
  <p class="pt-auteur">Sammy Kabagambe Magbo</p>
  <p class="pt-etab">Lycée Molière · Rio de Janeiro</p>
  <p class="pt-annee">${aujourdhui.getFullYear()}</p>
</section>

<!-- Verso de la page de titre. Une dédicace s'ouvre sur un recto. -->
<section class="page-blanche"></section>

<!-- ═══════════════════════════════════════════════════════════════════
     ▼▼▼  DÉDICACE — À COMPOSER PAR SAMMY  ▼▼▼
     Remplacer le texte entre <div class="dedicace-texte"> et </div> dans
     scripts/build-livre.js (c'est lui qui produit cette page), puis
     régénérer. Deux ou trois lignes, pas davantage : rien d'autre sur la
     page, ni titre, ni filet, ni numéro.
     ═══════════════════════════════════════════════════════════════════ -->
<section class="page-dedicace">
  <div class="dedicace-texte">
    À composer par Sammy.
  </div>
</section>
<!-- ▲▲▲  FIN DE L'EMPLACEMENT DE LA DÉDICACE  ▲▲▲ -->

<!-- Rien ne fait face à une dédicace. -->
<section class="page-blanche"></section>

<section class="page-avertissement">
  <h2 class="lim-titre">Comment lire ce livre</h2>
  <p>Chaque affirmation technique est vérifiable dans le dépôt&nbsp;: quand un
  fichier est cité, c'est qu'il dit ce qui est écrit. Ce qui n'a pas pu être
  vérifié porte <code>[À VÉRIFIER]</code> avec la commande ou la requête qui le
  confirmerait. Ce que seul Sammy sait porte <code>[À COMPLÉTER PAR SAMMY]</code>
  avec la question précise.</p>
  <p><strong>Une documentation fausse est pire qu'absente</strong>, parce qu'on
  lui fait confiance. Si vous trouvez une affirmation que le dépôt contredit,
  corrigez-la dans <code>docs/livre/</code> et régénérez le livre.</p>
  <p>L'état opérationnel du jour ne vit pas ici&nbsp;: il vit dans
  <code>docs/operacional/handoff.md</code>. C'est le document à ouvrir en
  premier en cas de problème&nbsp;; celui-ci explique <em>pourquoi</em> le
  système est ce qu'il est.</p>
</section>

<section class="page-sommaire">
  <h2 class="lim-titre">Table des matières</h2>
  <ol class="somm">
${sommaire}
  </ol>
</section>

${corps}

<!-- ═══════════════════════════════════════════════════════════════════
     COLOPHON — dernière page, sans folio ni titre courant.
     ═══════════════════════════════════════════════════════════════════ -->
<section class="page-colophon">
  <h2 class="colo-titre">Colophon</h2>
  <div class="colo-filet"></div>
  <dl class="colo-liste">
    <dt>Système</dt><dd>MAGBO Access Control, version ${esc(version())}</dd>
    <dt>Livre arrêté le</dt><dd>${date}</dd>
    <dt>Dernier commit</dt><dd><code>${esc(commit.court)}</code> — branche <code>${esc(commit.branche)}</code></dd>
    <dt>Contenu</dt><dd>${numerotes.length} chapitre${numerotes.length > 1 ? 's' : ''}${liminaires.length ? ', plus le sommaire' : ''}</dd>
    <dt>Établissement</dt><dd>Lycée Molière, Rio de Janeiro</dd>
    <dt>Auteur</dt><dd>Sammy K. MAGBO</dd>
  </dl>
  <div class="colo-filet"></div>
  <p class="colo-note">Composé en Cambria pour le texte, Segoe UI pour les
  titres et Consolas pour le code — trois polices du système, aucune à
  installer. Le livre est un fichier HTML autonome&nbsp;: pas de script, pas de
  ressource réseau, aucune bibliothèque PDF. C'est le navigateur qui imprime.</p>
  <p class="colo-note"><strong>Pour régénérer&nbsp;:</strong>
  <code>node scripts/build-livre.js</code> reconstruit le HTML depuis
  <code>docs/livre/*.md</code>&nbsp;; <code>node scripts/paginer-livre.js</code>
  mesure les vrais numéros de page dans le PDF, les réinjecte dans la table des
  matières et produit <code>docs/livre/livre-complet.pdf</code>.</p>
  <p class="colo-note"><strong>Pour l'imprimeur&nbsp;:</strong> A4, recto-verso,
  reliure côté long. La marge intérieure fait 26&nbsp;mm et l'extérieure
  20&nbsp;mm&nbsp;; <strong>ne pas redimensionner</strong> («&nbsp;Taille
  réelle&nbsp;» / «&nbsp;100&nbsp;%&nbsp;», jamais «&nbsp;Ajuster à la
  page&nbsp;»), sinon les marges de reliure ne sont plus celles qui ont été
  calculées.</p>
  <p class="colo-marque">MAGBO Studio · Rio de Janeiro</p>
</section>

</body>
</html>
`;

    fs.writeFileSync(SORTIE, html, 'utf8');
    const numerotage = Object.keys(pages).length
        ? `sommaire paginé (${Object.keys(pages).length} entrées)`
        : 'sommaire SANS numéros — lancer scripts/paginer-livre.js';
    console.log(`✓ ${path.relative(RACINE, SORTIE)} — ${numerotes.length} chapitres, `
        + `${Math.round(html.length / 1024)} Ko, ${numerotage}`);
    chs.forEach(c => console.log(`    ${c.fichier}  ${c.titre}`));
    console.log('\nPour le PDF prêt à relier : node scripts/paginer-livre.js');
}

/** La version du système, lue dans package.json — jamais recopiée à la main. */
function version() {
    try {
        return JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8')).version;
    } catch (e) {
        return 'inconnue';
    }
}

/**
 * Le dernier commit, pour le colophon.
 *
 * ⚠️ Lu dans .git À LA MAIN, sans lancer `git` : le livre doit pouvoir se
 * régénérer sur une machine où git n'est pas dans le PATH (le poste de
 * l'imprimeur, une copie du dépôt sans outillage). En cas d'échec on écrit
 * « inconnu » — une valeur fausse dans un colophon serait pire que rien.
 */
function dernierCommit() {
    try {
        const tete = fs.readFileSync(path.join(RACINE, '.git', 'HEAD'), 'utf8').trim();
        const m = tete.match(/^ref:\s*(.+)$/);
        if (!m) return { court: tete.slice(0, 7), branche: 'détachée' };
        const branche = m[1].replace(/^refs\/heads\//, '');
        let sha = null;
        const direct = path.join(RACINE, '.git', m[1]);
        if (fs.existsSync(direct)) {
            sha = fs.readFileSync(direct, 'utf8').trim();
        } else {
            // Référence empaquetée (git gc est passé) : packed-refs.
            const paquet = path.join(RACINE, '.git', 'packed-refs');
            if (fs.existsSync(paquet)) {
                const ligne = fs.readFileSync(paquet, 'utf8').split('\n')
                    .find(l => l.endsWith(' ' + m[1]));
                if (ligne) sha = ligne.split(' ')[0];
            }
        }
        return { court: sha ? sha.slice(0, 7) : 'inconnu', branche };
    } catch (e) {
        return { court: 'inconnu', branche: 'inconnue' };
    }
}
if (require.main === module) construire();

// ⚠️ `ancre` est EXPORTÉE, et ce n'est pas de la commodité :
// scripts/paginer-livre.js doit calculer EXACTEMENT la même ancre pour
// rattacher un numéro de page à une entrée du sommaire. Deux copies de la
// formule, c'est un sommaire qui perd ses numéros en silence le jour où
// l'une des deux change.
module.exports = { versHtml, inline, esc, construire, ancre, empreinteDesSources };
