// =====================================================================
// MAIN APP
// =====================================================================

function App() {
      const [currentPoint, setCurrentPoint] = React.useState(null);
      const [accessLogs, setAccessLogs] = React.useState([]);
      const [activeTimers, setActiveTimers] = React.useState([]);
      const [toast, setToast] = React.useState(null);

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

            // ── Special: Aluno at Portaria → show Responsável ──
            if (user.tipo === 'ALUNO' && isPortaria(pointId) && user.responsavel_id) {
                  setToast({
                        responsavelId: user.responsavel_id,
                        alunoNome: user.nome,
                        timestamp: now,
                  });
            }

            setAccessLogs(prev => [...prev, newLog]);
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
