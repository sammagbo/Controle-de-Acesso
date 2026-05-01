// =====================================================================
// MAIN APP
// =====================================================================

function App() {
      const [currentPoint, setCurrentPoint] = React.useState(null);
      const [accessLogs, setAccessLogs] = React.useState([]);
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

      // Reconstruir logs globais e timers dinamicamente ao abrir um Setor (F5 / Reload proof)
      React.useEffect(() => {
            if (!currentPoint) return;
            const loadPointData = async () => {
                  try {
                        const logs = await fetchLogs(currentPoint.id);
                        
                        // Guard: ensure logs is always an array (fetchLogs already normalises)
                        if (!Array.isArray(logs)) { setAccessLogs([]); return; }
                        setAccessLogs(logs);

                        if (isEspecial(currentPoint.id) || currentPoint.id.startsWith('REFEI')) {
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
                                                pointId: currentPoint.id, 
                                                startTime: safeDateParse(log.timestamp) 
                                          });
                                    }
                              }
                              setActiveTimers(newTimers);
                        }
                  } catch (e) {
                        setToast({ title: 'Erro de Comunicação com o Servidor', message: e.message, type: 'error' });
                  }
            };
            loadPointData();
      }, [currentPoint]);

      // ─────────────────────────────────────────────────────────────
      // processAccess — Lógica de Negócio Assíncrona Integrada (API)
      // ─────────────────────────────────────────────────────────────
      const processAccess = React.useCallback(async (userId, pointId) => {
            try {
                  // 1. Busca Segura do Usuário com Tratamento Contínuo 
                  const data = await fetchUser(userId);
                  
                  // Guard: API returned incomplete payload
                  if (!data || !data.user) {
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
                        setAccessLogs(prev => [...prev, newLog]);
                  }

                  // 4. Acionamento Robusto de Modais 
                  if (isPortaria(pointId) && (user.tipo === 'RESPONSAVEL' || user.tipo === 'ALUNO')) {
                        // Modal Duplo Exclusivo para Portarias — only if a REAL responsável exists
                        if (responsavel && responsavel.id) {
                              setAccessModal({ type: 'portaria', responsavel, alunos: [user], logId: newLog.id });
                        } else {
                              // Aluno sem responsável cadastrado → show simple sector modal with warning
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

                        if (errorTempoMinimo) {
                              bannerProps = { text: 'ACESSO BLOQUEADO', subtext: 'Tempo mínimo (10 min) não atingido. Retorne à cantina.', type: 'alert' };
                        } else if (isRefeicaoDuplicada) {
                              // Constraint 3 (Refeitório): Banner Vemelho Central Absoluto!
                              bannerProps = { text: 'AVISO REFEIÇÃO DUPLICADA', subtext: 'Refeição já registrada hoje no Servidor', type: 'alert' };

                        } else if (isEspecial(pointId)) {
                              if (status === 'ENTRADA') {
                                    bannerProps = { text: 'TEMPO DE PERMANÊNCIA MAX 02:00', subtext: 'Timer iniciado', type: 'success' };
                              } else {
                                    // SAIDA
                                    const timer = activeTimers.find(t => t.userId === userId && t.pointId === pointId);
                                    if (timer && (now - timer.startTime > 7200 * 1000)) {
                                          bannerProps = { text: 'TEMPO MÁXIMO EXCEDIDO', subtext: 'Permaneceu mais de 2h (7200s)', type: 'alert' };
                                    } else {
                                          bannerProps = { text: 'SAÍDA LIBERADA', subtext: 'Dentro do tempo', type: 'success' };
                                    }
                              }
                        }
                        setAccessModal({ type: 'sector', user, bannerProps });
                  } else {
                        // Portaria Normal (Funcionário/Prof) e afins..
                        setAccessModal({ type: 'sector', user, bannerProps: { text: status === 'ENTRADA' ? 'ACESSO LIBERADO' : 'SAÍDA LIBERADA', type: 'success' } });
                  }
            } catch (error) {
                  // Constraint 4: Try/Catch super resiliente contra quedas de Backend
                  setToast({ title: 'Erro de Comunicação com o Servidor', message: error.message || 'Desconhecido', type: 'error' });
            }
      }, [accessLogs, activeTimers, currentPoint]);

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
                  />
            ) : !currentPoint ? (
                        <Dashboard
                              onSelectPoint={setCurrentPoint}
                              accessLogs={accessLogs}
                        />
                  ) : (
                  <SectorView
                        point={currentPoint}
                        accessLogs={accessLogs}
                        onProcess={processAccess}
                        activeTimers={activeTimers}
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
                              <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-success-500 animate-pulse" />
                                    <span className="text-[11px] text-slate-400 font-medium">
                                          Sistema Operacional
                                    </span>
                              </div>
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
