// =====================================================================
// PLANNING DE CANTINE — l'affiche de la Vie Scolaire, par clics
// =====================================================================
// ⚠️ POURQUOI CET ÉCRAN EXISTE. L'affiche change chaque année. Tant que le
// planning vivait dans `class_schedules` sans écran, en changer demandait du
// SQL à la main — et il s'est passé ce qui devait : personne ne l'a changé, la
// base est restée en 2025, et le 25/08/2026 la cantine a produit 63
// OUTSIDE_MEAL_TIME sur 22 turmas qui mangeaient à l'heure juste.
//
// ⚠️ LES DÉSACCORDS SONT MONTRÉS, PAS ARBITRÉS. Deux turmas de l'affiche
// (5E3, 3E3) n'ont aucun élève ; une turma d'élèves peut n'avoir aucun
// créneau. L'écran les signale et laisse trancher la Vie Scolaire — c'est elle
// qui tient le mur. Un écran qui « corrigerait » tout seul ferait disparaître
// la question au lieu de la poser.
//
// ⚠️ ÉCRIRE EXIGE `MEAL_SLOT_WRITE`. Sans la permission, tout reste VISIBLE et
// les boutons sont désactivés — jamais cachés. Lire le planning fait partie du
// travail de qui opère la cantine ; changer la grille de l'école entière est
// autre chose.

const JOURS_ORDRE = [1, 2, 3, 4, 5];

