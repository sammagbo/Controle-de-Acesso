// =====================================================================
// CANTINE MONITOR — real-time refectory board (3 columns + search)
// =====================================================================
// State is computed live from the last event of each student:
//   - last = ENTRADA, < 1h        -> Column 1 (dans la cantine)
//   - last = ENTRADA, >= 1h       -> Column 3 (doit sortir)
//   - last = SAIDA,   < 40 min    -> Column 2 (sortis)
//   - last = SAIDA,   >= 40 min   -> hidden
// Backend unchanged: fetchRefectoryLogs() returns raw events (last ~30d/500).

const STAY_LIMIT_MS = 60 * 60 * 1000;      // 1h max stay
const EXIT_VISIBLE_MS = 40 * 60 * 1000;    // sortis visible 40 min

function CantineMonitor() {
    const [logs, setLogs] = React.useState([]);
    const [lastUpdate, setLastUpdate] = React.useState(null);
    const [now, setNow] = React.useState(Date.now());
    const [query, setQuery] = React.useState('');
    const [cutoff, setCutoff] = React.useState(0); // timestamp do "limpar" manual (0 = sem corte)

    React.useEffect(() => {
        let active = true;
        const poll = async () => {
            const data = await fetchRefectoryLogs();
            if (active && Array.isArray(data)) {
                setLogs(data);
                setLastUpdate(new Date());
            }
        };
        poll();
        const interval = setInterval(poll, 3000);
        // tick local clock every 10s so "doit sortir" updates even without new events
        const clock = setInterval(() => setNow(Date.now()), 10000);
        return () => { active = false; clearInterval(interval); clearInterval(clock); };
    }, []);

    // Build the latest event per student, then bucket into the 3 columns.
    const columns = React.useMemo(() => {
        // início do dia de hoje (meia-noite local) — reset diário automático
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const dayFloor = startOfDay.getTime();
        // limite efetivo: o mais recente entre meia-noite e o "limpar" manual
        const floor = Math.max(dayFloor, cutoff);

        const lastByUser = new Map();
        for (const log of logs) {
            const t = new Date(safeDateParse(log.timestamp)).getTime();
            if (t < floor) continue; // ignora eventos antes do corte (dia anterior ou pré-"limpar")
            const prev = lastByUser.get(log.userId);
            if (!prev || t > prev._t) {
                lastByUser.set(log.userId, { ...log, _t: t });
            }
        }

        const dans = [];      // column 1
        const sortis = [];    // column 2
        const doitSortir = [];// column 3

        for (const ev of lastByUser.values()) {
            const elapsed = now - ev._t;
            if (ev.action === 'ENTRADA') {
                if (elapsed >= STAY_LIMIT_MS) {
                    doitSortir.push(ev);
                } else {
                    dans.push(ev);
                }
            } else if (ev.action === 'SAIDA') {
                if (elapsed < EXIT_VISIBLE_MS) {
                    sortis.push(ev);
                }
                // else: hidden
            }
        }

        // sort: most recent first for dans/sortis; longest overstay first for doitSortir
        dans.sort((a, b) => b._t - a._t);
        sortis.sort((a, b) => b._t - a._t);
        doitSortir.sort((a, b) => a._t - b._t);

        return { dans, sortis, doitSortir };
    }, [logs, now, cutoff]);

    // Search across all 3 columns
    const matchesQuery = (ev) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        const user = window.userCache?.byId(ev.userId);
        const nome = (user?.nome || '').toLowerCase();
        const turma = (user?.turma || '').toLowerCase();
        return nome.includes(q) || turma.includes(q) || ev.userId.includes(query.trim());
    };

    const foundColumn = React.useMemo(() => {
        if (!query.trim()) return null;
        if (columns.doitSortir.some(matchesQuery)) return 'doit sortir';
        if (columns.dans.some(matchesQuery)) return 'dans la cantine';
        if (columns.sortis.some(matchesQuery)) return 'sortis';
        return 'introuvable';
    }, [query, columns]);

    const elapsedLabel = (ev) => {
        const mins = Math.floor((now - ev._t) / 60000);
        if (mins < 1) return "à l'instant";
        if (mins < 60) return `il y a ${mins} min`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `il y a ${h}h${m.toString().padStart(2, '0')}`;
    };

    const Card = ({ ev, variant }) => {
        const user = window.userCache?.byId(ev.userId);
        const dim = query.trim() && !matchesQuery(ev);
        const horsHoraire = ev.flag === 'FORA_HORARIO';
        return (
            <div className={`flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm border ${
                variant === 'doit' ? 'border-warning-300' : horsHoraire ? 'border-danger-300' : 'border-soft-200'
            } ${dim ? 'opacity-30' : 'opacity-100'} transition-opacity`}>
                <img src={(user && user.foto_url) || DEFAULT_AVATAR} alt="" className="w-12 h-12 rounded-xl shadow flex-shrink-0" onError={handleImgError} />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-navy-500 truncate">{(user && user.nome) || ev.userId}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {user && user.turma && (
                            <span className="text-xs font-bold text-slate-500 bg-soft-100 px-1.5 py-0.5 rounded">{user.turma}</span>
                        )}
                        <span className="text-xs text-slate-400">{elapsedLabel(ev)}</span>
                        {horsHoraire && variant !== 'doit' && (
                            <span className="text-xs font-bold text-danger-600 bg-danger-50 px-1.5 py-0.5 rounded">hors horaire</span>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const ColumnHeader = ({ icon, title, count, color }) => (
        <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center`}>
                    <LucideIcon name={icon} size={18} className="text-white" />
                </div>
                <h3 className="text-sm font-black text-navy-500 uppercase tracking-wide">{title}</h3>
            </div>
            <span className="text-sm font-black text-slate-400">{count}</span>
        </div>
    );

    return (
        <div className="max-w-7xl mx-auto px-4 py-6 animate-fade-in flex flex-col xl:flex-row gap-6 items-start">
            
            {/* Monitor Content (Main) */}
            <div className="flex-1 w-full space-y-5">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-navy-500 flex items-center justify-center">
                            <LucideIcon name="utensils" size={26} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-navy-500">Monitor Cantine</h2>
                            <p className="text-sm text-slate-400">Surveillance en temps réel — actualisé toutes les 3s</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => { if (confirm("Vider l'écran ? (les données restent enregistrées)")) setCutoff(Date.now()); }}
                            className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-soft-100 hover:bg-soft-200 px-3 py-2 rounded-full transition-colors"
                            title="Masque les passages actuels, sans rien supprimer"
                        >
                            <LucideIcon name="eraser" size={14} /> Vider l'écran
                        </button>
                        <div className="flex items-center gap-2 text-xs font-semibold text-success-600 bg-success-50 px-3 py-2 rounded-full">
                            <span className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
                            {lastUpdate ? `Mis à jour ${formatTime(lastUpdate)}` : 'Connexion...'}
                        </div>
                    </div>
                </div>

                {/* Search */}
                <div>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300">
                            <LucideIcon name="search" size={18} />
                        </span>
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Rechercher un élève (nom, classe ou ID)..."
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-soft-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent-300"
                        />
                    </div>
                    {query.trim() && (
                        <p className="text-xs font-semibold mt-2 px-1 text-slate-500">
                            {foundColumn === 'introuvable'
                                ? "Aucun élève trouvé"
                                : <>Trouvé dans : <span className="text-accent-600">{foundColumn}</span></>}
                        </p>
                    )}
                </div>

                {/* 3 columns */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Column 1 */}
                    <div className="bg-soft-50/50 rounded-2xl p-3">
                        <ColumnHeader icon="log-in" title="Dans la cantine" count={columns.dans.length} color="bg-accent-500" />
                        <div className="space-y-2">
                            {columns.dans.length === 0 && <p className="text-xs text-slate-300 text-center py-6">Personne</p>}
                            {columns.dans.map((ev, i) => <Card key={ev.userId + i} ev={ev} variant="dans" />)}
                        </div>
                    </div>

                    {/* Column 2 */}
                    <div className="bg-soft-50/50 rounded-2xl p-3">
                        <ColumnHeader icon="log-out" title="Sortis" count={columns.sortis.length} color="bg-success-500" />
                        <div className="space-y-2">
                            {columns.sortis.length === 0 && <p className="text-xs text-slate-300 text-center py-6">Personne</p>}
                            {columns.sortis.map((ev, i) => <Card key={ev.userId + i} ev={ev} variant="sortis" />)}
                        </div>
                    </div>

                    {/* Column 3 */}
                    <div className="bg-warning-50/40 rounded-2xl p-3 border border-warning-200">
                        <ColumnHeader icon="alert-triangle" title="Doit sortir" count={columns.doitSortir.length} color="bg-warning-500" />
                        <div className="space-y-2">
                            {columns.doitSortir.length === 0 && <p className="text-xs text-slate-300 text-center py-6">Personne</p>}
                            {columns.doitSortir.map((ev, i) => <Card key={ev.userId + i} ev={ev} variant="doit" />)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Sidebar: Denied Attempts Feed */}
            <div className="w-full xl:w-96 flex-shrink-0 h-[600px] xl:h-[calc(100vh-120px)] xl:sticky xl:top-6">
                <DeniedAttemptsFeed 
                    title="Tentatives Refusées" 
                    emptyMessage="Aucune tentative refusée" 
                    fetchFn={window.api?.getRefectoryAttempts || (async () => [])} 
                    pollingMs={3000} 
                />
            </div>

        </div>
    );
}
