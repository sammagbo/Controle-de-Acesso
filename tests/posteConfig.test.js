// =====================================================================
// CONFIGURATION DU POSTE — les trois branches de résolution (ADR-007)
// =====================================================================
// ⚠️ CE FICHIER EXISTE POUR UNE RAISON QUI N'EST PAS TECHNIQUE : distribuer un
// .exe qui ignorerait les variables d'environnement casserait chaque poste du
// parc le jour de la mise à jour, et il n'y a plus personne pour les rouvrir
// un par un. La branche « environnement » n'est pas une option de confort —
// c'est ce qui rend ce chantier déployable.
//
// Les trois branches, dans l'ordre :
//   1. variables d'environnement  (le .bat d'aujourd'hui)  → PRIORITAIRE
//   2. fichier magbo-poste.json   (le .exe seul)
//   3. écran de première configuration (PC neuf)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PC from '../js/utils/posteConfig.js';

const REPO = path.resolve(__dirname, '..');

/** ACCESS_POINTS réduit à ce dont ces tests ont besoin, même forme que le vrai. */
const POINTS = [
    { id: 'PORT1', nome: 'Portail Principal', category: 'portaria', area: 'portail' },
    { id: 'PORT2', nome: 'Portail Terrain', category: 'portaria', area: 'portail' },
    { id: 'BIBLIO', nome: 'CDI', category: 'especial', area: 'cdi' },
    { id: 'ENFERM', nome: 'Infirmerie', category: 'especial', area: 'infirmerie' },
    { id: 'REFEI1', nome: 'Cantine Principale', category: 'refeitorio', area: 'cantine' },
    { id: 'REFEI2', nome: 'Cantine Secondaire', category: 'refeitorio', area: 'cantine' },
    { id: 'CANTINA_MONITOR', nome: 'Surveillance Cantine', category: 'monitor', area: 'cantine' },
    { id: 'GENERAL_REPORT', nome: 'Rapport Général', category: 'monitor', area: 'admin', hidden: true },
    { id: 'PPMS', nome: 'PPMS', category: 'monitor', area: 'portail' },
];

// ═════════════════════════════════════════════════════════════════════
describe('★★ branche 1 — les variables d’environnement PRIMENT', () => {

    /**
     * ⚠️ LE TEST QUI DÉCIDE SI CE CHANTIER EST DÉPLOYABLE. Un poste lancé par
     * `Abrir-MAGBO.bat` doit se comporter EXACTEMENT comme avant : même
     * adresse, même poste, et surtout aucun écran de configuration.
     */
    it('★★ le .bat gouverne, et l’écran ne s’affiche pas', () => {
        const r = PC.resoudre({
            env: { MAGBO_API_URL: 'http://192.168.1.253:8080', MAGBO_SECTOR: 'BIBLIO' },
            fichier: null
        });

        expect(r.apiUrl).toBe('http://192.168.1.253:8080');
        expect(r.sector).toBe('BIBLIO');
        expect(r.source).toBe(PC.SOURCES.ENVIRONNEMENT);
        expect(r.doitConfigurer).toBe(false);
    });

    /**
     * ⚠️ ET ELLES PRIMENT MÊME QUAND UN FICHIER EXISTE. Sinon un poste du parc
     * qui aurait été ouvert une fois par le .exe (créant un fichier) verrait
     * ensuite ce fichier contredire son .bat — deux vérités sur la même
     * machine, et celle qui gagne dépendrait de l'ordre du code.
     */
    it('★★ elles écrasent le fichier, jamais l’inverse', () => {
        const r = PC.resoudre({
            env: { MAGBO_API_URL: 'http://10.0.0.9:8080', MAGBO_SECTOR: 'PORT2' },
            fichier: { apiUrl: 'http://192.168.1.253:8080', sector: 'REFEI1' }
        });

        expect(r.apiUrl).toBe('http://10.0.0.9:8080');
        expect(r.sector).toBe('PORT2');
        expect(r.source).toBe(PC.SOURCES.ENVIRONNEMENT);
    });

    /**
     * ⚠️ UNE SEULE des deux variables suffit à rester en « mode .bat », et les
     * replis reproduisent le comportement d'avant ce chantier (main.js faisait
     * `process.env.MAGBO_SECTOR || 'PORT1'`). Un lanceur incomplet ne doit pas
     * se mettre soudain à poser des questions.
     */
    it('★ une seule variable suffit — les replis sont ceux d’avant', () => {
        const seulementUrl = PC.resoudre({ env: { MAGBO_API_URL: 'http://10.0.0.9:8080' } });
        expect(seulementUrl.sector).toBe('PORT1');
        expect(seulementUrl.doitConfigurer).toBe(false);

        const seulementPoste = PC.resoudre({ env: { MAGBO_SECTOR: 'ENFERM' } });
        expect(seulementPoste.apiUrl).toBe(PC.DEFAUT_API_URL);
        expect(seulementPoste.doitConfigurer).toBe(false);
    });

    it('une variable vide ou faite d’espaces ne compte pas comme posée', () => {
        const r = PC.resoudre({ env: { MAGBO_API_URL: '   ', MAGBO_SECTOR: '' }, fichier: null });
        expect(r.source).toBe(PC.SOURCES.AUCUNE);
        expect(r.doitConfigurer).toBe(true);
    });
});

