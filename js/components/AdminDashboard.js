// =====================================================================
// ADMIN DASHBOARD — Painel Administrativo (PIN-gated)
// =====================================================================

function AdminDashboard({ onBack, onShowToast, activeTimers }) {
      const [, setCacheTick] = React.useState(0);
      React.useEffect(() => {
            const handler = () => setCacheTick(t => t + 1);
            window.addEventListener('user-cache-updated', handler);
            return () => window.removeEventListener('user-cache-updated', handler);
      }, []);

      // ── State ──
      const [globalLogs, setGlobalLogs] = React.useState([]);
      const [stats, setStats] = React.useState({ totalToday: 0, activeUsers: 0, totalUsers: 0 });
      const [loadingLogs, setLoadingLogs] = React.useState(true);
      const [loadingSync, setLoadingSync] = React.useState(false);
      const [lastSync, setLastSync] = React.useState('03:00');
      const [showUserMgmt, setShowUserMgmt] = React.useState(false);
      const [showUserList, setShowUserList] = React.useState(false);
      const [showGeneralReport, setShowGeneralReport] = React.useState(false);

      const EMPTY_FILTERS = { pointId: '', action: '', dateFrom: '', dateTo: '' };
      const [filters, setFilters] = React.useState(EMPTY_FILTERS);
      const [appliedFilters, setAppliedFilters] = React.useState(EMPTY_FILTERS);
      const isDirty = filters.pointId !== appliedFilters.pointId ||
            filters.action !== appliedFilters.action ||
            filters.dateFrom !== appliedFilters.dateFrom ||
            filters.dateTo !== appliedFilters.dateTo;

      const loadLogs = React.useCallback(async (f) => {
            setLoadingLogs(true);
            try {
                  const logs = await window.api.fetchAllLogs(f);
                  setGlobalLogs(Array.isArray(logs) ? logs : []);
            } catch (e) {
                  setGlobalLogs([]);
            } finally {
                  setLoadingLogs(false);
            }
      }, []);

      const applyFilters = () => {
            setAppliedFilters(filters);
            loadLogs(filters);
      };

      const clearFilters = () => {
            const empty = { pointId: '', action: '', dateFrom: '', dateTo: '' };
            setFilters(empty);
            setAppliedFilters(empty);
            loadLogs(empty);
      };

      // ── Fetch data on mount ──
      React.useEffect(() => {
            const loadData = async () => {
                  try {
                        const s = await window.api.fetchGlobalStats();
                        if (s && typeof s === 'object') {
                              setStats({
                                    totalToday: s.totalToday || 0,
                                    activeUsers: s.activeUsers || 0,
                                    totalUsers: s.totalUsers || (window.userCache?.all().length || 0)
                              });
                        }
                  } catch (e) {
                        setStats({
                              totalToday: 0,
                              activeUsers: (activeTimers || []).length,
                              totalUsers: (window.userCache?.all().length || 0)
                        });
                  }
                  loadLogs({});
            };
            loadData();
      }, [loadLogs]);

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
                  const user = (window.userCache?.byId(log.userId)) || null;
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

      // ── PDF Export ──
      const exportPDF = () => {
            if (!globalLogs.length) {
                  onShowToast({ title: 'Exportação', message: 'Nenhum registo para exportar.', type: 'error' });
                  return;
            }

            try {
                  const doc = new window.jspdf.jsPDF();
                  
                  // Header
                  doc.setFontSize(18);
                  doc.setTextColor(12, 27, 58); // navy-500
                  doc.text("Lycée Molière", 14, 22);
                  
                  doc.setFontSize(11);
                  doc.setTextColor(100);
                  doc.text("Relatório de Acessos", 14, 30);
                  
                  const today = new Date().toLocaleDateString('pt-BR');
                  doc.setFontSize(9);
                  doc.text(`Gerado em: ${today}`, 14, 36);

                  // Table Data
                  const tableColumn = ["Hora", "Nome", "Setor", "Ação"];
                  const tableRows = [];

                  globalLogs.forEach(log => {
                        const time = new Date(safeDateParse(log.timestamp));
                        const formattedTime = formatTime(time);
                        const user = (window.userCache?.byId(log.userId)) || null;
                        const userName = user ? (user.nome || 'Desconhecido') : (log.userId || 'Desconhecido');
                        const point = ACCESS_POINTS.find(p => p.id === log.pointId);
                        const pointName = point ? (point.nome || log.pointId) : (log.pointId || 'Desconhecido');
                        const action = log.status || log.action || 'N/A';
                        
                        tableRows.push([formattedTime, userName, pointName, action]);
                  });

                  // Generate Table
                  doc.autoTable({
                        head: [tableColumn],
                        body: tableRows,
                        startY: 45,
                        theme: 'striped',
                        headStyles: { fillColor: [12, 27, 58] }, // navy-500
                        styles: { fontSize: 9, cellPadding: 3 },
                  });

                  // Save
                  const fileNameDate = new Date().toISOString().slice(0, 10);
                  doc.save(`relatorio-acessos-${fileNameDate}.pdf`);
                  
                  onShowToast({ title: 'Exportação PDF', message: `${globalLogs.length} registos exportados.`, type: 'success' });
            } catch (error) {
                  console.error("PDF Export Error:", error);
                  onShowToast({ title: 'Erro de Exportação', message: 'Falha ao gerar PDF. Verifique a conexão.', type: 'error' });
            }
      };

      // ── Resolve display helpers ──
      const resolveUserName = (log) => {
            const user = (window.userCache?.byId(log.userId)) || null;
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
                  {/* SECTION 2 — GESTÃO DE OPERADORES (admin only)            */}
                  {/* ══════════════════════════════════════════════════════════ */}
                  {window.auth && window.auth.isAdmin() && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                              {/* Gestão de Operadores */}
                              <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm flex flex-col justify-between">
                                    <div className="flex items-start gap-4 mb-4">
                                          <div className="w-12 h-12 rounded-xl bg-accent-500/10 flex items-center justify-center flex-shrink-0">
                                                <LucideIcon name="shield-check" size={24} className="text-accent-600" />
                                          </div>
                                          <div>
                                                <h3 className="text-base font-bold text-navy-500">Gestão de Operadores</h3>
                                                <p className="text-sm text-slate-400">
                                                      Criar, editar e desativar operadores do sistema
                                                </p>
                                          </div>
                                    </div>
                                    <button
                                          onClick={() => setShowUserMgmt(true)}
                                          className="flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm bg-accent-500 text-white hover:bg-accent-600 hover:shadow-md active:scale-95"
                                    >
                                          <LucideIcon name="users" size={16} />
                                          Abrir gestão de operadores
                                    </button>
                              </div>

                              {/* Gestão de Usuários Gerais */}
                              <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm flex flex-col justify-between">
                                    <div className="flex items-start gap-4 mb-4">
                                          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                                                <LucideIcon name="users" size={24} className="text-indigo-600" />
                                          </div>
                                          <div>
                                                <h3 className="text-base font-bold text-navy-500">Gestão de Usuários</h3>
                                                <p className="text-sm text-slate-400">
                                                      Editar ou desativar alunos, professores, funcionários e responsáveis
                                                </p>
                                          </div>
                                    </div>
                                    <button
                                          onClick={() => setShowUserList(true)}
                                          className="flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-md active:scale-95"
                                    >
                                          <LucideIcon name="edit" size={16} />
                                          Abrir gestão de usuários
                                    </button>
                              </div>

                              {/* Rapport Général */}
                              <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm flex flex-col justify-between">
                                    <div className="flex items-start gap-4 mb-4">
                                          <div className="w-12 h-12 rounded-xl bg-navy-500/10 flex items-center justify-center flex-shrink-0">
                                                <LucideIcon name="layout-dashboard" size={24} className="text-navy-500" />
                                          </div>
                                          <div>
                                                <h3 className="text-base font-bold text-navy-500">Rapport Général</h3>
                                                <p className="text-sm text-slate-400">
                                                      Vue consolidée — KPIs, par élève, journal
                                                </p>
                                          </div>
                                    </div>
                                    <button
                                          onClick={() => setShowGeneralReport(true)}
                                          className="flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm bg-navy-500 text-white hover:bg-navy-600 hover:shadow-md active:scale-95"
                                    >
                                          <LucideIcon name="bar-chart-3" size={16} />
                                          Ouvrir le rapport
                                    </button>
                              </div>
                        </div>
                  )}

                  {/* ══════════════════════════════════════════════════════════ */}
                  {/* SECTION 3 — PRONOTE SYNC                                  */}
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
                              <div className="flex items-center gap-3">
                                    <button
                                          onClick={exportPDF}
                                          disabled={loadingLogs || !globalLogs.length}
                                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                                                loadingLogs || !globalLogs.length
                                                      ? 'bg-soft-100 text-slate-300 cursor-not-allowed'
                                                      : 'bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100 hover:shadow-sm active:scale-95'
                                          }`}
                                    >
                                          <LucideIcon name="file-text" size={15} />
                                          Exportar PDF
                                    </button>
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
                        </div>

                        {/* Filter Bar */}
                        <div className="px-6 py-3 border-b border-soft-200 bg-soft-50 flex flex-wrap items-end gap-3">
                              <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Setor</label>
                                    <select
                                          value={filters.pointId}
                                          onChange={e => setFilters(f => ({ ...f, pointId: e.target.value }))}
                                          className="h-9 px-3 rounded-xl border border-soft-200 bg-white text-sm text-navy-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    >
                                          <option value="">Todos</option>
                                          {ACCESS_POINTS.map(p => (
                                                <option key={p.id} value={p.id}>{p.nome}</option>
                                          ))}
                                    </select>
                              </div>
                              <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ação</label>
                                    <select
                                          value={filters.action}
                                          onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}
                                          className="h-9 px-3 rounded-xl border border-soft-200 bg-white text-sm text-navy-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    >
                                          <option value="">Todas</option>
                                          <option value="ENTRADA">ENTRADA</option>
                                          <option value="SAIDA">SAIDA</option>
                                    </select>
                              </div>
                              <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">De</label>
                                    <input
                                          type="date"
                                          value={filters.dateFrom}
                                          onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
                                          className="h-9 px-3 rounded-xl border border-soft-200 bg-white text-sm text-navy-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    />
                              </div>
                              <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Até</label>
                                    <input
                                          type="date"
                                          value={filters.dateTo}
                                          onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
                                          className="h-9 px-3 rounded-xl border border-soft-200 bg-white text-sm text-navy-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    />
                              </div>
                              <div className="flex items-end gap-2 ml-auto">
                                    <button
                                          onClick={clearFilters}
                                          className="h-9 px-4 rounded-xl border border-soft-200 bg-white text-sm font-semibold text-slate-500 hover:bg-soft-100 transition-colors"
                                    >
                                          Limpar
                                    </button>
                                    <button
                                          onClick={applyFilters}
                                          className={`h-9 px-4 rounded-xl text-sm font-semibold transition-colors ${
                                                isDirty
                                                      ? 'bg-accent-500 text-white hover:bg-accent-600'
                                                      : 'bg-navy-500 text-white hover:bg-navy-600'
                                          }`}
                                    >
                                          {isDirty ? '• Aplicar filtros' : 'Aplicar filtros'}
                                    </button>
                              </div>
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


                  {/* ══════════════════════════════════════════════════════════ */}
                  {/* MODAL — User Management (fullscreen overlay)             */}
                  {/* ══════════════════════════════════════════════════════════ */}
                  {showUserMgmt && (
                        <div className="fixed inset-0 z-[200] bg-navy-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                              <div className="bg-white rounded-[24px] w-full max-w-5xl shadow-2xl overflow-hidden animate-zoom-in max-h-[90vh] flex flex-col">

                                    {/* Modal Header */}
                                    <div className="bg-navy-500 p-6 flex items-center justify-between flex-shrink-0">
                                          <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                                                      <LucideIcon name="shield-check" size={20} className="text-white" />
                                                </div>
                                                <div>
                                                      <h2 className="text-xl font-bold text-white">Gestão de Operadores</h2>
                                                      <p className="text-xs text-white/50">Administrar contas de acesso ao sistema</p>
                                                </div>
                                          </div>
                                          <button
                                                onClick={() => setShowUserMgmt(false)}
                                                className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                                          >
                                                <LucideIcon name="x" size={20} />
                                          </button>
                                    </div>

                                    {/* Modal Body — scrollable */}
                                    <div className="flex-1 overflow-y-auto p-6">
                                          <UserManagement />
                                    </div>
                              </div>
                        </div>
                  )}

                  {/* ══════════════════════════════════════════════════════════ */}
                  {/* MODAL — User List (fullscreen overlay)                     */}
                  {/* ══════════════════════════════════════════════════════════ */}
                  {/* ══════════════════════════════════════════════════════════ */}
                  {/* MODAL — General Report (fullscreen overlay)               */}
                  {/* ══════════════════════════════════════════════════════════ */}
                  {showGeneralReport && (
                        <div className="fixed inset-0 z-[200] bg-navy-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                              <div className="bg-white rounded-[24px] w-full max-w-7xl shadow-2xl overflow-hidden animate-zoom-in h-[90vh] flex flex-col">
                                    <div className="bg-navy-500 p-6 flex items-center justify-between flex-shrink-0">
                                          <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                                                      <LucideIcon name="layout-dashboard" size={20} className="text-white" />
                                                </div>
                                                <div>
                                                      <h2 className="text-xl font-bold text-white">Rapport Général</h2>
                                                      <p className="text-xs text-white/50">Vue consolidée de toutes les zones</p>
                                                </div>
                                          </div>
                                          <button
                                                onClick={() => setShowGeneralReport(false)}
                                                className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                                          >
                                                <LucideIcon name="x" size={20} />
                                          </button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-6 min-h-0">
                                          <GeneralReport onClose={() => setShowGeneralReport(false)} />
                                    </div>
                              </div>
                        </div>
                  )}

                  {showUserList && (
                        <div className="fixed inset-0 z-[200] bg-navy-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                              <div className="bg-white rounded-[24px] w-full max-w-5xl shadow-2xl overflow-hidden animate-zoom-in h-[90vh] flex flex-col">
                                    <div className="bg-indigo-600 p-6 flex items-center justify-between flex-shrink-0">
                                          <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                                                      <LucideIcon name="users" size={20} className="text-white" />
                                                </div>
                                                <div>
                                                      <h2 className="text-xl font-bold text-white">Gestão de Usuários</h2>
                                                      <p className="text-xs text-indigo-100">Administrar cadastro de alunos e equipe</p>
                                                </div>
                                          </div>
                                          <button
                                                onClick={() => setShowUserList(false)}
                                                className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                                          >
                                                <LucideIcon name="x" size={20} />
                                          </button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-6 min-h-0">
                                          <UserListPanel onClose={() => setShowUserList(false)} onShowToast={onShowToast} />
                                    </div>
                              </div>
                        </div>
                  )}
            </div>
      );
}
