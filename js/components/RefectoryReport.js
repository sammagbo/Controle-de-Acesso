// =====================================================================
// RAPPORT CANTINE — manager report (paired meals + KPIs + period filter)
// =====================================================================
// Consumes GET /api/access/refectory/meals (paired entry+exit).
// Period quick-select (today/week/month/custom), filters (student/class),
// KPIs, table with duration & status, CSV + PDF export.

function RefectoryReport() {
    const todayStr = () => new Date().toISOString().slice(0, 10);

    const [dateFrom, setDateFrom] = React.useState(todayStr());
    const [dateTo, setDateTo] = React.useState(todayStr());
    const [period, setPeriod] = React.useState('today');
    const [aluno, setAluno] = React.useState('');
    const [turma, setTurma] = React.useState('');
    const [statut, setStatut] = React.useState(''); // '', 'ontime', 'late', 'noexit'
    const [meals, setMeals] = React.useState([]);
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

    const statusBadge = (m) => {
        if (!m.exitRegistered) return { label: 'Sortie non enregistrée', cls: 'text-slate-600 bg-slate-100' };
        if (!m.onTime) return { label: 'Hors horaire', cls: 'text-danger-700 bg-danger-100' };
        return { label: 'À l\'heure', cls: 'text-success-700 bg-success-100' };
    };

    const fmtDuration = (min) => {
        if (min == null) return '—';
        if (min < 60) return `${min} min`;
        return `${Math.floor(min / 60)}h${(min % 60).toString().padStart(2, '0')}`;
    };

    const exportCSV = () => {
        const header = 'Date,ID,Nom,Classe,Entrée,Sortie,Durée (min),Statut\n';
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
                <h1 className="text-2xl font-black mb-1">Rapport Cantine — Lycée Molière</h1>
                <p className="text-sm text-slate-500 mb-4">Période : {dateFrom} → {dateTo} · {filtered.length} repas</p>
                <div className="grid grid-cols-5 gap-3 mb-5 text-center text-sm">
                    <div><b className="block text-xl">{kpis.total}</b>Repas</div>
                    <div><b className="block text-xl">{kpis.uniques}</b>Élèves</div>
                    <div><b className="block text-xl">{kpis.late}</b>Hors horaire</div>
                    <div><b className="block text-xl">{kpis.noExit}</b>Sans sortie</div>
                    <div><b className="block text-xl">{fmtDuration(kpis.avg)}</b>Durée moy.</div>
                </div>
                <table className="w-full text-xs border-collapse">
                    <thead><tr className="border-b-2 border-slate-800 text-left">
                        <th className="py-1">Date</th><th>Nom</th><th>Classe</th><th>Entrée</th><th>Sortie</th><th>Durée</th><th>Statut</th>
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
                    <h2 className="text-xl font-black text-navy-500">Rapport Cantine</h2>
                    <p className="text-sm text-slate-400">Repas, durée de présence et ponctualité</p>
                </div>
            </div>

            {/* Period quick-select */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
                {periodBtn('today', "Aujourd'hui")}
                {periodBtn('week', '7 derniers jours')}
                {periodBtn('month', '30 derniers jours')}
                {periodBtn('custom', 'Personnalisé')}
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
                    { label: 'Repas servis', value: kpis.total, color: 'text-navy-500' },
                    { label: 'Élèves uniques', value: kpis.uniques, color: 'text-accent-600' },
                    { label: 'Hors horaire', value: kpis.late, color: 'text-danger-600' },
                    { label: 'Sans sortie', value: kpis.noExit, color: 'text-slate-500' },
                    { label: 'Durée moyenne', value: fmtDuration(kpis.avg), color: 'text-success-600' },
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
                    <label className="text-xs font-bold text-slate-400 uppercase">Élève (nom/ID)</label>
                    <input type="text" value={aluno} onChange={e => setAluno(e.target.value)} placeholder="Rechercher..." className={inputCls + " w-full mt-1"} />
                </div>
                <div className="min-w-[140px]">
                    <label className="text-xs font-bold text-slate-400 uppercase">Classe</label>
                    <select value={turma} onChange={e => setTurma(e.target.value)} className={inputCls + " w-full mt-1"}>
                        <option value="">Toutes</option>
                        {turmas.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div className="min-w-[160px]">
                    <label className="text-xs font-bold text-slate-400 uppercase">Statut</label>
                    <select value={statut} onChange={e => setStatut(e.target.value)} className={inputCls + " w-full mt-1"}>
                        <option value="">Tous</option>
                        <option value="ontime">À l'heure</option>
                        <option value="late">Hors horaire</option>
                        <option value="noexit">Sans sortie</option>
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
                    <span className="text-sm font-bold text-navy-500">{filtered.length} repas</span>
                    {loading && <span className="text-xs text-slate-400">Chargement...</span>}
                </div>
                <div className="overflow-x-auto max-h-[calc(100vh-440px)] overflow-y-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-soft-50 sticky top-0">
                            <tr className="text-left text-xs font-bold text-slate-400 uppercase">
                                <th className="px-4 py-2">Date</th>
                                <th className="px-4 py-2">Élève</th>
                                <th className="px-4 py-2">Classe</th>
                                <th className="px-4 py-2">Entrée</th>
                                <th className="px-4 py-2">Sortie</th>
                                <th className="px-4 py-2">Durée</th>
                                <th className="px-4 py-2">Statut</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && !loading && (
                                <tr><td colSpan="7" className="px-4 py-10 text-center text-sm text-slate-400">Aucun repas pour cette période</td></tr>
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