// ═════════════════════════════════════════════════════════════════════
describe('★★ branche 2 — le fichier à côté du .exe', () => {

    it('★★ le .exe seul, déjà configuré : aucune question', () => {
        const r = PC.resoudre({
            env: {},
            fichier: { apiUrl: 'http://192.168.1.253:8080', sector: 'REFEI1', version: 1 }
        });

        expect(r.apiUrl).toBe('http://192.168.1.253:8080');
        expect(r.sector).toBe('REFEI1');
        expect(r.source).toBe(PC.SOURCES.FICHIER);
        expect(r.doitConfigurer).toBe(false);
    });

    it('l’adresse du fichier est normalisée à la lecture', () => {
        const r = PC.resoudre({ env: {}, fichier: { apiUrl: '192.168.1.253:8080/', sector: 'PORT1' } });
        expect(r.apiUrl).toBe('http://192.168.1.253:8080');
    });

    /**
     * ⚠️ UN FICHIER À MOITIÉ ÉCRIT REPOSE LA QUESTION. Mieux vaut demander une
     * fois de plus que démarrer sur une demi-configuration et laisser quelqu'un
     * chercher pourquoi l'écran est vide. Ce qui a été lu sert à pré-remplir.
     */
    it('★ fichier incomplet : on redemande, en pré-remplissant', () => {
        const sansPoste = PC.resoudre({ env: {}, fichier: { apiUrl: 'http://10.0.0.9:8080' } });
        expect(sansPoste.doitConfigurer).toBe(true);
        expect(sansPoste.apiUrl).toBe('http://10.0.0.9:8080');   // pré-rempli
        expect(sansPoste.sector).toBe('');

        const sansUrl = PC.resoudre({ env: {}, fichier: { sector: 'BIBLIO' } });
        expect(sansUrl.doitConfigurer).toBe(true);
        expect(sansUrl.sector).toBe('BIBLIO');
    });
});

// ═════════════════════════════════════════════════════════════════════
describe('★★ branche 3 — le PC neuf : on demande', () => {

    it('★★ ni variable ni fichier : l’écran s’affiche', () => {
        const r = PC.resoudre({ env: {}, fichier: null });

        expect(r.doitConfigurer).toBe(true);
        expect(r.source).toBe(PC.SOURCES.AUCUNE);
        expect(r.sector).toBe('');
    });

    /**
     * ⚠️ L'adresse est PRÉ-REMPLIE avec la valeur du parc : celui qui installe
     * un PC de plus n'a rien à retaper, et celui qui déménage la VM n'a qu'un
     * champ à corriger.
     */
    it('★ l’adresse propose la valeur du parc, jamais localhost', () => {
        const r = PC.resoudre({ env: {}, fichier: null });
        expect(r.apiUrl).toBe(PC.DEFAUT_API_URL);
        expect(r.apiUrl).not.toContain('localhost');
    });

    it('★ le poste n’est JAMAIS deviné — on ne pré-coche pas PORT1', () => {
        // Deviner « portail » enverrait la moitié des PC neufs porter le nom
        // d'un lieu où ils ne sont pas, sans que personne ne s'en aperçoive.
        expect(PC.resoudre({ env: {}, fichier: null }).sector).toBe('');
    });

    it('appelé sans rien du tout, ne lève pas', () => {
        expect(() => PC.resoudre()).not.toThrow();
        expect(PC.resoudre().doitConfigurer).toBe(true);
    });
});

