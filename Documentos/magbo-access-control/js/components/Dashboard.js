// =====================================================================
// DASHBOARD VIEW
// =====================================================================

function Dashboard({ onSelectPoint, accessLogs }) {
      const activeCounts = React.useMemo(() => {
            const counts = {};
            ACCESS_POINTS.forEach(ap => { counts[ap.id] = 0; });
            const userLastStatus = {};
            accessLogs.forEach(log => {
                  const key = `${log.userId}-${log.pointId}`;
                  if (!userLastStatus[key] || log.timestamp > userLastStatus[key].timestamp) {
                        userLastStatus[key] = log;
                  }
            });
            Object.values(userLastStatus).forEach(log => {
                  if (log.status === 'ENTRADA') {
                        counts[log.pointId] = (counts[log.pointId] || 0) + 1;
                  }
            });
            return counts;
      }, [accessLogs]);

      const todayCount = accessLogs.length;

      return (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
                  {/* Stats bar */}
                  <div className="flex flex-wrap items-center gap-4 mb-8">
                        <div className="flex items-center gap-3 bg-white rounded-2xl px-5 py-3 shadow-sm border border-soft-200">
                              <div className="w-10 h-10 rounded-xl bg-accent-500/10 flex items-center justify-center">
                                    <LucideIcon name="activity" size={20} className="text-accent-500" />
                              </div>
                              <div>
                                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Movimentações Hoje</p>
                                    <p className="text-2xl font-bold text-navy-500">{todayCount}</p>
                              </div>
                        </div>
                        <div className="flex items-center gap-3 bg-white rounded-2xl px-5 py-3 shadow-sm border border-soft-200">
                              <div className="w-10 h-10 rounded-xl bg-success-500/10 flex items-center justify-center">
                                    <LucideIcon name="users" size={20} className="text-success-500" />
                              </div>
                              <div>
                                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Cadastrados</p>
                                    <p className="text-2xl font-bold text-navy-500">{USERS.length}</p>
                              </div>
                        </div>
                        <div className="flex items-center gap-3 bg-white rounded-2xl px-5 py-3 shadow-sm border border-soft-200">
                              <div className="w-10 h-10 rounded-xl bg-warning-500/10 flex items-center justify-center">
                                    <LucideIcon name="map-pin" size={20} className="text-warning-500" />
                              </div>
                              <div>
                                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Pontos de Acesso</p>
                                    <p className="text-2xl font-bold text-navy-500">{ACCESS_POINTS.length}</p>
                              </div>
                        </div>
                  </div>

                  {/* Section Title */}
                  <div className="mb-6">
                        <h2 className="text-xl font-bold text-navy-500">Selecione o Ponto de Trabalho</h2>
                        <p className="text-sm text-slate-400 mt-1">Escolha o setor para iniciar o controle de acesso</p>
                  </div>

                  {/* Access Point Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {ACCESS_POINTS.map((point) => {
                              const colors = CATEGORY_COLORS[point.category];
                              const count = activeCounts[point.id] || 0;
                              return (
                                    <button
                                          key={point.id}
                                          onClick={() => onSelectPoint(point)}
                                          className="stagger-child card-hover bg-white rounded-2xl p-6 text-left border border-soft-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 group"
                                    >
                                          <div className="flex items-start justify-between mb-4">
                                                <div className={`w-14 h-14 ${colors.bg} rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                                                      <LucideIcon name={point.icon} size={28} className="text-white" />
                                                </div>
                                                {count > 0 && (
                                                      <span className="flex items-center gap-1.5 text-xs font-bold text-success-600 bg-success-50 px-2.5 py-1 rounded-full">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-success-500 animate-pulse" />
                                                            {count} {count === 1 ? 'pessoa' : 'pessoas'}
                                                      </span>
                                                )}
                                          </div>
                                          <h3 className="text-lg font-bold text-navy-500 mb-1">{point.nome}</h3>
                                          <p className="text-sm text-slate-400">{point.description}</p>
                                          <div className="mt-4 flex items-center text-xs text-accent-500 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                                                <span>Abrir setor</span>
                                                <LucideIcon name="arrow-right" size={14} className="ml-1" />
                                          </div>
                                    </button>
                              );
                        })}
                  </div>
            </div>
      );
}
