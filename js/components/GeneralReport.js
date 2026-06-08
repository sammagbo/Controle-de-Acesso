// =====================================================================
// RAPPORT GÉNÉRAL — consolidated view across all areas (admin only)
// 3 tabs: Vue d'ensemble (KPIs by area) | Par élève | Journal (all logs)
// =====================================================================

// ── Journal Tab ──────────────────────────────────────────────────────
function JournalTab() {
    const todayStr = () => new Date().toISOString().slice(0, 10);
    const [dateFrom, setDateFrom] = React.useState(todayStr());
    const [dateTo,   setDateTo]   = React.useState(todayStr());
    const [pointId,  setPointId]  = React.useState('');
    const [action,   setAction]   = React.useState('');
    const [aluno,    setAluno]    = React.useState('');
    const [logs,     setLogs]     = React.useState([]);
    const [loading,  setLoading]  = React.useState(false);

    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            const data = await window.api.fetchAllLogs({ dateFrom, dateTo, pointId, action, limit: 500 });
            setLogs(Array.isArray(data) ? data : []);
        } catch (e) {
            setLogs([]);
        } finally {
            setLoading(false);
        }
    }, [dateFrom, dateTo, pointId, action]);

    React.useEffect(() => { load(); }, [load]);

    // filtro client-side por nome/ID do aluno
    const filtered = React.useMemo(() => {
        if (!aluno.trim()) return logs;
        const q = aluno.trim().toLowerCase();
        return logs.filter(l => {
            const u = window.userCache?.byId(l.userId);
            const nome = (u?.nome || '').toLowerCase();
            return nome.includes(q) || String(l.userId).includes(aluno.trim());
        });
    }, [logs, aluno]);

    const pointName = (id) => {
        const p = (typeof ACCESS_POINTS !== 'undefined' ? ACCESS_POINTS : []).find(pt => pt.id === id);
        return p ? p.nome : id;
    };

    const fmtDateTime = (ts) => {
        const d = new Date(safeDateParse(ts));
        return d.toLocaleDateString('fr-FR') + ' ' + formatTime(d);
    };

    const exportCSV = () => {
        const header = 'Date,ID,Nom,Classe,Zone,Action\n';
        const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const rows = filtered.map(l => {
            const u = window.userCache?.byId(l.userId);
            return [
                esc(fmtDateTime(l.timestamp)), esc(l.userId), esc(u?.nome || ''),
                esc(u?.turma || ''), esc(pointName(l.pointId)), esc(l.action)
            ].join(',');
        }).join('\n');
        const csv = '\uFEFF' + header + rows;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `journal-${dateFrom}_${dateTo}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const inputCls = 'px-3 py-2 rounded-xl border border-soft-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent-300';
    const points = typeof ACCESS_POINTS !== 'undefined' ? ACCESS_POINTS : [];

    return (
        <div>
            {/* ── Filtros ── */}
            <div className="flex flex-wrap items-end gap-3 mb-4">
                <div>
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Du</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Au</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Zone</label>
                    <select value={pointId} onChange={e => setPointId(e.target.value)} className={inputCls}>
                        <option value="">Toutes</option>
                        {points.filter(p => p.category !== 'monitor').map(p => (
                            <option key={p.id} value={p.id}>{p.nome}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Action</label>
                    <select value={action} onChange={e => setAction(e.target.value)} className={inputCls}>
                        <option value="">Toutes</option>
                        <option value="ENTRADA">Entrée</option>
                        <option value="SAIDA">Sortie</option>
                    </select>
                </div>
                <div className="flex-1 min-w-[160px]">
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Élève</label>
                    <input
                        type="text"
                        value={aluno}
                        onChange={e => setAluno(e.target.value)}
                        placeholder="Nom ou ID..."
                        className={inputCls + ' w-full'}
                    />
                </div>
                <button
                    onClick={exportCSV}
                    className="px-4 py-2 rounded-xl bg-success-500 text-white font-bold text-sm hover:bg-success-600 flex items-center gap-2"
                >
                    <LucideIcon name="download" size={16} /> CSV
                </button>
            </div>

            {/* ── Tabela ── */}
            <div className="border border-soft-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2 border-b border-soft-100 flex items-center justify-between">
                    <span className="text-sm font-bold text-navy-500">{filtered.length} mouvements</span>
                    {loading && <span className="text-xs text-slate-400 flex items-center gap-1"><LucideIcon name="loader-2" size={12} className="animate-spin" /> Chargement...</span>}
                </div>
                <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-soft-50 sticky top-0 z-10">
                            <tr className="text-left text-xs font-bold text-slate-400 uppercase">
                                <th className="px-4 py-2">Date / Heure</th>
                                <th className="px-4 py-2">Élève</th>
                                <th className="px-4 py-2">Classe</th>
                                <th className="px-4 py-2">Zone</th>
                                <th className="px-4 py-2">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && !loading && (
                                <tr>
                                    <td colSpan="5" className="px-4 py-10 text-center text-sm text-slate-400">
                                        Aucun mouvement
                                    </td>
                                </tr>
                            )}
                            {filtered.map((l, i) => {
                                const u = window.userCache?.byId(l.userId);
                                const isEntrada = l.action === 'ENTRADA';
                                return (
                                    <tr key={l.id || i} className="border-b border-soft-50 hover:bg-soft-50/50 transition-colors">
                                        <td className="px-4 py-2 text-slate-500 font-mono text-xs">{fmtDateTime(l.timestamp)}</td>
                                        <td className="px-4 py-2 font-bold text-navy-500">{u?.nome || l.userId}</td>
                                        <td className="px-4 py-2 text-slate-500">{u?.turma || '—'}</td>
                                        <td className="px-4 py-2 text-slate-600">{pointName(l.pointId)}</td>
                                        <td className="px-4 py-2">
                                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                                                isEntrada
                                                    ? 'text-success-700 bg-success-100'
                                                    : 'text-danger-700 bg-danger-100'
                                            }`}>
                                                {isEntrada ? 'Entrée' : 'Sortie'}
                                            </span>
                                        </td>
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