// ═════════════════════════════════════════════════════════════════════
describe('la liste des postes — ACCESS_POINTS fait autorité', () => {

    /**
     * ⚠️ POURQUOI PAS `door_mappings`. La raison qui tranche n'est pas
     * esthétique : on ne peut pas interroger la base AVANT de connaître
     * l'adresse du serveur, et c'est exactement la question que l'écran pose.
     * Une liste venue du serveur exigerait de connaître le serveur pour
     * demander où l'on est.
     */
    it('★★ ce sont les LIEUX, pas les écrans', () => {
        const ids = PC.postesDisponibles(POINTS).map(p => p.id);

        // ⚠️ Les LIEUX sont ceux d'ACCESS_POINTS, dans l'ordre, et rien
        // d'autre. La dernière entrée n'est pas un lieu : c'est le poste
        // administratif, qui ne vient pas de la constante — voir le bloc qui
        // lui est consacré, et l'ADR-007.
        expect(ids.slice(0, -1)).toEqual(['PORT1', 'PORT2', 'BIBLIO', 'ENFERM', 'REFEI1', 'REFEI2']);
        expect(ids[ids.length - 1]).toBe(PC.POSTE_ADMINISTRATIF);

        expect(ids).not.toContain('CANTINA_MONITOR');   // un écran, pas un lieu
        expect(ids).not.toContain('GENERAL_REPORT');
        expect(ids).not.toContain('PPMS');
    });

    /**
     * ⚠️ REFEI2 est le contre-exemple qui règle le débat : il a un écran et
     * une vraie salle, mais AUCUNE ligne dans `door_mappings` (le seed s'arrête
     * à REFEI1). Une liste venue de la base l'aurait oublié, et le PC de la
     * seconde cantine n'aurait pas pu se nommer.
     */
    it('★★ REFEI2 est offert, alors que door_mappings ne le connaît pas', () => {
        expect(PC.postesDisponibles(POINTS).map(p => p.id)).toContain('REFEI2');
    });

    it('les noms affichés sont ceux de l’application, pas les codes', () => {
        const cdi = PC.postesDisponibles(POINTS).find(p => p.id === 'BIBLIO');
        expect(cdi.nom).toBe('CDI');
    });

    it('une liste absente ou cassée ne fait pas tomber l’écran', () => {
        expect(PC.postesDisponibles(undefined)).toEqual([]);
        expect(PC.postesDisponibles([null, {}, { id: 'X' }])).toEqual([]);
    });

    it('posteValide n’accepte que ce que la liste offre', () => {
        expect(PC.posteValide('BIBLIO', POINTS)).toBe(true);
        expect(PC.posteValide('PPMS', POINTS)).toBe(false);
        expect(PC.posteValide('', POINTS)).toBe(false);
    });
});

// ═════════════════════════════════════════════════════════════════════
describe('l’adresse telle que les gens la tapent', () => {

    it('★ ajoute http:// quand il manque', () => {
        expect(PC.normaliserUrl('192.168.1.253:8080')).toBe('http://192.168.1.253:8080');
    });

    it('★ https:// est respecté — on ne le remplace jamais', () => {
        expect(PC.normaliserUrl('https://magbo.lycee.fr')).toBe('https://magbo.lycee.fr');
    });

    it('enlève la barre finale et les espaces d’un copier-coller', () => {
        expect(PC.normaliserUrl('  http://192.168.1.253:8080/  ')).toBe('http://192.168.1.253:8080');
        expect(PC.normaliserUrl('http://192.168.1.253:8080///')).toBe('http://192.168.1.253:8080');
    });

    it('vide reste vide', () => {
        expect(PC.normaliserUrl('')).toBe('');
        expect(PC.normaliserUrl(null)).toBe('');
    });

    /**
     * ⚠️ LE PORT MANQUANT EST LA FAUTE DE FRAPPE LA PLUS COURANTE, et sans ce
     * contrôle elle se manifeste comme « aucune réponse » — indiscernable d'un
     * serveur éteint. On la nomme AVANT le test de connexion.
     */
    it('★ le port manquant est nommé, pas laissé au hasard', () => {
        expect(PC.verifierUrl('http://192.168.1.253')).toBe('poste.err.url.port');
        expect(PC.verifierUrl('192.168.1.253')).toBe('poste.err.url.port');
    });

    it('une adresse complète passe', () => {
        expect(PC.verifierUrl('http://192.168.1.253:8080')).toBe(null);
        expect(PC.verifierUrl('192.168.1.253:8080')).toBe(null);
    });

    it('vide et informe sont distingués', () => {
        expect(PC.verifierUrl('')).toBe('poste.err.url.vide');
        expect(PC.verifierUrl('http://')).toBe('poste.err.url.forme');
    });

    /** ⚠️ Les clés rendues doivent exister dans les DEUX dictionnaires. */
    it('★ toute clé d’erreur rendue est une vraie clé i18n', async () => {
        const I18N = (await import('../js/utils/i18n.js')).default;
        for (const entree of ['', 'http://', 'http://192.168.1.253']) {
            const cle = PC.verifierUrl(entree);
            expect(I18N.DICIONARIOS.fr[cle], `fr: ${cle}`).toBeTruthy();
            expect(I18N.DICIONARIOS.pt[cle], `pt: ${cle}`).toBeTruthy();
        }
    });
});

