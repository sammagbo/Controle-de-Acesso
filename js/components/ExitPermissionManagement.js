// =====================================================================
// EXIT PERMISSION MANAGEMENT (Portaria)
// =====================================================================

function ExitPermissionManagement() {
      const [permissions, setPermissions] = React.useState([]);
      const [loading, setLoading] = React.useState(true);
      const [error, setError] = React.useState('');
      const [showModal, setShowModal] = React.useState(false);
      
      // Mesmo gate do backend no POST e no revoke: ADMIN OU EXIT_PERMISSION_WRITE.
      // Antes era isAdmin() || isOperator(), o que errava dos dois lados: um
      // OPERATOR sem o direito via os botões ativos e levava 403, e quem tinha
      // o direito em outro papel ficava com a tela travada sem motivo.
      const canEdit = window.MagboPermissions.canWriteExitPermissions(window.auth);

      const loadPermissions = async () => {
            setLoading(true);
            try {
                  const data = await window.api.getActiveExitPermissions();
                  setPermissions(data);
            } catch (err) {
                  setError(err.message || 'Erro ao carregar permissões.');
            } finally {
                  setLoading(false);
            }
      };

      React.useEffect(() => {
            loadPermissions();
      }, []);

      const handleRevoke = async (id) => {
            if (!confirm('Deseja realmente revogar esta autorização de saída?')) return;
            try {
                  await window.api.revokeExitPermission(id, 'Revogado manualmente pela portaria');
                  loadPermissions();
            } catch (err) {
                  alert(err.message);
            }
      };

      const formatDateTime = (isoString) => {
            if (!isoString) return '—';
            const date = new Date(isoString);
            return isNaN(date) ? '—' : date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      };

      return (
            <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-fade-in">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                              <h1 className="text-2xl font-black text-navy-800">Controle de Saídas</h1>
                              <p className="text-sm text-slate-500">Gerencie as autorizações de saída de alunos.</p>
                        </div>

                        {canEdit && (
                              <button onClick={() => setShowModal(true)} className="btn bg-accent-600 hover:bg-accent-700 text-white flex items-center gap-2 shadow-lg shadow-accent-600/20">
                                    <LucideIcon name="plus" size={18} />
                                    Nova Autorização
                              </button>
                        )}
                  </div>

                  <div className="bg-white rounded-2xl border border-soft-200 shadow-sm overflow-hidden">
                        <div className="bg-soft-50 px-6 py-4 border-b border-soft-200 flex items-center gap-2">
                              <LucideIcon name="door-open" size={18} className="text-accent-600" />
                              <h3 className="text-sm font-bold text-navy-700">Autorizações Ativas</h3>
                        </div>

                        {loading ? (
                              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <LucideIcon name="loader-2" size={24} className="animate-spin mb-2" />
                                    <p className="text-sm">Carregando...</p>
                              </div>
                        ) : error ? (
                              <div className="flex flex-col items-center justify-center py-12 text-danger-500">
                                    <LucideIcon name="alert-circle" size={32} className="mb-2" />
                                    <p className="text-sm">{error}</p>
                              </div>
                        ) : permissions.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <LucideIcon name="shield-check" size={32} className="mb-2 text-slate-300" />
                                    <p className="text-sm">Nenhuma autorização ativa no momento.</p>
                              </div>
                        ) : (
                              <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                          <thead>
                                                <tr className="bg-soft-50 border-b border-soft-200">
                                                      <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Aluno</th>
                                                      <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Tipo</th>
                                                      <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Validade</th>
                                                      <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Responsável / Nota</th>
                                                      <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">Ações</th>
                                                </tr>
                                          </thead>
                                          <tbody className="divide-y divide-soft-100">
                                                {permissions.map(perm => {
                                                      const user = window.userCache?.byId(perm.userId);
                                                      const userName = user ? user.nome : perm.userId;
                                                      const photoUrl = user ? user.foto_url : window.localAvatar(perm.userId);
                                                      const typeLabel = window.EXIT_PERMISSION_TYPE_LABELS?.[perm.type] || perm.type;

                                                      return (
                                                            <tr key={perm.id} className="hover:bg-soft-50/50 transition-colors">
                                                                  <td className="px-6 py-3">
                                                                        <div className="flex items-center gap-3">
                                                                              <img src={photoUrl} className="w-8 h-8 rounded-full border border-slate-200" />
                                                                              <div>
                                                                                    <div className="text-sm font-bold text-navy-800">{userName}</div>
                                                                                    {user && <div className="text-[10px] font-bold text-slate-500">{user.turma}</div>}
                                                                              </div>
                                                                        </div>
                                                                  </td>
                                                                  <td className="px-6 py-3">
                                                                        <span className="text-xs font-bold text-accent-700 bg-accent-100 px-2 py-1 rounded">
                                                                              {typeLabel}
                                                                        </span>
                                                                  </td>
                                                                  <td className="px-6 py-3">
                                                                        <div className="text-xs text-navy-700">
                                                                              {perm.type === 'SINGLE' ? (
                                                                                    <>
                                                                                          <div>De: {formatDateTime(perm.validFrom)}</div>
                                                                                          <div>Até: {formatDateTime(perm.validUntil)}</div>
                                                                                    </>
                                                                              ) : (
                                                                                    <div className="text-slate-500">
                                                                                          {perm.allowedDays?.length > 0 ? `Dias: ${perm.allowedDays.join(', ')}` : 'Sempre'}
                                                                                          <br/>
                                                                                          {perm.startTime} - {perm.endTime}
                                                                                    </div>
                                                                              )}
                                                                        </div>
                                                                  </td>
                                                                  <td className="px-6 py-3">
                                                                        <div className="text-xs font-medium text-slate-700">{perm.reason}</div>
                                                                        {perm.note && <div className="text-[10px] text-slate-500 italic mt-0.5">{perm.note}</div>}
                                                                  </td>
                                                                  <td className="px-6 py-3 text-right">
                                                                        <button 
                                                                              onClick={() => handleRevoke(perm.id)}
                                                                              disabled={!canEdit}
                                                                              className="text-xs font-bold text-danger-600 hover:text-danger-700 bg-danger-50 hover:bg-danger-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                                                                        >
                                                                              Revogar
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

                  {/* Feed de tentativas negadas da portaria (D-H1) — mesmo componente
                      reutilizável da cantina, ligado ao endpoint /gate. Acessos válidos
                      (autorizações) e tentativas negadas ficam visualmente separados. */}
                  <DeniedAttemptsFeed
                        title="Tentatives Refusées — Portail"
                        emptyMessage="Aucune tentative refusée"
                        fetchFn={window.api?.getGateAttempts || (async () => [])}
                        pollingMs={5000}
                  />

                  {showModal && <NewExitPermissionModal onClose={() => setShowModal(false)} onSaved={loadPermissions} />}
            </div>
      );
}

function NewExitPermissionModal({ onClose, onSaved }) {
      const [type, setType] = React.useState('SINGLE');
      const [authorizedBy, setAuthorizedBy] = React.useState('');
      const [notes, setNotes] = React.useState('');

      // ── Escolha do aluno pelo NOME ────────────────────────────────────
      // Havia aqui um campo de matrícula em branco. A Vie Scolaire conhece os
      // alunos pelo nome, e um dígito trocado autorizava a saída da criança
      // errada — sem erro nenhum na tela. A matrícula agora vem de uma
      // ESCOLHA; o payload continua o mesmo (userId = matrícula).
      const [aluno, setAluno] = React.useState(null);
      const [busca, setBusca] = React.useState('');
      const [resultados, setResultados] = React.useState([]);
      const [buscando, setBuscando] = React.useState(false);
      const [erroForm, setErroForm] = React.useState('');

      // Busca remota com debounce de 250ms — padrão do projeto, sobre a base
      // INTEIRA (nunca sobre uma página pré-carregada).
      React.useEffect(() => {
            if (aluno) return;                       // já escolheu: não busca mais
            if (!window.MagboExitPermission.buscaValida(busca)) {
                  setResultados([]);
                  return;
            }
            let vivo = true;
            setBuscando(true);
            const tid = setTimeout(async () => {
                  try {
                        const achados = await window.userCache.searchStudents(busca.trim(), 20);
                        if (vivo) setResultados(window.MagboExitPermission.apenasAlunos(achados));
                  } catch (e) {
                        if (vivo) setResultados([]);
                  } finally {
                        if (vivo) setBuscando(false);
                  }
            }, 250);
            return () => { vivo = false; clearTimeout(tid); };
      }, [busca, aluno]);

      const escolher = (a) => {
            setAluno(a);
            setResultados([]);
            setBusca('');
            setErroForm('');
      };

      const trocarAluno = () => {
            setAluno(null);
            setBusca('');
            setResultados([]);
      };
      
      // Single
      const [validFrom, setValidFrom] = React.useState('');
      const [validUntil, setValidUntil] = React.useState('');
      
      // Recurring
      const [startTime, setStartTime] = React.useState('12:00');
      const [endTime, setEndTime] = React.useState('14:00');
      const [days, setDays] = React.useState({ MONDAY:true, TUESDAY:true, WEDNESDAY:true, THURSDAY:true, FRIDAY:true });

      const [saving, setSaving] = React.useState(false);

      const handleSubmit = async (e) => {
            e.preventDefault();

            // Montagem e validação vivem em js/utils/exitPermission.js, com
            // teste. O payload é o MESMO ExitPermissionRequest de sempre — o
            // que mudou é de onde vem o userId.
            const form = {
                  aluno, autorizadoPor: authorizedBy, tipo: type,
                  validFrom, validUntil, startTime, endTime, dias: days,
                  observacoes: notes
            };

            const check = window.MagboExitPermission.validar(form);
            if (!check.ok) {
                  setErroForm(check.motivo);
                  return;
            }
            const payload = window.MagboExitPermission.montarPayload(form);
            if (!payload) {
                  setErroForm('Selecione o aluno pelo nome antes de salvar.');
                  return;
            }

            setErroForm('');
            setSaving(true);

            try {
                  await window.api.postExitPermission(payload);
                  onSaved();
                  onClose();
            } catch (err) {
                  alert(err.message);
            } finally {
                  setSaving(false);
            }
      };

      return (
            <div className="fixed inset-0 z-[400] bg-navy-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white rounded-[24px] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="bg-accent-600 p-6 flex items-center justify-between flex-shrink-0">
                              <h2 className="text-lg font-bold text-white">Nova Autorização de Saída</h2>
                              <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
                                    <LucideIcon name="x" size={24} />
                              </button>
                        </div>

                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
                              {/* ── Aluno: escolhido pelo NOME, nunca digitado ── */}
                              <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Aluno</label>

                                    {aluno ? (
                                          <div className="flex items-center gap-3 bg-success-50 border border-success-200 rounded-xl px-4 py-3">
                                                <img src={aluno.foto_url || window.localAvatar(aluno.nome || aluno.id)}
                                                      className="w-9 h-9 rounded-full border border-success-200" alt="" />
                                                <div className="flex-1 min-w-0">
                                                      <div className="text-sm font-bold text-navy-800 truncate">{aluno.nome}</div>
                                                      <div className="text-[11px] text-slate-600">
                                                            {aluno.turma || '—'} · <span className="font-mono">{aluno.id}</span>
                                                      </div>
                                                </div>
                                                <button type="button" onClick={trocarAluno}
                                                      className="text-xs font-bold text-accent-700 underline hover:no-underline shrink-0">
                                                      Trocar
                                                </button>
                                          </div>
                                    ) : (
                                          <>
                                                <div className="relative">
                                                      <LucideIcon name="search" size={16}
                                                            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                      <input
                                                            type="text"
                                                            autoFocus
                                                            value={busca}
                                                            onChange={e => setBusca(e.target.value)}
                                                            className="w-full pl-9 pr-4 py-2 bg-soft-50 border border-soft-200 rounded-xl focus:ring-2 focus:ring-accent-500 text-sm font-medium"
                                                            placeholder="Buscar pelo nome (ou matrícula)..."
                                                      />
                                                </div>

                                                {resultados.length > 0 && (
                                                      <div className="max-h-48 overflow-y-auto border border-soft-200 rounded-xl mt-1">
                                                            {resultados.map(a => (
                                                                  <button key={a.id} type="button" onClick={() => escolher(a)}
                                                                        className="w-full text-left px-3 py-2 text-xs border-b border-soft-100 last:border-0 hover:bg-accent-50 flex items-center gap-2">
                                                                        <span className="font-bold text-navy-500 flex-1 truncate">{a.nome}</span>
                                                                        <span className="text-slate-500">{a.turma || '—'}</span>
                                                                        <span className="text-slate-400 font-mono">{a.id}</span>
                                                                  </button>
                                                            ))}
                                                      </div>
                                                )}

                                                {buscando && resultados.length === 0 && (
                                                      <p className="text-[11px] text-slate-400 mt-1">Buscando...</p>
                                                )}
                                                {!buscando && window.MagboExitPermission.buscaValida(busca) && resultados.length === 0 && (
                                                      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-1">
                                                            Nenhum aluno com esse nome. Confira a grafia — a busca ignora
                                                            acentos e maiúsculas.
                                                      </p>
                                                )}
                                                {!window.MagboExitPermission.buscaValida(busca) && (
                                                      <p className="text-[11px] text-slate-400 mt-1">
                                                            Digite ao menos {window.MagboExitPermission.MINIMO_BUSCA} letras do nome.
                                                      </p>
                                                )}
                                          </>
                                    )}
                              </div>

                              <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Autorizado por (Responsável)</label>
                                    <input required type="text" value={authorizedBy} onChange={e => setAuthorizedBy(e.target.value)} className="w-full px-4 py-2 bg-soft-50 border border-soft-200 rounded-xl focus:ring-2 focus:ring-accent-500 text-sm font-medium" />
                              </div>

                              <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Tipo de Autorização</label>
                                    <select value={type} onChange={e => setType(e.target.value)} className="w-full px-4 py-2 bg-soft-50 border border-soft-200 rounded-xl focus:ring-2 focus:ring-accent-500 text-sm font-medium">
                                          <option value="SINGLE">Saída Única (Data/Hora específica)</option>
                                          <option value="RECURRING">Recorrente (Dias da semana)</option>
                                    </select>
                              </div>

                              {type === 'SINGLE' ? (
                                    <div className="grid grid-cols-2 gap-4">
                                          <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase">Saída</label>
                                                <input required type="datetime-local" value={validFrom} onChange={e => setValidFrom(e.target.value)} className="w-full px-4 py-2 bg-soft-50 border border-soft-200 rounded-xl text-sm" />
                                          </div>
                                          <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase">Retorno (Máx)</label>
                                                <input required type="datetime-local" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="w-full px-4 py-2 bg-soft-50 border border-soft-200 rounded-xl text-sm" />
                                          </div>
                                    </div>
                              ) : (
                                    <div className="space-y-4">
                                          <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                      <label className="text-xs font-bold text-slate-500 uppercase">Hora Início</label>
                                                      <input required type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full px-4 py-2 bg-soft-50 border border-soft-200 rounded-xl text-sm" />
                                                </div>
                                                <div className="space-y-1">
                                                      <label className="text-xs font-bold text-slate-500 uppercase">Hora Fim</label>
                                                      <input required type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full px-4 py-2 bg-soft-50 border border-soft-200 rounded-xl text-sm" />
                                                </div>
                                          </div>
                                          <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase">Dias Autorizados</label>
                                                <div className="flex gap-2">
                                                      {['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'].map((d, i) => (
                                                            <label key={d} className={`flex-1 text-center py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${days[d] ? 'bg-accent-100 text-accent-700 border-accent-200' : 'bg-soft-50 text-slate-400 border-soft-200'} border`}>
                                                                  <input type="checkbox" className="hidden" checked={days[d]} onChange={(e) => setDays({...days, [d]: e.target.checked})} />
                                                                  {['Seg','Ter','Qua','Qui','Sex'][i]}
                                                            </label>
                                                      ))}
                                                </div>
                                          </div>
                                    </div>
                              )}

                              <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Observações (Opcional)</label>
                                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows="2" className="w-full px-4 py-2 bg-soft-50 border border-soft-200 rounded-xl focus:ring-2 focus:ring-accent-500 text-sm font-medium resize-none"></textarea>
                              </div>
                        </form>

                        {/* O motivo da recusa fica ao lado do botão, não num alert
                            que some: sem ele o operador clica e nada acontece. */}
                        {erroForm && (
                              <div className="px-6 pb-2">
                                    <p className="text-xs font-semibold text-danger-700 bg-danger-50 border border-danger-200 rounded-xl px-3 py-2">
                                          {erroForm}
                                    </p>
                              </div>
                        )}

                        <div className="bg-soft-50 p-4 border-t border-soft-200 flex justify-end gap-2">
                              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-soft-100 rounded-xl transition-colors">Cancelar</button>
                              <button type="button" onClick={handleSubmit} disabled={saving} className="btn bg-accent-600 hover:bg-accent-700 text-white flex items-center gap-2">
                                    {saving && <LucideIcon name="loader-2" size={16} className="animate-spin" />}
                                    Salvar Autorização
                              </button>
                        </div>
                  </div>
            </div>
      );
}