// ── Overview Tab ─────────────────────────────────────────────────────
function OverviewTab() {
    const [period,   setPeriod]   = React.useState('week'); // 'week' | 'month'
    const [data, setData] = React.useState(null);
    const [loading, setLoading] = React.useState(false);

    // Calcular dateFrom/dateTo a partir do period
    const { dateFrom, dateTo } = React.useMemo(() => {
        const to   = new Date();
        const from = new Date();
        if (period === 'week')  from.setDate(to.getDate() - 6);
        else                    from.setDate(to.getDate() - 29);
        const fmt = d => d.toISOString().slice(0, 10);
        return { dateFrom: fmt(from), dateTo: fmt(to) };
    }, [period]);

    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            const d = await window.api.fetchOverview({ dateFrom, dateTo });
            setData(d);
        } catch (e) { setData(null); }
        finally { setLoading(false); }
    }, [dateFrom, dateTo]);

    React.useEffect(() => { load(); }, [load]);

    const grandTotal = data?.totalMovements || 0;
    const allUniques = data?.uniqueStudents || 0;
    const prevTotal = data?.previousTotal ?? null;
    const trend = (prevTotal == null || prevTotal === 0) ? null
        : Math.round(((grandTotal - prevTotal) / prevTotal) * 100);

    const areaLabels = { cantine: 'Cantine', infirmerie: 'Infirmerie', cdi: 'CDI', portail: 'Portail' };
    const areaIcons = { cantine: 'utensils', infirmerie: 'heart-pulse', cdi: 'book-open', portail: 'door-open' };
    const areaStats = (data?.areas || []).map(a => ({
        key: a.area,
        label: areaLabels[a.area] || a.area,
        icon: areaIcons[a.area] || 'square',
        total: a.movements,
        uniques: a.uniqueStudents,
        entradas: a.entries,
    }));
    const maxAreaTotal = Math.max(...areaStats.map(a => a.total), 1);

    const attention = {
        sejoursLongs: data?.longInfirmaryStays || 0,
        repasHorsHoraire: data?.offScheduleMeals || 0,
        sortiesNonEnreg: data?.unregisteredExits || 0,
        total: (data?.longInfirmaryStays || 0) + (data?.offScheduleMeals || 0) + (data?.unregisteredExits || 0),
    };

    // pico de hora (do byHour)
    const picoHora = (() => {
        const bh = data?.byHour || [];
        if (!bh.length) return null;
        return bh.reduce((max, h) => h.count > max.count ? h : max, bh[0]).hour;
    })();
    const zonaMaisAtiva = areaStats.length
        ? areaStats.reduce((max, a) => a.total > max.total ? a : max, areaStats[0])
        : null;

    const areaColor = {
        cantine: 'bg-accent-500', infirmerie: 'bg-danger-500', cdi: 'bg-warning-500', portail: 'bg-navy-500'
    };
    const areaBarColor = {
        cantine: '#f97316', infirmerie: '#ef4444', cdi: '#eab308', portail: '#0c1b3a'
    };

    const periodoLabel = period === 'week' ? '7 derniers jours' : '30 derniers jours';

    return (
        <div>
            {/* ── Toggle de período ── */}
            <div className="flex gap-2 mb-5">
                <button
                    onClick={() => setPeriod('week')}
                    className={`flex-1 py-2 rounded-xl font-bold text-sm transition-colors ${period === 'week' ? 'bg-accent-500 text-white shadow-sm' : 'bg-soft-100 text-navy-500 hover:bg-soft-200'}`}
                >
                    Cette semaine
                </button>
                <button
                    onClick={() => setPeriod('month')}
                    className={`flex-1 py-2 rounded-xl font-bold text-sm transition-colors ${period === 'month' ? 'bg-accent-500 text-white shadow-sm' : 'bg-soft-100 text-navy-500 hover:bg-soft-200'}`}
                >
                    Ce mois
                </button>
                {loading && (
                    <span className="self-center text-xs text-slate-400 flex items-center gap-1 ml-2">
                        <LucideIcon name="loader-2" size={12} className="animate-spin" /> Chargement...
                    </span>
                )}
            </div>

            {/* ── Analyse de l'Activité ── */}
            <div className="bg-warning-50 border border-warning-200 rounded-2xl p-4 mb-5 flex gap-3">
                <LucideIcon name="lightbulb" size={20} className="text-warning-600 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="font-bold text-warning-700 text-sm">Analyse de l'Activité</p>
                    <p className="text-sm text-slate-600 mt-1">
                        {grandTotal === 0
                            ? 'Aucune activité sur la période.'
                            : (<>La zone la plus active est <b>{zonaMaisAtiva.label}</b> ({zonaMaisAtiva.total} mouvements). Le pic d'affluence est observé vers <b>{picoHora}h</b>. {allUniques} élève{allUniques > 1 ? 's' : ''} ont circulé sur la période ({periodoLabel}).</>)
                        }
                    </p>
                </div>
            </div>

            {/* ── Points d'attention ── */}
            <div className={`rounded-2xl border p-4 mb-5 ${attention.total === 0 ? 'bg-success-50 border-success-200' : 'bg-danger-50 border-danger-200'}`}>
                <div className="flex items-center gap-2 mb-3">
                    <LucideIcon name={attention.total === 0 ? 'shield-check' : 'alert-triangle'} size={20} className={attention.total === 0 ? 'text-success-600' : 'text-danger-600'} />
                    <h3 className={`font-black text-sm ${attention.total === 0 ? 'text-success-700' : 'text-danger-700'}`}>
                        Points d'attention {attention.total > 0 ? `(${attention.total})` : ''}
                    </h3>
                </div>
                {attention.total === 0 ? (
                    <p className="text-sm text-slate-600">Aucune anomalie détectée sur la période.</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-white rounded-xl p-3 border border-danger-100">
                            <p className="text-2xl font-black text-danger-600">{attention.sejoursLongs}</p>
                            <p className="text-xs text-slate-500 mt-1">Séjours prolongés (infirmerie)</p>
                        </div>
                        <div className="bg-white rounded-xl p-3 border border-danger-100">
                            <p className="text-2xl font-black text-warning-600">{attention.repasHorsHoraire}</p>
                            <p className="text-xs text-slate-500 mt-1">Repas hors horaire</p>
                        </div>
                        <div className="bg-white rounded-xl p-3 border border-danger-100">
                            <p className="text-2xl font-black text-slate-600">{attention.sortiesNonEnreg}</p>
                            <p className="text-xs text-slate-500 mt-1">Sorties non enregistrées</p>
                        </div>
                    </div>
                )}
            </div>

            {/* ── KPIs globaux ── */}
            <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-navy-500 rounded-2xl p-5 text-white">
                    <p className="text-xs font-bold uppercase opacity-70">Total mouvements</p>
                    <p className="text-3xl font-black mt-1">{grandTotal}</p>
                    <p className="text-xs opacity-50 mt-1">{periodoLabel}</p>
                    {trend !== null && (
                        <p className="text-xs font-bold mt-1 opacity-90">
                            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}% vs période précédente
                        </p>
                    )}
                </div>
                <div className="bg-accent-500 rounded-2xl p-5 text-white">
                    <p className="text-xs font-bold uppercase opacity-70">Élèves uniques</p>
                    <p className="text-3xl font-black mt-1">{allUniques}</p>
                    <p className="text-xs opacity-50 mt-1">élèves distincts</p>
                </div>
            </div>

            {/* ── Cards par zone avec barre CSS ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {areaStats.map(a => (
                    <div key={a.key} className="bg-white rounded-2xl border border-soft-200 p-4 shadow-sm">
                        {/* en-tête zone */}
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`w-10 h-10 rounded-xl ${areaColor[a.key] || 'bg-slate-400'} flex items-center justify-center`}>
                                <LucideIcon name={a.icon} size={20} className="text-white" />
                            </div>
                            <h3 className="text-base font-black text-navy-500">{a.label}</h3>
                        </div>

                        {/* barre de fréquentation CSS (comme le CDI) */}
                        <div className="mb-3">
                            <div className="flex justify-between text-xs text-slate-400 mb-1">
                                <span>Fréquentation relative</span>
                                <span>{a.total} mvt</span>
                            </div>
                            <div className="h-3 bg-soft-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{ width: `${Math.round((a.total / maxAreaTotal) * 100)}%`, backgroundColor: areaBarColor[a.key] || '#94a3b8' }}
                                />
                            </div>
                        </div>

                        {/* métriques */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                                <p className="text-2xl font-black text-navy-500">{a.total}</p>
                                <p className="text-xs text-slate-400">Mouvements</p>
                            </div>
                            <div>
                                <p className="text-2xl font-black text-accent-600">{a.uniques}</p>
                                <p className="text-xs text-slate-400">Élèves</p>
                            </div>
                            <div>
                                <p className="text-2xl font-black text-success-600">{a.entradas}</p>
                                <p className="text-xs text-slate-400">Entrées</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── GeneralReport ─────────────────────────────────────────────────────
function GeneralReport({ onClose }) {
    const [tab, setTab] = React.useState('overview'); // 'overview' | 'student' | 'journal'

    const tabBtn = (id, label, icon) => (
        <button onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                tab === id ? 'bg-accent-500 text-white shadow-sm' : 'bg-soft-100 text-navy-500 hover:bg-soft-200'
            }`}>
            <LucideIcon name={icon} size={16} /> {label}
        </button>
    );

    return (
        <div className="max-w-7xl mx-auto px-4 py-6 animate-fade-in">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-navy-500 flex items-center justify-center">
                        <LucideIcon name="layout-dashboard" size={24} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-navy-500">Rapport Général</h2>
                        <p className="text-sm text-slate-400">Vue consolidée de toutes les zones</p>
                    </div>
                </div>
                {onClose && (
                    <button onClick={onClose} className="px-4 py-2 rounded-xl bg-soft-100 text-navy-500 font-bold text-sm hover:bg-soft-200 transition-colors">Fermer</button>
                )}
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
                {tabBtn('overview', "Vue d'ensemble", 'bar-chart-3')}
                {tabBtn('student', 'Par élève', 'user-search')}
                {tabBtn('journal', 'Journal', 'list')}
            </div>

            <div className="bg-white rounded-2xl border border-soft-200 p-6 shadow-sm min-h-[300px]">
                {tab === 'overview' && <OverviewTab />}
                {tab === 'student'  && <div className="text-center text-slate-400 py-16">Par élève — à venir</div>}
                {tab === 'journal'  && <JournalTab />}
            </div>
        </div>
    );
}
