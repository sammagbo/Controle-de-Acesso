// =====================================================================
// RECHERCHE GLOBALE — le parcours du jour d'une personne
// =====================================================================
// ⚠️ SEULEMENT sur le tableau de bord admin / Vie Scolaire / direction. Le CDI
// et le Moniteur Cantine ont déjà leur recherche, adaptée à ce qu'ils font ;
// en ajouter une troisième au même endroit ferait deux champs côte à côte
// répondant à deux questions différentes.
//
// ⚠️ ELLE PASSE PAR UN ENDPOINT GARDÉ PAR PERMISSION (`PARCOURS_READ`), pas
// par `/api/users/search` qui est en `isAuthenticated()`. Un parcours traverse
// l'école entière — où l'enfant est entré, à quelle heure, où il est allé
// ensuite — et c'est plus que ce qu'une aire donne.
//
// ⚠️ ET ELLE N'AFFIRME JAMAIS UNE PRÉSENCE QUE LE SYSTÈME N'A PAS VUE :
//     DANS     dernier événement = ENTRADA  →  « dans <zone>, depuis HH:MM »
//     SORTI    dernier événement = SAIDA    →  « sorti de <zone> à HH:MM »
//     INCONNU  aucun passage aujourd'hui    →  « aucun passage vu aujourd'hui »
// `SORTI` ne nomme jamais une zone comme un lieu où la personne serait, et
// `INCONNU` ne dit pas « absent » : un enfant entré par une porte non équipée
// est à l'école sans une seule ligne.

/**
 * OU EST CETTE PERSONNE — les trois seules reponses honnetes.
 *
 * ⚠️ AU SCOPE DU MODULE : dernier composant du projet defini dans un parent
 * (releve par le panel du 27/08). Sans etat ni photo il etait inerte, mais
 * c'est la maladie qui a coute cinq fois dans CantineMonitor — et cet ecran
 * va maintenant se re-rendre a CHAQUE frappe de l'autocompletion.
 */
function RechercheEstado({ d, zona }) {
    const t = useI18n();
    if (d.estado === 'DANS') {
        return (
            <span className="text-sm font-bold text-accent-600">
                {t('recherche.dans', { zona: zona(d.ponto), hora: (d.desde || '').slice(0, 5) })}
            </span>
        );
    }
    if (d.estado === 'SORTI') {
        // ⚠️ «sorti DE», jamais «dans» : la derniere ligne dit precisement que
        // la personne n'y est plus. Nommer la zone comme un lieu enverrait au
        // mauvais endroit celui qui cherche un enfant.
        return (
            <span className="text-sm font-bold text-slate-600">
                {t('recherche.sorti', { zona: zona(d.ponto), hora: (d.desde || '').slice(0, 5) })}
            </span>
        );
    }
    return (
        <span className="text-sm font-bold text-slate-400">{t('recherche.inconnu')}</span>
    );
}