function MealSlotManagement({ onBack }) {
    const t = useI18n();
    const [grade, setGrade] = React.useState(null);
    const [erro, setErro] = React.useState(null);
    const [ocupado, setOcupado] = React.useState(false);
    const [busca, setBusca] = React.useState('');
    const [aluno, setAluno] = React.useState(null);
    // ⚠️ A afixação é uma VISTA da mesma grade já carregada, não um segundo
    // pedido. Buscar outra vez abriria a porta a imprimir um estado
    // diferente do que está no ecrã — e é a divergência entre o mur e a base
    // que este chantier veio fechar.
    const [vistaAfixacao, setVistaAfixacao] = React.useState(false);
    // O criador de creneau (dia + hora) — o gesto da maternal/elementar:
    // NADA e semeado por codigo; o Sam cria os horarios certos por aqui.
    const [novoDia, setNovoDia] = React.useState(1);
    const [novaHora, setNovaHora] = React.useState('');

    const podeEscrever = window.MagboPermissions
        ? window.MagboPermissions.canWrite(window.auth, 'MEAL_SLOT_WRITE')
        : false;

    const carregar = React.useCallback(async () => {
        try {
            const g = await window.api.fetchMealSlots();
            setGrade(g);
            setErro(null);
        } catch (e) {
            setErro((e && e.message) || 'erro');
        }
    }, []);

    React.useEffect(() => { carregar(); }, [carregar]);

    const agir = async (fn) => {
        if (!podeEscrever || ocupado) return;
        setOcupado(true);
        try {
            await fn();
            await carregar();
        } catch (e) {
            alert(t('creneaux.erro') + ' ' + ((e && e.message) || ''));
        } finally {
            setOcupado(false);
        }
    };

    const nomeDoDia = (n) => t('creneaux.dia.' + n);

    const buscarAluno = async (e) => {
        e.preventDefault();
        const q = busca.trim();
        if (!q) { setAluno(null); return; }
        try {
            // ⚠️ Passe pelo userCache (busca REMOTA já existente) e depois pelo
            // endpoint guardado do planning. Nenhuma rota nova sem guarda, e
            // /api/users não foi alargado.
            const achados = await window.userCache.search(q);
            const primeiro = Array.isArray(achados) && achados.length ? achados[0] : null;
            if (!primeiro) { setAluno({ vazio: true }); return; }
            setAluno(await window.api.fetchMealSlotOfStudent(primeiro.id));
        } catch (err) {
            setAluno({ erro: (err && err.message) || 'erro' });
        }
    };

    if (erro) {
        return (
            <div className="max-w-5xl mx-auto px-4 py-10">
                <p className="text-sm text-danger-600 bg-danger-50 border border-danger-500/40 rounded-xl px-4 py-3">
                    {t('creneaux.erro.carregar')} {erro}
                </p>
            </div>
        );
    }
    if (!grade) {
        return <div className="max-w-5xl mx-auto px-4 py-10 text-sm text-slate-400">{t('comum.conectando')}</div>;
    }

    const porDia = (d) => (grade.creneaux || []).filter(c => c.diaSemana === d);

    return (
        <div className="max-w-6xl mx-auto px-4 py-6 animate-fade-in space-y-5">

            {/* Cabeçalho */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="text-xs font-bold text-slate-500 hover:text-navy-500">
                        {t('header.voltar')}
                    </button>
                    <div className="w-12 h-12 rounded-2xl bg-navy-500 flex items-center justify-center">
                        <LucideIcon name="calendar-clock" size={26} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-navy-500">{t('creneaux.titulo')}</h2>
                        <p className="text-sm text-slate-400">{t('creneaux.subtitulo')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setVistaAfixacao(v => !v)}
                        className="flex items-center gap-2 text-xs font-bold text-navy-500 bg-soft-100 hover:bg-soft-200 px-3 py-2 rounded-full">
                        <LucideIcon name={vistaAfixacao ? 'pencil' : 'printer'} size={14} />
                        {vistaAfixacao ? t('creneaux.voltar.edicao') : t('creneaux.imprimir')}
                    </button>
                    {vistaAfixacao && (
                        <button
                            onClick={() => window.print()}
                            className="flex items-center gap-2 text-xs font-bold text-white bg-navy-500 px-3 py-2 rounded-full">
                            <LucideIcon name="printer" size={14} /> {t('affiche.imprimir.agora')}
                        </button>
                    )}
                </div>
            </div>

            {!podeEscrever && (
                <p className="text-xs text-slate-500 bg-soft-100 border border-soft-200 rounded-xl px-3 py-2">
                    {t('creneaux.sem.permissao')}
                </p>
            )}

            {/* ⚠️ Os dois desacordos, em cima e não escondidos num rodapé. */}
            {(grade.turmasSemCreneau || []).length > 0 && (
                <div className="text-xs text-warning-700 bg-warning-50 border border-warning-500/40 rounded-xl px-3 py-2">
                    <span className="font-bold">{t('creneaux.aviso.sem.creneau', { n: grade.turmasSemCreneau.length })}</span>
                    {' '}{grade.turmasSemCreneau.join(', ')}
                    <div className="text-warning-600 mt-1">{t('creneaux.aviso.sem.creneau.ajuda')}</div>
                </div>
            )}
            {(grade.turmasSemAlunos || []).length > 0 && (
                <div className="text-xs text-slate-600 bg-soft-100 border border-soft-200 rounded-xl px-3 py-2">
                    <span className="font-bold">{t('creneaux.aviso.sem.alunos', { n: grade.turmasSemAlunos.length })}</span>
                    {' '}{grade.turmasSemAlunos.join(', ')}
                    <div className="text-slate-500 mt-1">{t('creneaux.aviso.sem.alunos.ajuda')}</div>
                </div>
            )}

            {/* Recherche d'un élève */}
            <form onSubmit={buscarAluno} className="bg-soft-50/60 rounded-2xl p-3 border border-soft-200">
                <label className="text-xs font-bold text-navy-500 uppercase tracking-wide">
                    {t('creneaux.busca.titulo')}
                </label>
                <div className="flex gap-2 mt-2">
                    <input value={busca} onChange={e => setBusca(e.target.value)}
                        placeholder={t('creneaux.busca.placeholder')}
                        className="flex-1 px-3 py-2 rounded-xl border border-soft-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent-300" />
                    <button type="submit" className="text-xs font-bold text-white bg-navy-500 px-4 rounded-xl">
                        {t('creneaux.busca.botao')}
                    </button>
                </div>
                {aluno && aluno.vazio && (
                    <p className="text-xs text-slate-500 mt-2">{t('creneaux.busca.vazio')}</p>
                )}
                {aluno && aluno.userId && (
                    <div className="mt-3 bg-white rounded-xl border border-soft-200 px-3 py-2 text-sm">
                        <span className="font-bold text-navy-500">{aluno.nome}</span>
                        <span className="text-xs text-slate-400 ml-2">{aluno.turma}</span>
                        <div className="text-xs text-slate-600 mt-1">
                            {t('creneaux.veredicto.' + aluno.veredicto)}
                            {aluno.porExcecao && (
                                <span className="ml-2 text-accent-600 font-bold">{t('creneaux.por.excecao')}</span>
                            )}
                        </div>
                    </div>
                )}
            </form>

            {/* Criar um creneau novo. So aparece com permissao de escrita:
                um formulario morto seria pior que nenhum. */}
            {podeEscrever && !vistaAfixacao && (
                <div className="bg-soft-50/60 rounded-2xl p-3 border border-soft-200">
                    <label className="text-xs font-bold text-navy-500 uppercase tracking-wide">
                        {t('creneaux.novo.titulo')}
                    </label>
                    <p className="text-xs text-slate-500 mt-0.5 mb-2">{t('creneaux.novo.ajuda')}</p>
                    <div className="flex flex-wrap gap-2 items-center">
                        <select value={novoDia} onChange={e => setNovoDia(Number(e.target.value))}
                            className="px-2 py-2 rounded-xl border border-soft-200 text-sm">
                            {[1, 2, 3, 4, 5].map(d => (
                                <option key={d} value={d}>{t('creneaux.dia.' + d)}</option>
                            ))}
                        </select>
                        <input type="time" value={novaHora} onChange={e => setNovaHora(e.target.value)}
                            className="px-2 py-2 rounded-xl border border-soft-200 text-sm" />
                        <button type="button" disabled={ocupado || !novaHora}
                            onClick={() => agir(async () => {
                                await window.api.createMealSlot(novoDia, novaHora, null, null);
                                setNovaHora('');
                            })}
                            className="text-xs font-bold text-white bg-navy-500 px-4 py-2 rounded-xl disabled:opacity-40">
                            {t('creneaux.novo.criar')}
                        </button>
                    </div>
                </div>
            )}

            {/* ⚠️ TURMAS DISPENSADAS DE BADGE — preparacao, NAO ativacao.
                Default: NENHUMA. A consequencia PPMS esta POR EXTENSO ao lado
                do reglage, como exigido: e o unico sitio onde quem decide vai
                le-la no momento de decidir. */}
            {!vistaAfixacao && (
                <div className="bg-soft-50/60 rounded-2xl p-3 border border-soft-200">
                    <label className="text-xs font-bold text-navy-500 uppercase tracking-wide">
                        {t('creneaux.disp.titulo')}
                    </label>
                    <p className="text-xs text-danger-600 bg-danger-50 border border-danger-500/30 rounded-lg px-2 py-1.5 mt-1 mb-2">
                        {t('creneaux.disp.aviso.ppms')}
                    </p>
                    {(grade.turmasDispensees || []).length === 0 ? (
                        <p className="text-xs text-slate-500">{t('creneaux.disp.nenhuma')}</p>
                    ) : (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {grade.turmasDispensees.map(tu => (
                                <span key={tu} className="text-xs font-bold px-2 py-0.5 rounded-full bg-danger-50 text-danger-700 border border-danger-500/40 flex items-center gap-1">
                                    {tu}
                                    {podeEscrever && (
                                        <button type="button" disabled={ocupado}
                                            onClick={() => agir(() => window.api.saveMealSlotDispensees(
                                                grade.turmasDispensees.filter(x => x !== tu)))}
                                            className="text-danger-400 hover:text-danger-700">×</button>
                                    )}
                                </span>
                            ))}
                        </div>
                    )}
                    {podeEscrever && (
                        <div className="flex gap-1.5 items-center">
                            <select id="disp-nova" className="px-2 py-1.5 rounded-xl border border-soft-200 text-xs">
                                <option value="">{t('creneaux.disp.escolher')}</option>
                                {(grade.turmasConhecidas || [])
                                    .filter(tu => !(grade.turmasDispensees || []).includes(tu))
                                    .map(tu => <option key={tu} value={tu}>{tu}</option>)}
                            </select>
                            <button type="button" disabled={ocupado}
                                onClick={() => {
                                    const el = document.getElementById('disp-nova');
                                    const v = el && el.value;
                                    if (v) agir(() => window.api.saveMealSlotDispensees(
                                        (grade.turmasDispensees || []).concat([v])));
                                }}
                                className="text-xs font-bold text-danger-600 hover:bg-danger-50 px-2 py-1.5 rounded">
                                {t('creneaux.disp.adicionar')}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ⚠️ A afixação substitui a grade de edição em vez de conviver com
                ela: são a MESMA informação em duas formas, e mostrá-las juntas
                convidaria a imprimir uma e ler a outra. */}
            {vistaAfixacao && <AfficheCantine grade={grade} annee={new Date().getFullYear()} />}

            {/* La grille, jour par jour — comme l'affiche */}
            <div className={`space-y-4 ${vistaAfixacao ? 'hidden' : ''}`}>
                {JOURS_ORDRE.map(d => (
                    <div key={d} className="bg-soft-50/50 rounded-2xl p-3">
                        <h3 className="text-sm font-black text-navy-500 uppercase tracking-wide mb-2 px-1">
                            {nomeDoDia(d)}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {porDia(d).map(c => (
                                <div key={c.id}
                                    className={`rounded-xl p-3 border ${c.ordem === 1
                                        ? 'bg-warning-50/40 border-warning-200' : 'bg-white border-soft-200'}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-black text-navy-500">{c.hora.slice(0, 5)}</span>
                                        {/* ⚠️ ÉDITABLE : c'est ce rotulo que le bandeau de
                                            l'affiche imprime pour un créneau hors 12H30/13H00.
                                            La page 11h imprimait « REPRIS DE CLASS_SCHEDULES »
                                            — un nom de table interne sur un mur que lisent des
                                            familles — et RIEN à l'écran ne permettait de le
                                            changer (panel du 28/08). */}
                                        {podeEscrever ? (
                                            <input type="text" defaultValue={c.rotulo || ''}
                                                id={`rot-${c.id}`} maxLength={64}
                                                placeholder={t('creneaux.rotulo.placeholder')}
                                                className="w-56 px-1.5 py-0.5 rounded border border-soft-200 text-[10px] font-bold text-slate-500 uppercase" />
                                        ) : (
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">{c.rotulo}</span>
                                        )}
                                    </div>
                                    {/* A JANELA do creneau, visivel e editavel: hora −antes / +depois.
                                        E ela que decide AVANT_CRENEAU/APRES_CRENEAU — um numero
                                        escondido seria um julgamento cuja regra ninguem ve. */}
                                    <div className="flex items-center gap-1 mb-2 text-[11px] text-slate-500">
                                        <span>−</span>
                                        <input type="number" min="0" defaultValue={c.toleranciaAntesMinutos}
                                            id={`tola-${c.id}`} disabled={!podeEscrever}
                                            className="w-12 px-1 py-0.5 rounded border border-soft-200 text-center" />
                                        <span>{t('creneaux.tol.min')} / +</span>
                                        <input type="number" min="0" defaultValue={c.toleranciaDepoisMinutos}
                                            id={`told-${c.id}`} disabled={!podeEscrever}
                                            className="w-12 px-1 py-0.5 rounded border border-soft-200 text-center" />
                                        <span>{t('creneaux.tol.min')}</span>
                                        {podeEscrever && (
                                            <button type="button" disabled={ocupado}
                                                title={t('creneaux.tol.gravar')}
                                                onClick={() => {
                                                    const a = document.getElementById(`tola-${c.id}`);
                                                    const d2 = document.getElementById(`told-${c.id}`);
                                                    const r = document.getElementById(`rot-${c.id}`);
                                                    agir(() => window.api.updateMealSlot(c.id, {
                                                        toleranciaAntesMinutos: a ? a.value : null,
                                                        toleranciaDepoisMinutos: d2 ? d2.value : null,
                                                        ...(r ? { rotulo: r.value } : {})
                                                    }));
                                                }}
                                                className="text-accent-600 hover:bg-accent-50 px-1.5 rounded font-bold">
                                                ✓
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {c.turmas.length === 0 && (
                                            <span className="text-xs text-slate-300">{t('creneaux.vazio')}</span>
                                        )}
                                        {c.turmas.map(tu => (
                                            <span key={tu.turma}
                                                title={tu.aConfirmar ? t('creneaux.a.confirmar')
                                                    : tu.semAlunos ? t('creneaux.turma.sem.alunos') : ''}
                                                className={`text-xs font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                                                    tu.aConfirmar ? 'bg-warning-100 text-warning-700 border-warning-500/40'
                                                        : tu.semAlunos ? 'bg-soft-100 text-slate-400 border-soft-200 line-through'
                                                        : 'bg-white text-navy-500 border-soft-200'}`}>
                                                {tu.turma}
                                                {tu.aConfirmar && <span>?</span>}
                                                {podeEscrever && (
                                                    <button type="button" disabled={ocupado}
                                                        onClick={() => agir(() => window.api.unlinkMealSlotClass(c.id, tu.turma))}
                                                        className="text-slate-400 hover:text-danger-600 ml-0.5">×</button>
                                                )}
                                            </span>
                                        ))}
                                    </div>
                                    {podeEscrever && (
                                        <div className="mt-2 flex gap-1">
                                            <input id={`p-${c.id}`} placeholder={t('creneaux.prefixo')}
                                                className="w-20 px-2 py-1 rounded border border-soft-200 text-xs" />
                                            <button type="button" disabled={ocupado}
                                                title={t('creneaux.massa.ajuda')}
                                                onClick={() => {
                                                    const el = document.getElementById(`p-${c.id}`);
                                                    const v = el && el.value.trim();
                                                    if (v) agir(() => window.api.linkMealSlotPrefix(c.id, v));
                                                }}
                                                className="text-xs font-bold text-accent-600 hover:bg-accent-50 px-2 rounded">
                                                {t('creneaux.massa')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <p className="text-xs text-slate-400 px-1">{t('creneaux.regra.prioridade')}</p>
        </div>
    );
}
