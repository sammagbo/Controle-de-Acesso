// =====================================================================
// RAPPORT CANTINE — manager report (paired meals + KPIs + period filter)
// =====================================================================
// Consumes GET /api/access/refectory/meals (paired entry+exit).
// Period quick-select (today/week/month/custom), filters (student/class),
// KPIs, table with duration & status, CSV + PDF export.

function RefectoryReport() {
    const t = useI18n();
    const todayStr = () => new Date().toISOString().slice(0, 10);

    const [dateFrom, setDateFrom] = React.useState(todayStr());
    const [dateTo, setDateTo] = React.useState(todayStr());
    const [period, setPeriod] = React.useState('today');
    const [aluno, setAluno] = React.useState('');
    const [turma, setTurma] = React.useState('');
    const [statut, setStatut] = React.useState(''); // '', 'ontime', 'late', 'noexit'
    const [meals, setMeals] = React.useState([]);
    // A grade de creneaux, carregada UMA vez: serve para agrupar os
    // contadores POR SERVICO (12H30 / 13H00 / 11h00...). Falha = contadores
    // globais na mesma — o rapport nunca fica refem da grade.
    const [grade, setGrade] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [showPrint, setShowPrint] = React.useState(false);

    const applyPeriod = (p) => {
        const now = new Date();
        let from = new Date();
        if (p === 'today') {
            from = now;
        } else if (p === 'week') {
            from = new Date(now); from.setDate(now.getDate() - 6);
        } else if (p === 'month') {
            from = new Date(now); from.setDate(now.getDate() - 29);
        }
        setPeriod(p);
        if (p !== 'custom') {
            setDateFrom(from.toISOString().slice(0, 10));
            setDateTo(now.toISOString().slice(0, 10));
        }
    };

    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchRefectoryMeals({ dateFrom, dateTo });
            setMeals(Array.isArray(data) ? data : []);
        } catch (e) { setMeals([]); }
        finally { setLoading(false); }
    }, [dateFrom, dateTo]);

    React.useEffect(() => { load(); }, [dateFrom, dateTo]);
    React.useEffect(() => {
        let vivo = true;
        window.api.fetchMealSlots()
            .then(g => { if (vivo) setGrade(g); })
            .catch(() => { /* sem grade: contadores globais apenas */ });
        return () => { vivo = false; };
    }, []);

    const turmas = React.useMemo(() => {
        const all = (window.userCache?.all() || []).map(u => u.turma).filter(Boolean);
        return [...new Set(all)].sort();
    }, []);

    const filtered = React.useMemo(() => {
        return meals.filter(m => {
            if (turma && m.turma !== turma) return false;
            if (statut === 'ontime' && !(m.onTime && m.exitRegistered)) return false;
            if (statut === 'late' && m.onTime) return false;
            if (statut === 'noexit' && m.exitRegistered) return false;
            if (aluno) {
                const q = aluno.trim().toLowerCase();
                const nome = (m.nome || '').toLowerCase();
                if (!nome.includes(q) && !String(m.userId).includes(aluno.trim())) return false;
            }
            return true;
        });
    }, [meals, turma, statut, aluno]);

    // KPIs
    const kpis = React.useMemo(() => {
        const total = filtered.length;
        const uniques = new Set(filtered.map(m => m.userId)).size;
        const late = filtered.filter(m => !m.onTime).length;
        const noExit = filtered.filter(m => !m.exitRegistered).length;
        const durations = filtered.filter(m => m.durationMinutes != null).map(m => m.durationMinutes);
        const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
        return { total, uniques, late, noExit, avg };
    }, [filtered]);

    /**
     * AS QUATRO FAMILIAS, POR SERVICO. «Passou antes do seu creneau», «passou
     * depois», «curto demais», «tempo demais» — contadas sobre o periodo
     * filtrado, agrupadas pelo creneau da TURMA (resolucao no cliente via a
     * grade ja carregada; as excecoes individuais nao sao vistas aqui — o
     * FLAG em si veio do backend com elas honradas, so o agrupamento usa a
     * turma). Sem grade: uma linha unica «tous services».
     */
    const familias = React.useMemo(() => {
        const cfg = window.MagboCantine ? window.MagboCantine.config() : { duracaoCurtaMinutos: 15, duracaoMaximaMinutos: 30 };
        const porServico = new Map();
        const chaveDe = (m) => {
            // ⚠️ DOIS baldes DISTINTOS, nao um «Tous services» que dizia duas
            // coisas opostas (apanhado pelo painel, 27/08): a grade nao
            // carregou, e a turma nao tem creneau. Sem creneaux semeados para
            // a maternal/elementar, o segundo balde recebe TODAS as refeicoes
            // delas — apresentado como «total» ao lado de 12H30 e 13H00, um
            // CPE leria um agregado onde ha uma lacuna de configuracao.
            if (!grade) return t('rap.familles.grade.indisponivel');
            if (!m.entryTime) return t('rap.familles.sem.creneau');
            const d = new Date(m.date + 'T12:00:00');
            const dia = ((d.getDay() + 6) % 7) + 1;   // JS 0=domingo -> ISO 1=segunda
            const minutos = Number(m.entryTime.slice(0, 2)) * 60 + Number(m.entryTime.slice(3, 5));
            return window.MagboCantine.servicoDe(grade, m.turma, dia, minutos)
                || t('rap.familles.sem.creneau');
        };
        for (const m of filtered) {
            const k = chaveDe(m);
            if (!porServico.has(k)) porServico.set(k, { avant: 0, apres: 0, curtas: 0, longas: 0 });
            const c = porServico.get(k);
            // O FORA_HORARIO historico NAO tem direcao: conta na propria
            // familia «legado», nunca distribuido entre avant/apres — seria
            // inventar uma direcao que o dado nao tem.
            if (m.entryFlag === 'AVANT_CRENEAU') c.avant++;
            else if (m.entryFlag === 'APRES_CRENEAU') c.apres++;
            else if (m.entryFlag === 'FORA_HORARIO') c.legado = (c.legado || 0) + 1;
            if (m.durationMinutes != null) {
                if (m.durationMinutes < cfg.duracaoCurtaMinutos) c.curtas++;
                else if (m.durationMinutes > cfg.duracaoMaximaMinutos) c.longas++;
            }
        }
        return [...porServico.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    }, [filtered, grade]);

    const statusBadge = (m) => {
        if (!m.exitRegistered) return { label: t('rap.status.sem.saida'), cls: 'text-slate-600 bg-slate-100' };
        if (!m.onTime) {
            // ⚠️ A DIRECAO por extenso: «antes do seu creneau» e «depois do seu
            // creneau» sao problemas diferentes. O FORA_HORARIO historico
            // mantem o rotulo antigo.
            if (m.entryFlag === 'AVANT_CRENEAU') {
                return { label: t('rap.status.avant.creneau'), cls: 'text-accent-700 bg-accent-100' };
            }
            if (m.entryFlag === 'APRES_CRENEAU') {
                return { label: t('rap.status.apres.creneau'), cls: 'text-danger-700 bg-danger-100' };
            }
            return { label: t('rap.status.fora.horario'), cls: 'text-danger-700 bg-danger-100' };
        }
        return { label: t('rap.status.na.hora'), cls: 'text-success-700 bg-success-100' };
    };

    const fmtDuration = (min) => {
        if (min == null) return '—';
        if (min < 60) return `${min} min`;
        return `${Math.floor(min / 60)}h${(min % 60).toString().padStart(2, '0')}`;
    };

    const exportCSV = () => {
        // O CSV sai no idioma da tela — quem exporta lê o arquivo na língua em que trabalha.
        const header = t('rap.cantina.csv.header') + '\n';
        const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const rows = filtered.map(m => [
            esc(m.date), esc(m.userId), esc(m.nome), esc(m.turma),
            esc(m.entryTime || ''), esc(m.exitTime || ''),
            esc(m.durationMinutes ?? ''), esc(statusBadge(m).label)
        ].join(',')).join('\n');
        const csv = '\uFEFF' + header + rows;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `rapport-cantine-${dateFrom}_${dateTo}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const exportPDF = () => {
        setShowPrint(true);
        setTimeout(() => { window.print(); setShowPrint(false); }, 100);
    };

    const inputCls = "px-3 py-2 rounded-xl border border-soft-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent-300";
    const periodBtn = (p, label) => (
        <button onClick={() => applyPeriod(p)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                period === p ? 'bg-accent-500 text-white' : 'bg-soft-100 text-navy-500 hover:bg-soft-200'
            }`}>{label}</button>
    );

    // ---- Print view ----
    if (showPrint) {
        return (
            <div className="fixed inset-0 bg-white z-50 p-8 overflow-auto" id="cantine-report-view">
                <style>{`@media print { body * { visibility: hidden; } #cantine-report-view, #cantine-report-view * { visibility: visible; } #cantine-report-view { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
                <h1 className="text-2xl font-black mb-1">{t('rap.cantina.print.titulo')}</h1>
                <p className="text-sm text-slate-500 mb-4">{t('rap.periodo')} {dateFrom} → {dateTo} · {t('rap.cantina.refeicoes', { n: filtered.length })}</p>
                <div className="grid grid-cols-5 gap-3 mb-5 text-center text-sm">
                    <div><b className="block text-xl">{kpis.total}</b>{t('rap.cantina.kpi.refeicoes')}</div>
                    <div><b className="block text-xl">{kpis.uniques}</b>{t('rap.kpi.alunos')}</div>
                    <div><b className="block text-xl">{kpis.late}</b>{t('rap.status.fora.horario')}</div>
                    {/* As quatro familias por servico — a leitura que a Vie
                        Scolaire pediu: QUEM chega fora do seu creneau, e em
                        QUAL servico isso acontece. */}
                    <div className="col-span-full mt-2 space-y-1">
                        {familias.map(([servico, c]) => (
                            <div key={servico} className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-bold text-navy-500 w-40 truncate">{servico}</span>
                                <span className="px-1.5 py-0.5 rounded bg-accent-50 text-accent-700">{t('cantina.cont.avant', { n: c.avant })}</span>
                                <span className="px-1.5 py-0.5 rounded bg-danger-50 text-danger-600">{t('cantina.cont.apres', { n: c.apres })}</span>
                                <span className="px-1.5 py-0.5 rounded bg-warning-50 text-warning-700">{t('cantina.cont.curtas', { n: c.curtas })}</span>
                                <span className="px-1.5 py-0.5 rounded bg-soft-100 text-slate-600">{t('cantina.cont.longas', { n: c.longas })}</span>
                                {c.legado > 0 && (
                                    <span className="px-1.5 py-0.5 rounded bg-soft-100 text-slate-400" title={t('cantina.cont.legado.ajuda')}>
                                        {t('cantina.cont.legado', { n: c.legado })}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                    <div><b className="block text-xl">{kpis.noExit}</b>{t('rap.status.sem.saida')}</div>
                    <div><b className="block text-xl">{fmtDuration(kpis.avg)}</b>{t('cdi.stats.duracao.curta')}</div>
                </div>
                <table className="w-full text-xs border-collapse">
                    <thead><tr className="border-b-2 border-slate-800 text-left">
                        <th className="py-1">{t('rap.col.data')}</th><th>{t('comum.nome')}</th><th>{t('comum.turma')}</th><th>{t('rap.col.entrada')}</th><th>{t('rap.col.saida')}</th><th>{t('rap.col.duracao')}</th><th>{t('comum.status')}</th>
                    </tr></thead>
                    <tbody>
                        {filtered.map((m, i) => (
                            <tr key={i} className="border-b border-slate-200">
                                <td className="py-1">{m.date}</td><td>{m.nome}</td><td>{m.turma}</td>
                                <td>{m.entryTime || '—'}</td><td>{m.exitTime || '—'}</td>
                                <td>{fmtDuration(m.durationMinutes)}</td><td>{statusBadge(m).label}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-2xl bg-navy-500 flex items-center justify-center">
                    <LucideIcon name="clipboard-list" size={24} className="text-white" />
                </div>
                <div>
                    <h2 className="text-xl font-black text-navy-500">{t('rap.cantina.titulo')}</h2>
                    <p className="text-sm text-slate-400">{t('rap.cantina.subtitulo')}</p>
                </div>
            </div>

            {/* Period quick-select */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
                {periodBtn('today', t('periodo.hoje'))}
                {periodBtn('week', t('periodo.7dias'))}
                {periodBtn('month', t('periodo.30dias'))}
                {periodBtn('custom', t('periodo.personalizado'))}
                {period === 'custom' && (
                    <div className="flex items-center gap-2 ml-2">
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
                        <span className="text-slate-400">→</span>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
                    </div>
                )}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                {[
                    { label: t('rap.cantina.kpi.servidos'), value: kpis.total, color: 'text-navy-500' },
                    { label: t('vue.kpi.pessoas.unicas'), value: kpis.uniques, color: 'text-accent-600' },
                    { label: t('rap.status.fora.horario'), value: kpis.late, color: 'text-danger-600' },
                    { label: t('rap.status.sem.saida'), value: kpis.noExit, color: 'text-slate-500' },
                    { label: t('rap.kpi.duracao'), value: fmtDuration(kpis.avg), color: 'text-success-600' },
                ].map((k, i) => (
                    <div key={i} className="bg-white rounded-2xl border border-soft-200 p-4 shadow-sm">
                        <p className="text-xs font-bold text-slate-400 uppercase">{k.label}</p>
                        <p className={`text-2xl font-black mt-1 ${k.color}`}>{k.value}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl border border-soft-200 p-4 mb-5 shadow-sm flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[180px]">
                    <label className="text-xs font-bold text-slate-400 uppercase">{t('rap.filtro.aluno')}</label>
                    <input type="text" value={aluno} onChange={e => setAluno(e.target.value)} placeholder={t('rap.filtro.busca')} className={inputCls + " w-full mt-1"} />
                </div>
                <div className="min-w-[140px]">
                    <label className="text-xs font-bold text-slate-400 uppercase">{t('comum.turma')}</label>
                    <select value={turma} onChange={e => setTurma(e.target.value)} className={inputCls + " w-full mt-1"}>
                        <option value="">{t('rap.filtro.todas')}</option>
                        {/* ⚠️ o parâmetro chamava-se `t` e sombreava a função de tradução */}
                        {turmas.map(tu => <option key={tu} value={tu}>{tu}</option>)}
                    </select>
                </div>
                <div className="min-w-[160px]">
                    <label className="text-xs font-bold text-slate-400 uppercase">{t('comum.status')}</label>
                    <select value={statut} onChange={e => setStatut(e.target.value)} className={inputCls + " w-full mt-1"}>
                        <option value="">{t('rap.filtro.todos')}</option>
                        <option value="ontime">{t('rap.status.na.hora')}</option>
                        <option value="late">{t('rap.status.fora.horario')}</option>
                        <option value="noexit">{t('rap.status.sem.saida')}</option>
                    </select>
                </div>
                <button onClick={exportCSV} className="px-4 py-2 rounded-xl bg-success-500 text-white font-bold text-sm hover:bg-success-600 flex items-center gap-2">
                    <LucideIcon name="download" size={16} /> CSV
                </button>
                <button onClick={exportPDF} className="px-4 py-2 rounded-xl bg-navy-500 text-white font-bold text-sm hover:bg-navy-600 flex items-center gap-2">
                    <LucideIcon name="printer" size={16} /> PDF
                </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-soft-200 overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-soft-100 flex items-center justify-between">
                    <span className="text-sm font-bold text-navy-500">{t('rap.cantina.refeicoes', { n: filtered.length })}</span>
                    {loading && <span className="text-xs text-slate-400">{t('comum.carregando')}</span>}
                </div>
                <div className="overflow-x-auto max-h-[calc(100vh-440px)] overflow-y-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-soft-50 sticky top-0">
                            <tr className="text-left text-xs font-bold text-slate-400 uppercase">
                                <th className="px-4 py-2">{t('rap.col.data')}</th>
                                <th className="px-4 py-2">{t('rap.filtro.aluno.curto')}</th>
                                <th className="px-4 py-2">{t('comum.turma')}</th>
                                <th className="px-4 py-2">{t('rap.col.entrada')}</th>
                                <th className="px-4 py-2">{t('rap.col.saida')}</th>
                                <th className="px-4 py-2">{t('rap.col.duracao')}</th>
                                <th className="px-4 py-2">{t('comum.status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && !loading && (
                                <tr><td colSpan="7" className="px-4 py-10 text-center text-sm text-slate-400">{t('rap.cantina.vazio')}</td></tr>
                            )}
                            {filtered.map((m, i) => {
                                const b = statusBadge(m);
                                return (
                                    <tr key={i} className="border-b border-soft-50 hover:bg-soft-50/50">
                                        <td className="px-4 py-2 text-slate-500">{m.date}</td>
                                        <td className="px-4 py-2 font-bold text-navy-500">{m.nome}</td>
                                        <td className="px-4 py-2 text-slate-500">{m.turma}</td>
                                        <td className="px-4 py-2">{m.entryTime || '—'}</td>
                                        <td className="px-4 py-2">{m.exitTime || '—'}</td>
                                        <td className="px-4 py-2 font-semibold">{fmtDuration(m.durationMinutes)}</td>
                                        <td className="px-4 py-2"><span className={`text-xs font-bold px-2 py-1 rounded-full ${b.cls}`}>{b.label}</span></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
