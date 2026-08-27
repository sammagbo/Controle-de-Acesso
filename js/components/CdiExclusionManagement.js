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

/**
 * CAPACITE ET ETAT DECLARE DU CDI.
 *
 * ⚠️ La capacite N'EMPECHE RIEN. Elle decide a partir de quand l'ecran du CDI
 * dit « on est au maximum » — l'adulte present fait ce qu'il en juge. Le
 * defaut du code (50) reste ce qui s'applique tant que personne n'a rien
 * ecrit : pas de ligne en base = comportement d'avant, inchange.
 */
function CdiCapacitePanel() {
    const t = useI18n();
    const [e, setE] = React.useState(null);
    const [ocupado, setOcupado] = React.useState(false);
    const [salvo, setSalvo] = React.useState(false);

    React.useEffect(() => {
        window.api.fetchCdiEtat().then(setE).catch(() => setE(null));
    }, []);

    if (!e) return null;

    const campo = (k, v) => { setE({ ...e, [k]: v }); setSalvo(false); };
    const gravar = async () => {
        setOcupado(true);
        try {
            await window.api.saveCdiEtat({
                capacidade: String(e.capacidade || ''),
                estado: e.estado || 'OUVERT',
                estadoInicio: e.estadoInicio || '',
                estadoFim: e.estadoFim || '',
                estadoNota: e.estadoNota || ''
            });
            setE(await window.api.fetchCdiEtat());
            setSalvo(true);
        } catch (err) {
            alert(t('cdi.excl.erro') + ' ' + ((err && err.message) || ''));
        } finally { setOcupado(false); }
    };

    const n = Number(e.capacidade) || 0;
    return (
        <div className="bg-white rounded-2xl p-4 border border-soft-200 space-y-3">
            <h3 className="text-sm font-black text-navy-500 uppercase tracking-wide">
                {t('cdi.cap.titulo')}
            </h3>
            <div className="flex flex-wrap items-end gap-4">
                <div>
                    <label className="text-[10px] text-slate-400 block mb-1">{t('cdi.cap.capacidade')}</label>
                    {/* ⚠️ Les deux : les fleches pour ajuster d'un cran, la saisie
                        pour passer de 50 a 120 sans soixante-dix clics. */}
                    <div className="flex items-center gap-1">
                        <button type="button" onClick={() => campo('capacidade', String(Math.max(1, n - 1)))}
                            className="w-9 h-9 rounded-xl border border-soft-200 font-black text-lg">−</button>
                        <input type="number" min="1" value={e.capacidade || ''}
                            onChange={ev => campo('capacidade', ev.target.value)}
                            className="w-24 px-3 py-2 rounded-xl border border-soft-200 text-center text-lg font-black" />
                        <button type="button" onClick={() => campo('capacidade', String(n + 1))}
                            className="w-9 h-9 rounded-xl border border-soft-200 font-black text-lg">+</button>
                    </div>
                </div>
                <div>
                    <label className="text-[10px] text-slate-400 block mb-1">{t('cdi.etat.OUVERT')}</label>
                    <select value={e.estado || 'OUVERT'} onChange={ev => campo('estado', ev.target.value)}
                        className="px-3 py-2 rounded-xl border border-soft-200 text-sm">
                        {['OUVERT', 'RESERVE', 'FERME'].map(k =>
                            <option key={k} value={k}>{t('cdi.etat.' + k)}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] text-slate-400 block mb-1">{t('cdi.cap.de')}</label>
                    <input type="time" value={e.estadoInicio || ''} onChange={ev => campo('estadoInicio', ev.target.value)}
                        className="px-3 py-2 rounded-xl border border-soft-200 text-sm" />
                </div>
                <div>
                    <label className="text-[10px] text-slate-400 block mb-1">{t('cdi.cap.ate')}</label>
                    <input type="time" value={e.estadoFim || ''} onChange={ev => campo('estadoFim', ev.target.value)}
                        className="px-3 py-2 rounded-xl border border-soft-200 text-sm" />
                </div>
                <input value={e.estadoNota || ''} onChange={ev => campo('estadoNota', ev.target.value)}
                    placeholder={t('cdi.cap.nota')}
                    className="flex-1 min-w-48 px-3 py-2 rounded-xl border border-soft-200 text-sm" />
                <button type="button" disabled={ocupado} onClick={gravar}
                    className="text-xs font-bold text-white bg-navy-500 px-4 py-2.5 rounded-xl disabled:opacity-40">
                    {salvo ? t('cdi.cap.gravado') : t('cdi.cap.gravar')}
                </button>
            </div>
        </div>
    );
}

/**
 * L'HISTORIQUE DES ALERTES (V026) — chaque alerte montrée au comptoir.
 *
 * ⚠️ Au scope du module (la maladie du composant-dans-le-parent a assez
 * coûté), et derrière la MÊME permission que la gestion : une ligne
 * EXCLUSION nomme un enfant et date un signalement. C'est ici qu'on répond
 * à « pourquoi mon enfant a-t-il été signalé, et combien de fois ».
 */
function CdiAlertHistorique() {
    const t = useI18n();
    const [linhas, setLinhas] = React.useState(null);
    const [erro, setErro] = React.useState(null);

    React.useEffect(() => {
        let vivo = true;
        window.api.fetchCdiAlertes()
            .then(l => { if (vivo) { setLinhas(l); setErro(null); } })
            .catch(e => { if (vivo) setErro((e && e.message) || t('cdi.excl.erro')); });
        return () => { vivo = false; };
    }, []);

    const TIPO = {
        EXCLUSION: { rotulo: t('cdi.hist.tipo.EXCLUSION'), cor: 'bg-danger-100 text-danger-700' },
        CAPACITE: { rotulo: t('cdi.hist.tipo.CAPACITE'), cor: 'bg-amber-100 text-amber-700' },
        FERME: { rotulo: t('cdi.hist.tipo.FERME'), cor: 'bg-purple-100 text-purple-700' }
    };

    if (erro) {
        return <p className="text-sm text-danger-600 bg-danger-50 border border-danger-500/40 rounded-xl px-4 py-3">{erro}</p>;
    }
    if (linhas === null) return <p className="text-sm text-slate-400">{t('comum.conectando')}</p>;
    if (linhas.length === 0) return <p className="text-sm text-slate-500">{t('cdi.hist.vazio')}</p>;

    return (
        <div className="space-y-1.5">
            {/* ⚠️ L'heure affichée est celle du BADGE (event_time). `criadoEm`
                n'apparaît que si les deux divergent — c'est le signe d'une file
                offline, et le lecteur doit le voir. */}
            {linhas.map(l => (
                <div key={l.id} className="flex items-center gap-3 rounded-xl px-3 py-2 border bg-white border-soft-200">
                    <span className="text-xs font-mono text-slate-500 whitespace-nowrap">
                        {String(l.eventTime || '').slice(0, 16).replace('T', ' ')}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${(TIPO[l.tipo] || {}).cor || 'bg-soft-100 text-slate-500'}`}>
                        {(TIPO[l.tipo] || {}).rotulo || l.tipo}
                    </span>
                    <span className="font-bold text-sm text-navy-500 truncate">
                        {l.nome || (l.userId ? l.userId : '—')}
                    </span>
                    {l.detalhe && <span className="text-xs text-slate-500 italic truncate">{l.detalhe}</span>}
                    <span className="text-xs text-slate-400 flex-1 text-right">{l.pointId}</span>
                    {String(l.criadoEm || '').slice(0, 16) !== String(l.eventTime || '').slice(0, 16) && (
                        <span className="text-[10px] text-amber-700 whitespace-nowrap"
                            title={t('cdi.hist.decalage.title')}>
                            {t('cdi.hist.decalage', { quando: String(l.criadoEm || '').slice(11, 16) })}
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}

function CdiExclusionManagement({ onBack }) {
    const t = useI18n();
    const [aba, setAba] = React.useState('exclusions');   // 'exclusions' | 'historique'
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

            {/* Exclusions | Historique des alertes — même permission, même
                avertissement : les deux nomment des enfants. */}
            <div className="flex gap-2">
                {['exclusions', 'historique'].map(k => (
                    <button key={k} type="button" onClick={() => setAba(k)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-full border ${
                            aba === k ? 'bg-navy-500 text-white border-navy-500'
                                      : 'bg-white text-slate-500 border-soft-200'}`}>
                        {t('cdi.hist.aba.' + k)}
                    </button>
                ))}
            </div>

            {aba === 'historique' && <CdiAlertHistorique />}
            {aba === 'historique' ? null : <>

            {/* ══ CAPACITE ET ETAT ═══════════════════════════════════════
                ⚠️ Le reglage vit ICI, derriere la meme permission que les
                exclusions. Sans cet encadre, « capacite reglable a l'ecran »
                voulait dire un UPDATE en base : le serveur lisait bien la
                valeur, mais aucun ecran ne l'ecrivait. */}
            <CdiCapacitePanel />

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
                    <div>
                        <input value={turma} onChange={e => setTurma(e.target.value)}
                            placeholder="6E1"
                            className="w-32 px-3 py-2 rounded-xl border border-soft-200 text-sm" />
                        {/* ⚠️ DIT PAR ECRIT, parce que le systeme ne le sait pas
                            autrement : la mesure suit la CLASSE, pas les eleves
                            qui y etaient le jour ou on l'a posee. */}
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded-lg px-2 py-1.5 mt-2 max-w-md">
                            {t('cdi.excl.aviso.turma')}
                        </p>
                    </div>
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
            </>}
        </div>
    );
}
