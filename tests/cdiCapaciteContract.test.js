// =====================================================================
// GARDE — le CDI n'affiche QU'UNE capacité, et l'alerte part au badge RÉEL
// =====================================================================
// Deux défauts relevés par le panel du 27/08, tous deux invisibles pour une
// suite qui ne rend aucun composant. Ce fichier les tient par la chaîne de
// caractères, comme `AccessLogRepositoryQueryGuardTest` tient les requêtes
// que H2 n'exécute pas : ce n'est pas une preuve que l'écran marche, c'est
// une alarme quand quelqu'un défait la correction sans le savoir.
//
// 1. `CDI_CAPACITY` était lu à deux endroits du composant en plus du repli :
//    capacité réglée à 30, la grande alerte partait à 30 pendant que le
//    compteur restait bleu et annonçait « / 50 ». Deux nombres pour la même
//    salle sur le même écran — `f442db9` mot pour mot.
//
// 2. Le badge réel n'arrive PAS par `togglePresence` : un élève qui passe sa
//    carte au terminal BIBLIO entre par le polling de 3 s. Sans le diff dans
//    le tick, la fonctionnalité ne couvrait que les scans faits dans l'écran
//    — c'est-à-dire pas le cas qu'elle existe pour couvrir.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEW = fs.readFileSync(path.join(RAIZ, 'js/cdi/BibliotecaView.js'), 'utf8');
const DADOS = fs.readFileSync(path.join(RAIZ, 'js/cdi/cdiData.js'), 'utf8');

describe('CDI — une seule capacité à l\'écran', () => {
    it('★★★ `CDI_CAPACITY` n\'apparaît que comme REPLI, jamais dans l\'affichage', () => {
        const usos = VIEW.split('\n')
            .map((l, i) => ({ n: i + 1, l }))
            .filter(o => /\bCDI_CAPACITY\b/.test(o.l))
            // la ligne de commentaire qui explique la règle ne compte pas
            .filter(o => !/^\s*\/\//.test(o.l));

        expect(usos.length,
            'CDI_CAPACITY doit être lu à UN seul endroit — le repli de `capacite`. '
            + 'Lu ailleurs, l\'écran affiche deux capacités différentes en même temps. '
            + 'Trouvé aux lignes : ' + usos.map(o => o.n).join(', ')
        ).toBe(1);

        expect(usos[0].l).toMatch(/const capacite\s*=/);
    });

    it('★★ le compteur et le seuil `isFull` lisent `capacite`, pas la constante', () => {
        expect(VIEW).toMatch(/const isFull = count >= capacite;/);
        expect(VIEW).toMatch(/\/ \{capacite\}/);
    });

    it('★ le bandeau est rendu dans les DEUX modes, pas seulement en urgence', () => {
        // Il vivait dans le bloc `if (emergency)` : déclarer le CDI fermé
        // n'affichait rien pendant le service normal, le seul mode où
        // quelqu'un le lirait.
        const ocorrencias = (VIEW.match(/<CdiBandeauEtat\b/g) || []).length;
        expect(ocorrencias,
            'un rendu en mode normal et un en mode urgence').toBe(2);
        // et il est défini au scope du module, pas dans le parent
        expect(VIEW).toMatch(/^function CdiBandeauEtat\(/m);
    });
});

describe('CDI — l\'alerte part sur le badge réel', () => {
    it('★★★ le tick du polling évalue les nouveaux présents', () => {
        // Le corps du `reload` doit calculer la différence et appeler
        // l'évaluation. Sans ça, seuls les scans faits DANS l'écran alertent.
        expect(VIEW).toMatch(/const novos = dentroIds\.filter\(id => !antes\.has\(id\)\)/);
        // ⚠️ La CONDITION, pas seulement l'appel : vérifier que
        // `avisarRef.current(...)` est écrit quelque part laisse passer un
        // `if (false)` autour. Vérifié par mutation.
        expect(VIEW).toMatch(/if \(novos\.length\) \{\s*\n\s*avisarRef\.current\(novos, antes\.size, dentroIds\.length, freshStudents\);/);
    });

    it('★★★ un seul chemin d\'évaluation, partagé par le scan et le polling', () => {
        // `avisar` est la porte unique : deux évaluations parallèles finiraient
        // par diverger, et c'est celle du badge réel qui serait oubliée.
        expect(VIEW).toMatch(/const avisar = useCallback\(/);
        expect(VIEW).toMatch(/const alertou = isEntering \? avisar\(\[mapped\], antes, depois\) : false;/);
    });

    it('★★★ « complet » ne part que sur le FRONT MONTANT', () => {
        // `depois >= capacite` seul : une modale et un clic de souris par
        // personne pendant toute une récréation. Le bandeau permanent dit le
        // reste du temps que la salle est pleine.
        expect(VIEW).toMatch(/antes < capacite && depois >= capacite/);
    });

    it('★★★ un passage normal EFFACE l\'alerte précédente, muet ou pas', () => {
        // Le `setAlerte(null)` doit être hors de la condition `muted` : sinon,
        // écran muet, le nom, la classe et la PHOTO d'un enfant exclu restent
        // en plein écran pendant les passages suivants.
        const bloco = VIEW.slice(VIEW.indexOf('const alertou ='), VIEW.indexOf('if (fromScanner)'));
        const iNull = bloco.indexOf('setAlerte(null)');
        const iMuted = bloco.indexOf('if (!muted)');
        expect(iNull).toBeGreaterThan(-1);
        expect(iMuted).toBeGreaterThan(-1);
        expect(iNull, '`setAlerte(null)` doit précéder le test de `muted`').toBeLessThan(iMuted);
    });
});

describe('CDI — les trois sons restent distincts', () => {
    it('★★ le son du danger ne commence pas comme le son du succès', () => {
        const succes = DADOS.match(/success: \(\) => cdiPlayBeep\((\d+)/);
        const exclu = DADOS.slice(DADOS.indexOf('exclu: () =>'));
        const primeira = exclu.match(/cdiPlayBeep\((\d+)/);
        expect(succes).toBeTruthy();
        expect(primeira).toBeTruthy();
        // 880 Hz sine bref = succès. Si l'exclusion ouvre dans ce registre,
        // ses 150 premières millisecondes SONT le son du OK, et à un comptoir
        // on est déjà passé au suivant avant la deuxième note.
        expect(Number(primeira[1]),
            'la première note de `exclu` doit être nettement plus grave que `success`'
        ).toBeLessThan(Number(succes[1]) / 2);
    });

    it('★ l\'alerte est plus forte que la routine', () => {
        // Tous les sons partageaient le même gain fixe : celui qui compte
        // n'était pas plus audible que celui qu'on entend cent fois par jour.
        expect(DADOS).toMatch(/cdiPlayBeep\(300, 0\.16, 'sawtooth', 0\.22\)/);
        expect(DADOS).toMatch(/ganho = 0\.1/);
    });
});
