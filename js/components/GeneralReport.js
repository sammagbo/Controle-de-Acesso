// =====================================================================
// RAPPORT GÉNÉRAL — consolidated view across all areas (admin only)
// 3 tabs: Vue d'ensemble (KPIs by area) | Par élève | Journal (all logs)
// =====================================================================

// ── Journal Tab ──────────────────────────────────────────────────────
function JournalTab() {
    const todayStr = () => new Date().toISOString().slice(0, 10);
    const [dateFrom, setDateFrom] = React.useState(todayStr());
    const [dateTo, setDateTo] = React.useState(todayStr());
    const [pointId, setPointId] = React.useState('');
    const [action, setAction] = React.useState('');
    const [aluno, setAluno] = React.useState('');
    const [logs, setLogs] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [classe, setClasse] = React.useState('');
    const [sortDir, setSortDir] = React.useState('desc');
    const [page, setPage] = React.useState(1);
    const PAGE_SIZE = 50;

    const load = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await window.api.fetchAllLogs({ dateFrom, dateTo, pointId, action, limit: 500 });
            setLogs(Array.isArray(data) ? data : []);
        } catch (e) {
            setLogs([]);
            setError('Impossible de charger le journal. Vérifiez la connexion au serveur.');
        } finally {
            setLoading(false);
        }
    }, [dateFrom, dateTo, pointId, action]);

    React.useEffect(() => { load(); }, [load]);

    // filtro client-side por nome/ID do aluno
    const filtered = React.useMemo(() => {
        const qA = aluno.trim().toLowerCase();
        const qC = classe.trim().toLowerCase();
        return logs.filter(l => {
            const u = window.userCache?.byId(l.userId);
            if (qA) {
                const nome = (u?.nome || '').toLowerCase();
                if (!nome.includes(qA) && !String(l.userId).includes(aluno.trim())) return false;
            }
            if (qC) {
                const turma = (u?.turma || '').toLowerCase();
                if (!turma.includes(qC)) return false;
            }
            return true;
        });
    }, [logs, aluno, classe]);

    const sorted = React.useMemo(() => {
        const arr = [...filtered];
        arr.sort((a, b) => sortDir === 'desc'
            ? new Date(b.timestamp) - new Date(a.timestamp)
            : new Date(a.timestamp) - new Date(b.timestamp));
        return arr;
    }, [filtered, sortDir]);
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const pageRows = React.useMemo(
        () => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        [sorted, page]
    );
    React.useEffect(() => { setPage(1); }, [filtered]);

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
                <div>
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Classe</label>
                    <input
                        type="text"
                        value={classe}
                        onChange={e => setClasse(e.target.value)}
                        placeholder="ex: CE1D"
                        className={inputCls + ' w-24'}
                    />
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

            {error && (
                <div className="mb-3 flex items-center gap-2 bg-danger-50 border border-danger-200 text-danger-700 text-sm rounded-xl px-4 py-2.5">
                    <LucideIcon name="wifi-off" size={16} />
                    <span className="flex-1">{error}</span>
                    <button onClick={load} className="font-bold underline hover:no-underline">Réessayer</button>
                </div>
            )}

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
                                <th className="px-4 py-2">
                                    <button onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                                        className="flex items-center gap-1 uppercase font-bold hover:text-navy-500 transition-colors">
                                        Date / Heure
                                        <LucideIcon name={sortDir === 'desc' ? 'arrow-down' : 'arrow-up'} size={12} />
                                    </button>
                                </th>
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
                            {pageRows.map((l, i) => {
                                const u = window.userCache?.byId(l.userId);
                                const isEntrada = l.action === 'ENTRADA';
                                return (
                                    <tr key={l.id || i} className="border-b border-soft-50 hover:bg-soft-50/50 transition-colors">
                                        <td className="px-4 py-2 text-slate-500 font-mono text-xs">{fmtDateTime(l.timestamp)}</td>
                                        <td className="px-4 py-2 font-bold text-navy-500">{u?.nome || l.userId}</td>
                                        <td className="px-4 py-2 text-slate-500">{u?.turma || '—'}</td>
                                        <td className="px-4 py-2 text-slate-600">{pointName(l.pointId)}</td>
                                        <td className="px-4 py-2">
                                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${isEntrada
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
                {totalPages > 1 && (
                    <div className="px-4 py-2 border-t border-soft-100 flex items-center justify-between text-sm">
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                            className="px-3 py-1 rounded-lg bg-soft-100 font-bold text-navy-500 hover:bg-soft-200 disabled:opacity-40 disabled:cursor-not-allowed">‹ Précédent</button>
                        <span className="text-xs text-slate-400">Page {page} / {totalPages} · {sorted.length} résultats{logs.length === 500 ? ' (max 500 chargés)' : ''}</span>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                            className="px-3 py-1 rounded-lg bg-soft-100 font-bold text-navy-500 hover:bg-soft-200 disabled:opacity-40 disabled:cursor-not-allowed">Suivant ›</button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Par élève Tab ────────────────────────────────────────────────────
function ParEleveTab() {
    const todayStr = () => new Date().toISOString().slice(0, 10);

    const [query,    setQuery]    = React.useState('');
    const [results,  setResults]  = React.useState([]);
    const [selected, setSelected] = React.useState(null);
    const [period,   setPeriod]   = React.useState('today');
    const [logs,     setLogs]     = React.useState([]);
    const [loading,  setLoading]  = React.useState(false);
    const [searched, setSearched] = React.useState(false);

    // Debounced search 250 ms (userCache.search é assíncrono — busca no backend)
    React.useEffect(() => {
        if (!query.trim()) { setResults([]); setSearched(false); return; }
        let cancelled = false;
        const tid = setTimeout(async () => {
            let hits = [];
            try {
                hits = await (window.userCache?.search?.(query.trim(), 8) || []);
            } catch (e) {
                hits = [];
            }
            if (cancelled) return;
            setResults(Array.isArray(hits) ? hits : []);
            setSearched(true);
        }, 250);
        return () => { cancelled = true; clearTimeout(tid); };
    }, [query]);

    const { dateFrom, dateTo } = React.useMemo(() => {
        const to   = new Date();
        const from = new Date();
        if (period === 'week')       from.setDate(to.getDate() - 6);
        else if (period === 'month') from.setDate(to.getDate() - 29);
        const fmt = d => d.toISOString().slice(0, 10);
        return { dateFrom: fmt(from), dateTo: fmt(to) };
    }, [period]);

    const loadLogs = React.useCallback(async (user) => {
        if (!user) return;
        setLoading(true);
        try {
            const data = await window.api.fetchUserLogs(user.id, { dateFrom, dateTo });
            setLogs(Array.isArray(data) ? data : []);
        } catch (e) {
            setLogs([]);
        } finally {
            setLoading(false);
        }
    }, [dateFrom, dateTo]);

    React.useEffect(() => {
        const u = selected?.user || selected;
        if (u) loadLogs(u);
    }, [loadLogs, selected]);

    const pointName = (id) => {
        const p = (typeof ACCESS_POINTS !== 'undefined' ? ACCESS_POINTS : []).find(pt => pt.id === id);
        return p ? p.nome : id;
    };
    const tsMs = (ts) => typeof ts === 'number' ? ts : new Date(ts).getTime();
    const fmtTime = (ts) => new Date(tsMs(ts)).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const fmtDayHeader = (dateStr) => {
        const d = new Date(dateStr + 'T12:00:00');
        return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    };

    // Chips de présence derivados dos logs de hoje
    const presenceChips = React.useMemo(() => {
        const today = todayStr();
        const todayLogs = logs
            .filter(l => new Date(tsMs(l.timestamp)).toISOString().slice(0, 10) === today)
            .sort((a, b) => tsMs(a.timestamp) - tsMs(b.timestamp));

        const entry = todayLogs.find(l => l.action === 'ENTRADA' && String(l.pointId).startsWith('PORT'));
        const entryChip = entry
            ? { label: `Entré à ${fmtTime(entry.timestamp)}`, cls: 'bg-success-100 text-success-700' }
            : { label: 'Pas encore entré', cls: 'bg-slate-100 text-slate-500' };

        const internalPoints = ['REFEI1', 'REFEI2', 'CANTINA1', 'ENFERM', 'BIBLIO'];
        const lastInternal = [...todayLogs].reverse().find(l => internalPoints.includes(l.pointId));
        let locationChip = { label: 'Actuellement: —', cls: 'bg-slate-100 text-slate-500' };
        if (lastInternal && lastInternal.action === 'ENTRADA') {
            const hasExitAfter = todayLogs.some(
                l => l.pointId === lastInternal.pointId && l.action === 'SAIDA' &&
                    tsMs(l.timestamp) > tsMs(lastInternal.timestamp)
            );
            if (!hasExitAfter) {
                locationChip = { label: `Actuellement: ${pointName(lastInternal.pointId)}`, cls: 'bg-accent-100 text-accent-700' };
            }
        }
        return [entryChip, locationChip];
    }, [logs]);

    // Grouper logs par jour (decroissant) + durées dérivées (ENTRADA→SAIDA même point, même jour)
    const logsByDay = React.useMemo(() => {
        const days = {};
        logs.forEach(l => {
            const key = new Date(tsMs(l.timestamp)).toISOString().slice(0, 10);
            if (!days[key]) days[key] = [];
            days[key].push({ ...l });
        });
        Object.values(days).forEach(dayLogs => {
            dayLogs.sort((a, b) => tsMs(a.timestamp) - tsMs(b.timestamp));
            const open = {};
            dayLogs.forEach(l => {
                if (l.action === 'ENTRADA') {
                    open[l.pointId] = l;
                } else if (l.action === 'SAIDA' && open[l.pointId]) {
                    l._dur = Math.round((tsMs(l.timestamp) - tsMs(open[l.pointId].timestamp)) / 60000);
                    delete open[l.pointId];
                }
            });
            Object.values(open).forEach(l => {
                if (!String(l.pointId).startsWith('PORT')) l._open = true;
            });
        });
        return Object.entries(days).sort(([a], [b]) => b.localeCompare(a));
    }, [logs]);

    const u = selected?.user || selected;
    const lastMove = logs.length > 0 ? logs[0] : null;
    const foto = u?.foto_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u?.nome || 'U')}`;
    const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-soft-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent-300 bg-white';
    const periodBtns = [
        { id: 'today', label: "Aujourd'hui" },
        { id: 'week',  label: '7 jours' },
        { id: 'month', label: '30 jours' },
    ];

    return (
        <div>
            {/* ── Busca ── */}
            <div className="mb-4 relative">
                <div className="relative">
                    <LucideIcon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Rechercher un élève par nom ou ID..."
                        className={inputCls + ' pl-9'}
                    />
                </div>
                {searched && results.length === 0 && (
                    <div className="mt-1 text-xs text-slate-400 pl-1">Aucun résultat</div>
                )}
                {results.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white rounded-xl border border-soft-200 shadow-lg overflow-hidden">
                        {results.map((hit, i) => {
                            const hu = hit.user || hit;
                            const hFoto = hu.foto_url ||
                                `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(hu.nome || 'U')}`;
                            return (
                                <button
                                    key={hu.id || i}
                                    onClick={() => { setSelected(hit); setQuery(''); setResults([]); setSearched(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-soft-50 transition-colors text-left"
                                >
                                    <img src={hFoto} alt=""
                                        className="w-8 h-8 rounded-full object-cover bg-soft-100 shrink-0"
                                        onError={e => { e.target.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(hu.nome || 'U')}`; }}
                                    />
                                    <span className="font-bold text-sm text-navy-500 flex-1 truncate">{hu.nome}</span>
                                    <span className="text-xs text-slate-400 shrink-0">{hu.turma || '—'}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Nenhum aluno selecionado ── */}
            {!u && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                    <LucideIcon name="user-search" size={40} className="text-slate-300" />
                    <p className="text-sm">Recherchez un élève pour voir sa présence et sa timeline</p>
                </div>
            )}

            {/* ── Aluno selecionado ── */}
            {u && (
                <>
                    {/* Card */}
                    <div className="flex items-center gap-4 bg-soft-50 rounded-2xl p-4 mb-4 border border-soft-200">
                        <img src={foto} alt=""
                            className="w-14 h-14 rounded-2xl object-cover bg-soft-200 shrink-0"
                            onError={e => { e.target.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.nome || 'U')}`; }}
                        />
                        <div className="flex-1 min-w-0">
                            <p className="font-black text-navy-500 text-base truncate">{u.nome}</p>
                            <p className="text-xs text-slate-400">{u.turma || '—'} &middot; <span className="font-mono">{u.id}</span></p>
                            {lastMove && (
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                    Dernier passage&nbsp;: <b className="text-slate-600">{pointName(lastMove.pointId)}</b> à {fmtTime(lastMove.timestamp)} &middot; {logs.length}{logs.length === 500 ? '+' : ''} mouvement{logs.length > 1 ? 's' : ''} sur la période
                                </p>
                            )}
                            <div className="flex flex-wrap gap-2 mt-2">
                                {presenceChips.map((c, i) => (
                                    <span key={i} className={`text-xs font-bold px-2.5 py-1 rounded-full ${c.cls}`}>{c.label}</span>
                                ))}
                            </div>
                        </div>
                        <button
                            onClick={() => { setSelected(null); setLogs([]); }}
                            className="shrink-0 p-1 text-slate-400 hover:text-danger-500 transition-colors"
                            title="Désélectionner"
                        >
                            <LucideIcon name="x" size={18} />
                        </button>
                    </div>

                    {/* Sélecteur de période */}
                    <div className="flex gap-2 mb-4">
                        {periodBtns.map(b => (
                            <button key={b.id} onClick={() => setPeriod(b.id)}
                                className={`px-4 py-1.5 rounded-xl text-sm font-bold transition-colors ${
                                    period === b.id ? 'bg-accent-500 text-white shadow-sm' : 'bg-soft-100 text-navy-500 hover:bg-soft-200'
                                }`}
                            >{b.label}</button>
                        ))}
                        {loading && (
                            <span className="self-center text-xs text-slate-400 flex items-center gap-1 ml-2">
                                <LucideIcon name="loader-2" size={12} className="animate-spin" /> Chargement...
                            </span>
                        )}
                    </div>

                    {/* Timeline */}
                    {loading && logs.length === 0 && (
                        <div className="animate-pulse flex flex-col gap-6 mt-6">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="relative pl-6 border-l-2 border-slate-200">
                                    <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-slate-300"></div>
                                    <div className="bg-white border border-soft-200 rounded-2xl p-4 h-20 shadow-sm flex items-center justify-between">
                                        <div className="w-1/2">
                                            <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
                                            <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                                        </div>
                                        <div className="h-6 bg-slate-100 rounded-full w-16"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {!loading && logs.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                            <LucideIcon name="calendar-x" size={32} className="text-slate-300" />
                            <p className="text-sm">Aucun mouvement sur la période</p>
                        </div>
                    )}
                    {logs.length > 0 && (
                        <div className="space-y-5">
                            {logsByDay.map(([dayKey, dayLogs]) => (
                                <div key={dayKey}>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 capitalize">
                                        {fmtDayHeader(dayKey)}
                                    </p>
                                    <div className="space-y-1.5">
                                        {dayLogs
                                            .slice()
                                            .sort((a, b) => tsMs(b.timestamp) - tsMs(a.timestamp))
                                            .map((l, i) => {
                                                const isEntrada = l.action === 'ENTRADA';
                                                return (
                                                    <div key={l.id || i} className="flex items-center gap-3 bg-white rounded-xl px-3 py-2 border border-soft-100">
                                                        <span className="font-mono text-xs text-slate-400 w-12 shrink-0">{fmtTime(l.timestamp)}</span>
                                                        <span className="flex-1 text-sm text-slate-700 truncate">{pointName(l.pointId)}</span>
                                                        {l._open && (
                                                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 bg-amber-100 text-amber-700">
                                                                sans sortie
                                                            </span>
                                                        )}
                                                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                                            isEntrada ? 'bg-success-100 text-success-700' : 'bg-rose-100 text-rose-700'
                                                        }`}>
                                                            {isEntrada ? 'Entrée' : 'Sortie'}{!isEntrada && l._dur != null ? ` (${l._dur} min)` : ''}
                                                        </span>
                                                    </div>
                                                );
                                            })
                                        }
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ── Overview Tab ─────────────────────────────────────────────────────
function OverviewTab() {
    const [period, setPeriod] = React.useState('week'); // 'today' | 'week' | 'month' | 'custom'
    const [customFrom, setCustomFrom] = React.useState(new Date().toISOString().slice(0, 10));
    const [customTo,   setCustomTo]   = React.useState(new Date().toISOString().slice(0, 10));
    const [data, setData] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [lastEvent, setLastEvent] = React.useState(null);  // HH:mm string ou null
    const [updatedAt, setUpdatedAt] = React.useState(null);  // HH:mm:ss string
    const [todayAlerts, setTodayAlerts] = React.useState([]);    // alertas de hoje

    const { dateFrom, dateTo } = React.useMemo(() => {
        const fmt = d => d.toISOString().slice(0, 10);
        if (period === 'custom') {
            const f = customFrom <= customTo ? customFrom : customTo;
            const t = customFrom <= customTo ? customTo : customFrom;
            return { dateFrom: f, dateTo: t };
        }
        const to = new Date();
        const from = new Date();
        if (period === 'week') from.setDate(to.getDate() - 6);
        else if (period === 'month') from.setDate(to.getDate() - 29);
        return { dateFrom: fmt(from), dateTo: fmt(to) };
    }, [period, customFrom, customTo]);

    const fmtHHmm = (d) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const fmtHHmmss = (d) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const load = React.useCallback(async () => {
        setLoading(true);
        const today = new Date().toISOString().slice(0, 10);
        try {
            const [d, lastLogArr, visits, meals] = await Promise.all([
                window.api.fetchOverview({ dateFrom, dateTo }),
                window.api.fetchAllLogs({ limit: 1 }).catch(() => []),
                (typeof fetchInfirmaryVisits === 'function'
                    ? fetchInfirmaryVisits({ dateFrom: today, dateTo: today })
                    : Promise.resolve([])
                ).catch(() => []),
                (typeof fetchRefectoryMeals === 'function'
                    ? fetchRefectoryMeals({ dateFrom: today, dateTo: today })
                    : Promise.resolve([])
                ).catch(() => [])
            ]);
            setData(d);
            const lastLog = Array.isArray(lastLogArr) && lastLogArr.length > 0 ? lastLogArr[0] : null;
            setLastEvent(lastLog && lastLog.timestamp ? fmtHHmm(new Date(lastLog.timestamp)) : null);
            // ── Construir lista de alertas client-side ──────────────────
            const alerts = [];
            (Array.isArray(visits) ? visits : []).forEach(v => {
                if (!v.exitRegistered) {
                    alerts.push({
                        severite: 'critique',
                        type: 'Sans sortie (infirmerie)',
                        nome: v.nome || v.userId,
                        turma: v.turma || '—',
                        heure: v.entryTime || '—',
                        detail: 'Pas de sortie enregistrée',
                    });
                } else if (v.durationMinutes != null && v.durationMinutes > 45) {
                    alerts.push({
                        severite: 'critique',
                        type: 'Séjour prolongé',
                        nome: v.nome || v.userId,
                        turma: v.turma || '—',
                        heure: v.entryTime || '—',
                        detail: v.durationMinutes + ' min',
                    });
                } else if (v.durationMinutes != null && v.durationMinutes > 30) {
                    alerts.push({
                        severite: 'attention',
                        type: 'Séjour prolongé',
                        nome: v.nome || v.userId,
                        turma: v.turma || '—',
                        heure: v.entryTime || '—',
                        detail: v.durationMinutes + ' min',
                    });
                }
            });
            (Array.isArray(meals) ? meals : []).forEach(m => {
                if (!m.exitRegistered) {
                    alerts.push({
                        severite: 'attention',
                        type: 'Sans sortie (cantine)',
                        nome: m.nome || m.userId,
                        turma: m.turma || '—',
                        heure: m.entryTime || '—',
                        detail: 'Pas de sortie enregistrée',
                    });
                } else if (!m.onTime) {
                    alerts.push({
                        severite: 'info',
                        type: 'Repas hors horaire',
                        nome: m.nome || m.userId,
                        turma: m.turma || '—',
                        heure: m.entryTime || '—',
                        detail: 'Hors créneau',
                    });
                }
            });
            // Ordenar por heure desc
            alerts.sort((a, b) => (b.heure || '').localeCompare(a.heure || ''));
            setTodayAlerts(alerts);
        } catch (e) {
            setData(null);
            setLastEvent(null);
            setTodayAlerts([]);
        } finally {
            setUpdatedAt(fmtHHmmss(new Date()));
            setLoading(false);
        }
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
        occupation: a.currentOccupancy,
        dureeMoy: a.avgDurationMin,
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

    const periodoLabel = period === 'today' ? "aujourd'hui"
        : period === 'week' ? '7 derniers jours'
        : period === 'month' ? '30 derniers jours'
        : 'période personnalisée';

    return (
        <div>
            {/* ── Toggle de période ── */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
                {[
                    { id: 'today',  label: "Aujourd'hui" },
                    { id: 'week',   label: 'Cette semaine' },
                    { id: 'month',  label: 'Ce mois' },
                    { id: 'custom', label: 'Personnalisé' },
                ].map(p => (
                    <button key={p.id}
                        onClick={() => setPeriod(p.id)}
                        className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors ${period === p.id ? 'bg-accent-500 text-white shadow-sm' : 'bg-soft-100 text-navy-500 hover:bg-soft-200'}`}
                    >
                        {p.label}
                    </button>
                ))}
                {period === 'custom' && (
                    <span className="flex items-center gap-2 ml-1">
                        <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                            className="px-3 py-1.5 rounded-xl border border-soft-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent-300" />
                        <span className="text-xs text-slate-400">au</span>
                        <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                            className="px-3 py-1.5 rounded-xl border border-soft-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent-300" />
                    </span>
                )}
                {loading && (
                    <span className="self-center text-xs text-slate-400 flex items-center gap-1 ml-2">
                        <LucideIcon name="loader-2" size={12} className="animate-spin" /> Chargement...
                    </span>
                )}
            </div>

            {/* ── État loading initial (sans data préalable) ── */}
            {loading && data === null && (
                <div className="animate-pulse flex flex-col gap-5 mt-2">
                    {/* Skeleton KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4 h-28 flex flex-col justify-between">
                                <div>
                                    <div className="h-8 bg-slate-200 rounded w-1/2 mb-2"></div>
                                    <div className="h-3 bg-slate-200 rounded w-3/4"></div>
                                </div>
                                <div className="h-2 bg-slate-200 rounded w-1/3"></div>
                            </div>
                        ))}
                    </div>
                    {/* Skeleton Charts Area */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 h-72 flex flex-col">
                            <div className="h-5 bg-slate-200 rounded w-1/3 mb-6"></div>
                            <div className="flex-1 bg-slate-100 rounded-xl"></div>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 h-72 flex flex-col">
                            <div className="h-5 bg-slate-200 rounded w-1/3 mb-6"></div>
                            <div className="flex-1 bg-slate-100 rounded-xl"></div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── État erreur ── */}
            {!loading && data === null && (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-4">
                    <LucideIcon name="wifi-off" size={40} className="text-slate-300" />
                    <p className="text-sm font-semibold text-slate-500">Impossible de charger les données</p>
                    <button
                        onClick={load}
                        className="px-5 py-2 rounded-xl bg-accent-500 text-white text-sm font-bold hover:bg-accent-600 transition-colors"
                    >
                        Réessayer
                    </button>
                </div>
            )}

            {/* ── Contenu principal (data disponível) ── */}
            {data !== null && !loading && (
                <>
                    {/* ── KPIs globaux ── */}
                    {React.createElement("div", { className: "grid grid-cols-2 md:grid-cols-5 gap-3 mb-5" },
                        // 1. Mouvements
                        React.createElement("div", { className: "bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between" },
                            React.createElement("div", null,
                                React.createElement("p", { className: "text-2xl font-bold text-slate-900" }, grandTotal.toLocaleString('fr-FR')),
                                React.createElement("p", { className: "text-xs font-semibold text-slate-700 mt-1" }, "Mouvements"),
                                React.createElement("p", { className: "text-[11px] text-slate-400" }, "secteurs internes")
                            ),
                            trend !== null ? React.createElement("p", { className: "text-[11px] font-medium mt-2 text-slate-500" },
                                (trend >= 0 ? '▲ ' : '▼ ') + Math.abs(trend) + "%"
                            ) : null
                        ),
                        // 2. Élèves uniques
                        React.createElement("div", { className: "bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between" },
                            React.createElement("div", null,
                                React.createElement("p", { className: "text-2xl font-bold text-blue-600" }, allUniques.toLocaleString('fr-FR')),
                                React.createElement("p", { className: "text-xs font-semibold text-slate-700 mt-1" }, "Élèves uniques"),
                                React.createElement("p", { className: "text-[11px] text-slate-400" }, "sur la période")
                            )
                        ),
                        // 3. Présents aujourd'hui
                        React.createElement("div", { className: "bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between" },
                            React.createElement("div", null,
                                React.createElement("p", { className: "text-2xl font-bold text-emerald-600" }, (data?.presentToday || 0).toLocaleString('fr-FR')),
                                React.createElement("p", { className: "text-xs font-semibold text-slate-700 mt-1" }, "Présents aujourd'hui"),
                                React.createElement("p", { className: "text-[11px] text-slate-400" }, "entrés dans l'école")
                            )
                        ),
                        // 4. Dans les secteurs
                        React.createElement("div", { className: "bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between" },
                            React.createElement("div", null,
                                React.createElement("p", { className: "text-2xl font-bold text-indigo-600" }, (data?.currentlyInSectors || 0).toLocaleString('fr-FR')),
                                React.createElement("p", { className: "text-xs font-semibold text-slate-700 mt-1" }, "Dans les secteurs"),
                                React.createElement("p", { className: "text-[11px] text-slate-400" }, "en ce moment")
                            )
                        ),
                        // 5. Alertes actives
                        React.createElement("div", { className: "bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between" },
                            React.createElement("div", null,
                                React.createElement("p", { className: "text-2xl font-bold " + (attention.total > 0 ? "text-rose-600" : "text-emerald-600") }, (attention.total || 0).toLocaleString('fr-FR')),
                                React.createElement("p", { className: "text-xs font-semibold text-slate-700 mt-1" }, "Alertes actives"),
                                React.createElement("p", { className: "text-[11px] text-slate-400" }, "points d'attention")
                            )
                        )
                    )}

                    {(() => {
                        const totEntrees = areaStats.reduce((s, a) => s + (a.entradas || 0), 0);
                        const totSorties = Math.max(0, grandTotal - totEntrees);
                        return (
                            <div className="grid grid-cols-3 gap-3 mb-5">
                                <div className="bg-white border border-slate-200 rounded-2xl p-3 text-center">
                                    <p className="text-xl font-bold text-emerald-600">{totEntrees.toLocaleString('fr-FR')}</p>
                                    <p className="text-[11px] font-semibold text-slate-500 mt-0.5">Entrées (secteurs internes)</p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-2xl p-3 text-center">
                                    <p className="text-xl font-bold text-rose-600">{totSorties.toLocaleString('fr-FR')}</p>
                                    <p className="text-[11px] font-semibold text-slate-500 mt-0.5">Sorties (secteurs internes)</p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-2xl p-3 text-center">
                                    <p className="text-xl font-bold text-amber-600">{(attention.sortiesNonEnreg || 0).toLocaleString('fr-FR')}</p>
                                    <p className="text-[11px] font-semibold text-slate-500 mt-0.5">Mouvements incomplets</p>
                                </div>
                            </div>
                        );
                    })()}

                    {/* ── Barra de status ── */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 mb-5">
                        <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${data ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            {data ? 'Serveur en ligne' : 'Serveur hors ligne'}
                        </span>
                        <span className="text-slate-300">|</span>
                        <span>Période&nbsp;: {dateFrom.split('-').reverse().join('/')} – {dateTo.split('-').reverse().join('/')}</span>
                        <span className="text-slate-300">|</span>
                        <span>Dernier événement&nbsp;: {lastEvent || 'Non disponible'}</span>
                        <span className="text-slate-300">|</span>
                        <span>Mis à jour à {updatedAt || '—'}</span>
                        <button onClick={load} disabled={loading}
                            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-soft-100 text-navy-500 font-bold hover:bg-soft-200 transition-colors disabled:opacity-50">
                            <LucideIcon name="refresh-cw" size={12} className={loading ? 'animate-spin' : ''} />
                            Actualiser
                        </button>
                    </div>

                    {/* ── Analyse de l'Activité ── */}
                    <div className="bg-warning-50 border border-warning-200 rounded-2xl p-4 mb-5 flex gap-3">
                        <LucideIcon name="lightbulb" size={20} className="text-warning-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold text-warning-700 text-sm">Analyse de l'Activité</p>
                            <p className="text-sm text-slate-600 mt-1">
                                {grandTotal === 0
                                    ? 'Aucune activité sur la période.'
                                    : (<>La zone la plus active est <b>{zonaMaisAtiva.label}</b> ({zonaMaisAtiva.total} mouvements). Le pic d'affluence est observé vers <b>{picoHora}h</b>. {allUniques} élève{allUniques > 1 ? 's' : ''} ont circulé sur la période ({periodoLabel}).{attention.total > 0 ? (<> Principal point d'attention&nbsp;: <b>{attention.sortiesNonEnreg >= attention.repasHorsHoraire && attention.sortiesNonEnreg >= attention.sejoursLongs ? 'sorties non enregistrées' : (attention.repasHorsHoraire >= attention.sejoursLongs ? 'repas hors horaire' : 'séjours prolongés \u00e0 l\'infirmerie')}</b> ({Math.max(attention.sejoursLongs, attention.repasHorsHoraire, attention.sortiesNonEnreg)} cas).</>) : null}</>)
                                }
                            </p>
                        </div>
                    </div>

                    {/* ── Gráficos ou estado sem dados ── */}
                    {grandTotal === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2 bg-slate-50 rounded-xl mb-5">
                            <LucideIcon name="bar-chart-2" size={32} className="text-slate-300" />
                            <p className="text-sm">Aucun mouvement sur la période</p>
                        </div>
                    ) : (
                        <>
                            {/* ── Affluence par Heure ── */}
                            {(() => {
                                const maxHourCount = Math.max(...(data?.byHour || []).map(h => h.count), 1);
                                return React.createElement("div", { className: "bg-slate-50 rounded-xl p-4 mb-5" },
                                    React.createElement("h3", { className: "font-semibold mb-3 text-sm" }, "Affluence par Heure"),
                                    React.createElement("div", { className: "flex items-end gap-1 h-32" },
                                        (data?.byHour || []).map(function (h) {
                                            const count = h.count;
                                            const isMax = count === maxHourCount && count > 0;
                                            return React.createElement("div", { key: h.hour, className: "flex-1 flex flex-col items-center" },
                                                React.createElement("span", { className: "text-[10px] font-medium text-slate-600 mb-1" }, count > 0 ? (count >= 1000 ? (count / 1000).toFixed(1) + "k" : count) : ""),
                                                React.createElement("div", {
                                                    className: "w-full rounded-t",
                                                    style: {
                                                        height: (count / maxHourCount * 100) + "%",
                                                        minHeight: "4px",
                                                        backgroundColor: isMax ? "#F59E0B" : "#0055FF"
                                                    }
                                                }),
                                                React.createElement("span", { className: "text-[10px] text-slate-400 mt-1" }, h.hour + "h")
                                            );
                                        })
                                    )
                                );
                            })()}

                            {/* ── Répartition par Zone ── */}
                            {React.createElement("div", { className: "bg-slate-50 rounded-xl p-4 mb-5" },
                                React.createElement("h3", { className: "font-semibold mb-3 text-sm" }, "Répartition par Zone"),
                                [...areaStats].sort((a, b) => b.total - a.total).map(function (a) {
                                    const areaColorMap = { cantine: "#3B82F6", infirmerie: "#EF4444", cdi: "#F59E0B", portail: "#1E293B" };
                                    return React.createElement("div", { key: a.key, className: "flex items-center gap-3 mb-2" },
                                        React.createElement("span", { className: "w-24 text-sm font-medium text-slate-700" }, a.label),
                                        React.createElement("div", { className: "flex-1 h-6 bg-slate-200 rounded-full overflow-hidden" },
                                            React.createElement("div", {
                                                className: "h-full rounded-full",
                                                style: {
                                                    width: (a.total / maxAreaTotal * 100) + "%",
                                                    backgroundColor: areaColorMap[a.key] || "#94a3b8"
                                                }
                                            })
                                        ),
                                        React.createElement("span", { className: "w-20 text-sm text-right text-slate-600" }, a.total.toLocaleString("fr-FR") + " mvt")
                                    );
                                })
                            )}

                            {React.createElement("div", { className: "bg-slate-50 rounded-xl p-4 mb-5" },
                                React.createElement("h3", { className: "font-semibold mb-3 text-sm" }, "Entrées vs Sorties par zone"),
                                [...areaStats].sort((a, b) => b.total - a.total).map(function (a) {
                                    const sorties = Math.max(0, a.total - (a.entradas || 0));
                                    const maxRef = Math.max(maxAreaTotal, 1);
                                    return React.createElement("div", { key: a.key, className: "mb-3" },
                                        React.createElement("div", { className: "flex justify-between text-xs text-slate-500 mb-1" },
                                            React.createElement("span", { className: "font-medium text-slate-700" }, a.label),
                                            React.createElement("span", null,
                                                React.createElement("span", { className: "text-emerald-600 font-bold" }, a.entradas),
                                                " entrées \u00b7 ",
                                                React.createElement("span", { className: "text-rose-600 font-bold" }, sorties),
                                                " sorties"
                                            )
                                        ),
                                        React.createElement("div", { className: "flex gap-1" },
                                            React.createElement("div", { className: "h-2.5 rounded-full bg-emerald-500", style: { width: Math.max((a.entradas / maxRef) * 100, 1) + "%" } }),
                                            React.createElement("div", { className: "h-2.5 rounded-full bg-rose-400", style: { width: Math.max((sorties / maxRef) * 100, 1) + "%" } })
                                        )
                                    );
                                })
                            )}
                        </>
                    )}

                    {/* ── Points d'attention ── */}
                    {(() => {
                        const severiteCls = {
                            critique: { badge: 'bg-rose-100 text-rose-700', icon: 'alert-octagon', border: 'border-rose-100' },
                            attention: { badge: 'bg-amber-100 text-amber-700', icon: 'alert-triangle', border: 'border-amber-100' },
                            info: { badge: 'bg-sky-100 text-sky-700', icon: 'info', border: 'border-sky-100' },
                        };
                        const visibleAlerts = todayAlerts.slice(0, 10);
                        const hasAlerts = attention.total > 0 || todayAlerts.length > 0;
                        return (
                            <div className={`rounded-2xl border p-4 mb-5 ${hasAlerts ? 'bg-danger-50 border-danger-200' : 'bg-success-50 border-success-200'}`}>
                                {/* ── En-tête ── */}
                                <div className="flex items-center gap-2 mb-3">
                                    <LucideIcon name={hasAlerts ? 'alert-triangle' : 'shield-check'} size={20} className={hasAlerts ? 'text-danger-600' : 'text-success-600'} />
                                    <h3 className={`font-black text-sm ${hasAlerts ? 'text-danger-700' : 'text-success-700'}`}>
                                        Points d'attention {attention.total > 0 ? `(${attention.total})` : ''}
                                    </h3>
                                </div>

                                {/* ── Contadores do período (mantidos) ── */}
                                {attention.total === 0 && todayAlerts.length === 0 ? (
                                    <p className="text-sm text-slate-600 mb-0">Aucune anomalie détectée sur la période.</p>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
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

                                {/* ── Alertes récentes (aujourd'hui) ── */}
                                <div className="mt-1">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                                        Alertes récentes (aujourd'hui)
                                    </p>
                                    {todayAlerts.length === 0 ? (
                                        <div className="flex items-center gap-2 text-success-700 text-sm py-2">
                                            <LucideIcon name="check-circle-2" size={16} className="text-success-500" />
                                            Aucune alerte aujourd'hui
                                        </div>
                                    ) : (
                                        <>
                                            <div className="space-y-2">
                                                {visibleAlerts.map((al, i) => {
                                                    const cls = severiteCls[al.severite] || severiteCls.info;
                                                    return (
                                                        <div key={i} className={`flex items-center gap-3 bg-white rounded-xl px-3 py-2 border ${cls.border}`}>
                                                            <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${cls.badge}`}>
                                                                {al.severite}
                                                            </span>
                                                            <span className="font-bold text-sm text-slate-800 truncate">{al.nome}</span>
                                                            <span className="text-xs text-slate-400 shrink-0">{al.turma}</span>
                                                            <span className="text-xs text-slate-500 truncate flex-1">{al.type}</span>
                                                            <span className="text-xs text-slate-400 font-mono shrink-0">{al.heure}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {todayAlerts.length > 10 && (
                                                <p className="text-xs text-slate-400 mt-2 text-right">
                                                    {todayAlerts.length} alertes aujourd'hui au total
                                                </p>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

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
                                        <p className="text-2xl font-black text-success-600">{a.entradas}</p>
                                        <p className="text-xs text-slate-400">Entrées</p>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-black text-rose-500">{Math.max(0, a.total - (a.entradas || 0))}</p>
                                        <p className="text-xs text-slate-400">Sorties</p>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-black text-indigo-600">{a.occupation ?? 0}</p>
                                        <p className="text-xs text-slate-400">Occupation act.</p>
                                    </div>
                                    <div>
                                        <p className={`text-2xl font-black ${a.uniques > 0 ? 'text-accent-600' : 'text-slate-300'}`}>{a.uniques > 0 ? a.uniques : '—'}</p>
                                        <p className="text-xs text-slate-400">Élèves uniques</p>
                                    </div>
                                    <div>
                                        <p className={`font-black ${a.dureeMoy != null ? 'text-2xl text-navy-500' : 'text-lg text-slate-300'}`}>{a.dureeMoy != null ? a.dureeMoy + ' min' : 'Indispo.'}</p>
                                        <p className="text-xs text-slate-400">Durée moy.</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div className="bg-white rounded-2xl border-2 border-dashed border-navy-200 p-4 shadow-sm">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-navy-500 flex items-center justify-center">
                                    <LucideIcon name="door-open" size={20} className="text-white" />
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-navy-500">Portail</h3>
                                    <p className="text-[11px] text-slate-400">Flux de bordure — exclu des statistiques internes</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-center">
                                <div>
                                    <p className="text-2xl font-black text-emerald-600">{(data?.presentToday || 0).toLocaleString('fr-FR')}</p>
                                    <p className="text-xs text-slate-400">Entrés aujourd'hui</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-indigo-600">{(data?.currentlyInSectors || 0).toLocaleString('fr-FR')}</p>
                                    <p className="text-xs text-slate-400">Dans les secteurs</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Tentatives Refusées ── */}
                    <div className="mt-6">
                        <DeniedAttemptsFeed />
                    </div>
                </>
            )}
        </div>
    );
}

// ── GeneralReport ─────────────────────────────────────────────────────
function GeneralReport({ onBack }) {
    const [tab, setTab] = React.useState('overview'); // 'overview' | 'student' | 'journal'

    const tabBtn = (id, label, icon) => (
        <button onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${tab === id ? 'bg-accent-500 text-white shadow-sm' : 'bg-soft-100 text-navy-500 hover:bg-soft-200'
                }`}>
            <LucideIcon name={icon} size={16} /> {label}
        </button>
    );

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
            {/* ── Page Header ── */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="w-10 h-10 rounded-xl bg-white border border-soft-200 shadow-sm flex items-center justify-center hover:bg-soft-50 transition-colors"
                        >
                            <LucideIcon name="arrow-left" size={18} className="text-navy-500" />
                        </button>
                    )}
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-navy-500 flex items-center justify-center">
                            <LucideIcon name="layout-dashboard" size={24} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-navy-500 tracking-tight">Rapport Général</h1>
                            <p className="text-sm text-slate-400 mt-0.5">Vue consolidée de toutes les zones · Lycée Molière</p>
                        </div>
                    </div>
                </div>
                <span className="text-xs text-slate-400 font-medium bg-soft-100 px-3 py-1.5 rounded-lg border border-soft-200">
                    <LucideIcon name="shield-check" size={12} className="inline mr-1 text-accent-500" />
                    Accès Administrateur
                </span>
            </div>

            {/* ── Tab Bar ── */}
            <div className="flex flex-wrap gap-2 mb-6">
                {tabBtn('overview', "Vue d'ensemble", 'bar-chart-3')}
                {tabBtn('student', 'Par élève', 'user-search')}
                {tabBtn('journal', 'Journal', 'list')}
            </div>

            {/* ── Tab Content ── */}
            <div className="bg-white rounded-2xl border border-soft-200 p-6 shadow-sm min-h-[400px]">
                <div className={tab === 'overview' ? '' : 'hidden'}><OverviewTab /></div>
                <div className={tab === 'student' ? '' : 'hidden'}><ParEleveTab /></div>
                <div className={tab === 'journal' ? '' : 'hidden'}><JournalTab /></div>
            </div>
        </div>
    );
}
