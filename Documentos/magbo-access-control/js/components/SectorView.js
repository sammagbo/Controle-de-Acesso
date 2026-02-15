// =====================================================================
// SECTOR VIEW (Split View)
// =====================================================================

function SectorView({ point, accessLogs, onProcess, activeTimers }) {
      const [searchQuery, setSearchQuery] = React.useState('');
      const searchRef = React.useRef(null);
      const logListRef = React.useRef(null);

      React.useEffect(() => {
            if (searchRef.current) searchRef.current.focus();
      }, [point]);

      React.useEffect(() => {
            if (logListRef.current) logListRef.current.scrollTop = 0;
      }, [accessLogs]);

      const searchResults = React.useMemo(() => {
            if (!searchQuery.trim()) return [];
            const q = searchQuery.toLowerCase().trim();
            return USERS.filter(u =>
                  u.nome.toLowerCase().includes(q) ||
                  u.id.toLowerCase().includes(q) ||
                  (u.turma && u.turma.toLowerCase().includes(q))
            ).slice(0, 8);
      }, [searchQuery]);

      const pointLogs = React.useMemo(() => {
            return accessLogs
                  .filter(log => log.pointId === point.id)
                  .sort((a, b) => b.timestamp - a.timestamp);
      }, [accessLogs, point.id]);

      const handleSelectUser = (user) => {
            onProcess(user.id, point.id);
            setSearchQuery('');
            if (searchRef.current) searchRef.current.focus();
      };

      const colors = CATEGORY_COLORS[point.category];

      return (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fade-in">
                  {/* Active Timers (Biblioteca / Enfermaria) */}
                  {isEspecial(point.id) && (
                        <ActiveTimers activeTimers={activeTimers} pointId={point.id} />
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* LEFT PANEL — Action */}
                        <div className="lg:col-span-5">
                              <div className="bg-white rounded-2xl shadow-sm border border-soft-200 overflow-hidden">
                                    {/* Search Header */}
                                    <div className={`${colors.bg} p-5`}>
                                          <div className="flex items-center gap-3 mb-4">
                                                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                                                      <LucideIcon name={point.icon} size={22} className="text-white" />
                                                </div>
                                                <div>
                                                      <h3 className="text-lg font-bold text-white">{point.nome}</h3>
                                                      <p className="text-xs text-white/70">{point.description}</p>
                                                </div>
                                          </div>
                                          <div className="relative">
                                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                                      <LucideIcon name="scan-line" size={20} className="text-slate-400" />
                                                </div>
                                                <input
                                                      ref={searchRef}
                                                      type="text"
                                                      value={searchQuery}
                                                      onChange={(e) => setSearchQuery(e.target.value)}
                                                      placeholder="Ler Cartão ou buscar nome..."
                                                      className="w-full pl-12 pr-4 py-3.5 bg-white rounded-xl text-sm font-medium text-navy-500 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-white/50 shadow-lg animate-pulse-glow"
                                                />
                                                {searchQuery && (
                                                      <button
                                                            onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }}
                                                            className="absolute inset-y-0 right-0 pr-4 flex items-center"
                                                      >
                                                            <LucideIcon name="x-circle" size={18} className="text-slate-400 hover:text-slate-600" />
                                                      </button>
                                                )}
                                          </div>
                                    </div>

                                    {/* Search Results */}
                                    <div className="max-h-[calc(100vh-380px)] overflow-y-auto">
                                          {searchQuery.trim() && searchResults.length === 0 && (
                                                <div className="p-8 text-center">
                                                      <LucideIcon name="search-x" size={40} className="text-slate-300 mx-auto mb-3" />
                                                      <p className="text-sm text-slate-400">Nenhum resultado para "{searchQuery}"</p>
                                                </div>
                                          )}
                                          {searchResults.map((user, idx) => {
                                                const tipoInfo = TIPO_LABELS[user.tipo];
                                                return (
                                                      <button
                                                            key={user.id}
                                                            onClick={() => handleSelectUser(user)}
                                                            className="w-full flex items-center gap-4 p-4 hover:bg-soft-50 border-b border-soft-100 transition-colors text-left group animate-fade-in"
                                                            style={{ animationDelay: `${idx * 0.05}s` }}
                                                      >
                                                            <img src={user.foto_url} alt="" className="w-12 h-12 rounded-xl shadow-sm flex-shrink-0" />
                                                            <div className="flex-1 min-w-0">
                                                                  <p className="text-sm font-bold text-navy-500 truncate">{user.nome}</p>
                                                                  <div className="flex items-center gap-2 mt-1">
                                                                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${tipoInfo.color} ${tipoInfo.textColor}`}>
                                                                              {tipoInfo.label}
                                                                        </span>
                                                                        {user.turma && (
                                                                              <span className="text-xs text-slate-400">{user.turma}</span>
                                                                        )}
                                                                  </div>
                                                            </div>
                                                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                                  <LucideIcon name="log-in" size={16} className="text-accent-500" />
                                                            </div>
                                                      </button>
                                                );
                                          })}
                                          {!searchQuery.trim() && (
                                                <div className="p-10 text-center">
                                                      <div className="w-16 h-16 rounded-2xl bg-soft-100 flex items-center justify-center mx-auto mb-4">
                                                            <LucideIcon name="scan-line" size={32} className="text-slate-300" />
                                                      </div>
                                                      <p className="text-sm font-semibold text-slate-400 mb-1">Aguardando leitura</p>
                                                      <p className="text-xs text-slate-300">Escaneie o cartão ou digite o nome do usuário</p>
                                                </div>
                                          )}
                                    </div>
                              </div>
                        </div>

                        {/* RIGHT PANEL — Monitor */}
                        <div className="lg:col-span-7">
                              <div className="bg-white rounded-2xl shadow-sm border border-soft-200 overflow-hidden">
                                    <div className="px-5 py-4 border-b border-soft-100 flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                                <LucideIcon name="radio" size={18} className="text-accent-500" />
                                                <h3 className="text-sm font-bold text-navy-500 uppercase tracking-wider">Últimos Acessos</h3>
                                          </div>
                                          <span className="text-xs font-medium text-slate-400 bg-soft-100 px-3 py-1 rounded-full">
                                                {pointLogs.length} registros
                                          </span>
                                    </div>

                                    <div ref={logListRef} className="max-h-[calc(100vh-320px)] overflow-y-auto">
                                          {pointLogs.length === 0 && (
                                                <div className="p-12 text-center">
                                                      <div className="w-16 h-16 rounded-2xl bg-soft-100 flex items-center justify-center mx-auto mb-4">
                                                            <LucideIcon name="clipboard-list" size={32} className="text-slate-300" />
                                                      </div>
                                                      <p className="text-sm font-semibold text-slate-400 mb-1">Nenhum registro</p>
                                                      <p className="text-xs text-slate-300">Os acessos aparecerão aqui em tempo real</p>
                                                </div>
                                          )}
                                          {pointLogs.map((log, idx) => {
                                                const user = USERS.find(u => u.id === log.userId);
                                                if (!user) return null;
                                                const tipoInfo = TIPO_LABELS[user.tipo];
                                                const isEntrada = log.status === 'ENTRADA';
                                                const time = new Date(log.timestamp);
                                                return (
                                                      <div
                                                            key={log.id}
                                                            className="flex items-center gap-4 px-5 py-3.5 border-b border-soft-50 hover:bg-soft-50/50 transition-colors animate-slide-in-right"
                                                            style={{ animationDelay: `${idx * 0.03}s` }}
                                                      >
                                                            <div className="relative flex-shrink-0">
                                                                  <img src={user.foto_url} alt="" className="w-11 h-11 rounded-xl shadow-sm" />
                                                                  <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${isEntrada ? 'bg-success-500' : 'bg-danger-500'}`}>
                                                                        <LucideIcon name={isEntrada ? 'arrow-down-left' : 'arrow-up-right'} size={10} className="text-white" />
                                                                  </span>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                  <p className="text-sm font-bold text-navy-500 truncate">{user.nome}</p>
                                                                  <div className="flex items-center gap-2 mt-0.5">
                                                                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${tipoInfo.color} ${tipoInfo.textColor}`}>
                                                                              {tipoInfo.label}
                                                                        </span>
                                                                        {user.turma && (
                                                                              <span className="text-xs text-slate-400">{user.turma}</span>
                                                                        )}
                                                                  </div>
                                                            </div>
                                                            <div className="flex-shrink-0 text-right">
                                                                  <p className="text-sm font-bold font-mono text-navy-500">{formatTime(time)}</p>
                                                                  <span className={`inline-flex items-center gap-1 text-xs font-semibold mt-0.5 px-2 py-0.5 rounded-full ${isEntrada ? 'text-success-600 bg-success-50' : 'text-danger-600 bg-danger-50'}`}>
                                                                        {isEntrada ? '✅ Entrada' : '🔴 Saída'}
                                                                  </span>
                                                            </div>
                                                            {log.duration && (
                                                                  <div className="flex-shrink-0 ml-1">
                                                                        <span className="text-xs font-mono font-semibold text-warning-600 bg-warning-50 px-2 py-1 rounded-lg">
                                                                              ⏱ {formatDuration(log.duration)}
                                                                        </span>
                                                                  </div>
                                                            )}
                                                      </div>
                                                );
                                          })}
                                    </div>
                              </div>
                        </div>
                  </div>
            </div>
      );
}
