// =====================================================================
// SECTOR VIEW (Split View)
// =====================================================================

function SectorView({ point, accessLogs, onProcess, activeTimers,
                      incluirRepeticoes = false, onToggleRepeticoes }) {
      const t = useI18n();
      const [searchQuery, setSearchQuery] = React.useState('');
      const [searchResults, setSearchResults] = React.useState([]);
      const [isSearching, setIsSearching] = React.useState(false);
      const searchRef = React.useRef(null);
      const logListRef = React.useRef(null);

      React.useEffect(() => {
            if (searchRef.current) searchRef.current.focus();
      }, [point]);

      React.useEffect(() => {
            if (logListRef.current) logListRef.current.scrollTop = 0;
      }, [accessLogs]);

      // Busca remota (backend) com debounce de 250ms — substitui USERS.filter local
      React.useEffect(() => {
            const q = searchQuery.trim();
            if (!q) { setSearchResults([]); return; }
            const handle = setTimeout(async () => {
                  if (window.userCache && window.userCache.search) {
                        const results = await window.userCache.search(q, 20);
                        setSearchResults(results);
                  }
            }, 250);
            return () => clearTimeout(handle);
      }, [searchQuery]);

      const displayResults = searchResults;

      // ── Badge search via API on Enter ──
      const handleKeyDown = async (e) => {
            if (e.key !== 'Enter') return;
            const q = searchQuery.trim();
            if (!q) return;

            setIsSearching(true);
            setSearchResults([]);
            try {
                  const data = await fetchUser(q);
                  if (data && data.user) {
                        setSearchResults([data.user]);
                  } else {
                        // No API result — fall back to local filtering (already shown)
                        setSearchResults([]);
                  }
            } catch (err) {
                  // Network error — keep local results visible
                  setSearchResults([]);
            } finally {
                  setIsSearching(false);
            }
      };

      // ── FIM DE JORNADA: quem ainda está dentro, antes de o sistema fechar ──
      // O componente decide sozinho se aparece: pergunta ao backend e some
      // quando o ponto não tem fechamento configurado (204). Não há lista de
      // pontos espelhada aqui — ela envelheceria em relação às properties.

      // ── RÉGIME DE SORTIE, ao vivo, no portão ──────────────────────────
      // ⚠️ SEM UM CLIQUE A MAIS. O veredicto chega sozinho, no mesmo ciclo em
      // que a passagem aparece: com duzentos alunos em movimento, qualquer
      // interação a mais custa mais do que a informação vale (veto do AED).
      //
      // Só no PORTÃO: o regime de sortie fala de sair da escola. No CDI ou na
      // cantina a consulta seria puro gasto.
      const ehPortao = String(point.id || '').toUpperCase().startsWith('PORT');
      const [veredictos, setVeredictos] = React.useState([]);
      const [falhouRegime, setFalhouRegime] = React.useState(false);

      // A trava e o ponto corrente vivem em REFS, para sobreviverem às
      // remontagens do efeito — é a sobrevivência que conserta o descarte de
      // resposta boa. Ver js/utils/travaDeVoo.js.
      const travaRegime = React.useRef(null);
      if (travaRegime.current === null) travaRegime.current = window.MagboTravaDeVoo.criar();
      const pontoAtualRef = React.useRef(point.id);
      pontoAtualRef.current = point.id;

      React.useEffect(() => {
            if (!ehPortao || !window.api?.veredictosNoPortao) { setVeredictos([]); return; }
            // Uma requisição no ar bloqueia a próxima. Sem isto, um endpoint
            // mais lento que o ciclo de 3s empilha chamadas até esgotar as ~6
            // conexões do navegador — e o polling de logos de que a tela
            // depende passa fome.
            if (!travaRegime.current.entrar()) return;
            const pontoPedido = point.id;
            (async () => {
                  try {
                        const v = await window.api.veredictosNoPortao(pontoPedido, 20);
                        // ⚠️ Compara o PONTO, não "o efeito ainda está vivo". A
                        // resposta do mesmo ponto serve mesmo que o efeito que a
                        // pediu já tenha sido substituído por outro ciclo —
                        // descartá-la é o que congelava a faixa com a rede
                        // trabalhando.
                        if (!travaRegime.current.aplicavel(pontoPedido, pontoAtualRef.current)) return;
                        // null = a consulta FALHOU; [] = não há saída de aluno hoje.
                        // Sem distinguir, uma falha de rede fica idêntica a "está
                        // tudo certo" na tela onde isso mais custa.
                        setFalhouRegime(v === null);
                        setVeredictos(Array.isArray(v) ? v : []);
                  } finally {
                        // SEMPRE — uma falha que deixasse a trava fechada
                        // congelaria a faixa para sempre, que é pior do que o
                        // defeito que a trava conserta.
                        travaRegime.current.sair();
                  }
            })();
            // ⚠️ SEM setInterval PRÓPRIO. `accessLogs` está nas dependências e o
            // App.js recarrega os logs a cada 3s trocando o array — este efeito
            // já roda naquele ritmo. Com o intervalo TAMBÉM montado aqui eram
            // duas chamadas por ciclo ao mesmo endpoint, cada uma com duas
            // consultas por linha (painel de revisão, arquiteto, 14/08).
      }, [ehPortao, point.id, accessLogs]);

      /**
       * O QUE A FAIXA MOSTRA — e por que não é simplesmente "o último".
       *
       * ⚠️ Num portão às 11h50 passam várias pessoas em poucos segundos. Se a
       * faixa mostrasse sempre a última passagem, um VERMELHO seria enterrado
       * pelo verde que chega três segundos depois, e o AED nunca o veria: o
       * alerta existiria por dois segundos, no meio de uma fila.
       *
       * Então quem precisa de atenção VENCE: o mais recente NON_AUTORISE ou
       * A_VERIFIER dos últimos dois minutos fica na faixa, mesmo que passagens
       * verdes tenham vindo depois. Passados os dois minutos, a faixa volta a
       * ser a última passagem — o alerta é para o momento, não para o dia.
       *
       * A hora aparece sempre na faixa, então nunca se confunde a passagem
       * retida com a que acabou de acontecer.
       */
      const JANELA_ATENCAO_MS = 2 * 60 * 1000;
      const emDestaque = React.useMemo(() => {
            if (!veredictos.length) return null;
            const agora = Date.now();
            const precisaAtencao = veredictos.find(v =>
                  (v.verdict === 'NON_AUTORISE' || v.verdict === 'A_VERIFIER')
                  && v.momento
                  && (agora - new Date(v.momento).getTime()) <= JANELA_ATENCAO_MS);
            return precisaAtencao || veredictos[0];
      }, [veredictos]);

      // Quantas passagens de aluno vieram DEPOIS da que está na faixa: sem isto,
      // o AED não sabe que a fila andou enquanto o alerta ficou parado.
      const passagensDepois = React.useMemo(() => {
            if (!emDestaque) return 0;
            const i = veredictos.findIndex(v => v.logId === emDestaque.logId);
            return i > 0 ? i : 0;
      }, [veredictos, emDestaque]);

      // Casado por logId: o veredicto pertence À PASSAGEM, e foi julgado na hora
      // dela. Casar por userId poria o veredicto de agora numa linha de horas
      // atrás.
      const veredictoPorLog = React.useMemo(() => {
            const m = {};
            (veredictos || []).forEach(v => { if (v && v.logId != null) m[v.logId] = v; });
            return m;
      }, [veredictos]);

      const pointLogs = React.useMemo(() => {
            return accessLogs
                  .filter(log => log.pointId === point.id)
                  .sort((a, b) => safeDateParse(b.timestamp) - safeDateParse(a.timestamp));
      }, [accessLogs, point.id]);

      const handleSelectUser = (user) => {
            onProcess(user.id, point.id);
            setSearchQuery('');
            setSearchResults([]);
            if (searchRef.current) searchRef.current.focus();
      };

      const colors = CATEGORY_COLORS[point.category];

      // Quantas das linhas em tela são REPETIÇÃO (posto fixo ou já presente).
      // Só faz sentido quando o botão está ligado — desligado, o servidor nem
      // as mandou, e o número seria sempre zero.
      const repeticoesEmTela = React.useMemo(
            () => window.MagboPostoFixo ? window.MagboPostoFixo.contarRepeticoes(pointLogs) : 0,
            [pointLogs]
      );

      return (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fade-in">
                  {/* Active Timers (Biblioteca / Enfermaria) */}
                  {isEspecial(point.id) && (
                        <ActiveTimers activeTimers={activeTimers} pointId={point.id} />
                  )}

                  {/* A FAIXA: a última saída de aluno, grande, sem procurar. */}
                  {ehPortao && emDestaque && (
                        <RegimeVerdictBanner v={emDestaque} passagensDepois={passagensDepois} />
                  )}
                  {/* A ausência de faixa não pode significar duas coisas. */}
                  {ehPortao && falhouRegime && (
                        <p className="text-xs font-bold text-warning-600 bg-warning-50 border border-warning-500 rounded-xl px-3 py-2 mb-3">
                              {t('regime.portao.indisponivel')}
                        </p>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* LEFT PANEL — Action */}
                        <div className="lg:col-span-5">
                              <div className="bg-white rounded-2xl shadow-sm border border-soft-200 overflow-hidden">
                                    {/* Search Header */}
                                    <div className={`${colors.bg} p-5`}>
                                          <div className="flex items-center gap-3 mb-4">
                                                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                                                      <LucideIcon name={point.icon} size={22} className="text-white" />
                                                </div>
                                                <div>
                                                      <h3 className="text-lg font-bold text-white">{point.nome}</h3>
                                                      <p className="text-xs text-white/70">{point.description}</p>
                                                </div>
                                          </div>
                                          <div className="relative">
                                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                                      <LucideIcon name="scan-line" size={20} className="text-slate-400" />
                                                </div>
                                                <input
                                                      ref={searchRef}
                                                      type="text"
                                                      value={searchQuery}
                                                      onChange={(e) => { setSearchQuery(e.target.value); setSearchResults([]); }}
                                                      onKeyDown={handleKeyDown}
                                                      placeholder={t('setor.busca')}
                                                      className="w-full pl-12 pr-4 py-3.5 bg-white rounded-xl text-sm font-medium text-navy-500 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-white/50 shadow-lg animate-pulse-glow"
                                                />
                                                {searchQuery && (
                                                      <button
                                                            onClick={() => { setSearchQuery(''); setSearchResults([]); searchRef.current?.focus(); }}
                                                            className="absolute inset-y-0 right-0 pr-4 flex items-center"
                                                      >
                                                            <LucideIcon name="x-circle" size={18} className="text-slate-400 hover:text-slate-600" />
                                                      </button>
                                                )}
                                          </div>
                                    </div>

                                    {/* Search Results */}
                                    <div className="max-h-[calc(100vh-380px)] overflow-y-auto">
                                          {/* Loading spinner */}
                                          {isSearching && (
                                                <div className="p-6 text-center">
                                                      <div className="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                                                      <p className="text-xs text-slate-400">{t('setor.buscando')}</p>
                                                </div>
                                          )}
                                          {!isSearching && searchQuery.trim() && displayResults.length === 0 && (
                                                <div className="p-8 text-center">
                                                      <LucideIcon name="search-x" size={40} className="text-slate-300 mx-auto mb-3" />
                                                      <p className="text-sm text-slate-400">{t('setor.sem.resultado')}{' '}"{searchQuery}"</p>
                                                </div>
                                          )}
                                          {!isSearching && displayResults.map((user, idx) => {
                                                const tipoInfo = TIPO_LABELS[user.tipo] || TIPO_LABEL_FALLBACK;
                                                const tipoRotulo = window.MagboI18n.tEnum('tipo', user.tipo || 'DESCONHECIDO');
                                                return (
                                                      <button
                                                            key={user.id}
                                                            onClick={() => handleSelectUser(user)}
                                                            className="w-full flex items-center gap-4 p-4 hover:bg-soft-50 border-b border-soft-100 transition-colors text-left group animate-fade-in"
                                                            style={{ animationDelay: `${idx * 0.05}s` }}
                                                      >
                                                            <PersonPhoto userId={user.id} nome={user.nome} fotoUrl={user.foto_url}
                                                                  className="w-12 h-12 rounded-xl shadow-sm flex-shrink-0 object-cover" />
                                                            <div className="flex-1 min-w-0">
                                                                  <p className="text-sm font-bold text-navy-500 truncate">{user.nome}</p>
                                                                  <div className="flex items-center gap-2 mt-1">
                                                                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${tipoInfo.color} ${tipoInfo.textColor}`}>
                                                                              {tipoRotulo}
                                                                        </span>
                                                                        {user.turma && (
                                                                              <span className="text-xs text-slate-400">{user.turma}</span>
                                                                        )}
                                                                  </div>
                                                            </div>
                                                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                                  <LucideIcon name="log-in" size={16} className="text-accent-500" />
                                                            </div>
                                                      </button>
                                                );
                                          })}
                                          {!searchQuery.trim() && (
                                                <div className="p-10 text-center">
                                                      <div className="w-16 h-16 rounded-2xl bg-soft-100 flex items-center justify-center mx-auto mb-4">
                                                            <LucideIcon name="scan-line" size={32} className="text-slate-300" />
                                                      </div>
                                                      <p className="text-sm font-semibold text-slate-400 mb-1">{t('setor.aguardando')}</p>
                                                      <p className="text-xs text-slate-300">{t('setor.aguardando.dica')}</p>
                                                </div>
                                          )}
                                    </div>
                              </div>
                        </div>

                        {/* RIGHT PANEL — Monitor */}
                        <div className="lg:col-span-7">
                              <div className="bg-white rounded-2xl shadow-sm border border-soft-200 overflow-hidden">
                                    <div className="px-5 py-4 border-b border-soft-100 flex items-center justify-between gap-3">
                                          <div className="flex items-center gap-2">
                                                <LucideIcon name="radio" size={18} className="text-accent-500" />
                                                <h3 className="text-sm font-bold text-navy-500 uppercase tracking-wider">{t('setor.ultimos')}</h3>
                                          </div>
                                          <div className="flex items-center gap-2">
                                                {/* Posto fixo: a repetição do dia de quem TRABALHA neste
                                                    ponto sai da lista por padrão. O botão existe porque
                                                    esconder sem dizer é o mesmo que apagar aos olhos de
                                                    quem opera — e nada aqui é apagado. */}
                                                {onToggleRepeticoes && (
                                                      <label
                                                            title={t('setor.repeticoes.ajuda')}
                                                            className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full cursor-pointer transition-colors ${incluirRepeticoes ? 'bg-accent-50 text-accent-700 border border-accent-200' : 'bg-soft-100 text-slate-500 border border-transparent hover:bg-soft-200'}`}
                                                      >
                                                            <input
                                                                  type="checkbox"
                                                                  checked={incluirRepeticoes}
                                                                  onChange={(e) => onToggleRepeticoes(e.target.checked)}
                                                                  className="w-3 h-3 rounded accent-accent-500"
                                                            />
                                                            {t('setor.repeticoes')}
                                                            {incluirRepeticoes && repeticoesEmTela > 0 && (
                                                                  <span className="tabular-nums">({repeticoesEmTela})</span>
                                                            )}
                                                      </label>
                                                )}
                                                <span className="text-xs font-medium text-slate-400 bg-soft-100 px-3 py-1 rounded-full whitespace-nowrap">
                                                      {pointLogs.length} {t('setor.acessos24h')}
                                                </span>
                                          </div>
                                    </div>

                                    <div ref={logListRef} className="max-h-[calc(100vh-320px)] overflow-y-auto">
                                          {pointLogs.length === 0 && (
                                                <div className="p-12 text-center">
                                                      <div className="w-16 h-16 rounded-2xl bg-soft-100 flex items-center justify-center mx-auto mb-4">
                                                            <LucideIcon name="clipboard-list" size={32} className="text-slate-300" />
                                                      </div>
                                                      <p className="text-sm font-semibold text-slate-400 mb-1">{t('setor.sem.registro')}</p>
                                                      <p className="text-xs text-slate-300">{t('setor.sem.registro.dica')}</p>
                                                </div>
                                          )}
                                          {pointLogs.slice(0, 50).map((log, idx) => {
                                                const user = (window.userCache?.byId(log.userId)) || null;
                                                // ⚠️ ERA `if (!user) return null` — a passagem DESAPARECIA
                                                // da tela quando a pessoa não estava no cache (cache ainda
                                                // carregando, ou cadastro removido). Mesma família da
                                                // sub-reportagem do Journal de 03/08: a tela parece
                                                // funcionar e mostra menos do que aconteceu, que é pior
                                                // que mostrar uma linha sem nome — o operador não tem como
                                                // desconfiar do que não vê. A linha agora aparece sempre;
                                                // quem falta é o NOME, e ele é dito em palavras.
                                                const quem = window.MagboIdentity.resolver(
                                                      { pessoa: user, userId: log.userId }, { lang: 'fr' });
                                                const tipoInfo = (user && TIPO_LABELS[user.tipo]) || TIPO_LABEL_FALLBACK;
                                                const tipoRotulo = window.MagboI18n.tEnum('tipo', (user && user.tipo) || 'DESCONHECIDO');
                                                const isEntrada = log.status === 'ENTRADA';
                                                const time = new Date(safeDateParse(log.timestamp));
                                                // Só aparece quando o operador ligou o botão — e aí precisa
                                                // ficar claro POR QUE aquela linha voltou, senão ela se
                                                // confunde com uma passagem comum.
                                                const ehRepeticao = window.MagboPostoFixo
                                                      ? window.MagboPostoFixo.ehRepeticao(log) : false;
                                                const rotuloRepeticao = window.MagboPostoFixo
                                                      ? window.MagboPostoFixo.rotuloDaFlag(log && log.flag) : '';
                                                return (
                                                      <div
                                                            key={log.id}
                                                            className={`flex items-center gap-4 px-5 py-3.5 border-b border-soft-50 hover:bg-soft-50/50 transition-colors animate-slide-in-right ${ehRepeticao ? 'bg-soft-50/60' : ''}`}
                                                            style={{ animationDelay: `${idx * 0.03}s` }}
                                                      >
                                                            <div className="relative flex-shrink-0">
                                                                  <PersonPhoto userId={log.userId} nome={quem.nome} fotoUrl={user && user.foto_url}
                                                                        className="w-11 h-11 rounded-xl shadow-sm object-cover" />
                                                                  <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${isEntrada ? 'bg-success-500' : 'bg-danger-500'}`}>
                                                                        <LucideIcon name={isEntrada ? 'arrow-down-left' : 'arrow-up-right'} size={10} className="text-white" />
                                                                  </span>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                  <p className={`text-sm font-bold truncate ${quem.reconhecido ? 'text-navy-500' : 'text-slate-500 italic'}`}>
                                                                        {quem.nome}
                                                                  </p>
                                                                  <div className="flex items-center gap-2 mt-0.5">
                                                                        {user && (
                                                                              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${tipoInfo.color} ${tipoInfo.textColor}`}>
                                                                                    {tipoRotulo}
                                                                              </span>
                                                                        )}
                                                                        {user && user.turma && (
                                                                              <span className="text-xs text-slate-400">{user.turma}</span>
                                                                        )}
                                                                        {/* A pastilha do regime, na própria linha.
                                                                            Casada por logId: o veredicto pertence a
                                                                            ESTA passagem e foi julgado na hora dela. */}
                                                                        {veredictoPorLog[log.id] && (
                                                                              <RegimeChip
                                                                                    verdict={veredictoPorLog[log.id].verdict}
                                                                                    regimeSortie={veredictoPorLog[log.id].regimeSortie} />
                                                                        )}
                                                                        {/* Matrícula só quando o nome falta: é o
                                                                            único apoio que sobra para identificar
                                                                            a passagem depois. */}
                                                                        {!quem.reconhecido && quem.matricula && (
                                                                              <span className="text-xs font-mono text-slate-400">{quem.matricula}</span>
                                                                        )}
                                                                        {ehRepeticao && (
                                                                              <span
                                                                                    title={t('setor.repeticao.etiqueta')}
                                                                                    className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-600"
                                                                              >
                                                                                    {rotuloRepeticao}
                                                                              </span>
                                                                        )}
                                                                  </div>
                                                            </div>
                                                            <div className="flex-shrink-0 text-right">
                                                                  <p className="text-sm font-bold font-mono text-navy-500">{formatTime(time)}</p>
                                                                  <span className={`inline-flex items-center gap-1 text-xs font-semibold mt-0.5 px-2 py-0.5 rounded-full ${isEntrada ? 'text-success-600 bg-success-50' : 'text-danger-600 bg-danger-50'}`}>
                                                                        {isEntrada ? t('acao.entrada.emoji') : t('acao.saida.emoji')}
                                                                  </span>
                                                            </div>
                                                            {log.duration && (
                                                                  <div className="flex-shrink-0 ml-1">
                                                                        <span className="text-xs font-mono font-semibold text-warning-600 bg-warning-50 px-2 py-1 rounded-lg">
                                                                              ⏱ {formatDuration(log.duration)}
                                                                        </span>
                                                                  </div>
                                                            )}
                                                      </div>
                                                );
                                          })}
                                    </div>
                              </div>
                        </div>
                  </div>
            </div>
      );
}
