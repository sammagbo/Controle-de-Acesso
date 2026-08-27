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
    const [q, setQ] = React.useState('');
    const [resultados, setResultados] = React.useState(null);
    const [parcours, setParcours] = React.useState(null);
    const [ocupado, setOcupado] = React.useState(false);
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
        const termo = q.trim();
        if (!pode || termo.length < 2) { setResultados(null); return undefined; }
        if (escolhidoRef.current === termo) return undefined;   // on vient de choisir
        const meu = ++pedido.current;
        const id = setTimeout(async () => {
            try {
                const r = await window.api.searchParcours(termo);
                if (meu === pedido.current) { setResultados(r); setDestaque(0); }
            } catch (err) {
                if (meu === pedido.current) setResultados([]);
            }
        }, 250);
        return () => clearTimeout(id);
    }, [q]);

    const buscar = async (e) => {
        if (e) e.preventDefault();
        const alvo = (resultados || [])[destaque];
        if (alvo) { abrir(alvo.id); return; }
        const termo = q.trim();
        if (termo.length < 2) return;
        setOcupado(true);
        try {
            setResultados(await window.api.searchParcours(termo));
        } catch (err) {
            setResultados([]);
        } finally {
            setOcupado(false);
        }
    };

    /**
     * Flèches + Entrée + Échap.
     *
     * ⚠️ `preventDefault` sur les flèches : sans lui, le curseur saute au
     * début ou à la fin du texte pendant qu'on parcourt la liste, et on perd
     * sa place dans ce qu'on était en train de taper.
     */
    const aoTeclado = (e) => {
        const n = (resultados || []).length;
        if (e.key === 'Escape') { setResultados(null); return; }
        if (!n) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setDestaque(d => (d + 1) % n); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setDestaque(d => (d - 1 + n) % n); }
    };

    const abrir = async (id) => {
        setOcupado(true);
        const achado = (resultados || []).find(r => r.id === id);
        if (achado) { escolhidoRef.current = achado.nome; setQ(achado.nome); }
        try {
            setParcours(await window.api.fetchParcours(id));
            setResultados(null);
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
        <div className="mb-6">
            {/* ⚠️ L'élément PRINCIPAL de l'écran : grand, centré, au-dessus des
                KPI. Quelqu'un qui ouvre ce tableau de bord cherche presque
                toujours UNE personne. */}
            <form onSubmit={buscar} className="max-w-2xl mx-auto">
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
                        autoComplete="off"
                        role="combobox"
                        aria-expanded={!!(resultados && resultados.length)}
                        aria-autocomplete="list"
                        placeholder={t('recherche.placeholder')}
                        className="w-full pl-14 pr-5 py-5 rounded-2xl border-2 border-soft-200 shadow-md text-lg
                                   focus:outline-none focus:ring-2 focus:ring-accent-300 focus:border-accent-300 bg-white"
                    />
                </div>
                <p className="text-xs text-slate-400 text-center mt-2">{t('recherche.ajuda')}</p>
            </form>

            {resultados && resultados.length === 0 && (
                <p className="max-w-2xl mx-auto mt-3 text-sm text-slate-500 text-center">
                    {t('recherche.vazio')}
                </p>
            )}

            {resultados && resultados.length > 0 && (
                <div className="max-w-2xl mx-auto mt-3 space-y-1.5">
                    {resultados.map((r, i) => (
                        <button key={r.id} type="button" onClick={() => abrir(r.id)}
                            onMouseEnter={() => setDestaque(i)}
                            aria-selected={i === destaque}
                            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 border text-left ${
                                i === destaque
                                    ? 'bg-accent-50 border-accent-300'
                                    : 'bg-white border-soft-200 hover:border-accent-300'}`}>
                            <PersonPhoto userId={r.id} nome={r.nome}
                                className="w-9 h-9 rounded-lg object-cover flex-shrink-0" alt="" />
                            <span className="font-bold text-sm text-navy-500 truncate">{r.nome}</span>
                            <span className="text-xs text-slate-400">{r.turma}</span>
                        </button>
                    ))}
                </div>
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
                                        <span className="text-[10px] text-slate-400 italic">{p.flag}</span>
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
