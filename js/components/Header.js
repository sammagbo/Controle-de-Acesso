// =====================================================================
// HEADER COMPONENT
// =====================================================================

function Header({ currentPoint, onBack, adminView, onAdminToggle, voltar = null }) {
      const t = useI18n();
      const locale = useLocale();
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
                                          title={t('header.voltar.para', { destino: voltar.label })}
                                          aria-label={t('header.voltar.para', { destino: voltar.label })}
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
                                          <span>{t('header.dashboard')}</span>
                                    </button>
                                    {adminView && (
                                          <>
                                                <LucideIcon name="chevron-right" size={14} className="text-white/30" />
                                                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 font-semibold text-white">
                                                      <LucideIcon name="shield" size={14} />
                                                      {t('header.painel')}
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
                                                {clock.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                                          </p>
                                          <p className="text-sm font-bold font-mono tracking-wider">{formatTime(clock)}</p>
                                    </div>
                                    <div className="flex items-center gap-3 border-l border-white/10 pl-4">
                                          <div className="w-2.5 h-2.5 rounded-full bg-success-500 animate-pulse" title={t('header.online')} />
                                          {/* O seletor de idioma fica AQUI, ao lado do
                                              cadeado e da engrenagem — a língua é a
                                              primeira coisa de que alguém precisa ao
                                              sentar no posto, não uma opção avançada. */}
                                          <LanguageSelector />
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
                                          title={adminView ? t('header.admin.fechar') : t('header.admin.abrir')}
                                    >
                                          <LucideIcon name={adminView ? 'lock-open' : 'lock'} size={14} />
                                          <span className="hidden md:inline">{t('header.admin')}</span>
                                    </button>
                                    {/* ⚠️ RÉGLAGES É ADMIN, E A ENGRENAGEM NÃO DIZIA ISSO.
                                        Ela era desenhada para TODO usuário logado, e cada uma
                                        das suas abas chama endpoints hasRole('ADMIN')
                                        (StaffController inteiro, /api/admin/photos, …).
                                        Medido em 20/08/2026 com uma conta OPERATOR real: a aba
                                        Personnels abria por completo — título, busca, cabeçalho
                                        de tabela — e mostrava «0 personnel(s)», com a única
                                        pista sendo um toast que passava dizendo «Forbidden», em
                                        INGLÊS. Uma tela que responde «não há nenhum» a uma
                                        recusa de permissão está a mentir, e é a mesma família
                                        de defeito que esta noite passou a corrigir.

                                        ⚠️ POR QUE ESCONDER, e não desabilitar: a regra de
                                        .claude/rules/frontend.md manda DESABILITAR em vez de
                                        esconder, mas ela fala de PERMISSÃO GRANULAR
                                        (MEAL_ENTITLEMENT_WRITE…), onde a LEITURA continua
                                        liberada por área e o operador tem o que ver. Aqui não
                                        há nada para ler: as sete abas são administração, e o
                                        operador não tem acesso a nenhuma. Deixar a porta
                                        desenhada só ensina a bater nela. */}
                                    {window.auth && window.auth.isAdmin && window.auth.isAdmin() && (
                                    <button
                                          onClick={() => window.dispatchEvent(new CustomEvent('open-settings'))}
                                          className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors text-white/70 hover:text-white"
                                          title={t('header.config')}
                                    >
                                          <LucideIcon name="cog" size={16} />
                                    </button>
                                    )}
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
                                                      title={t('header.sair')}
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
                                          <span>{t('header.voltar')}</span>
                                    </button>
                                    <LucideIcon name="chevron-right" size={14} className="text-white/30" />
                                    <span className="font-semibold text-white">{currentPoint.nome}</span>
                              </div>
                        )}
                  </div>
            </header>
      );
}
