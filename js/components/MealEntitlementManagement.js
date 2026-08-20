// =====================================================================
// MEAL ENTITLEMENT MANAGEMENT
// =====================================================================

function MealEntitlementManagement() {
      const t = useI18n();
      const locale = useLocale();
      const [searchTerm, setSearchTerm] = React.useState('');
      const [filterTurma, setFilterTurma] = React.useState('');
      const [filterStatus, setFilterStatus] = React.useState('');
      const [users, setUsers] = React.useState([]);
      const [entitlements, setEntitlements] = React.useState({});
      const [summary, setSummary] = React.useState(null);
      const [loading, setLoading] = React.useState(true);
      const [error, setError] = React.useState('');
      const [selectedUserHistory, setSelectedUserHistory] = React.useState(null);
      
      // Cantina: ADMIN OU operador com MEAL_ENTITLEMENT_WRITE (mesmo gate do backend
      // no PUT/bulk). Decisão do Sam: o gerente da cantina é OPERATOR e gere os direitos.
      const canEdit = window.auth?.isAdmin() || window.auth?.hasPermission?.('MEAL_ENTITLEMENT_WRITE') || false;

      // Carregar cache de usuários
      React.useEffect(() => {
            const handleUserCache = () => {
                  // Triggers re-render if needed, but we pull directly from window.userCache.all()
            };
            window.addEventListener('user-cache-updated', handleUserCache);
            return () => window.removeEventListener('user-cache-updated', handleUserCache);
      }, []);

      const loadData = async () => {
            setLoading(true);
            setError('');
            try {
                  const data = await window.api.getMealEntitlements({ 
                        q: searchTerm, 
                        turma: filterTurma, 
                        status: filterStatus,
                        size: 100 // Limite de visualização para não travar UI, ou implementamos paginação simples
                  });
                  
                  const entMap = {};
                  data.content.forEach(ent => {
                        entMap[ent.userId] = ent;
                  });
                  setEntitlements(entMap);

                  const sum = await window.api.getMealEntitlementSummary();
                  setSummary(sum);
            } catch (err) {
                  setError(err.message || t('cantina.gestao.erro.carregar'));
            } finally {
                  setLoading(false);
            }
      };

      React.useEffect(() => {
            // Debounce na busca
            const delay = setTimeout(() => {
                  loadData();
            }, 500);
            return () => clearTimeout(delay);
      }, [searchTerm, filterTurma, filterStatus]);

      const handleToggleStatus = async (userId, currentEntitlement) => {
            if (!canEdit) {
                  alert(t('cantina.gestao.sem.permissao'));
                  return;
            }

            // O PUT substitui a linha INTEIRA (o upsert grava os 4 campos sem
            // condição). Antes daqui saía `validUntil: null` fixo e nenhum
            // validFrom, então cada clique no badge apagava a vigência do aluno
            // em silêncio: quem estava autorizado só até o fim do semestre
            // passava a valer para sempre. A montagem vive em
            // js/utils/mealEntitlement.js, com teste.
            const payload = window.MagboMealEntitlement.buildTogglePayload(
                  currentEntitlement, t('cantina.gestao.motivo.ui'));

            try {
                  const updated = await window.api.putMealEntitlement(userId, payload);
                  if (updated) {
                        setEntitlements(prev => ({ ...prev, [userId]: updated }));
                        const sum = await window.api.getMealEntitlementSummary();
                        setSummary(sum);
                  } else {
                        // 200 sem corpo (contrato do upsert): NUNCA injetar null no
                        // estado — recarregar a verdade do servidor.
                        await loadData();
                  }
            } catch (err) {
                  alert(err.message);
            }
      };

      // ─────────────────────────────────────────────────────────────
      // IMPORTAÇÃO EXCEL — DUAS PASSADAS (molde do import do HikCentral)
      // ─────────────────────────────────────────────────────────────
      // O import antigo gravava DIRETO, sem conferência: lia a planilha,
      // mandava e avisava depois. Este arquivo decide quem almoça, e com
      // meal-pending=DENY em produção a ausência de linha já é recusa —
      // escrever sem mostrar antes o que muda é apostar o serviço do dia numa
      // planilha que ninguém leu.
      const fileInputRef = React.useRef(null);
      const [importRows, setImportRows] = React.useState([]);
      const [importPlan, setImportPlan] = React.useState(null);
      const [importando, setImportando] = React.useState(false);

      const handleImportClick = () => {
            if (fileInputRef.current) fileInputRef.current.click();
      };

      const limparImport = () => {
            setImportRows([]);
            setImportPlan(null);
      };

      const handleFileChange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            setImportando(true);
            try {
                  if (!window.XLSX) throw new Error(t('cantina.gestao.xlsx.ausente'));

                  const data = await file.arrayBuffer();
                  const workbook = window.XLSX.read(data, { type: 'array' });
                  const sheet = workbook.Sheets[workbook.SheetNames[0]];

                  // Opções de leitura e mapeamento das colunas vivem em
                  // js/utils/mealSheet.js (que reusa os helpers de cabeçalho do
                  // hikcentralSheet): é a parte que erra em SILÊNCIO se a
                  // planilha mudar — coluna renomeada, acento diferente,
                  // matrícula lida como número.
                  const json = window.XLSX.utils.sheet_to_json(sheet, window.MagboMealSheet.sheetOptions());
                  const rows = window.MagboMealSheet.mapRows(json);

                  if (rows.length === 0) {
                        throw new Error(
                              t('cantina.gestao.import.nada'));
                  }

                  // ⚠️ AS LINHAS COM DATA ILEGÍVEL NÃO VÃO AO SERVIDOR — e não
                  // porque sejam menos importantes, mas porque o Jackson recusa
                  // o CORPO INTEIRO quando uma única data não é ISO. Era esse o
                  // defeito: uma célula `09/01/2026` derrubava a planilha toda
                  // com 400, e a tela dizia "Session expirée". Agora elas viram
                  // CONFLITO da própria linha, com o número dela, e as outras
                  // seguem. (21/08/2026.)
                  const comData = rows.filter(r => !r.erroData);
                  const semData = rows.filter(r => r.erroData);

                  setImportRows(comData);
                  setImportPlan(null);
                  // Simula ANTES de gravar. Nada é escrito aqui.
                  const plano = await window.api.previewMealEntitlementImport(comData);

                  // Junta os conflitos locais ao plano do servidor, na MESMA
                  // forma, para a tela não ter dois vocabulários de erro.
                  if (semData.length) {
                        const linhasConflito = semData.map(r => ({
                              linha: r.linha,
                              userId: r.userId,
                              nome: null,
                              turma: null,
                              statusAtual: null,
                              statusNovo: null,
                              acao: 'CONFLITO',
                              detalhe: t('cantina.import.data.ilegivel', {
                                    valor: r.erroData.map(e => e.valor).join(', ')
                              })
                        }));
                        plano.linhas = linhasConflito.concat(plano.linhas || []);
                        plano.totais = Object.assign({}, plano.totais);
                        plano.totais.CONFLITO = (plano.totais.CONFLITO || 0) + semData.length;
                        plano.totais.TOTAL = (plano.totais.TOTAL || 0) + semData.length;
                  }
                  setImportPlan(plano);
            } catch (err) {
                  limparImport();
                  alert(t('cantina.gestao.import.erro') + ' ' + err.message);
            } finally {
                  setImportando(false);
                  if (fileInputRef.current) fileInputRef.current.value = '';
            }
      };

      const confirmarImport = async () => {
            if (!importRows.length || importando) return;
            setImportando(true);
            try {
                  // O plano é REFEITO no servidor. O que está na tela foi uma
                  // conferência, não uma ordem de serviço: entre olhar e
                  // confirmar alguém pode ter mexido num direito pela tela.
                  const relatorio = await window.api.applyMealEntitlementImport(importRows);
                  setImportPlan(relatorio);
                  // ⚠️ A variável local chamava-se `t` e SOMBREAVA a função de
                  // tradução — qualquer t('chave') aqui dentro viraria
                  // TypeError. Renomeada junto com a migração do i18n.
                  const totais = relatorio.totais || {};
                  alert(
                        t('cantina.gestao.aplicado.titulo') + '\n\n'
                        + t('cantina.gestao.aplicado.criados', { n: totais.CRIAR || 0 }) + '\n'
                        + t('cantina.gestao.aplicado.atualizados', { n: totais.ATUALIZAR || 0 }) + '\n'
                        + t('cantina.gestao.aplicado.ignorados', { n: totais.PULAR || 0 }) + '\n'
                        + t('cantina.gestao.aplicado.conflitos', { n: totais.CONFLITO || 0 }));
                  loadData();
            } catch (err) {
                  alert(t('cantina.gestao.import.nao.aplicada') + ' ' + err.message);
            } finally {
                  setImportando(false);
            }
      };

      /** Rótulos das quatro ações — mesmos nomes da aba HikCentral. */
      const ACOES_REFEICAO = {
            CRIAR: { label: null, chave: 'plano.criar', cor: 'text-success-700 bg-success-100' },
            ATUALIZAR: { label: null, chave: 'plano.atualizar', cor: 'text-accent-700 bg-accent-100' },
            PULAR: { label: null, chave: 'plano.ignorar', cor: 'text-slate-600 bg-soft-100' },
            CONFLITO: { label: null, chave: 'plano.conflito', cor: 'text-danger-700 bg-danger-100' }
      };

      // Mesma máquina de estados da aba HikCentral (js/utils/importPlan.js).
      const plano = window.MagboImportPlan.planState(importPlan);

      // Se API já retornou algo, usamos as chaves da API para ter a página correta,
      // ou misturamos com cache local para mostrar usuários que ainda não tem registro de entitlement (fallback para default).
      // Para manter simples e robusto: exibimos a lista da API, enriquecida com o userCache.
      const apiUserIds = Object.keys(entitlements);
      const mergedList = apiUserIds.map(uid => {
            const ent = entitlements[uid];
            const cachedUser = window.userCache?.byId(uid) || { nome: uid, turma: 'Inconnu', foto_url: window.localAvatar(uid) };
            return {
                  ...cachedUser,
                  userId: uid, // explícito: o userCache usa `id`, não `userId` (toggle/histórico/key dependem disto)
                  entitlement: ent
            };
      });

      // Se não há pesquisa ativa na API (ou é vazia), e temos cache local:
      // O ideal seria que a API retornasse TODOS os alunos daquela turma, mesmo sem entitlement.
      // O backend meal-entitlements/ faz join com UserEntity? Se sim, a API já traz.
      // Vamos assumir que `mergedList` é a fonte da verdade da view, 
      // pois os filtros de turma e searchTerm são passados para a API.

      return (
            <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-fade-in">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                              <h1 className="text-2xl font-black text-navy-800">{t('cantina.gestao.titulo')}</h1>
                              <p className="text-sm text-slate-500">{t('cantina.gestao.subtitulo')}</p>
                        </div>

                        {canEdit && (
                              <div className="flex gap-2">
                                    <input type="file" accept=".xlsx, .xls" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
                                    <button onClick={handleImportClick} disabled={importando} className="btn bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2">
                                          <LucideIcon name={importando ? "loader-2" : "upload"} size={18} className={importando ? "animate-spin" : ""} />
                                          {importando ? t('cantina.gestao.lendo') : t('cantina.gestao.importar')}
                                    </button>
                              </div>
                        )}
                  </div>

                  {/* ── Importação: colunas esperadas + simulação ──────────── */}
                  {canEdit && (
                        <div className="bg-soft-50 p-6 rounded-2xl border border-soft-200 space-y-4">
                              <div>
                                    <h3 className="text-lg font-bold text-navy-500 mb-2">{t('cantina.gestao.import.titulo')}</h3>
                                    <p className="text-sm text-slate-500 mb-3">
                                          {t('cantina.gestao.import.regra.a')} <strong>{t('cantina.gestao.import.regra.b')}</strong>{t('cantina.gestao.import.regra.c')}
                                          <strong> {t('cantina.gestao.import.regra.d')}</strong> {t('cantina.gestao.import.regra.e')}
                                    </p>
                                    <div className="overflow-x-auto">
                                          <table className="w-full text-xs">
                                                <thead>
                                                      <tr className="text-left text-slate-400 uppercase font-bold">
                                                            <th className="py-1 pr-3">{t('cantina.gestao.col.coluna')}</th>
                                                            <th className="py-1 pr-3">{t('cantina.gestao.col.obrigatoria')}</th>
                                                            <th className="py-1">{t('cantina.gestao.col.aceitos')}</th>
                                                      </tr>
                                                </thead>
                                                <tbody>
                                                      {window.MagboMealSheet.documentacaoDeColunas().map(c => (
                                                            <tr key={c.campo} className="border-t border-soft-200">
                                                                  {/* O PESO DA FONTE É A INFORMAÇÃO: obrigatória
                                                                em negrito e escura, opcional em peso normal.
                                                                Antes as duas vinham em negrito e só a coluna
                                                                ao lado as separava. */}
                                                            <td className={`py-1.5 pr-3 whitespace-nowrap ${c.obrigatorio
                                                                  ? 'font-bold text-navy-500'
                                                                  : 'font-normal text-slate-500'}`}>{c.campo}</td>
                                                                  <td className="py-1.5 pr-3">
                                                                        {c.obrigatorio
                                                                              ? <span className="text-danger-700 font-bold">{t('comum.sim')}</span>
                                                                              : <span className="text-slate-400">{t('comum.nao')}</span>}
                                                                  </td>
                                                                  <td className="py-1.5 text-slate-600">
                                                                        <code className="bg-soft-100 px-1.5 py-0.5 rounded">{c.aceitos.join(' · ')}</code>
                                                                  </td>
                                                            </tr>
                                                      ))}
                                                </tbody>
                                          </table>
                                    </div>
                                    <ul className="text-xs text-slate-500 space-y-1 mt-3 list-disc pl-5">
                                          <li><strong>{t('comum.status')}</strong> {t('cantina.gestao.nota.status')}
                                                <em> Autorizado · Não autorizado · Autorisé · Non autorisé · AUTHORIZED · NOT_AUTHORIZED</em>.</li>
                                          <li><strong>{t('cantina.gestao.nota.ignorado.a')}</strong>{t('cantina.gestao.nota.ignorado.b')}</li>
                                          <li>{t('cantina.gestao.nota.sem.mudanca.a')} <em>{t('plano.ignorar')}</em>.</li>
                                          <li><strong>{t('cantina.gestao.nota.dry.run')}</strong></li>
                                    </ul>
                                    <p className="text-xs text-danger-700 bg-danger-50 border border-danger-200 rounded-xl px-3 py-2 mt-3">
                                          ⚠️ {t('cantina.gestao.nota.zeros.a')} <strong>{t('cantina.gestao.nota.zeros.b')}</strong> (0001764). {t('cantina.gestao.nota.zeros.c')}
                                          <strong> {t('cantina.gestao.nota.zeros.d')}</strong> {t('cantina.gestao.nota.zeros.e')}
                                    </p>
                              </div>

                              {plano.estado !== 'sem-arquivo' && (
                                    <div className="bg-white border border-soft-200 rounded-2xl p-4 space-y-4">
                                          <div className="flex items-center justify-between">
                                                <p className="font-bold text-navy-500 text-sm">{t(plano.titulo)}</p>
                                                <span className="text-xs text-slate-400">{t('plano.linhas', { n: plano.total })}</span>
                                          </div>

                                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                {Object.keys(ACOES_REFEICAO).map(k => (
                                                      <div key={k} className="rounded-xl border border-soft-200 p-3 text-center">
                                                            <p className="text-xl font-bold text-navy-500 tabular-nums">{plano.totais[k] || 0}</p>
                                                            <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{t(ACOES_REFEICAO[k].chave)}</p>
                                                      </div>
                                                ))}
                                          </div>

                                          {plano.problemas.length > 0 && (
                                                <ListaLimitada
                                                      titulo={t('cfg.hik.problemas.contagem', { n: plano.problemas.length })}
                                                      total={plano.problemas.length}
                                                >
                                                      {(visiveis) => (
                                                            <table className="w-full text-xs">
                                                                  <tbody>
                                                                        {plano.problemas.slice(0, visiveis).map((l, i) => (
                                                                              <tr key={i} className="border-b border-soft-100 last:border-0 align-top">
                                                                                    <td className="py-1 px-2 font-mono text-slate-400 whitespace-nowrap">L{l.linha}</td>
                                                                                    <td className="py-1 px-2 whitespace-nowrap">
                                                                                          <span className={`px-1.5 py-0.5 rounded font-bold ${ACOES_REFEICAO[l.acao].cor}`}>
                                                                                                {t(ACOES_REFEICAO[l.acao].chave)}
                                                                                          </span>
                                                                                    </td>
                                                                                    <td className="py-1 px-2 font-mono text-slate-500 whitespace-nowrap">{l.userId || '—'}</td>
                                                                                    <td className="py-1 px-2 text-navy-500">{l.nome || '—'}</td>
                                                                                    <td className="py-1 px-2 text-slate-600">{l.detalhe}</td>
                                                                              </tr>
                                                                        ))}
                                                                  </tbody>
                                                            </table>
                                                      )}
                                                </ListaLimitada>
                                          )}

                                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 border-t border-soft-200 pt-3">
                                                <p className="text-xs text-slate-500 sm:flex-1">
                                                      {plano.podeConfirmar
                                                            ? t('cantina.gestao.simulado')
                                                            : t('cantina.gestao.aplicado')}
                                                </p>
                                                <button type="button" onClick={limparImport}
                                                      className="px-4 py-2 rounded-xl bg-soft-100 text-navy-500 text-sm font-bold hover:bg-soft-200">
                                                      {t('acao.descartar')}
                                                </button>
                                                {plano.podeConfirmar && (
                                                      <button
                                                            type="button"
                                                            onClick={confirmarImport}
                                                            disabled={importando}
                                                            className="px-6 py-2 bg-accent-500 text-white font-bold rounded-xl hover:bg-accent-600 transition-colors disabled:opacity-50 truncate"
                                                      >
                                                            {importando ? t('comum.gravando') : t(plano.rotuloConfirmar, plano.confirmarParams)}
                                                      </button>
                                                )}
                                          </div>
                                    </div>
                              )}
                        </div>
                  )}

                  {/* Estatísticas — o DTO do backend usa authorized/notAuthorized/pending/totalStudents */}
                  {summary && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="bg-white p-4 rounded-2xl border border-soft-200 shadow-sm flex flex-col justify-between">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t('cantina.gestao.kpi.autorizados')}</p>
                                    <p className="text-2xl font-black text-success-600 mt-2">{summary.authorized ?? 0}</p>
                              </div>
                              <div className="bg-white p-4 rounded-2xl border border-soft-200 shadow-sm flex flex-col justify-between">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t('cantina.gestao.kpi.nao.autorizados')}</p>
                                    <p className="text-2xl font-black text-danger-600 mt-2">{summary.notAuthorized ?? 0}</p>
                              </div>
                              <div className="bg-white p-4 rounded-2xl border border-soft-200 shadow-sm flex flex-col justify-between">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t('cantina.gestao.kpi.pendentes')}</p>
                                    <p className="text-2xl font-black text-warning-600 mt-2">{summary.pending ?? 0}</p>
                              </div>
                              <div className="bg-white p-4 rounded-2xl border border-soft-200 shadow-sm flex flex-col justify-between">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t('cantina.gestao.kpi.alunos')}</p>
                                    <p className="text-2xl font-black text-navy-600 mt-2">{summary.totalStudents ?? 0}</p>
                              </div>
                        </div>
                  )}

                  {/* Filtros */}
                  <div className="bg-white p-4 rounded-2xl border border-soft-200 shadow-sm flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative">
                              <LucideIcon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input 
                                    type="text" 
                                    placeholder={t('cantina.gestao.busca')} 
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-soft-50 border border-soft-200 rounded-xl focus:ring-2 focus:ring-navy-500 text-sm font-medium"
                              />
                        </div>
                        <div className="w-full md:w-48">
                              <select 
                                    value={filterTurma}
                                    onChange={e => setFilterTurma(e.target.value)}
                                    className="w-full px-4 py-2 bg-soft-50 border border-soft-200 rounded-xl focus:ring-2 focus:ring-navy-500 text-sm font-medium"
                              >
                                    <option value="">{t('cantina.gestao.todas.turmas')}</option>
                                    <option value="A1">A1</option>
                                    <option value="A2">A2</option>
                                    <option value="B1">B1</option>
                                    <option value="B2">B2</option>
                              </select>
                        </div>
                        <div className="w-full md:w-48">
                              <select 
                                    value={filterStatus}
                                    onChange={e => setFilterStatus(e.target.value)}
                                    className="w-full px-4 py-2 bg-soft-50 border border-soft-200 rounded-xl focus:ring-2 focus:ring-navy-500 text-sm font-medium"
                              >
                                    <option value="">{t('cantina.gestao.todos.status')}</option>
                                    <option value="AUTHORIZED">{t('cantina.gestao.status.autorizado')}</option>
                                    <option value="NOT_AUTHORIZED">{t('cantina.gestao.status.nao.autorizado')}</option>
                              </select>
                        </div>
                  </div>

                  {/* Lista */}
                  <div className="bg-white rounded-2xl border border-soft-200 shadow-sm overflow-hidden">
                        {loading ? (
                              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <LucideIcon name="loader-2" size={24} className="animate-spin mb-2" />
                                    <p className="text-sm">{t('cantina.gestao.carregando')}</p>
                              </div>
                        ) : error ? (
                              <div className="flex flex-col items-center justify-center py-12 text-danger-500">
                                    <LucideIcon name="alert-circle" size={32} className="mb-2" />
                                    <p className="text-sm">{error}</p>
                              </div>
                        ) : mergedList.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <LucideIcon name="search-x" size={32} className="mb-2 text-slate-300" />
                                    <p className="text-sm">{t('cantina.gestao.vazio')}</p>
                              </div>
                        ) : (
                              <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                          <thead>
                                                <tr className="bg-soft-50 border-b border-soft-200">
                                                      <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">{t('cantina.gestao.col.aluno')}</th>
                                                      <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">{t('comum.turma')}</th>
                                                      <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">{t('cantina.gestao.col.direito')}</th>
                                                      <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">{t('cantina.gestao.col.modif')}</th>
                                                      <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">{t('saidas.col.acoes')}</th>
                                                </tr>
                                          </thead>
                                          <tbody className="divide-y divide-soft-100">
                                                {mergedList.map(item => {
                                                      const ent = item.entitlement;
                                                      const status = ent?.status || 'PENDING'; // Default: sem dado = En attente (nunca "negado")
                                                      const isAuth = status === 'AUTHORIZED';
                                                      const isPending = status === 'PENDING';
                                                      
                                                      return (
                                                            <tr key={item.userId} className="hover:bg-soft-50/50 transition-colors">
                                                                  <td className="px-6 py-3">
                                                                        <div className="flex items-center gap-3">
                                                                              <img src={item.foto_url} className="w-8 h-8 rounded-full border border-slate-200" />
                                                                              <div>
                                                                                    <div className="text-sm font-bold text-navy-800">{item.nome}</div>
                                                                                    <div className="text-[10px] font-mono text-slate-400">{item.userId}</div>
                                                                              </div>
                                                                        </div>
                                                                  </td>
                                                                  <td className="px-6 py-3">
                                                                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">{item.turma}</span>
                                                                  </td>
                                                                  <td className="px-6 py-3">
                                                                        <button 
                                                                              onClick={() => handleToggleStatus(item.userId, ent)}
                                                                              disabled={!canEdit}
                                                                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                                                                                    isAuth
                                                                                          ? 'bg-success-100 text-success-700 hover:bg-success-200'
                                                                                          : isPending
                                                                                                ? 'bg-warning-100 text-warning-600 hover:opacity-80'
                                                                                                : 'bg-danger-100 text-danger-700 hover:bg-danger-200'
                                                                              } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                        >
                                                                              <div className={`w-1.5 h-1.5 rounded-full ${isAuth ? 'bg-success-500' : isPending ? 'bg-warning-500' : 'bg-danger-500'}`}></div>
                                                                              {window.MagboI18n.tEnum('entitlement', status)}
                                                                        </button>
                                                                  </td>
                                                                  <td className="px-6 py-3">
                                                                        {ent?.updatedAt ? (
                                                                              <div className="text-xs text-slate-500">
                                                                                    {new Date(ent.updatedAt).toLocaleDateString(locale)}
                                                                                    <div className="text-[10px] text-slate-400">{t('cantina.hist.por')} {ent.updatedBy || 'API'}</div>
                                                                              </div>
                                                                        ) : (
                                                                              <span className="text-xs text-slate-400">—</span>
                                                                        )}
                                                                  </td>
                                                                  <td className="px-6 py-3 text-right">
                                                                        <button 
                                                                              onClick={() => setSelectedUserHistory(item.userId)}
                                                                              className="p-1.5 text-slate-400 hover:text-navy-600 hover:bg-soft-100 rounded-lg transition-colors"
                                                                              title={t('cantina.gestao.historico')}
                                                                        >
                                                                              <LucideIcon name="history" size={18} />
                                                                        </button>
                                                                  </td>
                                                            </tr>
                                                      );
                                                })}
                                          </tbody>
                                    </table>
                              </div>
                        )}
                  </div>

                  {selectedUserHistory && (
                        <MealEntitlementHistoryModal 
                              userId={selectedUserHistory} 
                              onClose={() => setSelectedUserHistory(null)} 
                        />
                  )}
            </div>
      );
}
