#!/usr/bin/env node
/**
 * MESURER LA JUSTIFICATION DU LIVRE — l'instrument qui refait les chiffres.
 *
 * ⚠️ CE SCRIPT EXISTE PARCE QU'UNE MESURE QU'ON NE PEUT PAS REFAIRE N'EST PAS
 * UNE GARDE, C'EST UNE OPINION DATÉE. Les commentaires de la feuille de style
 * d'impression (scripts/build-livre.js) affirment des pourcentages précis pour
 * justifier un choix typographique. Sans cet outil, la personne qui voudra
 * retirer l'exception :has(code) — ou simplement vérifier qu'elle sert encore
 * après deux cents lignes de chapitre en plus — n'aurait que la parole d'un
 * commentaire. C'est exactement la doctrine que le livre s'impose à lui-même,
 * et qui a fait naître scripts/paginer-livre.js : poser la question au vrai
 * rendu, jamais l'estimer.
 *
 * Il ne fait PARTIE D'AUCUNE construction : rien ne l'appelle, il ne modifie
 * rien, et il n'est pas dans `npm test` (il lui faut Chrome et une minute).
 *
 *     node scripts/build-livre.js && node scripts/mesurer-justification.js
 *
 * CE QU'IL MESURE, ET COMMENT
 *
 * 1. LA CÉSURE. Hors du gabarit du livre : une page à part, lang=fr, Cambria
 *    10,5 pt, colonne FORCÉE à 24 mm, le mot « anticonstitutionnellement »
 *    seul. Avec une césure active il se coupe sur plusieurs lignes ; sans
 *    dictionnaire il déborde sur une seule. Un paragraphe français de 164 mm
 *    est rendu deux fois, hyphens:auto et hyphens:none — même nombre de
 *    lignes = aucune césure.
 *
 * 2. LES TROUS. Chaque mot du texte courant est enveloppé dans un <span>, les
 *    spans sont regroupés en lignes par CHEVAUCHEMENT VERTICAL (un <code> en
 *    ligne n'a pas la même métrique que le texte autour : grouper sur le `top`
 *    exact coupe une ligne en plusieurs — défaut mesuré et corrigé ici), puis
 *    on prend la MÉDIANE des vides entre mots de chaque ligne. Médiane et non
 *    moyenne : deux éléments en ligne collés l'un à l'autre donnent un vide
 *    nul qui n'est pas une espace. Le rapport à l'espace naturelle dit
 *    combien l'espace a grandi. La dernière ligne d'un paragraphe est exclue :
 *    elle n'est jamais justifiée.
 *
 * TROIS ÉTATS SONT COMPARÉS, et c'est la comparaison qui a valeur de preuve :
 *    publié   — le livre tel qu'il sort, avec l'exception :has(code)
 *    tout     — l'exception annulée, tout le texte courant justifié
 *    témoin   — tout au fer à gauche : le plancher, jamais dépassable
 * Le témoin n'est pas à zéro et c'est normal : il mesure le bruit de la
 * méthode elle-même. C'est à lui qu'il faut comparer « publié », pas à 1,00.
 */

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const LIVRE = path.join(RACINE, 'docs', 'livre', 'livre-complet.html');
const LARGEUR_COLONNE_PX = 620;   // 164 mm a 96 dpi, la colonne imprimable

