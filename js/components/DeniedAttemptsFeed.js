// =====================================================================
// DENIED ATTEMPTS FEED — Componente reutilizável
// =====================================================================
// Feed genérico de tentativas negadas (Cantina / Portaria)

function DeniedAttemptsFeed({ fetchFn, pollingMs = 5000, title, emptyMessage }) {
      const [attempts, setAttempts] = React.useState([]);
      const [loading, setLoading] = React.useState(true);
      const [error, setError] = React.useState(false);

      React.useEffect(() => {
            let active = true;
            const load = async () => {
                  try {
                        const data = await fetchFn();
                        if (active) {
                              setAttempts(Array.isArray(data) ? data : []);
                              setError(false);
                        }
                  } catch (err) {
                        if (active) setError(true);
                  } finally {
                        if (active) setLoading(false);
                  }
            };

            load();
            const interval = setInterval(load, pollingMs);
            return () => {
                  active = false;
                  clearInterval(interval);
            };
      }, [fetchFn, pollingMs]);

      const formatTimeOnly = (isoString) => {
            const date = new Date(isoString);
            return isNaN(date) ? '--:--' : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      };

      const getReasonBadge = (reason) => {
            const label = window.DENIAL_REASON_LABELS?.[reason] || reason;
            let color = 'bg-slate-100 text-slate-700'; // DEFAULT
            
            switch (reason) {
                  case 'MEAL_NOT_ENTITLED':
                  case 'EXIT_NOT_AUTHORIZED':
                        color = 'bg-danger-100 text-danger-700';
                        break;
                  case 'DEVICE_DENIED':
                        color = 'bg-orange-100 text-orange-700';
                        break;
                  case 'OUTSIDE_MEAL_TIME':
                  case 'OUTSIDE_EXIT_WINDOW':
                        color = 'bg-warning-100 text-warning-700';
                        break;
                  case 'UNKNOWN_USER':
                        color = 'bg-slate-200 text-slate-600';
                        break;
                  case 'MISSING_DOOR_MAPPING':
                  case 'USER_INACTIVE':
                        color = 'bg-slate-100 text-slate-500';
                        break;
            }
            
            return (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${color}`}>
                        {label}
                  </span>
            );
      };

      const getMethodBadge = (method) => {
            const label = window.AUTH_METHOD_LABELS?.[method] || method;
            if (method === 'FACE') return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded"><LucideIcon name="scan-face" size={12}/> {label}</span>;
            if (method === 'CARD') return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-lycee-600 bg-lycee-50 px-2 py-0.5 rounded"><LucideIcon name="credit-card" size={12}/> {label}</span>;
            return <span className="text-[11px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded">{label}</span>;
      };

      return (
            <div className="bg-white rounded-2xl border border-danger-200 shadow-sm overflow-hidden flex flex-col h-full">
                  <div className="bg-danger-50 px-4 py-3 border-b border-danger-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                              <LucideIcon name="shield-alert" size={18} className="text-danger-600" />
                              <h3 className="text-sm font-black text-danger-700 uppercase tracking-wide">{title}</h3>
                        </div>
                        {attempts.length > 0 && (
                              <span className="bg-danger-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    {attempts.length}
                              </span>
                        )}
                  </div>
                  
                  <div className="p-3 flex-1 overflow-y-auto">
                        {loading && attempts.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                                    <LucideIcon name="loader-2" size={20} className="animate-spin mb-2" />
                                    <p className="text-xs">Carregando...</p>
                              </div>
                        ) : error && attempts.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-6 text-danger-400">
                                    <LucideIcon name="alert-circle" size={20} className="mb-2" />
                                    <p className="text-xs">Erro ao carregar</p>
                              </div>
                        ) : attempts.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-6 text-slate-300">
                                    <LucideIcon name="check-circle-2" size={24} className="mb-2 text-success-300" />
                                    <p className="text-xs font-medium">{emptyMessage || 'Nenhuma tentativa negada hoje'}</p>
                              </div>
                        ) : (
                              <div className="space-y-2">
                                    {attempts.map(attempt => {
                                          let userName = attempt.employeeNoRaw;
                                          let userTurma = null;
                                          let isUnknown = true;
                                          let photoUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${attempt.employeeNoRaw || 'U'}`;

                                          if (attempt.userId) {
                                                const user = window.userCache?.byId(attempt.userId);
                                                if (user) {
                                                      userName = user.nome;
                                                      userTurma = user.turma;
                                                      isUnknown = false;
                                                      photoUrl = user.foto_url;
                                                } else {
                                                      userName = attempt.userId;
                                                }
                                          }
                                          
                                          const pointInfo = window.ACCESS_POINTS?.find(p => p.id === attempt.pointId);
                                          const pointName = pointInfo ? pointInfo.nome : attempt.pointId;

                                          return (
                                                <div key={attempt.id} className="flex gap-3 p-2 rounded-xl border border-danger-100 bg-white hover:bg-danger-50/50 transition-colors">
                                                      <img src={photoUrl} className="w-10 h-10 rounded-lg flex-shrink-0 border border-slate-200" onError={e => { e.target.src = 'https://api.dicebear.com/7.x/initials/svg?seed=Err'; }} />
                                                      <div className="flex-1 min-w-0">
                                                            <div className="flex items-start justify-between gap-2">
                                                                  <p className={`text-sm font-bold truncate ${isUnknown ? 'text-slate-500 italic' : 'text-navy-600'}`}>
                                                                        {userName}
                                                                        {isUnknown && <span className="ml-1 text-[10px] font-normal text-slate-400">(Não cadastrado)</span>}
                                                                  </p>
                                                                  <span className="text-[10px] font-mono font-medium text-slate-400 flex-shrink-0">
                                                                        {formatTimeOnly(attempt.timestamp)}
                                                                  </span>
                                                            </div>
                                                            
                                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                                  {userTurma && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 rounded">{userTurma}</span>}
                                                                  <span className="text-[10px] text-slate-400 flex items-center gap-0.5" title={pointName}>
                                                                        <LucideIcon name="map-pin" size={10} />
                                                                        <span className="truncate max-w-[80px]">{pointName}</span>
                                                                  </span>
                                                                  {getMethodBadge(attempt.method)}
                                                            </div>
                                                            
                                                            <div className="mt-1.5">
                                                                  {getReasonBadge(attempt.reason)}
                                                            </div>
                                                      </div>
                                                </div>
                                          );
                                    })}
                              </div>
                        )}
                  </div>
            </div>
      );
}