// ═════════════════════════════════════════════════════════════════════
describe('ce qui est écrit dans le fichier', () => {

    it('normalise, et rien de plus', () => {
        expect(PC.aEcrire('  192.168.1.253:8080/ ', ' BIBLIO ')).toEqual({
            apiUrl: 'http://192.168.1.253:8080',
            sector: 'BIBLIO',
            version: 1
        });
    });

    /**
     * ⚠️ AUCUN SECRET, JAMAIS. Le fichier est en clair à côté du .exe sur un PC
     * partagé de la Vie Scolaire. Le PIN de kiosque reste une variable
     * d'environnement ; les identifiants restent dans la session.
     */
    it('★★ ne contient qu’une adresse et un nom de poste', () => {
        const ecrit = PC.aEcrire('http://x:8080', 'PORT1');
        expect(Object.keys(ecrit).sort()).toEqual(['apiUrl', 'sector', 'version']);
    });

    /**
     * ⚠️ Ce qui est écrit doit se relire à l'identique — sinon un poste
     * configuré redemanderait sa configuration à la réouverture, ce qui est
     * précisément le défaut que ce chantier supprime.
     */
    it('★★ aller-retour : ce qui est écrit se relit sans redemander', () => {
        const ecrit = PC.aEcrire('192.168.1.253:8080', 'REFEI2');
        const relu = PC.resoudre({ env: {}, fichier: ecrit });

        expect(relu.doitConfigurer).toBe(false);
        expect(relu.apiUrl).toBe('http://192.168.1.253:8080');
        expect(relu.sector).toBe('REFEI2');
        expect(relu.source).toBe(PC.SOURCES.FICHIER);
    });
});

// ═════════════════════════════════════════════════════════════════════
describe('★★ ce qui est écrit doit se relire comme une configuration', () => {

    /**
     * ⚠️ UN JSON VALIDE N'EST PAS UNE CONFIGURATION VALIDE, et c'est ce qui
     * manquait. `aEcrire('', '')` produit `{"apiUrl":"","sector":"",…}`, que
     * `JSON.parse` accepte et que `resoudre` relit en `doitConfigurer: true`.
     * Le processus principal écrivait donc ce fichier, répondait « enregistré »,
     * rechargeait la page — et retombait sur l'écran de configuration, sans un
     * mot. C'est « l'enregistré qui ment » que ce chantier existe pour
     * supprimer, déplacé d'un cran.
     * (Panel de revue — qualité, 2e tour, 02/09/2026.)
     */
    it('★★ un réglage vide n’est pas utilisable', () => {
        expect(PC.utilisable(PC.aEcrire('', ''))).toBe(false);
    });

    it('★★ une adresse sans poste n’est pas utilisable', () => {
        expect(PC.utilisable(PC.aEcrire('http://192.168.1.253:8080', ''))).toBe(false);
    });

    it('★★ un poste sans adresse n’est pas utilisable', () => {
        expect(PC.utilisable(PC.aEcrire('', 'BIBLIO'))).toBe(false);
    });

    it('les deux réponses présentes → utilisable', () => {
        expect(PC.utilisable(PC.aEcrire('http://192.168.1.253:8080', 'BIBLIO'))).toBe(true);
    });

    it('rien du tout → pas utilisable, et surtout pas une exception', () => {
        expect(PC.utilisable(null)).toBe(false);
        expect(PC.utilisable(undefined)).toBe(false);
        expect(PC.utilisable({})).toBe(false);
    });

    /**
     * ⚠️ Volontairement muet sur la LISTE des postes : `ACCESS_POINTS` n'existe
     * pas dans le processus principal, et refuser un identifiant inconnu
     * empêcherait d'ajouter un point sans republier le `.exe`. On refuse le
     * vide, pas l'inattendu — et ce test dit que c'est un choix.
     */
    it('un identifiant de poste inconnu est ACCEPTÉ, et c’est délibéré', () => {
        expect(PC.utilisable(PC.aEcrire('http://192.168.1.253:8080', 'MAGASIN'))).toBe(true);
    });
});