function RechercheGlobale() {
    const t = useI18n();
    const auto = window.MagboRechercheAuto;
    const [q, setQ] = React.useState('');
    // ⚠️ `{termo, itens}` ET PAS UN TABLEAU NU. Un tableau ne peut pas dire de
    // quelle question il est la réponse, et c'est précisément ce qui manquait :
    // Entrée agissait sur la liste affichée sans vérifier qu'elle répondait
    // encore au texte du champ. Voir `js/utils/rechercheAutocomplete.js`.
    const [resposta, setResposta] = React.useState(null);
    const [parcours, setParcours] = React.useState(null);
    const [ocupado, setOcupado] = React.useState(false);
    // ⚠️ « Je n'ai pas pu demander » n'est PAS « personne trouvée ». Le `catch`
    // posait une liste vide, donc un 403, un jeton expiré ou le backend arrêté
    // s'affichaient « Personne trouvée. » — sur l'écran où l'on cherche un
    // enfant. C'est la faute exacte contre laquelle tout ce fichier est
    // commenté, commise une case plus loin.
    const [erroBusca, setErroBusca] = React.useState(null);
    // L'élément survolé au clavier. Remis à 0 à chaque nouvelle réponse : la
    // sélection ne doit jamais survivre à la liste qu'elle désignait.
    const [destaque, setDestaque] = React.useState(0);
    // ⚠️ Ce que l'on vient de choisir. Sans lui, remplir le champ avec le nom
    // choisi relance aussitôt une recherche sur ce nom — et la liste
    // réapparaît par-dessus le parcours qu'on venait d'ouvrir.
    const escolhidoRef = React.useRef(null);

    const pode = window.MagboPermissions
        ? window.MagboPermissions.canWrite(window.auth, 'PARCOURS_READ')
        : false;

    // ⚠️ L'AUTOCOMPLÉTION PASSE PAR LE MÊME ENDPOINT GARDÉ (`PARCOURS_READ`).
    // Elle ne crée AUCUN canal neuf : suggérer au fil de la frappe, c'est la
    // même requête, plus souvent — pas une porte plus large. `/api/users` n'est
    // toujours pas touché.
    //
    // ⚠️ 250 ms de débounce, et 2 caractères minimum. Sans le débounce, taper
    // « Marie » ferait cinq requêtes dont quatre déjà périmées ; sans le
    // minimum, la première lettre demanderait au serveur de ramener la moitié
    // de l'école.
    //
    // ⚠️ ET LA RÉPONSE PÉRIMÉE EST JETÉE. Deux frappes rapides partent dans
    // l'ordre et peuvent revenir dans le désordre : sans le compteur, les
    // suggestions de « Mar » écraseraient celles de « Marie ». Le défaut ne se
    // voit qu'en tapant vite, c'est-à-dire exactement comme on tape vraiment.
    const pedido = React.useRef(0);

    React.useEffect(() => {
        const termo = auto.normaliza(q);
        if (!pode || !auto.vaiPerguntar(termo)) { setResposta(null); setErroBusca(null); return undefined; }
        if (escolhidoRef.current === termo) return undefined;   // on vient de choisir
        // ⚠️ LA FICHE DE L'ENFANT PRÉCÉDENT DISPARAÎT DÈS QU'UNE AUTRE
        // RECHERCHE PART. Sans cette ligne, les suggestions de Zéphyrine
        // s'affichaient AU-DESSUS de la fiche complète de Marie — photo, nom,
        // « Dans CDI depuis 10:01 » — et l'écran montrait en même temps une
        // recherche pour un enfant et la présence d'un autre.
        setParcours(null);
        const meu = ++pedido.current;
        const id = setTimeout(async () => {
            try {
                const itens = await window.api.searchParcours(termo, auto.LIMITE_SUGESTOES);
                if (meu !== pedido.current) return;             // réponse périmée : jetée
                setResposta({ termo: termo, itens: itens });
                setErroBusca(null);
                setDestaque(0);
            } catch (err) {
                if (meu !== pedido.current) return;
                setResposta(null);
                setErroBusca((err && err.message) || 'erro');
            }
        }, auto.DEBOUNCE_MS);
        return () => clearTimeout(id);
    }, [q, pode]);

    // ⚠️ LA SEULE LISTE QUE L'ÉCRAN CONNAÎT : celle qui répond au texte
    // affiché maintenant. Tant que la réponse en vol n'est pas arrivée, il n'y
    // a pas de liste — ni à montrer, ni à parcourir, ni à ouvrir.
    const lista = auto.aplicavel(resposta, q) ? (resposta.itens || []) : [];

    /**
     * Entrée. ⚠️ Elle demande à la machine à états ce qu'il faut faire, elle ne
     * décide pas elle-même : `esperar` (la liste ne répond plus au texte
     * courant) est une réponse de première classe, et « ne rien faire » y est
     * la bonne action. Ouvrir le premier venu, c'est ouvrir la journée d'un
     * autre enfant.
     */
    const buscar = (e) => {
        if (e) e.preventDefault();
        const decisao = auto.aoEntrar(resposta, q, destaque);
        if (decisao.acao === 'abrir') abrir(decisao.item.id);
    };

    /**
     * Flèches + Entrée + Échap.
     *
     * ⚠️ `preventDefault` sur les flèches : sans lui, le curseur saute au
     * début ou à la fin du texte pendant qu'on parcourt la liste, et on perd
     * sa place dans ce qu'on était en train de taper.
     */
    const aoTeclado = (e) => {
        if (e.key === 'Escape') { setResposta(null); return; }
        if (!lista.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setDestaque(d => auto.proximoDestaque(lista.length, d, +1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setDestaque(d => auto.proximoDestaque(lista.length, d, -1)); }
    };

    const abrir = async (id) => {
        setOcupado(true);
        const achado = lista.find(r => r.id === id);
        // ⚠️ Le nom stocké est NORMALISÉ, comme le texte auquel il sera comparé.
        // Stocké brut d'un côté et comparé avec trim() de l'autre, un nom avec
        // une espace parasite en base faisait échouer la garde et la liste se
        // rouvrait par-dessus le parcours qu'on venait d'ouvrir.
        if (achado) { escolhidoRef.current = auto.normaliza(achado.nome); setQ(achado.nome); }
        try {
            setParcours(await window.api.fetchParcours(id));
            setResposta(null);
        } catch (err) {
            setParcours({ erro: (err && err.message) || 'erro' });
        } finally {
            setOcupado(false);
        }
    };

    // ⚠️ LA SORTIE ANTICIPÉE VIENT APRÈS TOUS LES HOOKS, jamais avant. Un
    // `return null` placé plus haut sauterait `useRef` et `useEffect` : React
    // compte les hooks par leur ORDRE d'appel, et le jour où `pode` change
    // pendant la vie du composant (rafraîchissement du profil, changement
    // d'utilisateur), l'écran entier casse avec « rendered fewer hooks than
    // expected ». La garde du serveur, elle, ne dépend pas de ceci.
    if (!pode) return null;

    const zona = (p) => (window.MagboPointLabel && window.MagboPointLabel.rotulo)
        ? window.MagboPointLabel.rotulo(p) : p;


    return (
        <div className="py-4 mb-6">
            {/* ⚠️ L'élément PRINCIPAL de l'écran : grand, centré, au-dessus des
                KPI. Quelqu'un qui ouvre ce tableau de bord cherche presque
                toujours UNE personne. */}
            {/* ⚠️ `relative` ICI, et la liste en `absolute` dessous : posée
                dans le flux, elle poussait les cartes KPI hors de l'écran à
                chaque caractère tapé. Un moteur de recherche SUPERPOSE sa
                liste, il ne déplace pas la page sous les doigts. */}
            <form onSubmit={buscar} className="max-w-2xl mx-auto relative">
                <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300">
                        <LucideIcon name="search" size={24} />
                    </span>
                    {/* ⚠️ PAS DE BOUTON. Les suggestions arrivent à la frappe ;
                        un bouton « Chercher » à côté d'une liste qui s'ouvre
                        toute seule ferait hésiter sur ce qu'il faut faire. */}
                    <input
                        value={q}
                        onChange={e => { escolhidoRef.current = null; setQ(e.target.value); }}
                        onKeyDown={aoTeclado}
                        // Rouvrir la liste au clic dans le champ. Sans ça, après
                        // avoir ouvert la mauvaise MARIE DUPONT, il fallait taper
                        // un caractère puis l'effacer : le cas où rouvrir la
                        // liste est le plus nécessaire était le plus difficile.
                        onFocus={() => { escolhidoRef.current = null; }}
                        autoComplete="off"
                        role="combobox"
                        aria-expanded={lista.length > 0}
                        aria-controls="recherche-suggestions"
                        aria-autocomplete="list"
                        placeholder={t('recherche.placeholder')}
                        className="w-full pl-14 pr-12 py-5 rounded-2xl border-2 border-soft-200 shadow-md text-lg
                                   focus:outline-none focus:ring-2 focus:ring-accent-300 focus:border-accent-300 bg-white"
                    />
                    {/* L'attente est VISIBLE. `ocupado` était écrit cinq fois et
                        lu zéro : cliquer une suggestion ne produisait
                        strictement aucun changement à l'écran. */}
                    {ocupado && (
                        <span className="absolute right-5 top-1/2 -translate-y-1/2 text-accent-500 animate-pulse">
                            <LucideIcon name="loader-circle" size={20} />
                        </span>
                    )}
                </div>
                <p className="text-xs text-slate-400 text-center mt-2">{t('recherche.ajuda')}</p>

                {/* ⚠️ « Je n'ai pas pu demander » a son propre message. Dire
                    « personne trouvée » quand le serveur a refusé, sur l'écran
                    où l'on cherche un enfant, c'est répondre à une question
                    qu'on n'a pas posée. */}
                {erroBusca && (
                    <p className="absolute left-0 right-0 mt-1 text-sm text-danger-600 bg-danger-50
                                  border border-danger-500/40 rounded-xl px-4 py-2 text-center z-20">
                        {t('recherche.erro')}
                    </p>
                )}

                {resposta && auto.aplicavel(resposta, q) && lista.length === 0 && !erroBusca && (
                    <p className="absolute left-0 right-0 mt-1 text-sm text-slate-500 text-center
                                  bg-white border border-soft-200 rounded-xl px-4 py-2 shadow-lg z-20">
                        {t('recherche.vazio')}
                    </p>
                )}

                {lista.length > 0 && (
                    <div id="recherche-suggestions" role="listbox"
                        className="absolute left-0 right-0 mt-1 space-y-1 bg-white border border-soft-200
                                   rounded-xl shadow-lg p-1.5 max-h-96 overflow-y-auto z-20">
                        {lista.map((r, i) => (
                            <button key={r.id} type="button" role="option" onClick={() => abrir(r.id)}
                                onMouseEnter={() => setDestaque(i)}
                                aria-selected={i === destaque}
                                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 border text-left ${
                                    i === destaque
                                        ? 'bg-accent-50 border-accent-300'
                                        : 'bg-white border-transparent hover:border-accent-300'}`}>
                                <PersonPhoto userId={r.id} nome={r.nome}
                                    className="w-9 h-9 rounded-lg object-cover flex-shrink-0" alt="" />
                                <span className="font-bold text-sm text-navy-500 truncate flex-1">{r.nome}</span>
                                <span className="text-xs text-slate-400">{r.turma}</span>
                                {/* ⚠️ La matricule départage deux homonymes de la
                                    même classe — le seul champ qui le fasse, et
                                    il était déjà dans la réponse. */}
                                <span className="text-[11px] font-mono text-slate-300">{r.id}</span>
                            </button>
                        ))}
                    </div>
                )}
            </form>

            {/* ⚠️ L'ÉCHEC S'AFFICHE. `abrir` posait bien `{erro: …}`, et la
                condition de rendu ci-dessous exige `parcours.userId` : l'objet
                d'erreur ne correspondait à AUCUNE branche. Rien ne s'affichait,
                jamais — le champ avait juste changé de nom tout seul. */}
            {parcours && parcours.erro && (
                <p className="max-w-2xl mx-auto mt-4 text-sm text-danger-600 bg-danger-50
                              border border-danger-500/40 rounded-xl px-4 py-3 text-center">
                    {t('recherche.erro')}
                </p>
            )}

            {parcours && parcours.userId && (
                <div className="max-w-2xl mx-auto mt-4 bg-white rounded-2xl border border-soft-200 shadow-sm p-4">
                    <div className="flex items-center gap-3 mb-3">
                        <PersonPhoto userId={parcours.userId} nome={parcours.nome}
                            className="w-12 h-12 rounded-xl object-cover flex-shrink-0" alt="" />
                        <div className="min-w-0 flex-1">
                            <p className="font-black text-navy-500 truncate">{parcours.nome}</p>
                            <p className="text-xs text-slate-400">{parcours.turma}</p>
                        </div>
                        <button type="button" onClick={() => setParcours(null)}
                            className="text-xs font-bold text-slate-400 hover:text-navy-500">
                            {t('cantina.fechar')}
                        </button>
                    </div>

                    <div className="bg-soft-50 rounded-xl px-3 py-2 mb-3">
                        <RechercheEstado d={parcours} zona={zona} />
                    </div>

                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                        {t('recherche.parcours')}
                    </p>
                    {parcours.passagens.length === 0 ? (
                        <p className="text-xs text-slate-400">{t('recherche.sem.passagem')}</p>
                    ) : (
                        <div className="space-y-1">
                            {parcours.passagens.map((p, i) => (
                                <div key={i} className="flex items-center gap-3 text-sm">
                                    <span className="font-mono text-xs text-slate-500 w-12">
                                        {(p.hora || '').slice(0, 5)}
                                    </span>
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                        p.action === 'ENTRADA'
                                            ? 'bg-accent-50 text-accent-600' : 'bg-soft-100 text-slate-500'}`}>
                                        {t('recherche.acao.' + p.action)}
                                    </span>
                                    <span className="text-navy-500">{zona(p.pointId)}</span>
                                    {/* La marque de répétition est DITE, pas masquée :
                                        sinon le parcours d'un agent posté raconte une
                                        journée qui n'a pas eu lieu. */}
                                    {p.flag && (
                                        <span className="text-[10px] text-slate-400 italic" title={p.flag}>{window.MagboI18n.tEnum('flag', p.flag)}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
