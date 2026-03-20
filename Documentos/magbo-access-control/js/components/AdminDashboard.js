// =====================================================================
// ADMIN DASHBOARD — Painel Administrativo (PIN-gated)
// =====================================================================

function AdminDashboard({ onBack, onShowToast, activeTimers }) {
      // ── State ──
      const [globalLogs, setGlobalLogs] = React.useState([]);
      const [stats, setStats] = React.useState({ totalToday: 0, activeUsers: 0, totalUsers: 0 });
      const [loadingLogs, setLoadingLogs] = React.useState(true);
      const [loadingSync, setLoadingSync] = React.useState(false);
      const [lastSync, setLastSync] = React.useState('03:00');

      // ── Fetch data on mount ──
      React.useEffect(() => {
            const loadData = async () => {
                  try {
                        // Fetch global stats
                        try {
                              const s = await window.api.fetchGlobalStats();
                              if (s && typeof s === 'object') {
                                    setStats({
                                          totalToday: s.totalToday || 0,
                                          activeUsers: s.activeUsers || 0,
                                          totalUsers: s.totalUsers || USERS.length
                                    });
                              }
                        } catch (e) {
                              // Fallback: compute locally
                              setStats({
                                    totalToday: 0,
                                    activeUsers: (activeTimers || []).length,
                                    totalUsers: USERS.length
                              });
                        }

                        // Fetch global logs
                        try {
                              const logs = await window.api.fetchAllLogs();
                              setGlobalLogs(Array.isArray(logs) ? logs : []);
                        } catch (e) {
                              setGlobalLogs([]);
                        }
                  } finally {
                        setLoadingLogs(false);
                  }
            };
            loadData();
      }, []);

      // ── Pronote Sync ──
      const handlePronoteSync = async () => {
            setLoadingSync(true);
            try {
                  const result = await window.api.forcePronoteSync();
                  const now = new Date();
                  setLastSync(formatTime(now));
                  onShowToast({
                        title: 'Sincronização Pronote',
                        message: (result && result.message) || 'Sincronização concluída com sucesso.',
                        type: 'success'
                  });
            } catch (error) {
                  onShowToast({
                        title: 'Erro na Sincronização',
                        message: (error && error.message) || 'Falha ao sincronizar com o Pronote.',
                        type: 'error'
                  });
            } finally {
                  setLoadingSync(false);
            }
      };

      // ── CSV Export ──
      const exportCSV = () => {
            if (!globalLogs.length) {
                  onShowToast({ title: 'Exportação', message: 'Nenhum registo para exportar.', type: 'error' });
                  return;
            }

            const header = 'Hora,Nome,Setor,Ação\n';
            const rows = globalLogs.map(log => {
                  const time = new Date(safeDateParse(log.timestamp));
                  const formattedTime = formatTime(time);
                  const user = USERS.find(u => u.id === log.userId);
                  const userName = user ? (user.nome || 'Desconhecido') : (log.userId || 'Desconhecido');
                  const point = ACCESS_POINTS.find(p => p.id === log.pointId);
                  const pointName = point ? (point.nome || log.pointId) : (log.pointId || 'Desconhecido');
                  const action = log.status || log.action || 'N/A';

                  // Escape CSV values
                  const escapeCsv = (val) => `"${String(val).replace(/"/g, '""')}"`;
                  return `${escapeCsv(formattedTime)},${escapeCsv(userName)},${escapeCsv(pointName)},${escapeCsv(action)}`;
            }).join('\n');

            const csvContent = '\uFEFF' + header + rows; // BOM for Excel UTF-8
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const today = new Date().toISOString().slice(0, 10);
            link.href = url;
            link.download = `relatorio-acessos-${today}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            onShowToast({ title: 'Exportação CSV', message: `${globalLogs.length} registos exportados.`, type: 'success' });
      };

      // ── Resolve display helpers ──
      const resolveUserName = (log) => {
            const user = USERS.find(u => u.id === log.userId);
            return user ? (user.nome || 'Sem nome') : (log.userId || '—');
      };

      const resolvePointName = (log) => {
            const point = ACCESS_POINTS.find(p => p.id === log.pointId);
            return point ? (point.nome || log.pointId) : (log.pointId || '—');
      };

      const resolvePointIcon = (log) => {
            const point = ACCESS_POINTS.find(p => p.id === log.pointId);
            return point ? (point.icon || 'map-pin') : 'map-pin';
      };

      // ── Sorted logs (newest first) ──
      const sortedLogs = React.useMemo(() => {
            return [...globalLogs]
                  .sort((a, b) => safeDateParse(b.timestamp) - safeDateParse(a.timestamp))
                  .slice(0, 50);
      }, [globalLogs]);

      // =====================================================================
      // RENDER
      // =====================================================================
      return (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">

                  {/* ── Page Title ── */}
                  <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                              <button
                                    onClick={onBack}
                                    className="w-10 h-10 rounded-xl bg-white border border-soft-200 shadow-sm flex items-center justify-center hover:bg-soft-50 transition-colors"
                              >
                                    <LucideIcon name="arrow-left" size={18} className="text-navy-500" />
                              </button>
                              <div>
                                    <h1 className="text-2xl font-bold text-navy-500 tracking-tight">Painel Administrativo</h1>
                                    <p className="text-sm text-slate-400 mt-0.5">Relatórios, KPIs e gestão Pronote · Lycée Molière</p>
                              </div>
                        </div>
                        <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400 font-medium bg-soft-100 px-3 py-1.5 rounded-lg border border-soft-200">
                                    <LucideIcon name="shield-check" size={12} className="inline mr-1 text-accent-500" />
                                    Acesso Administrativo
                              </span>
                        </div>
                  </div>

                  {/* ══════════════════════════════════════════════════════════ */}
                  {/* SECTION 1 — KPI CARDS                                     */}
                  {/* ══════════════════════════════════════════════════════════ */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">

                        {/* KPI: Total Acessos Hoje */}
                        <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm">
                              <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-accent-500/10 flex items-center justify-center flex-shrink-0">
                                          <LucideIcon name="activity" size={28} className="text-accent-500" />
                                    </div>
                                    <div>
                                          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Total de Acessos Hoje</p>
                                          <p className="text-3xl font-black text-navy-500 leading-tight">{stats.totalToday}</p>
                                    </div>
                              </div>
                        </div>

                        {/* KPI: Utilizadores Ativos */}
                        <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm">
                              <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-success-500/10 flex items-center justify-center flex-shrink-0">
                                          <LucideIcon name="users" size={28} className="text-success-500" />
                                    </div>
                                    <div>
                                          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Utilizadores Ativos</p>
                                          <p className="text-3xl font-black text-navy-500 leading-tight">{stats.activeUsers}</p>
                                          <p className="text-[10px] text-slate-400 mt-0.5">Em áreas especiais agora</p>
                                    </div>
                              </div>
                        </div>

                        {/* KPI: Total Cadastrados */}
                        <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm">
                              <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-navy-500/10 flex items-center justify-center flex-shrink-0">
                                          <LucideIcon name="database" size={28} className="text-navy-500" />
                                    </div>
                                    <div>
                                          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Total na Base de Dados</p>
                                          <p className="text-3xl font-black text-navy-500 leading-tight">{stats.totalUsers}</p>
                                          <p className="text-[10px] text-slate-400 mt-0.5">Utilizadores cadastrados</p>
                                    </div>
                              </div>
                        </div>
                  </div>

                  {/* ══════════════════════════════════════════════════════════ */}
                  {/* SECTION 2 — PRONOTE SYNC                                  */}
                  {/* ══════════════════════════════════════════════════════════ */}
                  <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm mb-8">
                        <div className="flex items-center justify-between flex-wrap gap-4">
                              <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                                          <LucideIcon name="refresh-cw" size={24} className={`text-indigo-600 ${loadingSync ? 'animate-spin' : ''}`} />
                                    </div>
                                    <div>
                                          <h3 className="text-base font-bold text-navy-500">Integração Pronote</h3>
                                          <p className="text-sm text-slate-400">
                                                Última sincronização automática: <span className="font-semibold text-slate-500">{lastSync}</span>
                                          </p>
                                    </div>
                              </div>
                              <button
                                    onClick={handlePronoteSync}
                                    disabled={loadingSync}
                                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm ${
                                          loadingSync
                                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-md active:scale-95'
                                    }`}
                              >
                                    <LucideIcon name={loadingSync ? 'loader-2' : 'upload-cloud'} size={16} className={loadingSync ? 'animate-spin' : ''} />
                                    {loadingSync ? 'A sincronizar...' : 'Sincronizar Agora'}
                              </button>
                        </div>
                  </div>

                  {/* ══════════════════════════════════════════════════════════ */}
                  {/* SECTION 3 — GLOBAL LOGS TABLE                             */}
                  {/* ══════════════════════════════════════════════════════════ */}
                  <div className="bg-white rounded-2xl border border-soft-200 shadow-sm overflow-hidden">

                        {/* Table Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-soft-200">
                              <div>
                                    <h3 className="text-base font-bold text-navy-500">Relatório de Acessos do Dia</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">Últimos 50 registos globais</p>
                              </div>
                              <button
                                    onClick={exportCSV}
                                    disabled={loadingLogs || !globalLogs.length}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                                          loadingLogs || !globalLogs.length
                                                ? 'bg-soft-100 text-slate-300 cursor-not-allowed'
                                                : 'bg-navy-500 text-white hover:bg-navy-600 hover:shadow-md active:scale-95'
                                    }`}
                              >
                                    <LucideIcon name="download" size={15} />
                                    Exportar CSV
                              </button>
                        </div>

                        {/* Table Body */}
                        {loadingLogs ? (
                              <div className="flex items-center justify-center py-16">
                                    <LucideIcon name="loader-2" size={24} className="text-slate-300 animate-spin" />
                                    <span className="ml-3 text-sm text-slate-400">A carregar registos...</span>
                              </div>
                        ) : sortedLogs.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <div className="w-16 h-16 rounded-2xl bg-soft-100 flex items-center justify-center mb-4">
                                          <LucideIcon name="inbox" size={32} className="text-slate-300" />
                                    </div>
                                    <p className="text-sm text-slate-400 font-medium">Nenhum registo encontrado para hoje</p>
                                    <p className="text-xs text-slate-300 mt-1">Os registos aparecerão aqui em tempo real</p>
                              </div>
                        ) : (
                              <div className="overflow-x-auto">
                                    <table className="w-full">
                                          <thead>
                                                <tr className="bg-soft-50 text-left">
                                                      <th className="px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Hora</th>
                                                      <th className="px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nome</th>
                                                      <th className="px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Setor</th>
                                                      <th className="px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ação</th>
                                                </tr>
                                          </thead>
                                          <tbody className="divide-y divide-soft-100">
                                                {sortedLogs.map((log, idx) => {
                                                      const time = new Date(safeDateParse(log.timestamp));
                                                      const isEntrada = (log.status || log.action) === 'ENTRADA';
                                                      return (
                                                            <tr
                                                                  key={log.id || idx}
                                                                  className="hover:bg-soft-50 transition-colors animate-fade-in"
                                                                  style={{ animationDelay: `${idx * 0.02}s` }}
                                                            >
                                                                  <td className="px-6 py-3">
                                                                        <span className="text-sm font-mono font-semibold text-navy-500">
                                                                              {formatTime(time)}
                                                                        </span>
                                                                  </td>
                                                                  <td className="px-6 py-3">
                                                                        <span className="text-sm font-semibold text-navy-500">
                                                                              {resolveUserName(log)}
                                                                        </span>
                                                                  </td>
                                                                  <td className="px-6 py-3">
                                                                        <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                                                                              <LucideIcon name={resolvePointIcon(log)} size={13} className="text-slate-400" />
                                                                              {resolvePointName(log)}
                                                                        </span>
                                                                  </td>
                                                                  <td className="px-6 py-3">
                                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                                                                              isEntrada
                                                                                    ? 'bg-success-50 text-success-600'
                                                                                    : 'bg-danger-50 text-danger-600'
                                                                        }`}>
                                                                              <LucideIcon name={isEntrada ? 'arrow-down-left' : 'arrow-up-right'} size={12} />
                                                                              {isEntrada ? 'ENTRADA' : 'SAÍDA'}
                                                                        </span>
                                                                  </td>
                                                            </tr>
                                                      );
                                                })}
                                          </tbody>
                                    </table>
                              </div>
                        )}
                  </div>
            </div>
      );
}
