// =====================================================================
// USER MANAGEMENT (admin only)
// =====================================================================
// Lista, cria, edita e desativa operadores do sistema.
// Acessível apenas via AdminDashboard quando role === 'ADMIN'.

function UserManagement() {
  const t = useI18n();
  const locale = useLocale();
  const [users, setUsers] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [showForm, setShowForm] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  // Pedidos de "esqueci a senha" (tela de login → aqui). O admin redefine a
  // senha pelo formulário de edição que já existe e fecha o bilhete.
  const [resetRequests, setResetRequests] = React.useState([]);
  // Erro de CARREGAMENTO da lista. Vive aqui e não no formulário (que tem o
  // seu próprio `error`, mais abaixo, noutro componente).
  const [erroLista, setErroLista] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/system-users`, {
        headers: { Authorization: `Bearer ${window.auth.getToken()}` }
      });
      // ⚠️ ANTES ERA `setUsers(await res.json())` SEM CHECAR res.ok. Num 403 ou
      // 500 o corpo do /error do Spring é um OBJETO JSON perfeitamente válido —
      // então `users` deixava de ser array e `users.map(...)` estourava DENTRO
      // da renderização. Sem error boundary (não havia nenhum neste projeto até
      // 20/08/2026), isso era TELA BRANCA, não uma mensagem.
      // Lista vazia é uma verdade ("não consegui carregar"); um objeto é uma
      // bomba com atraso.
      if (!res.ok) {
        const corpo = await res.json().catch(() => ({}));
        setUsers([]);
        // ⚠️ razaoDoServidor: ver o comentario em js/utils/api.js — `corpo.error`
        // no envelope do Spring e «Forbidden», ingles numa tela francesa.
        setErroLista(razaoDoServidor(corpo) || t('usuarios.erro.carregar'));
        return;
      }
      const lista = await res.json();
      setUsers(Array.isArray(lista) ? lista : []);
      setErroLista('');
      const rr = await fetch(`${API_BASE_URL}/admin/password-reset-requests`, {
        headers: { Authorization: `Bearer ${window.auth.getToken()}` }
      });
      if (rr.ok) setResetRequests(await rr.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const marcarTratado = async (id) => {
    await fetch(`${API_BASE_URL}/admin/password-reset-requests/${id}/handle`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${window.auth.getToken()}` }
    });
    load();
  };

  React.useEffect(() => { load(); }, [load]);

  const handleDeactivate = async (id) => {
    // O confirm diz O QUE acontece — "Desativar este operador?" não dizia
    // nem o que se perde nem o que fica.
    // Traduzido SEM afrouxar: a precisão ("nada é apagado", "reativável") é o
    // que faz este confirm valer alguma coisa — ver o dicionário.
    if (!confirm(t('operadores.desativar.confirma'))) return;
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
          React.createElement('h2', { className: 'text-xl font-bold text-navy-500' }, t('operadores.titulo')),
          React.createElement('p', { className: 'text-xs text-slate-400 mt-0.5' }, t('operadores.subtitulo'))
        ),
        React.createElement('button', {
          onClick: () => { setEditing(null); setShowForm(true); },
          className: 'flex items-center gap-2 px-4 py-2.5 bg-accent-500 hover:bg-accent-600 text-white font-semibold text-sm rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95'
        },
          React.createElement(LucideIcon, { name: 'user-plus', size: 16 }),
          t('operadores.novo')
        )
      ),

      // ── Pedidos de senha pendentes — em cima, porque são a razão de o
      // admin ter aberto esta tela quando existem. Tratado some da urgência
      // mas fica no histórico do servidor (o endpoint devolve os 100 últimos).
      (() => {
        const pendentes = resetRequests.filter(r => r.status === 'PENDING');
        if (pendentes.length === 0) return null;
        return React.createElement('div', { className: 'mb-6 bg-warning-50 border border-warning-200 rounded-2xl p-4' },
          React.createElement('div', { className: 'flex items-center gap-2 mb-3' },
            React.createElement(LucideIcon, { name: 'key-round', size: 18, className: 'text-warning-600' }),
            React.createElement('h3', { className: 'text-sm font-black text-warning-800' },
              t('operadores.senha.titulo', { n: pendentes.length })),
          ),
          pendentes.map(r =>
            React.createElement('div', { key: r.id, className: 'flex items-center gap-3 bg-white rounded-xl px-3 py-2 mb-1.5 border border-warning-100' },
              React.createElement('span', { className: 'font-mono text-sm font-bold text-navy-500' }, r.username),
              React.createElement('span', { className: 'text-xs text-slate-400 flex-1' },
                new Date(r.requestedAt).toLocaleString(locale)),
              React.createElement('button', {
                onClick: () => marcarTratado(r.id),
                title: t('operadores.senha.dica'),
                className: 'text-xs font-bold text-warning-700 bg-warning-100 hover:bg-warning-200 px-3 py-1.5 rounded-lg transition-colors'
              }, t('operadores.senha.tratado'))
            )
          ),
          React.createElement('p', { className: 'text-[11px] text-warning-700 mt-2' },
            t('operadores.senha.rodape'))
        );
      })(),

      loading && React.createElement('div', { className: 'flex items-center justify-center py-12' },
        React.createElement(LucideIcon, { name: 'loader-2', size: 24, className: 'text-slate-300 animate-spin' }),
        React.createElement('span', { className: 'ml-3 text-sm text-slate-400' }, t('operadores.carregando'))
      ),

      // O erro de carregamento é DITO. Antes, uma recusa do servidor deixava
      // a tela com uma tabela vazia e nenhuma explicação — indistinguível de
      // "não há operadores cadastrados".
      erroLista && React.createElement('div', {
        className: 'mb-4 px-4 py-3 rounded-xl bg-danger-50 border border-danger-200 text-sm text-danger-700'
      }, erroLista),

      !loading && React.createElement('div', { className: 'overflow-x-auto' },
        React.createElement('table', { className: 'w-full' },
          React.createElement('thead', null,
            React.createElement('tr', { className: 'bg-soft-50 text-left' },
              React.createElement('th', { className: 'px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider' }, t('operadores.col.usuario')),
              React.createElement('th', { className: 'px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider' }, t('comum.nome')),
              React.createElement('th', { className: 'px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider' }, t('operadores.col.role')),
              React.createElement('th', { className: 'px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider' }, t('operadores.col.setores')),
              React.createElement('th', { className: 'px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider' }, t('operadores.col.permissoes')),
              React.createElement('th', { className: 'px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider' }, t('comum.status')),
              React.createElement('th', { className: 'px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider' }, t('operadores.col.ultimo.login')),
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
                // Vazio e o estado NORMAL de um operador: permissao e o extra,
                // nao o padrao. O travessao diz "nenhuma", nao "nao carregou".
                React.createElement('td', { className: 'px-4 py-3 font-mono text-xs text-slate-500' },
                  u.role === 'ADMIN' ? t('operadores.permissao.admin.curto') : (u.permissoes || '—')),
                React.createElement('td', { className: 'px-4 py-3 text-sm' },
                  u.ativo
                    ? React.createElement('span', { className: 'inline-flex items-center gap-1.5 text-success-600 font-semibold text-xs' },
                        React.createElement('span', { className: 'w-2 h-2 rounded-full bg-success-500' }), t('comum.ativo'))
                    : React.createElement('span', { className: 'inline-flex items-center gap-1.5 text-danger-600 font-semibold text-xs' },
                        React.createElement('span', { className: 'w-2 h-2 rounded-full bg-danger-500' }), t('comum.inativo'))
                ),
                React.createElement('td', { className: 'px-4 py-3 text-xs text-slate-400' },
                  u.lastLogin ? new Date(u.lastLogin).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) : t('operadores.login.nunca')
                ),
                React.createElement('td', { className: 'px-4 py-3' },
                  React.createElement('div', { className: 'flex items-center gap-2' },
                    React.createElement('button', {
                      onClick: () => { setEditing(u); setShowForm(true); },
                      className: 'text-accent-600 hover:text-accent-700 text-xs font-semibold hover:underline'
                    }, t('acao.editar')),
                    u.ativo && React.createElement('button', {
                      onClick: () => handleDeactivate(u.id),
                      className: 'text-danger-500 hover:text-danger-600 text-xs font-semibold hover:underline'
                    }, t('acao.desativar'))
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
  const t = useI18n();
  const [form, setForm] = React.useState({
    username: user?.username || '',
    nomeCompleto: user?.nomeCompleto || '',
    role: user?.role || 'OPERATOR',
    setoresPermitidos: user?.setoresPermitidos || '',
    permissoes: user?.permissoes || '',
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
            permissoes: form.permissoes,
            ativo: form.ativo,
            newPassword: form.password || null
          };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${window.auth.getToken()}` },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error((await res.json()).error || t('comum.erro.salvar'));
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
              React.createElement('h2', { className: 'text-lg font-bold text-white' }, user ? t('operadores.editar') : t('operadores.novo')),
              React.createElement('p', { className: 'text-xs text-white/50' }, user ? t('operadores.editando', { username: user.username }) : t('operadores.novo.subtitulo'))
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
            React.createElement('label', { className: 'block text-xs font-bold text-slate-500 mb-1' }, t('operadores.campo.login')),
            React.createElement('input', {
              type: 'text',
              value: form.username,
              onChange: (e) => setForm({ ...form, username: e.target.value }),
              className: 'w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500 text-navy-500 font-mono',
              placeholder: t('operadores.campo.login.exemplo')
            })
          ),

          // Nome completo
          React.createElement('div', null,
            React.createElement('label', { className: 'block text-xs font-bold text-slate-500 mb-1' }, t('operadores.campo.nome')),
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
              React.createElement('label', { className: 'block text-xs font-bold text-slate-500 mb-1' }, t('operadores.col.role')),
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
              React.createElement('label', { className: 'block text-xs font-bold text-slate-500 mb-1' }, t('operadores.campo.setores')),
              React.createElement('div', { className: 'grid grid-cols-2 gap-2' },
                [
                  { val: 'cantine',    chave: 'operadores.setor.cantine' },
                  { val: 'infirmerie', chave: 'operadores.setor.infirmerie' },
                  { val: 'cdi',        chave: 'operadores.setor.cdi' },
                  { val: 'portail',    chave: 'operadores.setor.portail' },
                  { val: '*',          chave: 'operadores.setor.tudo' },
                ].map((area) => {
                  const current  = (form.setoresPermitidos || '').split(',').map(s => s.trim()).filter(Boolean);
                  const isAll    = current.includes('*');
                  const checked  = area.val === '*' ? isAll : current.includes(area.val);
                  const disabled = area.val !== '*' && isAll;
                  return React.createElement('label', {
                    key: area.val,
                    className: `flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${checked ? 'border-accent-500 bg-accent-500/5 text-accent-700 font-semibold' : 'border-soft-200 text-slate-600'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`
                  },
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: checked,
                      disabled: disabled,
                      onChange: () => {
                        if (area.val === '*') {
                          setForm({ ...form, setoresPermitidos: checked ? '' : '*' });
                          return;
                        }
                        let next = current.filter(v => v !== '*');
                        if (next.includes(area.val)) {
                          next = next.filter(v => v !== area.val);
                        } else {
                          next.push(area.val);
                        }
                        setForm({ ...form, setoresPermitidos: next.join(',') });
                      }
                    }),
                    t(area.chave)
                  );
                })
              )
            )
          ),

          // -- Permissoes especificas ---------------------------------
          // ⚠️ Sem este campo elas so se concediam por API. O backend as aceita
          // no POST e no PUT desde a Fase H, a tela nunca as ofereceu, e o efeito
          // era uma funcionalidade inteira acessivel so ao ADMIN — com o botao
          // simplesmente ausente para quem deveria usa-la, sem erro nenhum.
          // Descoberto ao percorrer o procedimento de deploy a letra (14/08):
          // o texto mandava conceder a permissao numa coluna que nao existia.
          //
          // A lista vem de window.MagboPermissions.PERMISSIONS, que ja espelha
          // security/Permissions.java. Uma lista escrita aqui seria a QUARTA
          // copia dos mesmos nomes — e a que ninguem lembraria de atualizar.
          React.createElement('div', null,
            React.createElement('label', { className: 'block text-xs font-bold text-slate-500 mb-1' },
              t('operadores.campo.permissoes')
            ),
            React.createElement('p', { className: 'text-[11px] text-slate-400 mb-2' },
              t('operadores.permissao.ajuda')
            ),
            (() => {
              const bruto = (form.permissoes || '').trim();
              // ⚠️ '*' so vale SOZINHO (SystemUser.hasPermission compara a string
              // inteira). Ele nao e oferecido como caixa de proposito: marca-lo
              // concederia tambem as permissoes que ainda nao existem, e a
              // proxima a nascer entraria em vigor sem ninguem decidir nada.
              // Quem ja o tem (concedido por API) ve o aviso abaixo.
              const tudo = bruto === '*';
              const atuais = tudo ? [] : bruto.split(',').map(v => v.trim()).filter(Boolean);
              const nomes = Object.values((window.MagboPermissions || {}).PERMISSIONS || {});
              const ehAdmin = form.role === 'ADMIN';
              return React.createElement(React.Fragment, null,
                tudo && React.createElement('p', {
                  className: 'text-[11px] text-warning-600 bg-warning-100 rounded-lg px-3 py-2 mb-2'
                }, t('operadores.permissao.curinga')),
                ehAdmin && React.createElement('p', {
                  className: 'text-[11px] text-slate-500 bg-soft-100 rounded-lg px-3 py-2 mb-2'
                }, t('operadores.permissao.admin')),
                React.createElement('div', { className: 'grid grid-cols-2 gap-2' },
                  nomes.map((perm) => {
                    const marcada = atuais.includes(perm);
                    return React.createElement('label', {
                      key: perm,
                      // Desabilitado, NUNCA escondido: o ADMIN as tem todas, e
                      // esconder faria parecer que a permissao nao existe.
                      className: `flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${marcada ? 'border-accent-500 bg-accent-500/5 text-accent-700 font-semibold' : 'border-soft-200 text-slate-600'} ${ehAdmin ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`
                    },
                      React.createElement('input', {
                        type: 'checkbox',
                        checked: marcada,
                        disabled: ehAdmin,
                        onChange: () => {
                          const proximas = marcada
                            ? atuais.filter(v => v !== perm)
                            : atuais.concat(perm);
                          setForm({ ...form, permissoes: proximas.join(',') });
                        }
                      }),
                      t('operadores.permissao.' + perm)
                    );
                  })
                )
              );
            })()
          ),

          // Password
          React.createElement('div', null,
            React.createElement('label', { className: 'block text-xs font-bold text-slate-500 mb-1' },
              user ? t('operadores.senha.nova') : t('operadores.senha')
            ),
            // O olho (PasswordInput): a senha que se define aqui vai ser
            // ditada ou conferida com o operador do lado — ver o que se
            // digitou é parte do fluxo, não um luxo.
            React.createElement(PasswordInput, {
              value: form.password,
              onChange: (e) => setForm({ ...form, password: e.target.value }),
              autoComplete: 'new-password',
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
            React.createElement('span', { className: 'text-sm font-semibold text-navy-500' }, t('operadores.ativo'))
          ),

          // Error display
          error && React.createElement('div', { className: 'bg-danger-50 text-danger-600 px-4 py-3 rounded-xl text-sm font-semibold border border-danger-100' }, error),

          // Action buttons
          React.createElement('div', { className: 'flex gap-3 pt-2' },
            React.createElement('button', {
              onClick: onClose,
              className: 'flex-1 px-4 py-3 rounded-xl bg-soft-100 hover:bg-soft-200 text-navy-500 font-bold text-sm transition-colors'
            }, t('acao.cancelar')),
            React.createElement('button', {
              onClick: handleSave,
              disabled: saving,
              className: 'flex-1 px-4 py-3 rounded-xl bg-navy-500 hover:bg-navy-600 text-white font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'
            },
              saving
                ? React.createElement(React.Fragment, null,
                    React.createElement(LucideIcon, { name: 'loader-2', size: 16, className: 'animate-spin' }),
                    t('comum.salvando')
                  )
                : React.createElement(React.Fragment, null,
                    React.createElement(LucideIcon, { name: 'check', size: 16 }),
                    t('acao.salvar')
                  )
            )
          )
        )
      )
    )
  );
}
