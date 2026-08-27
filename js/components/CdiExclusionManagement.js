// =====================================================================
// EXCLUSIONS DU CDI — qui ne doit pas entrer, et jusqu'à quand
// =====================================================================
// ⚠️ CET ÉCRAN N'EMPÊCHE PERSONNE D'ENTRER. Le terminal ouvre la porte de
// toute façon (ADR-003) ; ce qu'on écrit ici sert à PRÉVENIR l'adulte présent
// au moment où la personne badge. Ce qui se passe ensuite lui appartient.
//
// ⚠️ DONNÉE SENSIBLE SUR UN MINEUR. Chaque ligne nomme un enfant et raconte
// une sanction. L'écran est derrière `CDI_EXCLUSION_WRITE` — pas derrière le
// secteur `cdi`, parce que l'opérateur du CDI a besoin de voir l'ALERTE au
// badge, pas la LISTE avec les motifs. L'avertissement en tête n'est pas de
// la décoration : ce poste est souvent visible depuis le comptoir, par
// d'autres élèves.
//
// ⚠️ LEVER N'EFFACE PAS. L'historique reste, avec qui a créé et qui a levé.
// Une mesure prise sur un enfant est une preuve.

function CdiExclusionManagement({ onBack }) {
    const t = useI18n();
    const [linhas, setLinhas] = React.useState(null);
    const [erro, setErro] = React.useState(null);
    const [ocupado, setOcupado] = React.useState(false);
    const [alvo, setAlvo] = React.useState('aluno');   // 'aluno' | 'turma'
    const [busca, setBusca] = React.useState('');
    const [achados, setAchados] = React.useState([]);
    const [escolhido, setEscolhido] = React.useState(null);
    const [turma, setTurma] = React.useState('');
    const [motivo, setMotivo] = React.useState('');
    const [ate, setAte] = React.useState('');

    const pode = window.MagboPermissions
        ? window.MagboPermissions.canWrite(window.auth, 'CDI_EXCLUSION_WRITE')
        : false;

    const carregar = React.useCallback(async () => {
        try {
            setLinhas(await window.api.fetchCdiExclusions());
            setErro(null);
        } catch (e) {
            setErro((e && e.message) || 'erro');
        }
    }, []);

    React.useEffect(() => { if (pode) carregar(); }, [carregar, pode]);

    const agir = async (fn) => {
        if (!pode || ocupado) return;
        setOcupado(true);
        try {
            await fn();
            await carregar();
        } catch (e) {
            alert(t('cdi.excl.erro') + ' ' + ((e && e.message) || ''));
        } finally {
            setOcupado(false);
        }
    };

    // ⚠️ Passe par le userCache (recherche distante déjà gardée), jamais par
    // un canal neuf : cet écran n'ajoute aucune porte sur /api/users.
    const procurar = async (q) => {
        setBusca(q);
        setEscolhido(null);
        if (q.trim().length < 2) { setAchados([]); return; }
        try {
            const r = await window.userCache.search(q.trim());
            setAchados(Array.isArray(r) ? r.slice(0, 6) : []);
        } catch (e) { setAchados([]); }
    };

    if (!pode) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-10">
                <button onClick={onBack} className="text-xs font-bold text-slate-500 mb-4">
                    {t('header.voltar')}
                </button>
                <p className="text-sm text-slate-600 bg-soft-100 border border-soft-200 rounded-xl px-4 py-3">
                    {t('cdi.excl.sem.permissao')}
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-4 py-6 animate-fade-in space-y-5">
            <div className="flex items-center gap-3">
                <button onClick={onBack} className="text-xs font-bold text-slate-500 hover:text-navy-500">
                    {t('header.voltar')}
                </button>
                <div className="w-12 h-12 rounded-2xl bg-danger-500/10 flex items-center justify-center">
                    <LucideIcon name="user-x" size={26} className="text-danger-600" />
                </div>
                <div>
                    <h2 className="text-2xl font-black text-navy-500">{t('cdi.excl.titulo')}</h2>
                    <p className="text-sm text-slate-400">{t('cdi.excl.subtitulo')}</p>
                </div>
            </div>

            {/* ⚠️ L'avertissement est en TÊTE, pas en pied : il concerne le fait
                même d'avoir cet écran ouvert. */}
            <p className="text-xs text-danger-700 bg-danger-50 border border-danger-500/40 rounded-xl px-3 py-2">
                {t('cdi.excl.aviso.sensivel')}
            </p>

            {erro && (
                <p className="text-sm text-danger-600 bg-danger-50 border border-danger-500/40 rounded-xl px-4 py-3">
                    {erro}
                </p>
            )}

            {/* Créer */}
            <div className="bg-soft-50/60 rounded-2xl p-4 border border-soft-200 space-y-3">
                <div className="flex gap-2">
                    {['aluno', 'turma'].map(k => (
                        <button key={k} type="button" onClick={() => setAlvo(k)}
                            className={`text-xs font-bold px-3 py-1.5 rounded-full border ${
                                alvo === k ? 'bg-navy-500 text-white border-navy-500'
                                           : 'bg-white text-slate-500 border-soft-200'}`}>
                            {t('cdi.excl.' + k)}
                        </button>
                    ))}
                </div>

                {alvo === 'aluno' ? (
                    <div>
                        <input value={busca} onChange={e => procurar(e.target.value)}
                            placeholder={t('creneaux.busca.placeholder')}
                            className="w-full px-3 py-2 rounded-xl border border-soft-200 text-sm" />
                        {escolhido ? (
                            <p className="text-sm font-bold text-navy-500 mt-2">
                                {escolhido.nome} <span className="text-xs text-slate-400">{escolhido.turma}</span>
                            </p>
                        ) : achados.map(a => (
                            <button key={a.id} type="button"
                                onClick={() => { setEscolhido(a); setBusca(a.nome); setAchados([]); }}
                                className="block w-full text-left text-sm px-3 py-1.5 hover:bg-white rounded-lg">
                                {a.nome} <span className="text-xs text-slate-400">{a.turma}</span>
                            </button>
                        ))}
                    </div>
                ) : (
                    <input value={turma} onChange={e => setTurma(e.target.value)}
                        placeholder="6E1"
                        className="w-32 px-3 py-2 rounded-xl border border-soft-200 text-sm" />
                )}

                <div className="flex flex-wrap gap-2">
                    <input value={motivo} onChange={e => setMotivo(e.target.value)}
                        placeholder={t('cdi.excl.motivo')}
                        className="flex-1 min-w-48 px-3 py-2 rounded-xl border border-soft-200 text-sm" />
                    <div>
                        <label className="text-[10px] text-slate-400 block">{t('cdi.excl.ate')}</label>
                        <input type="date" value={ate} onChange={e => setAte(e.target.value)}
                            className="px-3 py-2 rounded-xl border border-soft-200 text-sm" />
                    </div>
                    <button type="button" disabled={ocupado || (alvo === 'aluno' ? !escolhido : !turma.trim())}
                        onClick={() => agir(async () => {
                            await window.api.createCdiExclusion({
                                userId: alvo === 'aluno' ? escolhido.id : null,
                                turma: alvo === 'turma' ? turma.trim() : null,
                                motivo: motivo || null,
                                ate: ate || null
                            });
                            setEscolhido(null); setBusca(''); setTurma(''); setMotivo(''); setAte('');
                        })}
                        className="text-xs font-bold text-white bg-danger-600 px-4 py-2 rounded-xl self-end disabled:opacity-40">
                        {t('cdi.excl.criar')}
                    </button>
                </div>
            </div>

            {/* La liste — actives d'abord */}
            {linhas === null ? (
                <p className="text-sm text-slate-400">{t('comum.conectando')}</p>
            ) : linhas.length === 0 ? (
                <p className="text-sm text-slate-500">{t('cdi.excl.vazio')}</p>
            ) : (
                <div className="space-y-1.5">
                    {linhas.map(l => (
                        <div key={l.id}
                            className={`flex items-center gap-3 rounded-xl px-3 py-2 border ${
                                l.ativa ? 'bg-danger-50 border-danger-500/40' : 'bg-white border-soft-200 opacity-70'}`}>
                            <span className="font-bold text-sm text-navy-500 truncate">
                                {l.userId ? (l.nome || l.userId) : l.turma}
                            </span>
                            {l.turma && l.userId && <span className="text-xs text-slate-400">{l.turma}</span>}
                            {l.motivo && <span className="text-xs text-slate-500 italic truncate">{l.motivo}</span>}
                            <span className="text-xs text-slate-400 flex-1 text-right truncate">
                                {l.ate ? '→ ' + l.ate : ''} · {t('cdi.excl.por', { quem: l.criadoPor })}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                l.ativa ? 'bg-danger-100 text-danger-700' : 'bg-soft-100 text-slate-500'}`}>
                                {l.ativa ? t('cdi.excl.ativa') : t('cdi.excl.levantada')}
                            </span>
                            {l.ativa && (
                                <button type="button" disabled={ocupado}
                                    onClick={() => agir(() => window.api.liftCdiExclusion(l.id))}
                                    className="text-xs font-bold text-accent-600 hover:bg-accent-50 px-2 py-1 rounded">
                                    {t('cdi.excl.levantar')}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
