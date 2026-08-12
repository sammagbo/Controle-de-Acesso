// =====================================================================
// HEADER COMPONENT
// =====================================================================

function Header({ currentPoint, onBack, adminView, onAdminToggle, voltar = null }) {
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

                              {/* ── VOLTAR, sempre AQUI e sempre NOMEADO ──
                                  Uma seta sem destino obriga o operador a
                                  adivinhar; e sem este botão, voltar de
                                  qualquer tela era refazer o caminho inteiro
                                  desde o Dashboard (PIN incluso, quando o
                                  caminho passava pelo painel).
                                  ⚠️ FORA do <nav> escondido de propósito: o
                                  breadcrumb some abaixo do breakpoint `sm`, e
                                  uma janela estreita ficava SEM navegação
                                  nenhuma — o voltar existe em qualquer
                                  largura; só o rótulo encolhe. */}
                              {voltar && (
                                    <button
                                          onClick={voltar.acao}
                                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-accent-300 hover:bg-white/15 hover:text-accent-200 transition-all font-semibold text-sm"
                                          title={`Retour : ${voltar.label}`}
                                          aria-label={`Retour : ${voltar.label}`}
                                    >
                                          <LucideIcon name="arrow-left" size={14} />
                                          {/* O destino SEMPRE nomeado — em janela estreita
                                              trunca, mas não vira seta muda. */}
                                          <span className="max-w-[38vw] truncate">{voltar.label}</span>
                                    </button>
                              )}

                              {/* Breadcrumb */}
                              <nav className="hidden sm:flex items-center gap-2 text-sm">
                                    <button
                                          onClick={onBack}
                                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                                                currentPoint || adminView
                                                      ? 'text-white/60 hover:text-white hover:bg-white/10 cursor-pointer'
                                                      : 'text-white font-semibold bg-white/10'
                                          }`}
                                    >
                                          <LucideIcon name="layout-grid" size={14} />
                                          <span>Dashboard</span>
                                    </button>
                                    {adminView && (
                                          <>
                                                <LucideIcon name="chevron-right" size={14} className="text-white/30" />
                                                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 font-semibold text-white">
                                                      <LucideIcon name="shield" size={14} />
                                                      Painel Administrativo
                                                </span>
                                          </>
                                    )}
                                    {!adminView && currentPoint && (
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
                                          {/* ── Administração: elemento NOMEADO, não um cadeado
                                              solto — um ícone sem palavra é um destino que só
                                              quem já sabe encontra. O cadeado continua, mas
                                              como adjetivo (exige PIN), não como nome. */}
                                          <button
                                          onClick={() => {
                                                if (adminView) {
                                                      onAdminToggle(false);
                                                } else {
                                                      window.dispatchEvent(new CustomEvent('open-admin-pin'));
                                                }
                                          }}
                                          className={`h-8 px-3 rounded-lg flex items-center gap-1.5 transition-colors text-xs font-semibold ${
                                                adminView
                                                      ? 'bg-accent-500/20 text-accent-400 hover:bg-accent-500/30'
                                                      : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white'
                                          }`}
                                          title={adminView ? 'Fechar o Painel Administrativo' : 'Painel Administrativo (PIN)'}
                                    >
                                          <LucideIcon name={adminView ? 'lock-open' : 'lock'} size={14} />
                                          <span className="hidden md:inline">Administração</span>
                                    </button>
                                    <button
                                          onClick={() => window.dispatchEvent(new CustomEvent('open-settings'))}
                                          className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors text-white/70 hover:text-white"
                                          title="Configurações e Cadastros"
                                    >
                                          <LucideIcon name="cog" size={16} />
                                    </button>
                                    {window.auth && window.auth.isLoggedIn() && window.auth.getUser() && (
                                          <div className="flex items-center gap-3 ml-2 pl-4 border-l border-white/10">
                                                <div className="text-right hidden sm:block">
                                                      <div className="text-[10px] uppercase font-bold tracking-wider text-white/50">{window.auth.getUser().role}</div>
                                                      <div className="text-sm font-medium text-white truncate max-w-[150px]">
                                                            {window.auth.getUser().nomeCompleto || window.auth.getUser().username}
                                                      </div>
                                                </div>
                                                <button
                                                      onClick={() => { window.auth.logout(); window.location.reload(); }}
                                                      className="w-8 h-8 rounded-lg bg-white/5 hover:bg-red-500/20 flex items-center justify-center transition-colors text-white/70 hover:text-red-400"
                                                      title="Sair"
                                                >
                                                      <LucideIcon name="log-out" size={16} />
                                                </button>
                                          </div>
                                    )}
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
