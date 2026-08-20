// =====================================================================
// DENIED ATTEMPTS FEED — Componente reutilizável
// =====================================================================
// Feed genérico de tentativas negadas (Cantina / Portaria)

function DeniedAttemptsFeed({ fetchFn, pollingMs = 5000, title, emptyMessage }) {
      const [attempts, setAttempts] = React.useState([]);
      const t = useI18n();
      // Datas e horas seguem o idioma da tela, não um país cravado.
      const locale = useLocale();
      const [loading, setLoading] = React.useState(true);
      const [error, setError] = React.useState(false);
      // F7a — destaque + som para itens novos entre polls
      const [newIds, setNewIds] = React.useState(() => new Set());
      const [soundOn, setSoundOn] = React.useState(() => localStorage.getItem('magbo_feed_sound') !== 'off');
      const knownIdsRef = React.useRef(null); // null = primeira carga ainda não aconteceu
      const soundOnRef = React.useRef(soundOn);
      React.useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

      React.useEffect(() => {
            let active = true;
            const load = async () => {
                  try {
                        const data = await fetchFn();
                        if (active) {
                              const list = Array.isArray(data) ? data : [];
                              // F7a: detectar itens novos comparando ids com o poll anterior
                              // (knownIdsRef null na primeira carga → nunca dispara no load inicial)
                              if (knownIdsRef.current !== null) {
                                    const fresh = list.filter(a => !knownIdsRef.current.has(a.id)).map(a => a.id);
                                    if (fresh.length > 0) {
                                          setNewIds(prev => new Set([...prev, ...fresh]));
                                          if (soundOnRef.current) window.playDeniedFeedBeep?.(); // 1 bipe por lote
                                          setTimeout(() => {
                                                if (!active) return;
                                                setNewIds(prev => {
                                                      const next = new Set(prev);
                                                      fresh.forEach(id => next.delete(id));
                                                      return next;
                                                });
                                          }, 8000);
                                    }
                              }
                              knownIdsRef.current = new Set(list.map(a => a.id));
                              setAttempts(list);
                              setError(false);
                        }
                  } catch (err) {
                        if (active) setError(true);
                  } finally {
                        if (active) setLoading(false);
                  }
            };

            load();
            const interval = setInterval(load, pollingMs);
            return () => {
                  active = false;
                  clearInterval(interval);
            };
      }, [fetchFn, pollingMs]);

      /**
       * Hora, e a DATA quando não é hoje.
       *
       * ⚠️ Este feed NÃO tem limite de tempo no Rapport Général: é
       * `getAllAttempts` com `?size=50` e nenhuma janela — o CLAUDE.md chama-o
       * de «histórico (últimos 50)». Numa semana calma esses 50 atravessam
       * vários dias, e todos apareciam como «14:32:05» seco, sem nada a
       * distingui-los. (Nos feeds da cantina e do portão a janela é de 12 h e
       * a data quase nunca aparece — o custo é zero e a regra é uma só.)
       *
       * ⚠️ E a hora estava cravada em 'pt-BR' numa interface francesa. Não se
       * via porque pt-BR e fr-FR imprimem HH:mm:ss igual — mas a data NÃO é
       * igual em toda a parte, e o cravado passaria despercebido outra vez.
       */
      const formatQuando = (isoString) => {
            const date = new Date(isoString);
            if (isNaN(date)) return '--:--';
            const hora = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            return ehHoje(date) ? hora : formatDate(date, locale) + ' ' + hora;
      };

      const getReasonBadge = (reason) => {
            // tEnum: rótulo no idioma atual, código cru se o enum for novo.
            // (O mapa antigo era lido de window e NUNCA esteve lá — o feed
            // mostrou códigos crus desde a Fase H sem ninguém notar.)
            const label = window.MagboI18n.tEnum('denial', reason);
            let color = 'bg-slate-100 text-slate-700'; // DEFAULT
            
            switch (reason) {
                  case 'MEAL_NOT_ENTITLED':
                  case 'EXIT_NOT_AUTHORIZED':
                  // Regime 1 saindo no meio da jornada é da mesma família das
                  // outras duas: uma criança no lugar errado. Deixá-lo no cinza
                  // padrão o poria na cor de MISSING_DOOR_MAPPING, que o
                  // operador aprendeu a ler como "coisa de configuração".
                  case 'REGIME_NOT_ALLOWED':
                        color = 'bg-danger-100 text-danger-700';
                        break;
                  // Âmbar, não vermelho: "ninguém preencheu o papel deste aluno"
                  // pede uma ação da Vie Scolaire, não uma do portão.
                  case 'REGIME_UNKNOWN':
                        color = 'bg-warning-100 text-warning-600';
                        break;
                  // ⚠️ REGIME_TO_VERIFY NAO E RECUSA: e o registro de que o MAGBO
                  // nao sabe (falta a grade). Sem um case proprio caia no cinza
                  // padrao — a cor de MISSING_DOOR_MAPPING, que o operador
                  // aprendeu a ler como "coisa de configuracao", e o rastro que
                  // esta entrega criou para responder ao AED chegava a ele
                  // pintado de "ignora isto".
                  case 'REGIME_TO_VERIFY':
                        color = 'bg-accent-500/10 text-accent-700';
                        break;
                  case 'DEVICE_DENIED':
                        color = 'bg-orange-100 text-orange-700';
                        break;
                  case 'OUTSIDE_MEAL_TIME':
                  case 'OUTSIDE_EXIT_WINDOW':
                        color = 'bg-warning-100 text-warning-700';
                        break;
                  case 'UNKNOWN_USER':
                        color = 'bg-slate-200 text-slate-600';
                        break;
                  case 'MISSING_DOOR_MAPPING':
                  case 'USER_INACTIVE':
                        color = 'bg-slate-100 text-slate-500';
                        break;
            }
            
            return (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${color}`}>
                        {label}
                  </span>
            );
      };

      const getMethodBadge = (method) => {
            const label = window.MagboI18n.tEnum('authMethod', method);
            if (method === 'FACE') return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded"><LucideIcon name="scan-face" size={12}/> {label}</span>;
            if (method === 'CARD') return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-lycee-600 bg-lycee-50 px-2 py-0.5 rounded"><LucideIcon name="credit-card" size={12}/> {label}</span>;
            return <span className="text-[11px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded">{label}</span>;
      };

      return (
            <div className="bg-white rounded-2xl border border-danger-200 shadow-sm overflow-hidden flex flex-col h-full">
                  <div className="bg-danger-50 px-4 py-3 border-b border-danger-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                              <LucideIcon name="shield-alert" size={18} className="text-danger-600" />
                              <h3 className="text-sm font-black text-danger-700 uppercase tracking-wide">{title}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                              {/* F7a — toggle de som (preferência do operador, persiste em localStorage) */}
                              <button
                                    onClick={() => setSoundOn(prev => {
                                          const next = !prev;
                                          localStorage.setItem('magbo_feed_sound', next ? 'on' : 'off');
                                          return next;
                                    })}
                                    title={t(soundOn ? 'feed.som.ligado' : 'feed.som.desligado')}
                                    className={`p-1 rounded-lg transition-colors ${soundOn ? 'text-danger-600 hover:bg-danger-100' : 'text-slate-300 hover:bg-slate-100'}`}
                              >
                                    <LucideIcon name={soundOn ? 'volume-2' : 'volume-x'} size={16} />
                              </button>
                              {attempts.length > 0 && (
                                    <span className="bg-danger-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                          {attempts.length}
                                    </span>
                              )}
                        </div>
                  </div>
                  
                  <div className="p-3 flex-1 overflow-y-auto">
                        {loading && attempts.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                                    <LucideIcon name="loader-2" size={20} className="animate-spin mb-2" />
                                    <p className="text-xs">{t('comum.carregando')}</p>
                              </div>
                        ) : error && attempts.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-6 text-danger-400">
                                    <LucideIcon name="alert-circle" size={20} className="mb-2" />
                                    <p className="text-xs">{t('comum.erro.carregar')}</p>
                              </div>
                        ) : attempts.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-6 text-slate-300">
                                    <LucideIcon name="check-circle-2" size={24} className="mb-2 text-success-300" />
                                    <p className="text-xs font-medium">{emptyMessage || t('feed.vazio')}</p>
                              </div>
                        ) : (
                              <div className="space-y-2">
                                    {attempts.map(attempt => {
                                          // ⚠️ ERA `userName = attempt.employeeNoRaw` — o
                                          // identificador CRU. Na portaria isso mostrava
                                          // "CAM:SEM-IDENTIDADE" e "CAM:HID:69205" como se
                                          // fossem nomes de gente, e o operador não tinha o
                                          // que fazer com aquilo. Pior: o backend JÁ manda
                                          // `nome` (o do cadastro quando casou, senão o que
                                          // a câmera leu) — a informação estava ali e a tela
                                          // a ignorava.
                                          const user = attempt.userId
                                                ? window.userCache?.byId(attempt.userId)
                                                : null;
                                          const quem = window.MagboIdentity.resolver({
                                                pessoa: user,
                                                userId: attempt.userId,
                                                employeeNoRaw: attempt.employeeNoRaw,
                                                nome: attempt.nome
                                          }, { lang: window.MagboI18n ? window.MagboI18n.getLang() : 'fr' });

                                          const userName = quem.nome;
                                          const userTurma = user ? user.turma : (attempt.turma || null);
                                          const isUnknown = !quem.reconhecido;
                                          // ⚠️ `attempt.userId` é NULO numa tentativa de desconhecido
                                          // (UNKNOWN_FACE) — e é o caso mais comum deste feed. O
                                          // PersonPhoto trata: sem id não busca, e cai direto nas
                                          // iniciais do nome que o terminal leu.
                                          const photoUrl = user && user.foto_url;

                                          // Nome do ponto, nunca o código seco (pointLabel resolve
                                          // e rotula o desconhecido como "Ponto X").
                                          // ⚠️ O idioma era 'pt' CRAVADO, numa interface francesa. Só não
                                          // se via porque `pointLabel` usa o idioma apenas no rótulo do
                                          // ponto DESCONHECIDO («Ponto X» contra «Point X») — que é
                                          // justamente a linha que aparece quando algo corre mal.
                                          const pointName = pointLabel(attempt.pointId);

                                          const isNew = newIds.has(attempt.id); // F7a — destaque ~8s

                                          return (
                                                <div key={attempt.id} className={`flex gap-3 p-2 rounded-xl border transition-colors ${isNew ? 'border-danger-400 bg-danger-50 ring-2 ring-danger-300 animate-pulse' : 'border-danger-100 bg-white hover:bg-danger-50/50'}`}>
                                                      <PersonPhoto userId={attempt.userId} nome={quem.nome} fotoUrl={photoUrl} alt="" className="w-10 h-10 rounded-lg flex-shrink-0 border border-slate-200 object-cover" />
                                                      <div className="flex-1 min-w-0">
                                                            <div className="flex items-start justify-between gap-2">
                                                                  <p className={`text-sm font-bold truncate ${isUnknown ? 'text-slate-500 italic' : 'text-navy-600'}`}>
                                                                        {userName}
                                                                        {quem.etiqueta && <span className="ml-1 text-[10px] font-normal text-slate-400">({quem.etiqueta})</span>}
                                                                  </p>
                                                                  {/* A matrícula desce para informação
                                                                      SECUNDÁRIA — presente para quem
                                                                      precisa dela, nunca no lugar do nome. */}
                                                                  {quem.matricula && (
                                                                        <p className="text-[10px] font-mono text-slate-400 leading-tight">{quem.matricula}</p>
                                                                  )}
                                                                  <span className="text-[10px] font-mono font-medium text-slate-400 flex-shrink-0">
                                                                        {formatQuando(attempt.timestamp)}
                                                                  </span>
                                                            </div>
                                                            
                                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                                  {userTurma && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 rounded">{userTurma}</span>}
                                                                  <span className="text-[10px] text-slate-400 flex items-center gap-0.5" title={pointName}>
                                                                        <LucideIcon name="map-pin" size={10} />
                                                                        <span className="truncate max-w-[80px]">{pointName}</span>
                                                                  </span>
                                                                  {getMethodBadge(attempt.authMethod)}
                                                            </div>
                                                            
                                                            <div className="mt-1.5">
                                                                  {getReasonBadge(attempt.denialReason)}
                                                            </div>
                                                      </div>
                                                </div>
                                          );
                                    })}
                              </div>
                        )}
                  </div>
            </div>
      );
}
