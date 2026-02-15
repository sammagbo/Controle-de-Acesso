// =====================================================================
// TIMER COMPONENT (for Biblioteca / Enfermaria)
// =====================================================================

function ActiveTimers({ activeTimers, pointId }) {
      const [, forceUpdate] = React.useState(0);

      React.useEffect(() => {
            const interval = setInterval(() => forceUpdate(n => n + 1), 1000);
            return () => clearInterval(interval);
      }, []);

      const timersForPoint = activeTimers.filter(t => t.pointId === pointId);
      if (timersForPoint.length === 0) return null;

      return (
            <div className="bg-warning-50 border border-warning-100 rounded-2xl p-4 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                        <LucideIcon name="timer" size={18} className="text-warning-600" />
                        <h4 className="text-sm font-bold text-warning-600 uppercase tracking-wider">
                              Tempo de Permanência
                        </h4>
                        <span className="ml-auto bg-warning-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                              {timersForPoint.length}
                        </span>
                  </div>
                  <div className="space-y-2">
                        {timersForPoint.map(timer => {
                              const user = USERS.find(u => u.id === timer.userId);
                              const elapsed = Date.now() - timer.startTime;
                              return (
                                    <div key={timer.userId} className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm">
                                          <img src={user?.foto_url} alt="" className="w-8 h-8 rounded-lg" />
                                          <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-navy-500 truncate">{user?.nome}</p>
                                                <p className="text-xs text-slate-400">{user?.turma}</p>
                                          </div>
                                          <span className="font-mono text-sm font-bold text-warning-600 animate-timer-pulse">
                                                {formatDuration(elapsed)}
                                          </span>
                                    </div>
                              );
                        })}
                  </div>
            </div>
      );
}
