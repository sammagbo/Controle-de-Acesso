// =====================================================================
// CONFIGURATION DU POSTE — l'ordre de résolution, et rien d'autre
// =====================================================================
// ⚠️ CE MODULE EST CHARGÉ DEUX FOIS, ET C'EST VOULU : par le processus
// PRINCIPAL d'Electron (`require` dans main.js, avant que la fenêtre existe)
// et par la PAGE (`<script>` dans index.html, pour l'écran de première
// configuration). C'est le même fichier, donc la même règle des deux côtés.
//
// Il fallait qu'il en soit ainsi. Le premier dessin mettait la résolution dans
// un fichier `electron/` réservé au processus principal — mais le portail de
// release (`scripts/indexAssets.js`) fige sa liste de points d'entrée à
// QUATRE, avec un commentaire qui dit que la liste ne grandit pas : « tout
// fichier NOUVEAU de l'app entre par la page, donc entre tout seul ». Un
// cinquième point d'entrée écrit à la main aurait été le début d'une liste
// qui vieillit — exactement le défaut que ce portail existe pour empêcher.
// Le module UMD entre par la page, et le processus principal le `require`.
//
// ⚠️ AUCUN ACCÈS DISQUE, AUCUN `window`, AUCUN MODULE NODE. Que de la
// décision. Le processus principal fait les entrées-sorties ; la page fait le
// rendu. Ce fichier ne fait que trancher, ce qui le rend testable sans
// Electron et sans navigateur.
//
// Charge des deux façons :
//   • navigateur → window.MagboPosteConfig, via <script> dans index.html
//   • Node / Vitest → module.exports

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboPosteConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    /**
     * L'adresse du serveur de l'école, telle qu'elle est déployée aujourd'hui.
     *
     * ⚠️ Sert de valeur PRÉ-REMPLIE dans l'écran de première configuration, et
     * de repli quand une variable d'environnement fixe le poste sans fixer
     * l'adresse. Ce n'est pas une vérité : c'est le point de départ le plus
     * probable, modifiable à l'écran. La VM peut déménager.
     */
    const DEFAUT_API_URL = 'http://192.168.1.253:8080';

    /**
     * Le poste par défaut quand une variable d'environnement en oublie un.
     *
     * ⚠️ IL N'EXISTE QUE POUR LA COMPATIBILITÉ. Un `.bat` qui poserait
     * `MAGBO_API_URL` sans `MAGBO_SECTOR` se comporte aujourd'hui comme si le
     * poste était PORT1 (main.js, avant ce chantier) ; ce repli garde ce
     * comportement à l'identique. Il n'est JAMAIS utilisé pour éviter de poser
     * la question : sans variable d'environnement et sans fichier, on demande.
     */
    const DEFAUT_SECTOR = 'PORT1';

    /** Le nom du fichier déposé à côté du .exe. */
    const NOM_FICHIER = 'magbo-poste.json';

    /**
     * ★ LE POSTE QUI N'EST PAS UN POINT DE PASSAGE.
     *
     * Les machines de la Vie Scolaire, de la direction et de l'informatique
     * ouvrent l'administration, le planning et la recherche. Elles ne sont
     * postées nulle part. Jusqu'ici l'écran les obligeait à cocher un lieu
     * physique : le PC du directeur s'intitulait « MAGBO — PORT1 », et
     * quelqu'un allait finir par croire que ce PC enregistrait des passages.
     *
     * ⚠️ CETTE VALEUR NE VIT PAS DANS `ACCESS_POINTS`, ET LA RAISON EST
     * MESURÉE, PAS DE PRINCIPE. `ACCESS_POINTS` n'est pas seulement une liste
     * de lieux : c'est la source de la GRILLE DE CARTES du tableau de bord
     * (`Dashboard.js`), du sélecteur de points de l'administration et du
     * routage de `App.js`. Toute entrée qu'on y ajoute devient une carte à
     * ouvrir, et `Dashboard.js` lit `CATEGORY_COLORS[point.category].bg`
     * SANS garde : une catégorie inconnue fait tomber le tableau de bord
     * dans l'ErrorBoundary pour tous les opérateurs de l'école. Un poste
     * administratif n'est ni un lieu ni un écran — il n'a pas de carte à
     * ouvrir, donc rien à faire dans la liste qui fabrique les cartes.
     *
     * (Une première rédaction invoquait le « miroir de l'`AreaMapping` du
     * backend ». C'était commode et faux : la constante porte déjà dix
     * entrées `monitor` que le backend ne connaît pas. Corrigé au panel.)
     *
     * Il vit donc ici, à côté de la fonction qui construit la liste de
     * l'écran — la seule qui a besoin de le connaître.
     *
     * ⚠️ La chaîne est EXPLICITE, jamais vide. `aEcrire('', '')` produit un
     * JSON parfaitement valide qui se relit en « non configuré » : le poste
     * repose alors sa question à chaque ouverture. C'est le défaut trouvé au
     * 2e tour de revue du chantier précédent, et le réintroduire ici sous
     * couvert de « pas de poste » serait le même piège avec un autre nom.
     */
    const POSTE_ADMINISTRATIF = 'ADMINISTRATIF';

    /**
     * Le libellé du titre de fenêtre pour ce poste-là.
     *
     * ⚠️ EN FRANÇAIS EN DUR, et il faut dire pourquoi plutôt que de faire
     * semblant. Le titre est dessiné par Windows AVANT que la page n'existe,
     * donc avant que la langue choisie — qui vit dans le `localStorage` du
     * rendu — soit lisible. Le processus principal n'a pas d'i18n, et lui en
     * donner une pour une chaîne obligerait à choisir une langue au démarrage
     * sans pouvoir la lire. Le dictionnaire porte la version traduite, pour
     * l'écran ; celle-ci ne sert qu'à la barre de titre.
     */
    const TITRE_ADMINISTRATIF = 'Poste administratif';

    /** D'où vient la configuration retenue — pour l'écran et pour le journal. */
    const SOURCES = {
        ENVIRONNEMENT: 'environnement',
        FICHIER: 'fichier',
        AUCUNE: 'aucune'
    };

    // -----------------------------------------------------------------

    function texte(v) {
        return typeof v === 'string' ? v.trim() : '';
    }

    /**
     * Met une adresse saisie à la main sous une forme utilisable.
     *
     * ⚠️ CE QUE LES GENS TAPENT VRAIMENT. « 192.168.1.253:8080 » sans schéma,
     * une barre oblique finale, des espaces collés par un copier-coller. Sans
     * ce nettoyage, l'adresse part telle quelle dans un `fetch` et échoue pour
     * une raison que personne ne voit à l'écran.
     *
     * ⚠️ Le schéma ajouté est `http://` et pas `https://` : le serveur de
     * l'école est en clair sur le réseau interne, et proposer `https` ferait
     * échouer chaque saisie sans schéma. Le jour où il passe en TLS, la
     * personne tape `https://` et c'est respecté.
     */
    function normaliserUrl(brut) {
        let s = texte(brut);
        if (!s) return '';
        s = s.replace(/\s+/g, '');
        if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
        return s.replace(/\/+$/, '');
    }

    /**
     * L'adresse est-elle utilisable ? Rend `null` si oui, sinon une clé i18n
     * décrivant le problème.
     *
     * ⚠️ Rend une CLÉ, pas une phrase : ce module est partagé avec le
     * processus principal, qui n'a pas les dictionnaires. C'est la page qui
     * traduit.
     */
    function verifierUrl(brut) {
        const s = normaliserUrl(brut);
        if (!s) return 'poste.err.url.vide';
        let u;
        try {
            u = new URL(s);
        } catch (e) {
            return 'poste.err.url.forme';
        }
        if (!u.hostname) return 'poste.err.url.forme';
        // ⚠️ Une adresse SANS PORT est presque toujours une erreur ici : le
        // backend écoute sur 8080 et rien ne sert le port 80 sur la VM. Mieux
        // vaut le dire que laisser le test de connexion échouer sans cause.
        if (!u.port && u.protocol === 'http:') return 'poste.err.url.port';
        return null;
    }

    /**
     * LES POSTES OFFERTS DANS LA LISTE.
     *
     * ⚠️ LA LISTE FAIT AUTORITÉ DEPUIS `ACCESS_POINTS` (js/data/constants.js),
     * PAS DEPUIS `door_mappings`. Trois raisons, dans l'ordre de force :
     *
     *  1. **On ne peut pas interroger la base avant de connaître l'adresse du
     *     serveur.** C'est précisément la question que l'écran pose. Une liste
     *     venue du serveur exigerait de connaître le serveur pour demander où
     *     l'on est — l'œuf et la poule, et un écran vide le jour où la VM est
     *     éteinte.
     *  2. `door_mappings` décrit les **TERMINAUX**, pas les postes de travail.
     *     Un PC n'est pas un lecteur facial. La table semée ne connaît pas
     *     REFEI2, qui est pourtant un vrai lieu avec un vrai écran ; à
     *     l'inverse elle porte deux lignes par point (entrée et sortie), ce
     *     qui n'a aucun sens dans une liste de postes.
     *  3. `ACCESS_POINTS` est déjà la liste des écrans que l'application sait
     *     ouvrir. Choisir un poste, c'est choisir un de ces écrans : c'est la
     *     même liste, et en fabriquer une deuxième garantirait qu'elles
     *     divergent.
     *
     * ⚠️ Filtré sur `category !== 'monitor'` : on garde les LIEUX PHYSIQUES
     * (portails, CDI, infirmerie, réfectoires) et on écarte les écrans qui
     * n'en sont pas — rapports, surveillance, PPMS, écrans de gestion. Un PC
     * ne se trouve pas « à Rapport Cantine » ; il se trouve à la cantine.
     *
     * @param accessPoints la constante ACCESS_POINTS, passée par l'appelant
     *                     (le module reste pur et testable sans le navigateur)
     */
    function postesDisponibles(accessPoints) {
        // ⚠️ AUCUN LIEU CONNU → LISTE VIDE, l'entrée administrative comprise.
        // Si `ACCESS_POINTS` manque (ordre des <script> cassé) ou arrive vide,
        // n'offrir QUE « Poste administratif » serait pire que n'offrir rien :
        // la personne qui installe le PC du portail y verrait la seule option
        // disponible et la choisirait. Une liste vide, elle, se voit.
        const lieux = Array.isArray(accessPoints) ? lieuxPhysiques(accessPoints) : [];
        if (lieux.length === 0) return [];
        return lieux.concat([{
            // ⚠️ EN DERNIER, et sans nom en dur : le libellé vient du
            // dictionnaire (`cleI18n`), parce que c'est la seule entrée de
            // cette liste qui n'est pas un nom propre. « Portail Principal »
            // et « CDI » ne se traduisent pas ; « Poste administratif » si.
            id: POSTE_ADMINISTRATIF,
            cleI18n: 'poste.administratif',
            nom: TITRE_ADMINISTRATIF,
            categorie: 'administratif'
        }]);
    }

    /** Les LIEUX, et rien qu'eux — le filtre historique, inchangé. */
    function lieuxPhysiques(accessPoints) {
        return accessPoints
            .filter(p => p && p.id && p.category && p.category !== 'monitor')
            // ⚠️ `nome`, pas `nom` : ACCESS_POINTS est écrit en portugais, comme
            // le reste des constantes du projet. Lire `nom` rendait `undefined`,
            // le repli affichait le CODE (« BIBLIO », « REFEI1 ») et la liste
            // cessait d'être lisible — précisément ce que cet écran corrige.
            // Attrapé par `tests/posteConfig.test.js`.
            .map(p => ({ id: p.id, nom: p.nome || p.nom || p.id, categorie: p.category }));
    }

    /** Le poste choisi existe-t-il dans la liste ? */
    /**
     * Ce réglage désigne-t-il une machine administrative ?
     *
     * ⚠️ Une fonction, pas une comparaison recopiée : elle est posée dans le
     * processus principal (titre de la fenêtre) et dans la page (la note sous
     * la liste). Deux copies d'une comparaison, c'est une copie qu'on oublie —
     * la leçon du verrouillage de quiosque, au chantier précédent.
     */
    function estAdministratif(sector) {
        return texte(sector) === POSTE_ADMINISTRATIF;
    }

    function posteValide(id, accessPoints) {
        return postesDisponibles(accessPoints).some(p => p.id === texte(id));
    }

    // -----------------------------------------------------------------

    /**
     * ★★ L'ORDRE DE RÉSOLUTION — le cœur de ce chantier.
     *
     * <b>environnement → fichier → écran de première configuration.</b>
     *
     * ⚠️ LES VARIABLES D'ENVIRONNEMENT PRIMENT, ET CE N'EST PAS NÉGOCIABLE.
     * Le parc tourne aujourd'hui sur des postes lancés par `Abrir-MAGBO.bat`,
     * qui pose `MAGBO_API_URL` et `MAGBO_SECTOR` avant d'ouvrir le .exe.
     * Distribuer un .exe qui ignorerait ces variables casserait chacun de ces
     * postes le jour de la mise à jour — et il n'y a plus personne pour les
     * rouvrir un par un. Un poste déjà installé et non touché doit continuer
     * de se comporter EXACTEMENT comme avant.
     *
     * ⚠️ Corollaire, et il compte autant : quand une variable d'environnement
     * est présente, on n'affiche JAMAIS l'écran de configuration, même si le
     * fichier existe. Le `.bat` est la volonté de l'installateur ; l'écran ne
     * doit pas la contredire ni la faire répéter à chaque ouverture.
     *
     * @param env    l'objet des variables d'environnement (process.env)
     * @param fichier le contenu du fichier déjà lu, ou null s'il est absent
     * @returns {{apiUrl, sector, source, doitConfigurer}}
     */
    function resoudre({ env, fichier } = {}) {
        const e = env || {};
        const envUrl = texte(e.MAGBO_API_URL);
        const envSector = texte(e.MAGBO_SECTOR);

        // ── 1. ENVIRONNEMENT ─────────────────────────────────────────
        // Il suffit de l'UNE des deux pour être en « mode .bat » : un
        // lanceur qui ne pose que l'adresse se comporte aujourd'hui comme si
        // le poste était PORT1, et ce comportement est préservé tel quel.
        if (envUrl || envSector) {
            return {
                apiUrl: normaliserUrl(envUrl) || DEFAUT_API_URL,
                sector: envSector || DEFAUT_SECTOR,
                source: SOURCES.ENVIRONNEMENT,
                doitConfigurer: false
            };
        }

        // ── 2. FICHIER À CÔTÉ DU .EXE ────────────────────────────────
        const f = fichier || null;
        const fUrl = f ? normaliserUrl(f.apiUrl) : '';
        const fSector = f ? texte(f.sector) : '';
        if (fUrl && fSector) {
            return {
                apiUrl: fUrl,
                sector: fSector,
                source: SOURCES.FICHIER,
                doitConfigurer: false
            };
        }

        // ── 3. ON DEMANDE ────────────────────────────────────────────
        // ⚠️ Un fichier À MOITIÉ écrit (adresse sans poste, ou l'inverse) tombe
        // ici : mieux vaut reposer la question une fois que démarrer sur une
        // moitié de configuration et laisser quelqu'un chercher pourquoi
        // l'écran est vide. Ce qui a été lu sert à pré-remplir.
        return {
            apiUrl: fUrl || DEFAUT_API_URL,
            sector: fSector || '',
            source: SOURCES.AUCUNE,
            doitConfigurer: true
        };
    }

    /**
     * Ce qui sera écrit dans le fichier. Normalisé, sans rien d'autre.
     *
     * ⚠️ AUCUN SECRET ICI, JAMAIS. Le fichier est en clair à côté du .exe, sur
     * un PC partagé de la Vie Scolaire : une adresse et un nom de poste, c'est
     * tout. Le PIN de kiosque reste une variable d'environnement, et les
     * identifiants restent dans la session.
     */
    function aEcrire(apiUrl, sector) {
        return {
            apiUrl: normaliserUrl(apiUrl),
            sector: texte(sector),
            // Horodatage volontairement absent : il rendrait le fichier
            // différent à chaque écriture pour rien, et une comparaison de
            // configuration entre deux postes deviendrait illisible.
            version: 1
        };
    }

    /**
     * Ce réglage se relira-t-il comme une configuration complète ?
     *
     * ⚠️ EXISTE PARCE QU'UN JSON VALIDE N'EST PAS UNE CONFIGURATION VALIDE.
     * `aEcrire('', '')` produit `{"apiUrl":"","sector":"","version":1}`, que
     * `JSON.parse` accepte sans broncher et que `resoudre` relit en
     * `doitConfigurer: true`. Le processus principal écrivait donc ce fichier,
     * répondait « enregistré », rechargeait la page — et retombait sur
     * l'écran de configuration, sans un mot. Le `<select>` de l'écran empêche
     * ce cas aujourd'hui, mais le seul contrôle vivait dans le rendu, pas dans
     * le processus qui écrit. (Panel de revue — qualité, 2e tour, 02/09/2026.)
     *
     * Volontairement muet sur la LISTE des postes : `ACCESS_POINTS` n'existe
     * pas dans le processus principal, et refuser un identifiant inconnu
     * empêcherait d'ajouter un point sans republier le `.exe`. On refuse le
     * vide, pas l'inattendu.
     */
    function utilisable(config) {
        if (!config) return false;
        const r = resoudre({ env: {}, fichier: config });
        return !r.doitConfigurer;
    }

    /**
     * Faut-il verrouiller ce poste en quiosque ?
     *
     * ⚠️ VIT ICI, ET PAS DANS `main.js`, POUR UNE RAISON MESURÉE. La règle
     * existe en DEUX endroits du processus principal — les options de la
     * fenêtre et l'enregistrement des raccourcis globaux — et le premier tour
     * de revue n'en avait corrigé qu'un : la fenêtre s'ouvrait bien en mode
     * normal sur un poste non réglé, mais `globalShortcut` confisquait quand
     * même Alt+F4 et Alt+Tab POUR TOUT LE SYSTÈME. Deux copies d'une règle,
     * c'est une copie qu'on oublie. Ici, la règle est unique et exécutée par
     * la suite. (Panel de revue — 2e tour, 02/09/2026.)
     *
     * ⚠️ Un poste qui n'est pas encore réglé n'est JAMAIS verrouillé : sinon
     * il ouvrirait sa question en plein écran, touches de sortie bloquées, et
     * si le serveur ne répond pas le bouton « Enregistrer » ne s'ouvre jamais.
     * Le verrouillage s'applique à l'ouverture suivante.
     */
    function verrouillable(isProduction, config) {
        if (!isProduction) return false;
        return !(config && config.doitConfigurer);
    }

    /**
     * Ce que la page doit faire de ce que le pont Electron lui a rendu.
     *
     * ⚠️ `pontPresent` et `valeur` sont DEUX questions distinctes, et les
     * confondre a déjà produit les deux défauts opposés :
     *  • pont présent, valeur nulle (canal muet, versions dépareillées) →
     *    il faut DEMANDER. Répondre `doitConfigurer: false` faisait sauter
     *    l'écran sur un PC neuf et affichait une application qui ne pouvait
     *    joindre personne.
     *  • pas de pont du tout (page ouverte dans un navigateur, tests) → il ne
     *    faut RIEN demander : il n'y a pas de poste à régler.
     */
    function resoudreDuPont(pontPresent, valeur) {
        if (valeur) return valeur;
        return { doitConfigurer: !!pontPresent };
    }

    return {
        DEFAUT_API_URL: DEFAUT_API_URL,
        DEFAUT_SECTOR: DEFAUT_SECTOR,
        POSTE_ADMINISTRATIF: POSTE_ADMINISTRATIF,
        TITRE_ADMINISTRATIF: TITRE_ADMINISTRATIF,
        estAdministratif: estAdministratif,
        NOM_FICHIER: NOM_FICHIER,
        SOURCES: SOURCES,
        normaliserUrl: normaliserUrl,
        verifierUrl: verifierUrl,
        postesDisponibles: postesDisponibles,
        posteValide: posteValide,
        resoudre: resoudre,
        aEcrire: aEcrire,
        utilisable: utilisable,
        verrouillable: verrouillable,
        resoudreDuPont: resoudreDuPont
    };
});
