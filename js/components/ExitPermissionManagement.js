// =====================================================================
// EXIT PERMISSION MANAGEMENT (Portaria)
// =====================================================================

function ExitPermissionManagement() {
      const [permissions, setPermissions] = React.useState([]);
      const [loading, setLoading] = React.useState(true);
      const [error, setError] = React.useState('');
      const [showModal, setShowModal] = React.useState(false);
      
      const canEdit = window.auth?.isAdmin() || window.auth?.isOperator();

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
      const [userId, setUserId] = React.useState('');
      const [authorizedBy, setAuthorizedBy] = React.useState('');
      const [notes, setNotes] = React.useState('');
      
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
            if (!userId) return alert('Informe a matrícula do aluno.');
            setSaving(true);

            // Espelha o ExitPermissionRequest do backend EXATAMENTE:
            // permissionType / reason / note / validFrom-validUntil como LocalDate
            // (YYYY-MM-DD) / startTime-endTime como LocalTime / daysOfWeek CSV.
            const payload = {
                  userId,
                  permissionType: type,
                  reason: authorizedBy,
                  note: notes || null,
            };

            if (type === 'SINGLE') {
                  payload.validFrom = validFrom.slice(0, 10);   // datetime-local -> YYYY-MM-DD
                  payload.validUntil = validUntil.slice(0, 10);
                  payload.startTime = validFrom.slice(11, 16) || null; // hora da saída
                  payload.endTime = validUntil.slice(11, 16) || null;  // retorno máx
            } else {
                  payload.startTime = startTime;
                  payload.endTime = endTime;
                  // Backend valida daysOfWeek como números ISO 1-7 (provado por curl 17/07)
                  const DAY_NUM = { MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5 };
                  payload.daysOfWeek = Object.keys(days).filter(k => days[k]).map(k => DAY_NUM[k]).join(',');
                  // Recorrente vale do dia atual até o fim do ano letivo civil
                  const now = new Date();
                  payload.validFrom = now.toISOString().slice(0, 10);
                  payload.validUntil = `${now.getFullYear()}-12-31`;
            }

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
                              <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Matrícula do Aluno</label>
                                    <input required type="text" value={userId} onChange={e => setUserId(e.target.value)} className="w-full px-4 py-2 bg-soft-50 border border-soft-200 rounded-xl focus:ring-2 focus:ring-accent-500 text-sm font-medium" placeholder="Ex: 0001764" />
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