// ═════════════════════════════════════════════════════════════════════
describe('★★ faut-il verrouiller ce poste en quiosque ?', () => {

    /**
     * ⚠️ CETTE RÈGLE VIT ICI PARCE QU'ELLE EXISTE EN DEUX ENDROITS DU
     * PROCESSUS PRINCIPAL — les options de la fenêtre, et l'enregistrement des
     * raccourcis globaux — et que le premier tour de revue n'en avait corrigé
     * qu'un. La fenêtre s'ouvrait bien en mode normal sur un poste non réglé,
     * mais `globalShortcut` confisquait quand même Alt+F4, Ctrl+W, F11 et
     * Alt+Tab POUR TOUT LE SYSTÈME : l'AED à qui le guide fait ouvrir un
     * navigateur pour vérifier `/api/health` ne pouvait plus le fermer.
     * Deux copies d'une règle, c'est une copie qu'on oublie.
     * (Panel de revue — Vie Scolaire et qualité, 2e tour, 02/09/2026.)
     */
    it('hors production, jamais', () => {
        expect(PC.verrouillable(false, { doitConfigurer: false })).toBe(false);
        expect(PC.verrouillable(false, { doitConfigurer: true })).toBe(false);
    });

    it('en production, sur un poste réglé : oui', () => {
        expect(PC.verrouillable(true, { doitConfigurer: false })).toBe(true);
    });

    it('★★ en production, sur un poste NON réglé : NON', () => {
        // Sinon il ouvrirait sa question en plein écran, touches de sortie
        // bloquées — et si le serveur ne répond pas, le bouton « Enregistrer »
        // ne s'ouvre jamais. La machine devient un écran sans issue, à la
        // cantine, à 11h50.
        expect(PC.verrouillable(true, { doitConfigurer: true })).toBe(false);
    });

    it('une configuration absente est traitée comme réglée, pas comme une erreur', () => {
        // `doitConfigurer` indéfini ne doit pas déverrouiller un poste de
        // production par accident : le déverrouillage est une exception
        // nommée, pas un défaut de lecture.
        expect(PC.verrouillable(true, null)).toBe(true);
        expect(PC.verrouillable(true, {})).toBe(true);
    });
});

// ═════════════════════════════════════════════════════════════════════
describe('★★ ce que la page fait de ce que le pont lui rend', () => {

    /**
     * ⚠️ DEUX QUESTIONS DISTINCTES, et les confondre a produit les deux
     * défauts opposés — c'est pour cela que la règle est ici et non recopiée
     * dans `js/App.js`, où une inversion d'un mot passait inaperçue (mesuré au
     * 2e tour : la mutation ne faisait rougir aucun des 787 tests).
     */
    it('le pont a rendu une configuration → on la prend telle quelle', () => {
        const c = { apiUrl: 'http://192.168.1.253:8080', sector: 'PORT1', doitConfigurer: false };
        expect(PC.resoudreDuPont(true, c)).toBe(c);
    });

    it('★★ pont présent mais muet → on DEMANDE', () => {
        // Canal muet, versions dépareillées. Le repli inverse sautait l'écran
        // sur un PC neuf et affichait une application qui ne pouvait joindre
        // personne — le symptôme même que ce chantier supprime.
        expect(PC.resoudreDuPont(true, null).doitConfigurer).toBe(true);
    });

    it('★★ pas de pont du tout → on ne demande RIEN', () => {
        // Page ouverte dans un navigateur, tests : il n'y a pas de poste à
        // régler, et poser la question n'aurait aucun sens.
        expect(PC.resoudreDuPont(false, null).doitConfigurer).toBe(false);
    });
});

