// =====================================================================
// MAIN APP
// =====================================================================

function App() {
      const [currentPoint, setCurrentPoint] = React.useState(null);
      const [accessLogs, setAccessLogs] = React.useState([]);
      const [activeTimers, setActiveTimers] = React.useState([]);
      const [toast, setToast] = React.useState(null);
      const [accessModal, setAccessModal] = React.useState(null);

      // ─────────────────────────────────────────────────────────────
      // processAccess — Core business logic
      // ─────────────────────────────────────────────────────────────
      const processAccess = React.useCallback((userId, pointId) => {
            const user = USERS.find(u => u.id === userId);
            if (!user) return;

            // Determine status: toggle based on last log at this point
            const lastLog = [...accessLogs]
                  .filter(l => l.userId === userId && l.pointId === pointId)
                  .sort((a, b) => b.timestamp - a.timestamp)[0];

            const status = (!lastLog || lastLog.status === 'SAIDA') ? 'ENTRADA' : 'SAIDA';
            const now = Date.now();

            let isRefeicaoDuplicada = false;
            if (pointId.startsWith('REFEI') && status === 'ENTRADA') {
                  const hasEatenToday = accessLogs.some(l => l.userId === userId && l.pointId.startsWith('REFEI') && l.status === 'ENTRADA' && now - l.timestamp < 24 * 60 * 60 * 1000);
                  if (hasEatenToday) isRefeicaoDuplicada = true;
            }

            const newLog = {
                  id: `LOG-${now}-${Math.random().toString(36).substr(2, 5)}`,
                  userId,
                  pointId,
                  status,
                  timestamp: now,
                  duration: null,
            };

            // ── Special: Biblioteca / Enfermaria timer ──
            if (isEspecial(pointId)) {
                  if (status === 'ENTRADA') {
                        setActiveTimers(prev => [...prev, { userId, pointId, startTime: now }]);
                  } else {
                        setActiveTimers(prev => {
                              const timer = prev.find(t => t.userId === userId && t.pointId === pointId);
                              if (timer) {
                                    newLog.duration = now - timer.startTime;
                              }
                              return prev.filter(t => !(t.userId === userId && t.pointId === pointId));
                        });
                  }
            }

            setAccessLogs(prev => [...prev, newLog]);

            // ── Trigger Access Modals ──
            if (isPortaria(pointId) && user.tipo === 'ALUNO') {
                  const responsavel = user.responsavel_id ? USERS.find(u => u.id === user.responsavel_id) : null;
                  setAccessModal({ type: 'portaria', user, responsavel, logId: newLog.id });
            } else if (isEspecial(pointId) || pointId.startsWith('REFEI')) {
                  let bannerProps = { text: status === 'ENTRADA' ? 'ACESSO LIBERADO' : 'SAÍDA LIBERADA', type: 'success' };

                  if (isRefeicaoDuplicada) {
                        bannerProps = { text: 'AVISO: REFEIÇÃO DUPLICADA', subtext: 'Refeição já registrada hoje', type: 'alert' };
                  } else if (isEspecial(pointId) && status === 'ENTRADA') {
                        bannerProps = { text: 'TEMPO DE PERMANÊNCIA RESTANTE 00:10', subtext: 'Timer iniciado', type: 'alert' };
                  }

                  setAccessModal({ type: 'sector', user, bannerProps });
            } else if (isPortaria(pointId) && user.tipo !== 'ALUNO') {
                  setAccessModal({ type: 'sector', user, bannerProps: { text: status === 'ENTRADA' ? 'ACESSO LIBERADO' : 'SAÍDA LIBERADA', type: 'success' } });
            }
      }, [accessLogs]);

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
                  <Header currentPoint={currentPoint} onBack={() => setCurrentPoint(null)} />

                  {!currentPoint ? (
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

                  {accessModal && accessModal.type === 'portaria' && (
                        <PortariaModal
                              user={accessModal.user}
                              responsavel={accessModal.responsavel}
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

                  {/* Footer */}
                  <footer className="fixed bottom-0 inset-x-0 bg-white/80 backdrop-blur border-t border-soft-200 z-40">
                        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between">
                              <p className="text-[11px] text-slate-400">
                                    MAGBO Access Control v1.0 · Lycée Molière · 2026
                              </p>
                              <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-success-500 animate-pulse" />
                                    <span className="text-[11px] text-slate-400 font-medium">Sistema Operacional</span>
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
