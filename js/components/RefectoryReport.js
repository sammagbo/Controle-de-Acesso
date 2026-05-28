// =====================================================================
// REFECTORY REPORT — historical refectory access with filters + export
// =====================================================================

function RefectoryReport() {
    const EMPTY = { dateFrom: '', dateTo: '', action: '', flag: '', turma: '', aluno: '', hourFrom: '', hourTo: '' };
    const [filters, setFilters] = React.useState(EMPTY);
    const [logs, setLogs] = React.useState([]);
    const [loading, setLoading] = React.useState(false);

    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchRefectoryLogs({
                dateFrom: filters.dateFrom,
                dateTo: filters.dateTo,
                action: filters.action,
                limit: 500
            });
            setLogs(Array.isArray(data) ? data : []);
        } catch (e) { setLogs([]); }
        finally { setLoading(false); }
    }, [filters.dateFrom, filters.dateTo, filters.action]);

    React.useEffect(() => { load(); }, []);

    // Filtros client-side: turma, flag, aluno, hora
    const filtered = React.useMemo(() => {
        return logs.filter(log => {
            const user = window.userCache?.byId(log.userId);
            if (filters.flag) {
                if (filters.flag === 'NONE' && log.flag) return false;
                if (filters.flag !== 'NONE' && log.flag !== filters.flag) return false;
            }
            if (filters.turma && (!user || user.turma !== filters.turma)) return false;
            if (filters.aluno) {
                const q = filters.aluno.toLowerCase();
                const nome = (user?.nome || '').toLowerCase();
                if (!nome.includes(q) && !String(log.userId).includes(filters.aluno)) return false;
            }
            if (filters.hourFrom || filters.hourTo) {
                const d = new Date(safeDateParse(log.timestamp));
                const h = d.getHours() * 60 + d.getMinutes();
                if (filters.hourFrom) {
                    const [hh, mm] = filters.hourFrom.split(':').map(Number);
                    if (h < hh * 60 + (mm || 0)) return false;
                }
                if (filters.hourTo) {
                    const [hh, mm] = filters.hourTo.split(':').map(Number);
                    if (h > hh * 60 + (mm || 0)) return false;
                }
            }
            return true;
        });
    }, [logs, filters.flag, filters.turma, filters.aluno, filters.hourFrom, filters.hourTo]);

    const turmas = React.useMemo(() => {
        const all = (window.userCache?.all() || []).map(u => u.turma).filter(Boolean);
        return [...new Set(all)].sort();
    }, []);

    const flagLabel = (f) => {
        if (f === 'FORA_HORARIO') return '⛔ Hors horaire';
        if (f === 'EXCEDEU_TEMPO') return '⏱ Temps dépassé';
        return '✅ OK';
    };

    const exportCSV = () => {
        const header = 'Date,Heure,ID,Nom,Classe,Action,Alerte\n';
        const rows = filtered.map(log => {
            const u = window.userCache?.byId(log.userId);
            const d = new Date(safeDateParse(log.timestamp));
            const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
            return [
                esc(d.toLocaleDateString('fr-FR')),
                esc(formatTime(d)),
                esc(log.userId),
                esc(u?.nome || ''),
                esc(u?.turma || ''),
                esc(log.action),
                esc(log.flag ? flagLabel(log.flag) : 'OK')
            ].join(',');
        }).join('\n');
        const csv = '\uFEFF' + header + rows;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `rapport-cantine-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const inputCls = "px-3 py-2 rounded-xl border border-soft-200 text-sm text-navy-500 focus:outline-none focus:ring-2 focus:ring-accent-300 bg-white";

    return (
        <div className="max-w-6xl mx-auto px-4 py-6 animate-fade-in">

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-11 h-11 rounded-2xl bg-navy-500 flex items-center justify-center">
                    <LucideIcon name="file-text" size={24} className="text-white" />
                </div>
                <div>
                    <h2 className="text-xl font-black text-navy-500">Rapport Cantine</h2>
                    <p className="text-sm text-slate-400">Historique des accès au réfectoire avec filtres</p>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-2xl border border-soft-200 p-5 mb-5 shadow-sm">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Date début</label>
                        <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({...f, dateFrom: e.target.value}))} className={inputCls} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Date fin</label>
                        <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({...f, dateTo: e.target.value}))} className={inputCls} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Heure début</label>
                        <input type="time" value={filters.hourFrom} onChange={e => setFilters(f => ({...f, hourFrom: e.target.value}))} className={inputCls} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Heure fin</label>
                        <input type="time" value={filters.hourTo} onChange={e => setFilters(f => ({...f, hourTo: e.target.value}))} className={inputCls} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Élève (nom / ID)</label>
                        <input type="text" value={filters.aluno} onChange={e => setFilters(f => ({...f, aluno: e.target.value}))} placeholder="Rechercher..." className={inputCls} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Classe</label>
                        <select value={filters.turma} onChange={e => setFilters(f => ({...f, turma: e.target.value}))} className={inputCls}>
                            <option value="">Toutes</option>
                            {turmas.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Action</label>
                        <select value={filters.action} onChange={e => setFilters(f => ({...f, action: e.target.value}))} className={inputCls}>
                            <option value="">Toutes</option>
                            <option value="ENTRADA">Entrée</option>
                            <option value="SAIDA">Sortie</option>
                        </select>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Alerte</label>
                        <select value={filters.flag} onChange={e => setFilters(f => ({...f, flag: e.target.value}))} className={inputCls}>
                            <option value="">Toutes</option>
                            <option value="FORA_HORARIO">Hors horaire</option>
                            <option value="EXCEDEU_TEMPO">Temps dépassé</option>
                            <option value="NONE">Sans alerte</option>
                        </select>
                    </div>
                </div>

                <div className="flex flex-wrap gap-3 mt-4">
                    <button
                        onClick={load}
                        className="px-5 py-2 rounded-xl bg-accent-500 text-white font-bold text-sm hover:bg-accent-600 transition-colors flex items-center gap-2">
                        <LucideIcon name="search" size={15} /> Appliquer dates
                    </button>
                    <button
                        onClick={() => setFilters(EMPTY)}
                        className="px-5 py-2 rounded-xl bg-soft-100 text-navy-500 font-bold text-sm hover:bg-soft-200 transition-colors">
                        Réinitialiser
                    </button>
                    <button
                        onClick={exportCSV}
                        disabled={filtered.length === 0}
                        className="px-5 py-2 rounded-xl bg-success-500 text-white font-bold text-sm hover:bg-success-600 transition-colors ml-auto flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                        <LucideIcon name="download" size={15} /> Exporter CSV ({filtered.length})
                    </button>
                </div>
            </div>

            {/* Tabela de resultados */}
            <div className="bg-white rounded-2xl border border-soft-200 overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-soft-100 flex items-center justify-between">
                    <span className="text-sm font-bold text-navy-500">{filtered.length} résultat(s)</span>
                    {loading && (
                        <span className="flex items-center gap-2 text-xs text-slate-400">
                            <span className="w-3 h-3 border-2 border-accent-400 border-t-transparent rounded-full animate-spin" />
                            Chargement...
                        </span>
                    )}
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 400px)' }}>
                    {!loading && filtered.length === 0 && (
                        <div className="py-16 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-soft-100 flex items-center justify-center mx-auto mb-3">
                                <LucideIcon name="inbox" size={32} className="text-slate-300" />
                            </div>
                            <p className="text-sm font-semibold text-slate-400">Aucun résultat pour ces filtres</p>
                        </div>
                    )}
                    {filtered.map((log, idx) => {
                        const u = window.userCache?.byId(log.userId);
                        const d = new Date(safeDateParse(log.timestamp));
                        const isEntrada = log.action === 'ENTRADA';
                        return (
                            <div key={log.id || idx} className="flex items-center gap-4 px-5 py-3 border-b border-soft-50 hover:bg-soft-50/50 transition-colors">
                                <img
                                    src={(u && u.foto_url) || DEFAULT_AVATAR}
                                    alt=""
                                    className="w-10 h-10 rounded-xl object-cover flex-shrink-0 bg-soft-100"
                                    onError={handleImgError}
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-navy-500 truncate">{u?.nome || log.userId}</p>
                                    <span className="text-xs text-slate-400">{u?.turma || '—'} · {d.toLocaleDateString('fr-FR')} {formatTime(d)}</span>
                                </div>
                                <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${isEntrada ? 'text-success-600 bg-success-50' : 'text-danger-600 bg-danger-50'}`}>
                                    {isEntrada ? 'Entrée' : 'Sortie'}
                                </span>
                                {log.flag ? (
                                    <span className={`text-xs font-bold px-2 py-1 rounded-full flex-shrink-0 ${log.flag === 'FORA_HORARIO' ? 'text-danger-700 bg-danger-100' : 'text-warning-700 bg-warning-100'}`}>
                                        {flagLabel(log.flag)}
                                    </span>
                                ) : (
                                    <span className="text-xs font-semibold px-2 py-1 rounded-full text-success-600 bg-success-50 flex-shrink-0">✅ OK</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