// ═════════════════════════════════════════════════════════════════════
describe('★★ le poste administratif — celui qui n’est pas un point de passage', () => {

    /**
     * ⚠️ POURQUOI CETTE ENTRÉE EXISTE. L'écran obligeait à choisir un LIEU :
     * la garde `peutEnregistrer` exige un poste, et la liste ne contenait que
     * des portails, le CDI, l'infirmerie et les réfectoires. Les machines de
     * la Vie Scolaire, de la direction et de l'informatique ne sont postées
     * nulle part — elles ouvrent l'administration, le planning, la recherche.
     * Le PC du directeur s'intitulait donc « MAGBO — PORT1 », et quelqu'un
     * allait finir par croire que ce PC enregistrait des passages au portail.
     */
    it('★★ l’entrée est proposée, et EN DERNIER', () => {
        const liste = PC.postesDisponibles(POINTS);
        expect(liste[liste.length - 1].id).toBe(PC.POSTE_ADMINISTRATIF);
    });

    it('★★ elle ne vit PAS dans ACCESS_POINTS — la vraie constante, pas la fixture', () => {
        // ⚠️ LA RAISON EST MESURÉE. `ACCESS_POINTS` fabrique la grille de
        // cartes du tableau de bord, et `Dashboard.js` lit
        // `CATEGORY_COLORS[point.category].bg` SANS garde : une entrée dont la
        // catégorie n'est pas dans CATEGORY_COLORS fait tomber le tableau de
        // bord pour tous les opérateurs. Ce test lit donc les deux constantes
        // RÉELLES : la valeur n'est pas dans la liste, et sa catégorie n'a pas
        // de couleur — si un jour elle en a une, c'est que quelqu'un l'a
        // ajoutée comme carte, et ce test doit le lui faire dire.
        const constants = fs.readFileSync(path.join(REPO, 'js', 'data', 'constants.js'), 'utf8');
        const grille = constants.match(/const ACCESS_POINTS = \[[\s\S]*?\n\];/)[0];
        const couleurs = constants.match(/const CATEGORY_COLORS = \{[\s\S]*?\n\};/)[0];

        expect(grille).not.toContain("'" + PC.POSTE_ADMINISTRATIF + "'");
        expect(couleurs).not.toMatch(/administratif/);
        expect(POINTS.some(p => p.id === PC.POSTE_ADMINISTRATIF)).toBe(false);
    });

    it('★ son libellé vient du dictionnaire, pas d’un nom en dur', () => {
        // « Portail Principal » et « CDI » sont des noms propres et ne se
        // traduisent pas ; « Poste administratif » si. C'est la seule entrée
        // de cette liste qui porte une clé i18n.
        const admin = PC.postesDisponibles(POINTS)
            .find(p => p.id === PC.POSTE_ADMINISTRATIF);
        expect(admin.cleI18n).toBe('poste.administratif');
        expect(admin.categorie).toBe('administratif');
    });

    /**
     * ⚠️★★ LA VALEUR EST EXPLICITE, JAMAIS VIDE. `aEcrire('', '')` produit un
     * JSON parfaitement valide qui se relit en « non configuré » : le poste
     * reposerait sa question à chaque ouverture. C'est le défaut trouvé au 2e
     * tour de revue du chantier précédent, et « pas de poste » aurait été
     * exactement le même piège sous un autre nom.
     */
    it('★★ elle ne se confond PAS avec « non configuré »', () => {
        const admin = PC.aEcrire('http://192.168.1.253:8080', PC.POSTE_ADMINISTRATIF);
        const vide  = PC.aEcrire('http://192.168.1.253:8080', '');

        expect(PC.utilisable(admin)).toBe(true);
        expect(PC.utilisable(vide)).toBe(false);

        expect(PC.resoudre({ env: {}, fichier: admin }).doitConfigurer).toBe(false);
        expect(PC.resoudre({ env: {}, fichier: vide }).doitConfigurer).toBe(true);
    });

    it('★★ elle fait l’aller-retour par le fichier sans se déformer', () => {
        const ecrit = PC.aEcrire('192.168.1.253:8080/', PC.POSTE_ADMINISTRATIF);
        const relu = PC.resoudre({ env: {}, fichier: ecrit });
        expect(relu.sector).toBe('ADMINISTRATIF');
        expect(relu.apiUrl).toBe('http://192.168.1.253:8080');
        expect(relu.source).toBe(PC.SOURCES.FICHIER);
    });

    it('★ l’adresse du serveur reste obligatoire, poste administratif ou non', () => {
        // Une machine administrative interroge le serveur autant qu'un
        // portail : sans adresse, elle n'ouvre rien.
        expect(PC.utilisable(PC.aEcrire('', PC.POSTE_ADMINISTRATIF))).toBe(false);
    });

    it('★ `estAdministratif` répond sur la valeur, pas sur autre chose', () => {
        expect(PC.estAdministratif(PC.POSTE_ADMINISTRATIF)).toBe(true);
        expect(PC.estAdministratif('  ADMINISTRATIF  ')).toBe(true);   // saisie du .bat
        expect(PC.estAdministratif('PORT1')).toBe(false);
        expect(PC.estAdministratif('')).toBe(false);
        expect(PC.estAdministratif(null)).toBe(false);
        expect(PC.estAdministratif(undefined)).toBe(false);
        expect(PC.estAdministratif('administratif')).toBe(false);      // la casse compte
    });

    it('★ elle est acceptée par la validation de poste', () => {
        expect(PC.posteValide(PC.POSTE_ADMINISTRATIF, POINTS)).toBe(true);
    });

    /**
     * ⚠️ AUCUN LIEU CONNU → LISTE VIDE, l'entrée administrative comprise.
     * Si `ACCESS_POINTS` manque (ordre des `<script>` cassé), n'offrir QUE
     * « Poste administratif » serait pire que n'offrir rien : la personne qui
     * installe le PC du portail y verrait la seule option et la choisirait.
     */
    it('★★ sans aucun lieu connu, la liste est VIDE — pas réduite à l’entrée administrative', () => {
        expect(PC.postesDisponibles([])).toEqual([]);
        expect(PC.postesDisponibles(null)).toEqual([]);
        expect(PC.postesDisponibles([{ id: 'PPMS', nome: 'PPMS', category: 'monitor' }])).toEqual([]);
    });
});

