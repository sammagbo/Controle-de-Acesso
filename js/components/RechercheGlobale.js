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

function RechercheGlobale() {
    const t = useI18n();
    const [q, setQ] = React.useState('');
    const [resultados, setResultados] = React.useState(null);
    const [parcours, setParcours] = React.useState(null);
    const [ocupado, setOcupado] = React.useState(false);

    const pode = window.MagboPermissions
        ? window.MagboPermissions.canWrite(window.auth, 'PARCOURS_READ')
        : false;

    if (!pode) return null;

    const buscar = async (e) => {
        e.preventDefault();
        const termo = q.trim();
        if (termo.length < 2) return;
        setOcupado(true);
        setParcours(null);
        try {
            setResultados(await window.api.searchParcours(termo));
        } catch (err) {
            setResultados([]);
        } finally {
            setOcupado(false);
        }
    };

    const abrir = async (id) => {
        setOcupado(true);
        try {
            setParcours(await window.api.fetchParcours(id));
            setResultados(null);
        } catch (err) {
            setParcours({ erro: (err && err.message) || 'erro' });
        } finally {
            setOcupado(false);
        }
    };

    const zona = (p) => (window.MagboPointLabel && window.MagboPointLabel.rotulo)
        ? window.MagboPointLabel.rotulo(p) : p;

    const Estado = ({ d }) => {
        if (d.estado === 'DANS') {
            return (
                <span className="text-sm font-bold text-accent-600">
                    {t('recherche.dans', { zona: zona(d.ponto), hora: (d.desde || '').slice(0, 5) })}
                </span>
            );
        }
        if (d.estado === 'SORTI') {
            return (
                <span className="text-sm font-bold text-slate-600">
                    {t('recherche.sorti', { zona: zona(d.ponto), hora: (d.desde || '').slice(0, 5) })}
                </span>
            );
        }
        return (
            <span className="text-sm font-bold text-slate-400">
                {t('recherche.inconnu')}
            </span>
        );
    };

    return (
        <div className="mb-6">
            {/* ⚠️ L'élément PRINCIPAL de l'écran : grand, centré, au-dessus des
                KPI. Quelqu'un qui ouvre ce tableau de bord cherche presque
                toujours UNE personne. */}
            <form onSubmit={buscar} className="max-w-2xl mx-auto">
                <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
                        <LucideIcon name="search" size={22} />
                    </span>
                    <input
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        placeholder={t('recherche.placeholder')}
                        className="w-full pl-12 pr-28 py-4 rounded-2xl border border-soft-200 shadow-sm text-base
                                   focus:outline-none focus:ring-2 focus:ring-accent-300 bg-white"
                    />
                    <button type="submit" disabled={ocupado || q.trim().length < 2}
                        className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-xl
                                   bg-navy-500 text-white text-sm font-bold disabled:opacity-40">
                        {t('recherche.botao')}
                    </button>
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
                    {resultados.map(r => (
                        <button key={r.id} type="button" onClick={() => abrir(r.id)}
                            className="w-full flex items-center gap-3 bg-white rounded-xl px-3 py-2
                                       border border-soft-200 hover:border-accent-300 text-left">
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
                        <Estado d={parcours} />
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
