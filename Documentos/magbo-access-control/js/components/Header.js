// =====================================================================
// HEADER COMPONENT
// =====================================================================

function Header({ currentPoint, onBack }) {
      const [clock, setClock] = React.useState(new Date());

      React.useEffect(() => {
            const interval = setInterval(() => setClock(new Date()), 1000);
            return () => clearInterval(interval);
      }, []);

      return (
            <header className="bg-navy-500 text-white shadow-lg">
                  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex items-center justify-between h-16">
                              {/* Logo */}
                              <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur">
                                          <LucideIcon name="shield-check" size={20} className="text-accent-400" />
                                    </div>
                                    <div>
                                          <h1 className="text-base font-bold tracking-tight leading-none">MAGBO Access Control</h1>
                                          <p className="text-[11px] text-white/50 font-medium">Lycée Molière</p>
                                    </div>
                              </div>

                              {/* Breadcrumb */}
                              <nav className="hidden sm:flex items-center gap-2 text-sm">
                                    <button
                                          onClick={onBack}
                                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${currentPoint
                                                ? 'text-white/60 hover:text-white hover:bg-white/10 cursor-pointer'
                                                : 'text-white font-semibold bg-white/10'
                                                }`}
                                    >
                                          <LucideIcon name="layout-grid" size={14} />
                                          <span>Dashboard</span>
                                    </button>
                                    {currentPoint && (
                                          <>
                                                <LucideIcon name="chevron-right" size={14} className="text-white/30" />
                                                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 font-semibold text-white">
                                                      <LucideIcon name={currentPoint.icon} size={14} />
                                                      {currentPoint.nome}
                                                </span>
                                          </>
                                    )}
                              </nav>

                              {/* Clock & Settings */}
                              <div className="flex items-center gap-4">
                                    <div className="text-right">
                                          <p className="text-xs text-white/50 font-medium">
                                                {clock.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                                          </p>
                                          <p className="text-sm font-bold font-mono tracking-wider">{formatTime(clock)}</p>
                                    </div>
                                    <div className="flex items-center gap-3 border-l border-white/10 pl-4">
                                          <div className="w-2.5 h-2.5 rounded-full bg-success-500 animate-pulse" title="Sistema Online" />
                                          <button
                                                onClick={() => window.dispatchEvent(new CustomEvent('open-settings'))}
                                                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors text-white/70 hover:text-white"
                                                title="Configurações e Cadastros"
                                          >
                                                <LucideIcon name="cog" size={16} />
                                          </button>
                                    </div>
                              </div>
                        </div>

                        {/* Mobile breadcrumb */}
                        {currentPoint && (
                              <div className="sm:hidden flex items-center gap-2 pb-3 text-sm">
                                    <button onClick={onBack} className="text-white/60 hover:text-white flex items-center gap-1">
                                          <LucideIcon name="arrow-left" size={14} />
                                          <span>Voltar</span>
                                    </button>
                                    <LucideIcon name="chevron-right" size={14} className="text-white/30" />
                                    <span className="font-semibold text-white">{currentPoint.nome}</span>
                              </div>
                        )}
                  </div>
            </header>
      );
}
