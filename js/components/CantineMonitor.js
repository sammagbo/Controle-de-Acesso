// =====================================================================
// CANTINE MONITOR — real-time refectory alerts display
// =====================================================================

function CantineMonitor() {
    const [logs, setLogs] = React.useState([]);
    const [lastUpdate, setLastUpdate] = React.useState(null);

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
        return () => { active = false; clearInterval(interval); };
    }, []);

    const flagStyle = (flag) => {
        if (flag === 'FORA_HORARIO') return { bg: 'bg-danger-500', label: '⛔ HORS HORAIRE', ring: 'ring-danger-300' };
        if (flag === 'EXCEDEU_TEMPO') return { bg: 'bg-warning-500', label: '⏱ TEMPS DÉPASSÉ', ring: 'ring-warning-300' };
        return { bg: 'bg-success-500', label: '✅ OK', ring: 'ring-success-200' };
    };

    return (
        <div className="max-w-5xl mx-auto px-4 py-6 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-navy-500 flex items-center justify-center">
                        <LucideIcon name="utensils" size={26} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-navy-500">Monitor Cantine</h2>
                        <p className="text-sm text-slate-400">Surveillance en temps réel — actualisé toutes les 3s</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-success-600 bg-success-50 px-3 py-2 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
                    {lastUpdate ? `Mis à jour ${formatTime(lastUpdate)}` : 'Connexion...'}
                </div>
            </div>

            {logs.length === 0 && (
                <div className="p-16 text-center">
                    <div className="w-20 h-20 rounded-2xl bg-soft-100 flex items-center justify-center mx-auto mb-4">
                        <LucideIcon name="scan-face" size={40} className="text-slate-300" />
                    </div>
                    <p className="text-base font-semibold text-slate-400">En attente de passages</p>
                    <p className="text-sm text-slate-300 mt-1">Les élèves apparaîtront ici en passant devant la caméra</p>
                </div>
            )}

            <div className="space-y-3">
                {logs.map((log, idx) => {
                    const user = (window.userCache?.byId(log.userId)) || null;
                    const style = flagStyle(log.flag);
                    const time = new Date(safeDateParse(log.timestamp));
                    const isEntrada = log.action === 'ENTRADA';
                    return (
                        <div
                            key={log.id || idx}
                            className={`flex items-center gap-5 bg-white rounded-2xl p-4 shadow-sm border-2 ${log.flag ? style.ring : 'border-soft-200'} ring-2 ${log.flag ? style.ring : 'ring-transparent'} animate-slide-in-right`}
                            style={{ animationDelay: `${idx * 0.03}s` }}
                        >
                            <img src={(user && user.foto_url) || DEFAULT_AVATAR} alt="" className="w-16 h-16 rounded-2xl shadow-md flex-shrink-0" onError={handleImgError} />
                            <div className="flex-1 min-w-0">
                                <p className="text-lg font-black text-navy-500 truncate">{(user && user.nome) || log.userId}</p>
                                <div className="flex items-center gap-2 mt-1">
                                    {user && user.turma && (
                                        <span className="text-sm font-bold text-slate-500 bg-soft-100 px-2 py-0.5 rounded-md">{user.turma}</span>
                                    )}
                                    <span className="text-xs font-semibold text-slate-400">
                                        {isEntrada ? 'Entrée' : 'Sortie'} · {formatTime(time)}
                                    </span>
                                </div>
                            </div>
                            <div className={`px-5 py-3 rounded-2xl ${style.bg} shadow-lg flex-shrink-0`}>
                                <span className="text-white font-black text-sm tracking-wide whitespace-nowrap">{style.label}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
