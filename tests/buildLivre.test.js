// =====================================================================
// Le convertisseur du livre — et les deux propriétés qui comptent
// =====================================================================
// `scripts/build-livre.js` embarque son propre convertisseur Markdown plutôt
// que d'ajouter une dépendance : le projet n'a pas de bundler, ne charge aucun
// CDN, et vendorise dans `libs/`. Ce test est la contrepartie de ce choix —
// un convertisseur maison sans test est une dette, pas une économie.
//
// Deux propriétés valent plus que la mise en forme :
//   1. le HTML produit est AUTONOME (aucun script, aucune ressource réseau) —
//      le livre doit s'ouvrir depuis une clé USB sur un poste hors ligne ;
//   2. `print-color-adjust: exact` est présent — sans lui le navigateur jette
//      les fonds et le livre sort en gris. La leçon a déjà été payée sur
//      l'affiche cantine, le 28/08.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { versHtml, esc } = require(path.join(RACINE, 'scripts', 'build-livre.js'));

describe('le convertisseur Markdown du livre', () => {

    it('★★ rend les formes que le livre utilise vraiment', () => {
        const html = versHtml([
            '# Titre',
            '',
            'Un **gras**, un `bout de code`, et [un renvoi](../operacional/handoff.md).',
            '',
            '| Colonne | Valeur |',
            '|---|---|',
            '| a | b |',
            '',
            '- une puce',
            '',
            '```bash',
            'echo "ok"',
            '```',
            '',
            '> une citation',
        ].join('\n'));

        expect(html).toContain('<h1');
        expect(html).toContain('<strong>gras</strong>');
        expect(html).toContain('<code>bout de code</code>');
        expect(html).toContain('<a href="../operacional/handoff.md">');
        expect(html).toContain('<table>');
        expect(html).toContain('<li>une puce</li>');
        expect(html).toContain('<pre class="code"');
        expect(html).toContain('<blockquote>');
    });

    it('★★★ le contenu cité ne peut pas devenir du HTML actif', () => {
        // Les chapitres citent des balises (`<script src="…">` dans
        // l'avertissement sur les CDN). Elles doivent s'AFFICHER, jamais
        // s'exécuter — un livre qui exécute ce qu'il cite est une faille.
        const html = versHtml('Un `<script src="https://x">` et <img onerror="x">.');
        expect(html).not.toMatch(/<script[^>]*>/);
        expect(html).not.toMatch(/<img[^>]*onerror/);
        expect(html).toContain('&lt;script');
    });

    it('★★ le gras à l\'intérieur d\'un bout de code reste du texte', () => {
        // Sans mise de côté du code inline, un `**` dans une commande citée
        // deviendrait du gras et la commande s'afficherait à moitié en italique.
        const html = versHtml('Lancer `grep -rn "**/*.java" .` ici.');
        expect(html).toContain('<code>grep -rn "**/*.java" .</code>');
        expect(html).not.toContain('<strong>');
    });

    it('★★ [CAPTURE: …] devient une case VISIBLE, jamais un silence', () => {
        // Une capture promise et absente doit se voir sur le papier : avalée,
        // personne ne la prendra jamais.
        const html = versHtml('[CAPTURE: l\'écran du CDI avec une alerte]');
        expect(html).toContain('capture-etiq');
        expect(html).toContain("l'écran du CDI avec une alerte");
    });

    it('★★★ toutes les FORMES du marqueur de capture sont reconnues', () => {
        // ⚠️ Défaut réel, trouvé le 29/08 : sept captures étaient annoncées dans
        // les chapitres et UNE SEULE était rendue. Les autres portaient l'espace
        // français avant le deux-points, ou des accents graves — le convertisseur
        // les avalait EN SILENCE. Une capture promise qui disparaît est
        // exactement ce que la case existe pour empêcher.
        const formes = [
            "[CAPTURE: sans espace]",
            "[CAPTURE : avec l'espace français]",
            "`[CAPTURE : entre accents graves]`",
            "  [CAPTURE: indenté]",
        ];
        for (const f of formes) {
            expect(versHtml(f), 'forme non reconnue : ' + f).toContain('capture-etiq');
        }
    });

    it('★ échappe les entités dans le bon ordre', () => {
        expect(esc('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
    });
});

describe('le livre assemblé', () => {
    const SORTIE = path.join(RACINE, 'docs', 'livre', 'livre-complet.html');
    const existe = fs.existsSync(SORTIE);
    const html = existe ? fs.readFileSync(SORTIE, 'utf8') : '';

    /**
     * Une balise qui CHARGE quelque chose depuis l'extérieur du fichier.
     *
     * ⚠️ Nommé et partagé de propos délibéré. Le test sur le livre assemblé ne
     * peut rien prouver tant qu'aucune capture n'existe — et le dépôt n'en
     * contient aucune : le prédicat serait resté non exercé jusqu'au jour où il
     * déciderait vraiment, sur le livre parti à l'imprimeur.
     * ⚠️ Comparé sans expression régulière : ce dépôt a déjà perdu un antislash
     * en écrivant un fichier (4146dd5).
     */
    const chargeDehors = (b) =>
        b.slice(0, 4).toLowerCase() !== '<img'
        || b.indexOf('src=' + '"' + 'data:image/') < 0;

    it('★★★ il est AUTONOME — rien à charger depuis le réseau', () => {
        if (!existe) return;   // pas encore généré : `node scripts/build-livre.js`
        // ⚠️ On cherche des ressources RÉELLEMENT chargées. Une URL citée dans
        // un bloc de code est échappée (`&lt;script`) et donc inerte : la
        // distinction est tout l'objet de ce test.
        const balises = html.match(/<(script|link|img|iframe)\b[^>]*>/gi) || [];
        // ⚠️ UNE CAPTURE INCORPORÉE N'EST PAS UNE RESSOURCE RÉSEAU. Depuis
        // que les captures existent, le livre porte des <img> — mais en data:,
        // donc DÉJÀ CONTENUS dans le fichier. Ce test garde l'intention
        // (« s'ouvrir depuis une clé USB, hors ligne »), pas la lettre.
        // ⚠️ Un src="captures/x.png" reste un ÉCHEC : il ferait du livre un
        // dossier au lieu d'un fichier, et le premier qui enverrait le seul
        // .html par courriel enverrait un livre sans images.
        // ⚠️ Comparé sans expression régulière, de propos délibéré : ce dépôt a
        // déjà perdu un antislash en écrivant un fichier (4146dd5).
        const externes = balises.filter(chargeDehors);
        expect(externes,
            'Le livre doit s\'ouvrir depuis une clé USB sur un poste hors ligne. '
            + 'Balises actives trouvées : ' + externes.join(' , ')).toEqual([]);
    });

    it('★★★ la règle d\'autonomie distingue les cinq cas', () => {
        // ⚠️ LA RÈGLE A ÉTÉ RELÂCHÉE le jour où les captures sont arrivées :
        // elle interdisait TOUTE balise <img>, ce qu'une capture incorporée est.
        // Relâcher une garde sans l'exercer, c'est la supprimer en croyant
        // l'assouplir — et le dépôt ne contient aucune image, donc le prédicat
        // ne déciderait rien avant le livre parti à l'imprimeur. Ces cinq
        // chaînes tiennent le relâchement exactement aussi large qu'annoncé.
        const A_ACCEPTER = ['<img src="data:image/png;base64,iVBORw0KGgo">'];
        const A_REJETER = [
            '<img src="captures/05-carte-creneau.png">',    // le livre cesserait d'être UN fichier
            '<img src="https://exemple.fr/ecran.png">',     // réseau
            '<script src="https://cdn.exemple.fr/x.js">',   // script distant
            '<link rel="stylesheet" href="styles.css">',    // feuille externe
        ];
        for (const b of A_ACCEPTER) expect(chargeDehors(b), 'refusé à tort : ' + b).toBe(false);
        for (const b of A_REJETER) expect(chargeDehors(b), 'accepté à tort : ' + b).toBe(true);
    });

    it('★★★ le style d\'impression garde les couleurs', () => {
        if (!existe) return;
        // Sans ces deux lignes, le navigateur JETTE les fonds à l'impression et
        // le livre sort en gris — le défaut de l'affiche cantine, qui revient
        // dès qu'on l'oublie.
        expect(html).toContain('print-color-adjust: exact');
        expect(html).toContain('-webkit-print-color-adjust: exact');
    });

    it('★★ toutes les captures annoncées sont RENDUES, aucune avalée', () => {
        if (!existe) return;
        const dansLesChapitres = fs.readdirSync(path.join(RACINE, 'docs', 'livre'))
            .filter(f => /^0[1-9]-.+\.md$/.test(f))
            .reduce((n, f) => n + (fs.readFileSync(path.join(RACINE, 'docs', 'livre', f), 'utf8')
                .match(/\[CAPTURE\s*:/gi) || []).length, 0);
        // ⚠️⚠️ ON COMPTE data-capture=, ET PAS capture-etiq. Deux raisons,
        // chacune avec sa façon à elle de rendre ce test faux :
        //   1. capture-etiq apparaît AUSSI DANS LA FEUILLE DE STYLE — le compte
        //      était gonflé des occurrences CSS (7 cases en rendaient 9) ;
        //   2. dès qu'une image existe, sa capture devient une <figure> et perd
        //      capture-etiq : le compte se serait mis à BAISSER le jour où
        //      quelqu'un fait le travail. Avec le seuil à 7 il aurait survécu à
        //      une capture, puis à deux, et serait devenu rouge à la troisième
        //      — en accusant le convertisseur d'avoir avalé une capture qu'il
        //      venait justement de rendre.
        // data-capture= est porté par les DEUX états : la case et la figure.
        const dansLeHtml = (html.match(/data-capture=/g) || []).length;
        expect(dansLeHtml,
            `${dansLesChapitres} capture(s) annoncée(s) dans les chapitres, ${dansLeHtml} rendue(s). `
            + 'Une capture avalée par le convertisseur ne sera jamais prise.')
            .toBeGreaterThanOrEqual(dansLesChapitres);
    });

    it('★ il porte les neuf chapitres et le sommaire', () => {
        if (!existe) return;
        expect((html.match(/class="chapitre"/g) || []).length).toBeGreaterThanOrEqual(10);
    });
});
