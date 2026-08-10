// =====================================================================
// MAIN APP
// =====================================================================

/** Cadência da recarga periódica da visão de setor (mesma do CantineMonitor). */
const SECTOR_POLL_MS = 3000;

/**
 * Pontos que renderizam <SectorView> — os únicos que consomem `accessLogs`.
 * Os de category 'monitor' e o CDI têm telas próprias que buscam os próprios
 * dados, então não devem gerar polling de /access/logs/{pointId}.
 */
function rendersSectorView(point) {
      return !!point && point.category !== 'monitor' && point.id !== 'BIBLIO';
}

function App() {
      const [currentUser, setCurrentUser] = React.useState(null);
      const [authChecked, setAuthChecked] = React.useState(false);

      React.useEffect(() => {
            // Sincroniza com window.auth
            if (window.auth) {
                  setCurrentUser(window.auth.getUser());
                  const unsubscribe = window.auth.onAuthChange(setCurrentUser);
                  setAuthChecked(true);
                  return unsubscribe;
            }
      }, []);

      const [currentPoint, setCurrentPoint] = React.useState(null);
      const [accessLogs, setAccessLogs] = React.useState([]);
      /**
       * "Mostrar as passagens de quem está POSTADO neste ponto".
       *
       * Desligado por padrão: a repetição do dia do porteiro (e da Vie Scolaire
       * de plantão no portão) é o ruído que motivou a marcação. Vive aqui, e
       * não dentro do SectorView, porque o filtro é do SERVIDOR — a busca
       * precisa refazer-se quando ele muda, e é esta função que busca.
       */
      const [incluirPostoFixo, setIncluirPostoFixo] = React.useState(false);
      const [activeTimers, setActiveTimers] = React.useState([]);
      const [toast, setToast] = React.useState(null);
      const [accessModal, setAccessModal] = React.useState(null);
      const [showSettings, setShowSettings] = React.useState(false);
      const [adminView, setAdminView] = React.useState(false);
      const [showAdminPinModal, setShowAdminPinModal] = React.useState(false);

      const handleAdminToggle = React.useCallback((enabled) => {
            setAdminView(enabled);
            if (enabled) setCurrentPoint(null); // clear sector when entering admin
      }, []);

      /**
       * Parâmetros de relatório, buscados UMA vez depois do login.
       *
       * O piso de visita curta vive em magbo.report.min-visit-seconds, no
       * backend, mas o Rapport CDI é calculado no cliente. Sem esta busca o JS
       * usaria o próprio número e, mudada a property, a mesma tela mostraria
       * dois valores para o mesmo dia. Se falhar, o reportFilters segue com o
       * fallback dele — a tela nunca fica sem piso.
       */
      React.useEffect(() => {
            if (!currentUser) return;
            let vivo = true;
            // A busca e o comportamento em falha vivem em
            // js/utils/reportConfig.js, com teste — inclusive o caso que
            // importa, que é o servidor não responder e a tela seguir com o
            // fallback em vez de ficar sem piso.
            window.MagboReportConfig.carregar(window.api, window.MagboReport, console)
                  .then(r => { if (vivo && !r.ok) console.warn('[report-config]', r.motivo); });
            return () => { vivo = false; };
      }, [currentUser]);

      /**
       * Liga o cache de fotos à camada HTTP, uma vez.
       *
       * Fica aqui e não dentro do módulo porque o módulo é puro (e testável
       * sem rede) de propósito: ele sabe cachear, não sabe buscar. E a busca
       * PRECISA passar por window.api, que é quem põe o token — o endpoint da
       * foto é autenticado, e essa é a única coisa que impede a foto de um
       * aluno de estar a um GET de distância na rede da escola.
       */
      React.useEffect(() => {
            if (window.MagboPhotoCache && window.api) {
                  window.MagboPhotoCache.configure((userId) => window.api.fetchUserPhoto(userId));
            }
      }, []);

      React.useEffect(() => {
            const handleOpenSettings = () => setShowSettings(true);
            window.addEventListener('open-settings', handleOpenSettings);
            return () => window.removeEventListener('open-settings', handleOpenSettings);
      }, []);

      React.useEffect(() => {
            const openHandler = () => setShowAdminPinModal(true);
            window.addEventListener('open-admin-pin', openHandler);
            return () => window.removeEventListener('open-admin-pin', openHandler);
      }, []);

      // Logs registrados localmente pelo operador que o servidor ainda não devolveu,
      // e logs que ele cancelou no PortariaModal (o cancelamento é só de tela — a
      // linha continua no banco, logo a recarga precisa filtrá-la para não ressuscitar).
      const pendingLogIdsRef = React.useRef(new Set());
      const dismissedLogIdsRef = React.useRef(new Set());

      // Recarga pausa enquanto um modal de acesso está aberto: o fluxo do modal
      // depende de accessLogs estável (o onCancel remove o log otimista pelo id).
      const accessModalRef = React.useRef(null);
      React.useEffect(() => { accessModalRef.current = accessModal; }, [accessModal]);

      // Reconstruir logs globais e timers dinamicamente ao abrir um Setor (F5 / Reload proof)
      // e a cada SECTOR_POLL_MS, para que eventos vindos do hardware apareçam ao vivo.
      React.useEffect(() => {
            if (!currentPoint) return;
            const pointId = currentPoint.id;
            let cancelled = false; // resposta de um setor anterior nunca é aplicada ao atual
            let inFlight = false;  // uma recarga em voo bloqueia a próxima (sem atropelo)

            pendingLogIdsRef.current = new Set();
            dismissedLogIdsRef.current = new Set();

            const loadPointData = async (isInitial) => {
                  if (inFlight) return;
                  inFlight = true;
                  try {
                        const logs = await fetchLogs(pointId, { incluirPostoFixo });
                        if (cancelled) return;

                        // Guard: ensure logs is always an array (fetchLogs already normalises)
                        if (!Array.isArray(logs)) { if (isInitial) setAccessLogs([]); return; }
                        if (isInitial) {
                              setAccessLogs(logs);
                        } else {
                              const serverIds = new Set(logs.map(l => l.id));
                              pendingLogIdsRef.current = new Set(
                                    [...pendingLogIdsRef.current].filter(id => !serverIds.has(id))
                              );
                              const pending = pendingLogIdsRef.current;
                              const fresh = logs.filter(l => !dismissedLogIdsRef.current.has(l.id));
                              // mantém o registro recém-processado até o servidor devolvê-lo (sem piscada)
                              setAccessLogs(prev => fresh.concat(prev.filter(l => pending.has(l.id))));
                        }

                        if (isEspecial(pointId) || pointId.startsWith('REFEI')) {
                              const latestByUser = {};
                              logs.forEach(l => {
                                    const lTime = safeDateParse(l.timestamp);
                                    const existingTime = latestByUser[l.userId] ? safeDateParse(latestByUser[l.userId].timestamp) : 0;
                                    if (!latestByUser[l.userId] || lTime > existingTime) {
                                          latestByUser[l.userId] = l;
                                    }
                              });

                              const newTimers = [];
                              for (const uId in latestByUser) {
                                    const log = latestByUser[uId];
                                    if (log.status === 'ENTRADA') {
                                          newTimers.push({
                                                userId: uId,
                                                pointId: pointId,
                                                startTime: safeDateParse(log.timestamp)
                                          });
                                    }
                              }
                              if (isInitial) {
                                    setActiveTimers(newTimers);
                              } else {
                                    // preserva o startTime já em tela p/ o cronômetro não reiniciar a cada ciclo
                                    setActiveTimers(prev => newTimers.map(t => {
                                          const existing = prev.find(p => p.userId === t.userId && p.pointId === t.pointId);
                                          return existing ? { ...t, startTime: existing.startTime } : t;
                                    }));
                              }
                        }
                  } catch (e) {
                        if (cancelled) return;
                        // Só a carga inicial avisa o operador: com recarga a cada poucos
                        // segundos e servidor fora do ar, um toast por ciclo tornaria a
                        // tela inutilizável.
                        if (isInitial) {
                              setToast({ title: 'Erro de Comunicação com o Servidor', message: e.message, type: 'error' });
                        } else {
                              console.warn('[App] falha na recarga periódica do setor', pointId, e.message);
                        }
                  } finally {
                        inFlight = false;
                  }
            };

            loadPointData(true);

            if (!rendersSectorView(currentPoint)) return () => { cancelled = true; };

            const interval = setInterval(() => {
                  if (accessModalRef.current) return;
                  loadPointData(false);
            }, SECTOR_POLL_MS);

            return () => {
                  cancelled = true;
                  clearInterval(interval);
            };
            // incluirPostoFixo entra nas dependências porque o filtro é do
            // servidor: ligar o botão tem que REBUSCAR, não refiltrar o que já
            // está em tela (as linhas escondidas nunca chegaram ao cliente).
      }, [currentPoint, incluirPostoFixo]);

      // Trocar de setor volta ao padrão. O botão é um recurso de diagnóstico —
      // "quanto ruído o posto fixo está absorvendo aqui?" —, não uma
      // preferência que deva seguir o operador pela portaria e pela enfermaria.
      React.useEffect(() => { setIncluirPostoFixo(false); }, [currentPoint]);

      // ─────────────────────────────────────────────────────────────
      // processAccess — Lógica de Negócio Assíncrona Integrada (API)
      // ─────────────────────────────────────────────────────────────
      const processAccess = React.useCallback(async (userId, pointId) => {
            try {
                  // 1. Busca Segura do Usuário com Tratamento Contínuo 
                  const data = await fetchUser(userId);
                  
                  // Guard: API returned incomplete payload
                  if (!data || !data.user) {
                        window.playErrorBeep?.();
                        setToast({ title: 'Erro de Dados', message: 'Usuário não encontrado ou dados incompletos.', type: 'error' });
                        return;
                  }
                  
                  const user = data.user;
                  const responsavel = data.responsavel || null;

                  const lastLog = [...accessLogs]
                        .filter(l => l.userId === userId && l.pointId === pointId)
                        .sort((a, b) => safeDateParse(b.timestamp) - safeDateParse(a.timestamp))[0];

                  const status = (!lastLog || lastLog.status === 'SAIDA') ? 'ENTRADA' : 'SAIDA';
                  const now = Date.now();

                  // Regra de Negócio: Bloqueio de Saída Precoce na Cantina (10 minutos) APENAS PARA ALUNOS
                  let errorTempoMinimo = false;
                  if (pointId.startsWith('REFEI') && status === 'SAIDA' && user.tipo === 'ALUNO') {
                        const timer = activeTimers.find(t => t.userId === userId && t.pointId === pointId);
                        if (timer && (now - timer.startTime < 10 * 60 * 1000)) { // 10 minutes
                              errorTempoMinimo = true;
                        }
                  }

                  // 2. Registro no Backend com análise de Duplicidade (Constraint: Refeitório)
                  let isRefeicaoDuplicada = false;
                  let newLog;
                  
                  if (errorTempoMinimo) {
                        // Não bate na API. Simula evento local para acionar o Modal Vermelho.
                        newLog = { id: `block-${now}`, userId, pointId, status: 'ENTRADA', timestamp: new Date().toISOString() };
                  } else {
                        try {
                              newLog = await registerAccess({ userId, pointId, action: status });
                              // registerAccess (utils/api.js) already normalises: .status and .timestamp are set
                              if (!newLog) throw new Error('Falha ao registrar acesso');
                        } catch (error) {
                              if ((error.message || '').includes('DUPLICATE_MEAL') || (error.message || '').includes('Duplicidade')) {
                                    isRefeicaoDuplicada = true;
                                    newLog = { id: `dup-${now}`, userId, pointId, status: 'ENTRADA', timestamp: new Date().toISOString() };
                              } else {
                                    throw error; // Propaga erro crítico (500/404)
                              }
                        }
                  }

                  // 3. Regra Especial Biblioteca & Refeitório: Atualiza Timers p/ Relógio e Bloqueio
                  if ((isEspecial(pointId) || pointId.startsWith('REFEI')) && !isRefeicaoDuplicada && !errorTempoMinimo) {
                        if (status === 'ENTRADA') {
                              setActiveTimers(prev => [...prev, { userId, pointId, startTime: now }]);
                        } else {
                              setActiveTimers(prev => prev.filter(t => !(t.userId === userId && t.pointId === pointId)));
                        }
                  }

                  if (!isRefeicaoDuplicada && !errorTempoMinimo) {
                        pendingLogIdsRef.current.add(newLog.id); // protege da recarga até o servidor devolvê-lo
                        setAccessLogs(prev => [...prev, newLog]);
                  }

                  // 4. Acionamento Robusto de Modais 
                  if (isPortaria(pointId) && (user.tipo === 'RESPONSAVEL' || user.tipo === 'ALUNO')) {
                        // Modal Duplo Exclusivo para Portarias — only if a REAL responsável exists
                        if (responsavel && responsavel.id) {
                              window.playSuccessBeep?.();
                              setAccessModal({ type: 'portaria', responsavel, alunos: [user], logId: newLog.id });
                        } else {
                              // Aluno sem responsável cadastrado → show simple sector modal with warning
                              window.playSuccessBeep?.();
                              setAccessModal({ 
                                    type: 'sector', 
                                    user, 
                                    bannerProps: { 
                                          text: status === 'ENTRADA' ? 'ACESSO LIBERADO' : 'SAÍDA LIBERADA', 
                                          subtext: 'Sem responsável cadastrado', 
                                          type: 'success' 
                                    } 
                              });
                        }
                  } else if (isEspecial(pointId) || pointId.startsWith('REFEI')) {
                        let bannerProps = { text: status === 'ENTRADA' ? 'ACESSO LIBERADO' : 'SAÍDA LIBERADA', type: 'success' };
                        let beepType = 'success';

                        if (errorTempoMinimo) {
                              bannerProps = { text: 'ACESSO BLOQUEADO', subtext: 'Tempo mínimo (10 min) não atingido. Retorne à cantina.', type: 'alert' };
                              beepType = 'error';
                        } else if (isRefeicaoDuplicada) {
                              // Constraint 3 (Refeitório): Banner Vemelho Central Absoluto!
                              bannerProps = { text: 'AVISO REFEIÇÃO DUPLICADA', subtext: 'Refeição já registrada hoje no Servidor', type: 'alert' };
                              beepType = 'error';

                        } else if (isEspecial(pointId)) {
                              if (status === 'ENTRADA') {
                                    bannerProps = { text: 'TEMPO DE PERMANÊNCIA MAX 02:00', subtext: 'Timer iniciado', type: 'success' };
                              } else {
                                    // SAIDA
                                    const timer = activeTimers.find(t => t.userId === userId && t.pointId === pointId);
                                    if (timer && (now - timer.startTime > 7200 * 1000)) {
                                          bannerProps = { text: 'TEMPO MÁXIMO EXCEDIDO', subtext: 'Permaneceu mais de 2h (7200s)', type: 'alert' };
                                          beepType = 'error';
                                    } else {
                                          bannerProps = { text: 'SAÍDA LIBERADA', subtext: 'Dentro do tempo', type: 'success' };
                                    }
                              }
                        }

                        if (beepType === 'error') window.playErrorBeep?.();
                        else window.playSuccessBeep?.();

                        setAccessModal({ type: 'sector', user, bannerProps });
                  } else {
                        // Portaria Normal (Funcionário/Prof) e afins..
                        window.playSuccessBeep?.();
                        setAccessModal({ type: 'sector', user, bannerProps: { text: status === 'ENTRADA' ? 'ACESSO LIBERADO' : 'SAÍDA LIBERADA', type: 'success' } });
                  }
            } catch (error) {
                  // Constraint 4: Try/Catch super resiliente contra quedas de Backend
                  window.playErrorBeep?.();
                  setToast({ title: 'Erro de Comunicação com o Servidor', message: error.message || 'Desconhecido', type: 'error' });
            }
      }, [accessLogs, activeTimers, currentPoint]);

      // Se não logado → mostra LoginScreen
      if (!currentUser) {
            return <LoginScreen onLoginSuccess={(data) => setCurrentUser(window.auth.getUser())} />;
      }

      // ── Biblioteca → Full CDI experience ──
      if (currentPoint && currentPoint.id === 'BIBLIO') {
            return (
                  <div className="h-screen overflow-hidden">
                        <BibliotecaView onBack={() => setCurrentPoint(null)} />
                  </div>
            );
      }

      return (
            <div className="min-h-screen bg-soft-100 pb-12">
                  <Header
                  currentPoint={currentPoint}
                  onBack={() => { setCurrentPoint(null); setAdminView(false); }}
                  adminView={adminView}
                  onAdminToggle={handleAdminToggle}
            />

            {adminView ? (
                  <AdminDashboard
                        onBack={() => setAdminView(false)}
                        onShowToast={setToast}
                        activeTimers={activeTimers}
                        onNavigateToReport={() => {
                              setAdminView(false);
                              const pt = ACCESS_POINTS.find(p => p.id === 'GENERAL_REPORT');
                              if (pt) setCurrentPoint(pt);
                        }}
                        onNavigateToMeal={() => {
                              setAdminView(false);
                              const pt = ACCESS_POINTS.find(p => p.id === 'MEAL_ENTITLEMENT_MANAGEMENT');
                              if (pt) setCurrentPoint(pt);
                        }}
                        onNavigateToExit={() => {
                              setAdminView(false);
                              const pt = ACCESS_POINTS.find(p => p.id === 'EXIT_PERMISSION_MANAGEMENT');
                              if (pt) setCurrentPoint(pt);
                        }}
                  />
            ) : !currentPoint ? (
                        <Dashboard
                              onSelectPoint={setCurrentPoint}
                              accessLogs={accessLogs}
                        />
                  ) : currentPoint && currentPoint.id === 'CANTINA_MONITOR' ? (
                        <CantineMonitor />
                  ) : currentPoint && currentPoint.id === 'CANTINA_REPORT' ? (
                        <RefectoryReport />
                  ) : currentPoint && currentPoint.id === 'INFIRMARY_REPORT' ? (
                        <InfirmaryReport />
                  ) : currentPoint && currentPoint.id === 'GENERAL_REPORT' ? (
                        <GeneralReport onBack={() => setCurrentPoint(null)} />
                  ) : currentPoint && currentPoint.id === 'MEAL_ENTITLEMENT_MANAGEMENT' ? (
                        <MealEntitlementManagement onBack={() => setCurrentPoint(null)} />
                  ) : currentPoint && currentPoint.id === 'EXIT_PERMISSION_MANAGEMENT' ? (
                        <ExitPermissionManagement onBack={() => setCurrentPoint(null)} />
                  ) : (
                  <SectorView
                        point={currentPoint}
                        accessLogs={accessLogs}
                        onProcess={processAccess}
                        activeTimers={activeTimers}
                        incluirPostoFixo={incluirPostoFixo}
                        onTogglePostoFixo={setIncluirPostoFixo}
                  />
            )}
                  <Toast toast={toast} onDismiss={() => setToast(null)} />

                  <AdminPinModal
                        open={showAdminPinModal}
                        onClose={() => setShowAdminPinModal(false)}
                        onSuccess={() => {
                              setShowAdminPinModal(false);
                              handleAdminToggle(true);
                        }}
                  />

                  {accessModal && accessModal.type === 'portaria' && (
                        <PortariaModal
                              responsavel={accessModal.responsavel}
                              alunos={accessModal.alunos}
                              onConfirm={() => setAccessModal(null)}
                              onCancel={() => {
                                    pendingLogIdsRef.current.delete(accessModal.logId);
                                    dismissedLogIdsRef.current.add(accessModal.logId);
                                    setAccessLogs(prev => prev.filter(l => l.id !== accessModal.logId));
                                    setAccessModal(null);
                              }}
                        />
                  )}

                  {accessModal && accessModal.type === 'sector' && (
                        <PermanenciaModal
                              user={accessModal.user}
                              bannerProps={accessModal.bannerProps}
                              onClose={() => setAccessModal(null)}
                        />
                  )}

                  {showSettings && (
                        <AppSettingsModal
                              onClose={() => setShowSettings(false)}
                              onShowToast={setToast}
                        />
                  )}

                  {/* Footer */}
                  <footer className="fixed bottom-0 inset-x-0 bg-white/80 backdrop-blur border-t border-soft-200 z-40">
                        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between">
                              <p className="text-[11px] text-slate-400">
                                    MAGBO Access Control v1.0 · Lycée Molière · 2026 ·{' '}
                                    <a href="https://www.sammagbo.com" target="_blank" rel="noopener noreferrer" className="text-[#00234b] font-semibold hover:underline">MAGBO STUDIO</a>
                              </p>
                              <ConnectionStatus />
                        </div>
                  </footer>
            </div>
      );
}

// =====================================================================
// RENDER
// =====================================================================

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
