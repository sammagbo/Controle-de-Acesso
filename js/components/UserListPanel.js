// =====================================================================
// USER LIST PANEL (admin only)
// =====================================================================
// Lista, edita e desativa usuários (Alunos, Professores, etc).

function UserListPanel({ onClose, onShowToast }) {
  const [users, setUsers] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [showForm, setShowForm] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [showInactive, setShowInactive] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // Fetch full list of users directly to get all fields
      const res = await fetch(`${window.magboConfig?.getCached?.()?.apiUrl || 'http://localhost:8080'}/api/users/all`, {
        headers: window.authHeaders()
      });
      if (!res.ok) throw new Error('Erro ao carregar usuários');
      const data = await res.json();
      setUsers(data.users || []);
    } catch (e) {
      console.error(e);
      if (onShowToast) onShowToast({ title: 'Erro', message: e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  React.useEffect(() => { load(); }, [load]);

  const handleDeactivate = async (id) => {
    if (!confirm('Tem certeza que deseja desativar este usuário? Ele não poderá mais acessar os setores.')) return;
    try {
      await window.api.deleteUser(id);
      if (onShowToast) onShowToast({ title: 'Sucesso', message: 'Usuário desativado com sucesso.', type: 'success' });
      load();
      window.userCache?.reload(); // Atualiza o cache global
    } catch (e) {
      if (onShowToast) onShowToast({ title: 'Erro', message: e.message, type: 'error' });
    }
  };

  const filteredUsers = React.useMemo(() => {
    return users.filter(u => {
      const matchStatus = showInactive ? true : u.ativo !== false;
      const matchQuery = !searchQuery || 
        (u.nome || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
        (u.id || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchStatus && matchQuery;
    });
  }, [users, showInactive, searchQuery]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-navy-500">Usuários Cadastrados</h2>
          <p className="text-xs text-slate-400 mt-0.5">Gerencie alunos, professores, funcionários e responsáveis</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-500 cursor-pointer">
            <input 
              type="checkbox" 
              checked={showInactive} 
              onChange={e => setShowInactive(e.target.checked)}
              className="w-4 h-4 rounded accent-accent-500"
            />
            Mostrar inativos
          </label>
          <div className="relative">
            <LucideIcon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou ID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-soft-200 rounded-xl bg-soft-50 focus:bg-white focus:ring-2 focus:ring-accent-500 outline-none text-sm w-64"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <LucideIcon name="loader-2" size={24} className="text-slate-300 animate-spin" />
          <span className="ml-3 text-sm text-slate-400">A carregar usuários...</span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 border border-soft-200 rounded-xl">
          <table className="w-full relative">
            <thead className="sticky top-0 bg-soft-50 z-10 shadow-sm">
              <tr className="text-left">
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">ID</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nome</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Turma</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-soft-100 bg-white">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-slate-400 text-sm">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              ) : filteredUsers.map(u => (
                <tr key={u.id} className="hover:bg-soft-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-mono font-semibold text-navy-500">{u.id}</td>
                  <td className="px-4 py-3 text-sm text-navy-500 font-medium">{u.nome || u.nomeCompleto || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide bg-soft-100 text-slate-500 border border-soft-200">
                      {u.tipo || 'DESCONHECIDO'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 font-mono">{u.turma || '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    {u.ativo !== false
                      ? <span className="inline-flex items-center gap-1.5 text-success-600 font-semibold text-xs"><span className="w-1.5 h-1.5 rounded-full bg-success-500"></span>Ativo</span>
                      : <span className="inline-flex items-center gap-1.5 text-danger-600 font-semibold text-xs"><span className="w-1.5 h-1.5 rounded-full bg-danger-500"></span>Inativo</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => { setEditing(u); setShowForm(true); }}
                        className="text-accent-600 hover:text-accent-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                      >
                        <LucideIcon name="edit-2" size={14} /> Editar
                      </button>
                      {u.ativo !== false && u.tipo !== 'RESPONSAVEL' && (
                        <button
                          onClick={() => handleDeactivate(u.id)}
                          className="text-danger-500 hover:text-danger-600 text-xs font-semibold flex items-center gap-1 transition-colors"
                        >
                          <LucideIcon name="user-x" size={14} /> Desativar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <UserEditModal
          user={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { 
            setShowForm(false); 
            load(); 
            window.userCache?.reload(); // Atualiza cache global
            if (onShowToast) onShowToast({ title: 'Sucesso', message: 'Usuário atualizado com sucesso.', type: 'success' });
          }}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
}

function UserEditModal({ user, onClose, onSaved, onShowToast }) {
  const [form, setForm] = React.useState({
    nome: user?.nome || user?.nomeCompleto || '',
    turma: user?.turma || '',
    tipo: user?.tipo || 'ALUNO',
    telefone: user?.telefone || '',
    parentesco: user?.parentesco || ''
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Clean up empty strings and only send what is necessary
      const updateData = { ...form };
      if (updateData.tipo !== 'ALUNO') updateData.turma = null;
      if (updateData.tipo !== 'RESPONSAVEL') {
        updateData.telefone = null;
        updateData.parentesco = null;
      }
      
      await window.api.updateUser(user.id, updateData);
      onSaved();
    } catch (e) {
      if (onShowToast) onShowToast({ title: 'Erro', message: e.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-navy-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-[24px] w-full max-w-lg shadow-2xl overflow-hidden animate-zoom-in">
        
        {/* Header */}
        <div className="bg-navy-500 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
              <LucideIcon name="user-cog" size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Editar Usuário</h2>
              <p className="text-xs text-white/50">Editando dados de {user?.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          >
            <LucideIcon name="x" size={20} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Nome Completo</label>
            <input
              type="text"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500 text-navy-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Tipo</label>
              <select
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500 text-navy-500"
              >
                <option value="ALUNO">ALUNO</option>
                <option value="PROFESSOR">PROFESSOR</option>
                <option value="FUNCIONARIO">FUNCIONARIO</option>
                <option value="RESPONSAVEL">RESPONSAVEL</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Turma (se Aluno)</label>
              <input
                type="text"
                value={form.turma || ''}
                onChange={(e) => setForm({ ...form, turma: e.target.value })}
                disabled={form.tipo !== 'ALUNO'}
                placeholder="Ex: 1A, 2B..."
                className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500 font-mono text-sm text-navy-500 disabled:opacity-50"
              />
            </div>
          </div>

          {form.tipo === 'RESPONSAVEL' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Telefone</label>
                <input
                  type="text"
                  value={form.telefone || ''}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500 text-navy-500"
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Parentesco</label>
                <input
                  type="text"
                  value={form.parentesco || ''}
                  onChange={(e) => setForm({ ...form, parentesco: e.target.value })}
                  className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500 text-navy-500"
                  placeholder="Ex: Pai, Mãe..."
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl bg-soft-100 hover:bg-soft-200 text-navy-500 font-bold text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-3 rounded-xl bg-navy-500 hover:bg-navy-600 text-white font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <LucideIcon name="loader-2" size={16} className="animate-spin" /> : <LucideIcon name="check" size={16} />}
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