function trouverChrome() {
    const candidats = [
        process.env.MAGBO_CHROME,
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
        '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].filter(Boolean);
    for (const c of candidats) { try { if (fs.existsSync(c)) return c; } catch (e) { /* suivant */ } }
    return null;
}

const SANS_EXCEPTION = '.chapitre p:has(code),.chapitre li:has(code),'
    + '.page-avertissement p:has(code){text-align:justify !important}';
const TOUT_A_GAUCHE = '.chapitre p,.chapitre li,.page-avertissement p{text-align:left !important}';

/** Enveloppe chaque mot, regroupe par ligne, rend le rapport espace/naturelle. */
function sonde() {
    const mesure = document.createElement('span');
    mesure.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
    document.body.appendChild(mesure);
    mesure.textContent = 'i i'; const avec = mesure.getBoundingClientRect().width;
    mesure.textContent = 'ii'; const sans = mesure.getBoundingClientRect().width;
    const naturelle = avec - sans;
    mesure.remove();

    const milieu = (t) => { const u = t.slice().sort((a, b) => a - b); return u[Math.floor(u.length / 2)]; };
    const rapports = [];

    for (const p of document.querySelectorAll('.chapitre p, .chapitre li, .page-avertissement p')) {
        if (!p.textContent.trim()) continue;

        const textes = [];
        const promeneur = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        let n; while ((n = promeneur.nextNode())) textes.push(n);
        for (const t of textes) {
            const morceaux = t.nodeValue.split(' ');
            if (morceaux.length < 2) continue;
            const bloc = document.createDocumentFragment();
            morceaux.forEach((m, k) => {
                if (k > 0) bloc.appendChild(document.createTextNode(' '));
                if (!m) return;
                const sp = document.createElement('span');
                sp.dataset.mot = '1'; sp.textContent = m;
                bloc.appendChild(sp);
            });
            t.parentNode.replaceChild(bloc, t);
        }

        const boites = [...p.querySelectorAll('span[data-mot]')]
            .map(sp => sp.getBoundingClientRect()).filter(r => r.width > 0.1);
        if (boites.length < 4) continue;
        boites.sort((u, v) => ((u.top + u.bottom) / 2) - ((v.top + v.bottom) / 2) || u.left - v.left);

        const lignes = [];
        for (const b of boites) {
            const L = lignes[lignes.length - 1];
            if (L && (b.top + b.bottom) / 2 < L.bas) { L.mots.push(b); L.bas = Math.max(L.bas, b.bottom); }
            else lignes.push({ mots: [b], bas: b.bottom });
        }
        for (let i = 0; i < lignes.length - 1; i++) {
            const M = lignes[i].mots.slice().sort((u, v) => u.left - v.left);
            if (M.length < 4) continue;
            const vides = [];
            for (let k = 0; k < M.length - 1; k++) {
                const v = M[k + 1].left - M[k].right;
                if (v > 0.5) vides.push(v);
            }
            if (vides.length < 3) continue;
            rapports.push(milieu(vides) / naturelle);
        }
    }
    return { naturelle, rapports };
}

function cesure() {
    const page = document.createElement('div');
    page.innerHTML = '<p id="etroit-avec" style="width:24mm;hyphens:auto;-webkit-hyphens:auto">'
        + 'anticonstitutionnellement</p>'
        + '<p id="etroit-sans" style="width:24mm;hyphens:none;-webkit-hyphens:none">'
        + 'anticonstitutionnellement</p>';
    page.style.cssText = 'font-family:Cambria,Georgia,serif;font-size:10.5pt;line-height:1.5';
    document.body.appendChild(page);
    const lignes = (id) => {
        const el = document.getElementById(id);
        const r = document.createRange(); r.selectNodeContents(el);
        return [...r.getClientRects()].filter(x => x.width > 1).length;
    };
    const r = { avec: lignes('etroit-avec'), sans: lignes('etroit-sans') };
    page.remove();
    return r;
}

async function principal() {
    if (!fs.existsSync(LIVRE)) {
        console.error('✗ ' + path.relative(RACINE, LIVRE) + ' absent — lancer d abord node scripts/build-livre.js');
        process.exit(1);
    }
    const exe = trouverChrome();
    if (!exe) { console.error('✗ Chrome introuvable. Poser MAGBO_CHROME sur le chemin de chrome.exe.'); process.exit(1); }
    let playwright;
    try { playwright = require('playwright-core'); }
    catch (e) { console.error('✗ playwright-core absent (npm install).'); process.exit(1); }

    const navigateur = await playwright.chromium.launch({ executablePath: exe });
    const resultats = {};
    try {
        for (const [nom, css] of [['publie', ''], ['tout', SANS_EXCEPTION], ['temoin', TOUT_A_GAUCHE]]) {
            const page = await navigateur.newPage({ viewport: { width: LARGEUR_COLONNE_PX, height: 1000 } });
            await page.emulateMedia({ media: 'print' });
            await page.goto('file:///' + LIVRE.split(String.fromCharCode(92)).join('/'), { waitUntil: 'load' });
            if (css) await page.addStyleTag({ content: '@media print{' + css + '}' });
            if (nom === 'publie') resultats.cesure = await page.evaluate(cesure);
            resultats[nom] = await page.evaluate(sonde);
            await page.close();
        }
    } finally { await navigateur.close(); }

    console.log('');
    console.log('① LA CÉSURE (colonne forcée à 24 mm, hors gabarit du livre)');
    const c = resultats.cesure;
    console.log('   « anticonstitutionnellement » : ' + c.avec + ' ligne(s) avec césure, '
        + c.sans + ' sans.');
    console.log('   -> ' + (c.avec > c.sans
        ? 'LA CÉSURE FONCTIONNE : le tableau ci-dessous ne décrit plus ce Chrome.'
        : 'AUCUNE CÉSURE. Le compromis :has(code) garde sa raison d être.'));

    console.log('');
    console.log('② LES TROUS — espace rendue / espace naturelle ('
        + resultats.publie.naturelle.toFixed(2) + ' px)');
    console.log('   état      lignes   médiane    >= 2x            >= 3x');
    for (const nom of ['publie', 'tout', 'temoin']) {
        const r = resultats[nom].rapports.slice().sort((a, b) => a - b);
        const n = r.length;
        const part = (s) => { const k = resultats[nom].rapports.filter(x => x >= s).length;
            return String(k).padStart(4) + ' (' + (100 * k / n).toFixed(1) + ' %)'; };
        console.log('   ' + nom.padEnd(9) + String(n).padStart(5) + '   '
            + r[Math.floor(n / 2)].toFixed(2) + 'x     ' + part(2) + '   ' + part(3));
    }
    console.log('');
    console.log('   « témoin » est le PLANCHER : il mesure le bruit de la méthode,');
    console.log('   pas un défaut. C est à lui qu il faut comparer « publié ».');
    console.log('');
}

principal().catch(e => { console.error('✗ ' + (e && e.message || e)); process.exit(1); });
