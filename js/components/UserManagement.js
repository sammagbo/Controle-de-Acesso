// =====================================================================
// USER MANAGEMENT (admin only)
// =====================================================================
// Lista, cria, edita e desativa operadores do sistema.
// Acessível apenas via AdminDashboard quando role === 'ADMIN'.

function UserManagement() {
  const [users, setUsers] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [showForm, setShowForm] = React.useState(false);
  const [editing, setEditing] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/system-users`, {
        headers: { Authorization: `Bearer ${window.auth.getToken()}` }
      });
      setUsers(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const handleDeactivate = async (id) => {
    if (!confirm('Desativar este operador?')) return;
    await fetch(`${API_BASE_URL}/system-users/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${window.auth.getToken()}` }
    });
    load();
  };

  return (
    React.createElement('div', null,
      React.createElement('div', { className: 'flex items-center justify-between mb-6' },
        React.createElement('div', null,
          React.createElement('h2', { className: 'text-xl font-bold text-navy-500' }, 'Operadores do Sistema'),
          React.createElement('p', { className: 'text-xs text-slate-400 mt-0.5' }, 'Gerencie quem pode operar cada setor')
        ),
        React.createElement('button', {
          onClick: () => { setEditing(null); setShowForm(true); },
          className: 'flex items-center gap-2 px-4 py-2.5 bg-accent-500 hover:bg-accent-600 text-white font-semibold text-sm rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95'
        },
          React.createElement(LucideIcon, { name: 'user-plus', size: 16 }),
          'Novo Operador'
        )
      ),

      loading && React.createElement('div', { className: 'flex items-center justify-center py-12' },
        React.createElement(LucideIcon, { name: 'loader-2', size: 24, className: 'text-slate-300 animate-spin' }),
        React.createElement('span', { className: 'ml-3 text-sm text-slate-400' }, 'A carregar operadores...')
      ),

      !loading && React.createElement('div', { className: 'overflow-x-auto' },
        React.createElement('table', { className: 'w-full' },
          React.createElement('thead', null,
            React.createElement('tr', { className: 'bg-soft-50 text-left' },
              React.createElement('th', { className: 'px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider' }, 'Usuário'),
              React.createElement('th', { className: 'px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider' }, 'Nome'),
              React.createElement('th', { className: 'px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider' }, 'Role'),
              React.createElement('th', { className: 'px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider' }, 'Setores'),
              React.createElement('th', { className: 'px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider' }, 'Status'),
              React.createElement('th', { className: 'px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider' }, 'Último login'),
              React.createElement('th', { className: 'px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider' }, '')
            )
          ),
          React.createElement('tbody', { className: 'divide-y divide-soft-100' },
            users.map(u =>
              React.createElement('tr', { key: u.id, className: 'hover:bg-soft-50 transition-colors' },
                React.createElement('td', { className: 'px-4 py-3 text-sm font-mono font-semibold text-navy-500' }, u.username),
                React.createElement('td', { className: 'px-4 py-3 text-sm text-navy-500' }, u.nomeCompleto),
                React.createElement('td', { className: 'px-4 py-3' },
                  React.createElement('span', {
                    className: `inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${u.role === 'ADMIN' ? 'bg-accent-500/10 text-accent-700' : 'bg-navy-500/10 text-navy-500'}`
                  }, u.role)
                ),
                React.createElement('td', { className: 'px-4 py-3 font-mono text-xs text-slate-500' }, u.setoresPermitidos || '—'),
                React.createElement('td', { className: 'px-4 py-3 text-sm' },
                  u.ativo
                    ? React.createElement('span', { className: 'inline-flex items-center gap-1.5 text-success-600 font-semibold text-xs' },
                        React.createElement('span', { className: 'w-2 h-2 rounded-full bg-success-500' }), 'Ativo')
                    : React.createElement('span', { className: 'inline-flex items-center gap-1.5 text-danger-600 font-semibold text-xs' },
                        React.createElement('span', { className: 'w-2 h-2 rounded-full bg-danger-500' }), 'Inativo')
                ),
                React.createElement('td', { className: 'px-4 py-3 text-xs text-slate-400' },
                  u.lastLogin ? u.lastLogin.substring(0, 16).replace('T', ' ') : 'Nunca'
                ),
                React.createElement('td', { className: 'px-4 py-3' },
                  React.createElement('div', { className: 'flex items-center gap-2' },
                    React.createElement('button', {
                      onClick: () => { setEditing(u); setShowForm(true); },
                      className: 'text-accent-600 hover:text-accent-700 text-xs font-semibold hover:underline'
                    }, 'Editar'),
                    u.ativo && React.createElement('button', {
                      onClick: () => handleDeactivate(u.id),
                      className: 'text-danger-500 hover:text-danger-600 text-xs font-semibold hover:underline'
                    }, 'Desativar')
                  )
                )
              )
            )
          )
        )
      ),

      showForm && React.createElement(UserFormModal, {
        user: editing,
        onClose: () => setShowForm(false),
        onSaved: () => { setShowForm(false); load(); }
      })
    )
  );
}

function UserFormModal({ user, onClose, onSaved }) {
  const [form, setForm] = React.useState({
    username: user?.username || '',
    nomeCompleto: user?.nomeCompleto || '',
    role: user?.role || 'OPERATOR',
    setoresPermitidos: user?.setoresPermitidos || '',
    password: '',
    ativo: user?.ativo ?? true
  });
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  // ESC to close
  React.useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const isNew = !user;
      const url = isNew ? `${API_BASE_URL}/system-users` : `${API_BASE_URL}/system-users/${user.id}`;
      const method = isNew ? 'POST' : 'PUT';
      const body = isNew
        ? form
        : {
            nomeCompleto: form.nomeCompleto,
            role: form.role,
            setoresPermitidos: form.setoresPermitidos,
            ativo: form.ativo,
            newPassword: form.password || null
          };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${window.auth.getToken()}` },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro ao salvar');
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    React.createElement('div', { className: 'fixed inset-0 z-[300] bg-navy-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in' },
      React.createElement('div', { className: 'bg-white rounded-[24px] w-full max-w-lg shadow-2xl overflow-hidden animate-zoom-in' },

        // Header
        React.createElement('div', { className: 'bg-navy-500 p-6 flex items-center justify-between' },
          React.createElement('div', { className: 'flex items-center gap-3' },
            React.createElement('div', { className: 'w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center' },
              React.createElement(LucideIcon, { name: user ? 'user-cog' : 'user-plus', size: 20, className: 'text-white' })
            ),
            React.createElement('div', null,
              React.createElement('h2', { className: 'text-lg font-bold text-white' }, user ? 'Editar Operador' : 'Novo Operador'),
              React.createElement('p', { className: 'text-xs text-white/50' }, user ? `Editando ${user.username}` : 'Preencha os dados do novo operador')
            )
          ),
          React.createElement('button', {
            onClick: onClose,
            className: 'w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors'
          }, React.createElement(LucideIcon, { name: 'x', size: 20 }))
        ),

        // Form body
        React.createElement('div', { className: 'p-6 space-y-4' },

          // Username (only for new)
          !user && React.createElement('div', null,
            React.createElement('label', { className: 'block text-xs font-bold text-slate-500 mb-1' }, 'Usuário (login)'),
            React.createElement('input', {
              type: 'text',
              value: form.username,
              onChange: (e) => setForm({ ...form, username: e.target.value }),
              className: 'w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500 text-navy-500 font-mono',
              placeholder: 'ex: biblio1'
            })
          ),

          // Nome completo
          React.createElement('div', null,
            React.createElement('label', { className: 'block text-xs font-bold text-slate-500 mb-1' }, 'Nome completo'),
            React.createElement('input', {
              type: 'text',
              value: form.nomeCompleto,
              onChange: (e) => setForm({ ...form, nomeCompleto: e.target.value }),
              className: 'w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500 text-navy-500'
            })
          ),

          // Role + Setores row
          React.createElement('div', { className: 'grid grid-cols-2 gap-4' },
            React.createElement('div', null,
              React.createElement('label', { className: 'block text-xs font-bold text-slate-500 mb-1' }, 'Role'),
              React.createElement('select', {
                value: form.role,
                onChange: (e) => setForm({ ...form, role: e.target.value }),
                className: 'w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500 text-navy-500'
              },
                React.createElement('option', { value: 'OPERATOR' }, 'OPERATOR'),
                React.createElement('option', { value: 'ADMIN' }, 'ADMIN')
              )
            ),
            React.createElement('div', null,
              React.createElement('label', { className: 'block text-xs font-bold text-slate-500 mb-1' }, 'Setores (CSV)'),
              React.createElement('input', {
                type: 'text',
                value: form.setoresPermitidos,
                onChange: (e) => setForm({ ...form, setoresPermitidos: e.target.value }),
                placeholder: 'BIBLIO,CDI ou *',
                className: 'w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500 font-mono text-sm text-navy-500'
              })
            )
          ),

          // Password
          React.createElement('div', null,
            React.createElement('label', { className: 'block text-xs font-bold text-slate-500 mb-1' },
              user ? 'Nova senha (opcional)' : 'Senha'
            ),
            React.createElement('input', {
              type: 'password',
              value: form.password,
              onChange: (e) => setForm({ ...form, password: e.target.value }),
              className: 'w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500 text-navy-500'
            })
          ),

          // Ativo toggle (edit only)
          user && React.createElement('label', { className: 'flex items-center gap-3 p-3 rounded-xl bg-soft-50 border border-soft-200 cursor-pointer' },
            React.createElement('input', {
              type: 'checkbox',
              checked: form.ativo,
              onChange: (e) => setForm({ ...form, ativo: e.target.checked }),
              className: 'w-4 h-4 rounded accent-accent-500'
            }),
            React.createElement('span', { className: 'text-sm font-semibold text-navy-500' }, 'Operador ativo')
          ),

          // Error display
          error && React.createElement('div', { className: 'bg-danger-50 text-danger-600 px-4 py-3 rounded-xl text-sm font-semibold border border-danger-100' }, error),

          // Action buttons
          React.createElement('div', { className: 'flex gap-3 pt-2' },
            React.createElement('button', {
              onClick: onClose,
              className: 'flex-1 px-4 py-3 rounded-xl bg-soft-100 hover:bg-soft-200 text-navy-500 font-bold text-sm transition-colors'
            }, 'Cancelar'),
            React.createElement('button', {
              onClick: handleSave,
              disabled: saving,
              className: 'flex-1 px-4 py-3 rounded-xl bg-navy-500 hover:bg-navy-600 text-white font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'
            },
              saving
                ? React.createElement(React.Fragment, null,
                    React.createElement(LucideIcon, { name: 'loader-2', size: 16, className: 'animate-spin' }),
                    'Salvando...'
                  )
                : React.createElement(React.Fragment, null,
                    React.createElement(LucideIcon, { name: 'check', size: 16 }),
                    'Salvar'
                  )
            )
          )
        )
      )
    )
  );
}