// ═════════════════════════════════════════════════════════════════════
describe('★★ les trois branches de résolution restent CELLES QU’ELLES ÉTAIENT', () => {

    /**
     * ⚠️ CE CHANTIER NE DOIT RIEN CHANGER À L'ORDRE. `MAGBO_SECTOR` ne pilote
     * que le titre de la fenêtre — aucun fichier de `js/` ne lit
     * `config.sector` — et l'entrée administrative ne doit pas commencer à lui
     * donner un rôle. Ces trois cas sont recopiés du chantier précédent, avec
     * la valeur nouvelle, pour que la garde morde si l'ordre bouge.
     */
    it('★★ environnement AVANT fichier, même quand le fichier dit « administratif »', () => {
        const r = PC.resoudre({
            env: { MAGBO_API_URL: 'http://10.0.0.1:8080', MAGBO_SECTOR: 'PORT2' },
            fichier: PC.aEcrire('http://192.168.1.253:8080', PC.POSTE_ADMINISTRATIF)
        });
        expect(r.source).toBe(PC.SOURCES.ENVIRONNEMENT);
        expect(r.sector).toBe('PORT2');
        expect(r.doitConfigurer).toBe(false);
    });

    it('★★ un `.bat` peut poser MAGBO_SECTOR=ADMINISTRATIF, et il gagne', () => {
        // Le parc doit pouvoir régler une machine administrative par lanceur
        // comme n'importe quelle autre : la valeur traverse la branche 1 sans
        // traitement particulier.
        const r = PC.resoudre({
            env: { MAGBO_API_URL: 'http://192.168.1.253:8080', MAGBO_SECTOR: 'ADMINISTRATIF' },
            fichier: null
        });
        expect(r.source).toBe(PC.SOURCES.ENVIRONNEMENT);
        expect(PC.estAdministratif(r.sector)).toBe(true);
        expect(r.doitConfigurer).toBe(false);
    });

    it('★★ ni variable ni fichier → on demande, comme avant', () => {
        const r = PC.resoudre({ env: {}, fichier: null });
        expect(r.source).toBe(PC.SOURCES.AUCUNE);
        expect(r.doitConfigurer).toBe(true);
        expect(r.sector).toBe('');
    });
});
