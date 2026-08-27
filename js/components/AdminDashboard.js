// =====================================================================
// ADMIN DASHBOARD — Painel Administrativo (PIN-gated)
// =====================================================================

function AdminDashboard({ onBack, onShowToast, activeTimers, onNavigateToReport, onNavigateToMeal, onNavigateToExit, onNavigateToRegime, onNavigateToMealSlots, onNavigateToCdiExclusions }) {

      // ⚠️ MASCARER, JAMAIS SUPPRIMER. Le réglage cache les cartes KPI de CET
      // écran, pour CE poste (localStorage) — les chiffres continuent d'être
      // calculés et l'endpoint ne change pas. Un opérateur qui n'utilise pas
      // les KPI récupère la place; celui qui s'en sert ne perd rien, et par
      // défaut RIEN NE CHANGE.
      //
      // ⚠️ localStorage lu dans un try/catch : en mode kiosque ou fenêtre
      // privée l'accès peut lancer, et un tableau de bord qui refuse de
      // s'afficher parce qu'une préférence est illisible serait pire que la
      // préférence perdue.
      const [kpisVisiveis, setKpisVisiveis] = React.useState(() => {
            try {
                  return localStorage.getItem('magbo.admin.kpis') !== 'off';
            } catch (e) {
                  return true;
            }
      });
      const alternarKpis = () => {
            setKpisVisiveis(v => {
                  const novo = !v;
                  try { localStorage.setItem('magbo.admin.kpis', novo ? 'on' : 'off'); } catch (e) {}
                  return novo;
            });
      };
      const t = useI18n();
      const locale = useLocale();
      const lang = window.MagboI18n.getLang();
      const [, setCacheTick] = React.useState(0);
      React.useEffect(() => {
            const handler = () => setCacheTick(t => t + 1);
            window.addEventListener('user-cache-updated', handler);
            return () => window.removeEventListener('user-cache-updated', handler);
      }, []);

      // ── State ──
      const [globalLogs, setGlobalLogs] = React.useState([]);
      const [stats, setStats] = React.useState({ 
            totalToday: 0, activeUsers: 0, totalUsers: 0, 
            blockedToday: 0, authorizedToday: 0,
            alertasHoje: 0, negadasHoje: 0, divergenciaHoje: 0, verificarHoje: 0
      });
      const [loadingLogs, setLoadingLogs] = React.useState(true);
      const [loadingSync, setLoadingSync] = React.useState(false);
      const [lastSync, setLastSync] = React.useState('03:00');
      const [showUserMgmt, setShowUserMgmt] = React.useState(false);
      const [showUserList, setShowUserList] = React.useState(false);


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

      // ── Fetch data on mount & Polling ──
      React.useEffect(() => {
            const loadData = async () => {
                  try {
                        const s = await window.api.fetchGlobalStats();
                        if (s && typeof s === 'object') {
                              setStats({
                                    totalToday: s.totalToday || 0,
                                    activeUsers: s.activeUsers || 0,
                                    totalUsers: s.totalUsers || (window.userCache?.all().length || 0),
                                    blockedToday: s.blockedToday || 0,
                                    // ?? e nao ||: `authorizedToday` legitimamente vale 0 quando toda
                                    // passagem do dia tem flag, e `0 || x` devolve x — o card
                                    // mostrava o TOTAL do dia como autorizado exatamente no
                                    // cenario em que o painel deveria alertar.
                                    authorizedToday: s.authorizedToday ?? (s.totalToday ?? 0),
                                    alertasHoje: s.alertasHoje || 0,
                                    negadasHoje: s.negadasHoje || 0,
                                    verificarHoje: s.verificarHoje || 0,
                                    divergenciaHoje: s.divergenciaHoje || 0
                              });
                        }
                  } catch (e) {
                        // ignore error in polling
                  }
                  
                  // Disable loading state if polling to prevent flickering
                  try {
                        const logs = await window.api.fetchAllLogs(appliedFilters);
                        setGlobalLogs(Array.isArray(logs) ? logs : []);
                  } catch (e) {
                        // ignore
                  } finally {
                        setLoadingLogs(false);
                  }
            };
            
            setLoadingLogs(true);
            loadData();
            
            // Polling interval 5 seconds
            const interval = setInterval(loadData, 5000);
            return () => clearInterval(interval);
      }, [appliedFilters]);

      // ── Pronote Sync ──
      const handlePronoteSync = async () => {
            setLoadingSync(true);
            try {
                  const result = await window.api.forcePronoteSync();
                  const now = new Date();
                  setLastSync(formatTime(now));
                  onShowToast({
                        title: t('admin.sync.titulo'),
                        message: (result && result.message) || t('admin.sync.ok'),
                        type: 'success'
                  });
            } catch (error) {
                  onShowToast({
                        title: t('admin.sync.erro'),
                        message: (error && error.message) || t('admin.sync.falha'),
                        type: 'error'
                  });
            } finally {
                  setLoadingSync(false);
            }
      };

      // ── CSV Export ──
      const exportCSV = () => {
            if (!globalLogs.length) {
                  onShowToast({ title: t('admin.export.titulo'), message: t('admin.export.vazio'), type: 'error' });
                  return;
            }

            const header = [t('admin.col.hora'), t('comum.nome'), t('admin.col.setor'), t('journal.filtro.acao')].join(',') + '\n';
            const rows = globalLogs.map(log => {
                  const time = new Date(safeDateParse(log.timestamp));
                  const formattedTime = formatTime(time);
                  const user = (window.userCache?.byId(log.userId)) || null;
                  const userName = window.MagboIdentity.resolver({ pessoa: user, userId: log.userId }, { lang }).nome;
                  const pointName = pointLabel(log.pointId, lang);
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

            onShowToast({ title: t('admin.export.csv.titulo'), message: t('admin.export.feito', { n: globalLogs.length }), type: 'success' });
      };

      // ── PDF Export ──
      const exportPDF = () => {
            if (!globalLogs.length) {
                  onShowToast({ title: t('admin.export.titulo'), message: t('admin.export.vazio'), type: 'error' });
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
                  doc.text(t('admin.pdf.titulo'), 14, 30);
                  
                  const today = new Date().toLocaleDateString(locale);
                  doc.setFontSize(9);
                  doc.text(`${t('cdi.stats.gerado')} ${today}`, 14, 36);

                  // Table Data
                  const tableColumn = [t('admin.col.hora'), t('comum.nome'), t('admin.col.setor'), t('journal.filtro.acao')];
                  const tableRows = [];

                  globalLogs.forEach(log => {
                        const time = new Date(safeDateParse(log.timestamp));
                        const formattedTime = formatTime(time);
                        const user = (window.userCache?.byId(log.userId)) || null;
                        const userName = window.MagboIdentity.resolver({ pessoa: user, userId: log.userId }, { lang }).nome;
                        const pointName = pointLabel(log.pointId, lang);
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
                  
                  onShowToast({ title: t('admin.export.pdf.titulo'), message: t('admin.export.feito', { n: globalLogs.length }), type: 'success' });
            } catch (error) {
                  console.error("PDF Export Error:", error);
                  onShowToast({ title: t('admin.export.erro'), message: t('admin.export.pdf.falha'), type: 'error' });
            }
      };

      // ── Resolve display helpers ──
      // Nome, nunca a matrícula sozinha: era `log.userId || '—'`, e a lista de
      // últimos acessos mostrava 0003535 quando o cache ainda não tinha chegado.
      const resolveUserName = (log) => {
            const user = (window.userCache?.byId(log.userId)) || null;
            return window.MagboIdentity.resolver(
                  { pessoa: user, userId: log.userId }, { lang }).nome;
      };

      // Nome do ponto, nunca o código seco — mesma regra do nome de pessoa.
      const resolvePointName = (log) => pointLabel(log.pointId, lang);

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
                                    <h1 className="text-2xl font-bold text-navy-500 tracking-tight">{t('header.painel')}</h1>
                                    <p className="text-sm text-slate-400 mt-0.5">{t('admin.subtitulo')}</p>
                              </div>
                        </div>
                        <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400 font-medium bg-soft-100 px-3 py-1.5 rounded-lg border border-soft-200">
                                    <LucideIcon name="shield-check" size={12} className="inline mr-1 text-accent-500" />
                                    {t('geral.acesso.admin')}
                              </span>
                        </div>
                  </div>

                  {/* ⚠️ LA RECHERCHE EST L'ÉLÉMENT PRINCIPAL DE L'ÉCRAN, et elle
                      passe AVANT les KPI. Quelqu'un qui ouvre ce tableau de bord
                      cherche presque toujours UNE personne ; les chiffres
                      répondent à une question qu'on ne se pose qu'ensuite.
                      Le composant se retire tout seul si le compte n'a pas
                      PARCOURS_READ. */}
                  {/* ⚠️ Pas d'enveloppe avec de la marge ici : le composant se
                      retire tout seul sans PARCOURS_READ, et une enveloppe
                      laisserait un trou de 2 rem que personne ne saurait
                      interpreter. La marge vit DANS le composant. */}
                  <RechercheGlobale />

                  {/* ══════════════════════════════════════════════════════════ */}
                  {/* SECTION 1 — KPI CARDS (masquables)                        */}
                  {/* ══════════════════════════════════════════════════════════ */}
                  {/* ⚠️ MASQUER, JAMAIS SUPPRIMER — et par défaut RIEN NE CHANGE.
                      Le bouton ne touche ni au calcul ni aux endpoints : il rend
                      la place à qui ne lit pas les chiffres, sans rien retirer à
                      qui les lit. */}
                  <div className="flex justify-end mb-2">
                        <button type="button" onClick={alternarKpis}
                              className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-navy-500">
                              <LucideIcon name={kpisVisiveis ? 'eye-off' : 'eye'} size={14} />
                              {kpisVisiveis ? t('admin.kpi.esconder') : t('admin.kpi.mostrar')}
                        </button>
                  </div>

                  <div className={`grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8 ${kpisVisiveis ? '' : 'hidden'}`}>

                        {/* KPI: Total Acessos Hoje */}
                        <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm">
                              <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-accent-500/10 flex items-center justify-center flex-shrink-0">
                                          <LucideIcon name="activity" size={28} className="text-accent-500" />
                                    </div>
                                    <div>
                                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('admin.kpi.hoje')}</p>
                                          <p className="text-3xl font-black text-navy-500 leading-tight">{stats.totalToday}</p>
                                    </div>
                              </div>
                        </div>
                        
                        {/* KPI: Acessos Autorizados */}
                        <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm">
                              <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-success-500/10 flex items-center justify-center flex-shrink-0">
                                          <LucideIcon name="check-circle-2" size={28} className="text-success-500" />
                                    </div>
                                    <div>
                                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('admin.kpi.autorizados')}</p>
                                          <p className="text-3xl font-black text-navy-500 leading-tight">{stats.authorizedToday}</p>
                                    </div>
                              </div>
                        </div>

                        {/* KPI: Acessos Barrados */}
                        <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm">
                              <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-danger-500/10 flex items-center justify-center flex-shrink-0">
                                          <LucideIcon name="x-circle" size={28} className="text-danger-500" />
                                    </div>
                                    <div>
                                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('admin.kpi.barrados')}</p>
                                          <p className="text-3xl font-black text-navy-500 leading-tight">{stats.blockedToday}</p>
                                    </div>
                              </div>
                        </div>

                        {/* KPI: Utilizadores Ativos */}
                        <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm">
                              <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                                          <LucideIcon name="users" size={28} className="text-indigo-500" />
                                    </div>
                                    <div>
                                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('admin.kpi.especiais')}</p>
                                          <p className="text-3xl font-black text-navy-500 leading-tight">{stats.activeUsers}</p>
                                    </div>
                              </div>
                        </div>
                  </div>

                  <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 ${kpisVisiveis ? '' : 'hidden'}`}>
                        {/* KPI: Alertas Hoje */}
                        <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm">
                              <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                                          <LucideIcon name="bell-ring" size={28} className="text-orange-500" />
                                    </div>
                                    <div>
                                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('admin.kpi.alertas')}</p>
                                          <p className="text-3xl font-black text-navy-500 leading-tight">{stats.alertasHoje}</p>
                                    </div>
                              </div>
                        </div>

                        {/* KPI: Tentativas Negadas */}
                        <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm">
                              <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-danger-500/10 flex items-center justify-center flex-shrink-0">
                                          <LucideIcon name="shield-off" size={28} className="text-danger-500" />
                                    </div>
                                    <div>
                                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('admin.kpi.negadas')}</p>
                                          <p className="text-3xl font-black text-navy-500 leading-tight">{stats.negadasHoje}</p>
                                          {/* ⚠️ O "não sei" fica FORA do número
                                              acima e VISÍVEL aqui. Somá-lo
                                              contaria contra o aluno uma
                                              limitação do sistema; escondê-lo
                                              apagaria o rastro que o AED pediu. */}
                                          {stats.verificarHoje > 0 && (
                                                <p className="text-[10px] text-accent-700 font-bold mt-0.5">
                                                      {t('admin.kpi.averificar', { n: stats.verificarHoje })}
                                                </p>
                                          )}
                                          {/* ⚠️ CE QUE LE NOMBRE COMPTE, ÉCRIT À CÔTÉ DU NOMBRE.
                                              Mesuré sur la VM le 21/08 : 469 « tentatives refusées »
                                              la veille, dont 469 SANS AUCUNE IDENTITÉ — la caméra du
                                              portail donne sur la rue et voit les parents, les
                                              livreurs, les frères et sœurs non inscrits. Sur sept
                                              jours : 0 élève réel. Depuis toujours : 12 sur 7 408.
                                              Sans cette ligne, un directeur financier lit « le
                                              système refuse la moitié de ce qu'il voit ».
                                              ⚠️ Formulé en « comprend » et non en « ce ne sont pas
                                              des élèves » : la première formulation reste vraie le
                                              jour où un vrai refus d'élève apparaîtra, la seconde
                                              deviendrait un mensonge ce jour-là. */}
                                          <p className="text-[10px] text-slate-400 mt-1 leading-snug max-w-[15rem]">
                                                {t('admin.kpi.negadas.explica')}
                                          </p>
                                    </div>
                              </div>
                        </div>

                        {/* KPI: Divergências */}
                        <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm group relative">
                              <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-warning-500/10 flex items-center justify-center flex-shrink-0">
                                          <LucideIcon name="split" size={28} className="text-warning-500" />
                                    </div>
                                    <div>
                                          <div className="flex items-center gap-1 cursor-help">
                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('admin.kpi.divergencias')}</p>
                                                <LucideIcon name="info" size={12} className="text-slate-300" />
                                          </div>
                                          <p className="text-3xl font-black text-navy-500 leading-tight">{stats.divergenciaHoje}</p>
                                    </div>
                              </div>
                              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 bg-navy-800 text-white text-xs p-3 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                                    <p className="font-bold mb-1">{t('admin.diverg.pergunta')}</p>
                                    <p className="text-navy-100">{t('admin.diverg.explica')}</p>
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
                                                <h3 className="text-base font-bold text-navy-500">{t('admin.card.operadores.titulo')}</h3>
                                                <p className="text-sm text-slate-400">
                                                      {t('admin.card.operadores.sub')}
                                                </p>
                                          </div>
                                    </div>
                                    <button
                                          onClick={() => setShowUserMgmt(true)}
                                          className="flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm bg-accent-500 text-white hover:bg-accent-600 hover:shadow-md active:scale-95"
                                    >
                                          <LucideIcon name="users" size={16} />
                                          {t('admin.card.operadores.btn')}
                                    </button>
                              </div>

                              {/* Gestão de Usuários Gerais */}
                              <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm flex flex-col justify-between">
                                    <div className="flex items-start gap-4 mb-4">
                                          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                                                <LucideIcon name="users" size={24} className="text-indigo-600" />
                                          </div>
                                          <div>
                                                <h3 className="text-base font-bold text-navy-500">{t('admin.card.usuarios.titulo')}</h3>
                                                <p className="text-sm text-slate-400">
                                                      {t('admin.card.usuarios.sub')}
                                                </p>
                                          </div>
                                    </div>
                                    <button
                                          onClick={() => setShowUserList(true)}
                                          className="flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-md active:scale-95"
                                    >
                                          <LucideIcon name="edit" size={16} />
                                          {t('admin.card.usuarios.btn')}
                                    </button>
                              </div>

                              {/* Rapport Général */}
                              <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm flex flex-col justify-between">
                                    <div className="flex items-start gap-4 mb-4">
                                          <div className="w-12 h-12 rounded-xl bg-navy-500/10 flex items-center justify-center flex-shrink-0">
                                                <LucideIcon name="layout-dashboard" size={24} className="text-navy-500" />
                                          </div>
                                          <div>
                                                <h3 className="text-base font-bold text-navy-500">{t('geral.titulo')}</h3>
                                                <p className="text-sm text-slate-400">
                                                      {t('admin.card.rapport.sub')}
                                                </p>
                                          </div>
                                    </div>
                                    <button
                                          onClick={onNavigateToReport}
                                          className="flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm bg-navy-500 text-white hover:bg-navy-600 hover:shadow-md active:scale-95"
                                    >
                                          <LucideIcon name="bar-chart-3" size={16} />
                                          {t('admin.card.rapport.btn')}
                                    </button>
                              </div>

                              {/* Gestion des Droits Repas */}
                              <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm flex flex-col justify-between">
                                    <div className="flex items-start gap-4 mb-4">
                                          <div className="w-12 h-12 rounded-xl bg-success-500/10 flex items-center justify-center flex-shrink-0">
                                                <LucideIcon name="utensils" size={24} className="text-success-600" />
                                          </div>
                                          <div>
                                                <h3 className="text-base font-bold text-navy-500">{t('admin.card.repas.titulo')}</h3>
                                                <p className="text-sm text-slate-400">
                                                      {t('admin.card.repas.sub')}
                                                </p>
                                          </div>
                                    </div>
                                    <button
                                          onClick={onNavigateToMeal}
                                          className="flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm bg-success-600 text-white hover:bg-success-700 hover:shadow-md active:scale-95"
                                    >
                                          <LucideIcon name="utensils" size={16} />
                                          {t('admin.card.repas.btn')}
                                    </button>
                              </div>

                              {/* Planning Cantine — os créneaux (V021).
                                  ⚠️ Ao lado de «Droits Repas» de propósito: são
                                  as duas metades da mesma pergunta — QUEM tem
                                  direito a comer, e A QUE HORAS. Separá-las
                                  obrigaria a Vie Scolaire a procurar em dois
                                  sítios distantes o que ela trata junto. */}
                              <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm flex flex-col justify-between">
                                    <div className="flex items-start gap-4 mb-4">
                                          <div className="w-12 h-12 rounded-xl bg-accent-500/10 flex items-center justify-center flex-shrink-0">
                                                <LucideIcon name="calendar-clock" size={24} className="text-accent-600" />
                                          </div>
                                          <div>
                                                <h3 className="text-base font-bold text-navy-500">{t('admin.card.creneaux.titulo')}</h3>
                                                <p className="text-sm text-slate-400">
                                                      {t('admin.card.creneaux.sub')}
                                                </p>
                                          </div>
                                    </div>
                                    <button
                                          onClick={onNavigateToMealSlots}
                                          className="flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm bg-accent-600 text-white hover:bg-accent-700 hover:shadow-md active:scale-95"
                                    >
                                          <LucideIcon name="calendar-clock" size={16} />
                                          {t('admin.card.creneaux.btn')}
                                    </button>
                              </div>

                              {/* ⚠️ EXCLUSIONS DU CDI — la carte manquait, et sans elle
                                  l'ecran etait INATTEIGNABLE pour un admin : le
                                  raccourci du tableau de bord se cache
                                  volontairement de l'admin (il entre par ce
                                  panneau) et ce panneau n'avait pas d'entree.
                                  Deux regles justes, un trou entre les deux. */}
                              <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm flex flex-col justify-between">
                                    <div className="flex items-start gap-4 mb-4">
                                          <div className="w-12 h-12 rounded-xl bg-danger-500/10 flex items-center justify-center flex-shrink-0">
                                                <LucideIcon name="user-x" size={24} className="text-danger-600" />
                                          </div>
                                          <div>
                                                <h3 className="text-base font-bold text-navy-500">{t('cdi.excl.titulo')}</h3>
                                                <p className="text-sm text-slate-400">{t('admin.card.cdiexcl.sub')}</p>
                                          </div>
                                    </div>
                                    <button
                                          onClick={onNavigateToCdiExclusions}
                                          className="flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm bg-danger-600 text-white hover:bg-danger-700 hover:shadow-md active:scale-95"
                                    >
                                          <LucideIcon name="user-x" size={16} />
                                          {t('admin.card.cdiexcl.btn')}
                                    </button>
                              </div>

                              {/* Régime de sortie — o direito ANUAL */}
                              <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm flex flex-col justify-between">
                                    <div className="flex items-start gap-4 mb-4">
                                          <div className="w-12 h-12 rounded-xl bg-warning-500/10 flex items-center justify-center flex-shrink-0">
                                                <LucideIcon name="scroll-text" size={24} className="text-warning-600" />
                                          </div>
                                          <div>
                                                <h3 className="text-base font-bold text-navy-500">{t('regime.titulo')}</h3>
                                                <p className="text-sm text-slate-400">
                                                      {t('admin.card.regime.sub')}
                                                </p>
                                          </div>
                                    </div>
                                    <button
                                          onClick={onNavigateToRegime}
                                          className="flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm bg-warning-600 text-white hover:bg-warning-700 hover:shadow-md active:scale-95"
                                    >
                                          <LucideIcon name="scroll-text" size={16} />
                                          {t('admin.card.regime.btn')}
                                    </button>
                              </div>

                              {/* Autorisations de Sortie */}
                              <div className="bg-white rounded-2xl p-6 border border-soft-200 shadow-sm flex flex-col justify-between">
                                    <div className="flex items-start gap-4 mb-4">
                                          <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                                                <LucideIcon name="door-open" size={24} className="text-orange-600" />
                                          </div>
                                          <div>
                                                <h3 className="text-base font-bold text-navy-500">{t('admin.card.saidas.titulo')}</h3>
                                                <p className="text-sm text-slate-400">
                                                      {t('admin.card.saidas.sub')}
                                                </p>
                                          </div>
                                    </div>
                                    <button
                                          onClick={onNavigateToExit}
                                          className="flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm bg-orange-500 text-white hover:bg-orange-600 hover:shadow-md active:scale-95"
                                    >
                                          <LucideIcon name="door-open" size={16} />
                                          {t('admin.card.saidas.btn')}
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
                                          <h3 className="text-base font-bold text-navy-500">{t('admin.pronote.titulo')}</h3>
                                          <p className="text-sm text-slate-400">
                                                {t('admin.pronote.ultima')} <span className="font-semibold text-slate-500">{lastSync}</span>
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
                                    {loadingSync ? t('admin.pronote.sincronizando') : t('admin.pronote.sincronizar')}
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
                                    <h3 className="text-base font-bold text-navy-500">{t('admin.tabela.titulo')}</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">{t('admin.tabela.sub')}</p>
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
                                          {t('admin.export.pdf')}
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
                                          {t('acao.exportar.csv')}
                                    </button>
                              </div>
                        </div>

                        {/* Filter Bar */}
                        <div className="px-6 py-3 border-b border-soft-200 bg-soft-50 flex flex-wrap items-end gap-3">
                              <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('admin.col.setor')}</label>
                                    <select
                                          value={filters.pointId}
                                          onChange={e => setFilters(f => ({ ...f, pointId: e.target.value }))}
                                          className="h-9 px-3 rounded-xl border border-soft-200 bg-white text-sm text-navy-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    >
                                          <option value="">{t('rap.filtro.todos')}</option>
                                          {ACCESS_POINTS.map(p => (
                                                <option key={p.id} value={p.id}>{p.nome}</option>
                                          ))}
                                    </select>
                              </div>
                              <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('journal.filtro.acao')}</label>
                                    <select
                                          value={filters.action}
                                          onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}
                                          className="h-9 px-3 rounded-xl border border-soft-200 bg-white text-sm text-navy-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    >
                                          <option value="">{t('rap.filtro.todas')}</option>
                                          <option value="ENTRADA">{t('rap.col.entrada')}</option>
                                          <option value="SAIDA">{t('rap.col.saida')}</option>
                                    </select>
                              </div>
                              <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('journal.filtro.de')}</label>
                                    <input
                                          type="date"
                                          value={filters.dateFrom}
                                          onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
                                          className="h-9 px-3 rounded-xl border border-soft-200 bg-white text-sm text-navy-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    />
                              </div>
                              <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('journal.filtro.ate')}</label>
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
                                          {t('admin.filtros.limpar')}
                                    </button>
                                    <button
                                          onClick={applyFilters}
                                          className={`h-9 px-4 rounded-xl text-sm font-semibold transition-colors ${
                                                isDirty
                                                      ? 'bg-accent-500 text-white hover:bg-accent-600'
                                                      : 'bg-navy-500 text-white hover:bg-navy-600'
                                          }`}
                                    >
                                          {isDirty ? '• ' + t('admin.filtros.aplicar') : t('admin.filtros.aplicar')}
                                    </button>
                              </div>
                        </div>

                        {/* Table Body */}
                        {loadingLogs ? (
                              <div className="flex items-center justify-center py-16">
                                    <LucideIcon name="loader-2" size={24} className="text-slate-300 animate-spin" />
                                    <span className="ml-3 text-sm text-slate-400">{t('admin.tabela.carregando')}</span>
                              </div>
                        ) : sortedLogs.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <div className="w-16 h-16 rounded-2xl bg-soft-100 flex items-center justify-center mb-4">
                                          <LucideIcon name="inbox" size={32} className="text-slate-300" />
                                    </div>
                                    <p className="text-sm text-slate-400 font-medium">{t('admin.tabela.vazio')}</p>
                                    <p className="text-xs text-slate-300 mt-1">{t('admin.tabela.vazio.sub')}</p>
                              </div>
                        ) : (
                              <div className="overflow-x-auto">
                                    <table className="w-full">
                                          <thead>
                                                <tr className="bg-soft-50 text-left">
                                                      <th className="px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('admin.col.hora')}</th>
                                                      <th className="px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('comum.nome')}</th>
                                                      <th className="px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('admin.col.setor')}</th>
                                                      <th className="px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('journal.filtro.acao')}</th>
                                                </tr>
                                          </thead>
                                          <tbody className="divide-y divide-soft-100">
                                                {sortedLogs.map((log, idx) => {
                                                      const time = new Date(safeDateParse(log.timestamp));
                                                      const isEntrada = (log.status || log.action) === 'ENTRADA';
                                                      const isBlocked = !!log.flag;
                                                      const blockedReason = log.flag;
                                                      
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
                                                                        {isBlocked ? (
                                                                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-danger-50 text-danger-600">
                                                                                    <LucideIcon name="shield-alert" size={12} />
                                                                                    {t('admin.barrado', { flag: blockedReason })}
                                                                              </span>
                                                                        ) : (
                                                                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                                                                                    isEntrada
                                                                                          ? 'bg-success-50 text-success-600'
                                                                                          : 'bg-indigo-50 text-indigo-600'
                                                                              }`}>
                                                                                    <LucideIcon name={isEntrada ? 'arrow-down-left' : 'arrow-up-right'} size={12} />
                                                                                    {isEntrada ? t('admin.chip.entrada') : t('admin.chip.saida')}
                                                                              </span>
                                                                        )}
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
                                                      <h2 className="text-xl font-bold text-white">{t('admin.card.operadores.titulo')}</h2>
                                                      <p className="text-xs text-white/50">{t('admin.modal.operadores.sub')}</p>
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


                  {showUserList && (
                        <div className="fixed inset-0 z-[200] bg-navy-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                              <div className="bg-white rounded-[24px] w-full max-w-5xl shadow-2xl overflow-hidden animate-zoom-in h-[90vh] flex flex-col">
                                    <div className="bg-indigo-600 p-6 flex items-center justify-between flex-shrink-0">
                                          <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                                                      <LucideIcon name="users" size={20} className="text-white" />
                                                </div>
                                                <div>
                                                      <h2 className="text-xl font-bold text-white">{t('admin.card.usuarios.titulo')}</h2>
                                                      <p className="text-xs text-indigo-100">{t('admin.modal.usuarios.sub')}</p>
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
