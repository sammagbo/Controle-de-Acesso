// =====================================================================
// ADMIN PIN MODAL
// =====================================================================
// Modal para validar PIN administrativo via backend (POST /api/admin/verify).
// Aberto via evento global "open-admin-pin"; fecha em sucesso ou cancelamento.
// Em sucesso, chama onSuccess() (ex: ativa o adminView no App).

function AdminPinModal({ open, onSuccess, onClose }) {
      const [pin, setPin] = React.useState('');
      const [loading, setLoading] = React.useState(false);
      const [error, setError] = React.useState('');
      const [attempts, setAttempts] = React.useState(0);
      const inputRef = React.useRef(null);

      // Foco automático no input ao abrir
      React.useEffect(() => {
            if (open && inputRef.current) {
                  setTimeout(() => inputRef.current.focus(), 100);
            }
            if (!open) {
                  setPin('');
                  setError('');
                  setAttempts(0);
            }
      }, [open]);

      // ESC para cancelar
      React.useEffect(() => {
            if (!open) return;
            const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
            window.addEventListener('keydown', handleEsc);
            return () => window.removeEventListener('keydown', handleEsc);
      }, [open, onClose]);

      const handleSubmit = async () => {
            if (!pin.trim()) {
                  setError('Digite o PIN.');
                  return;
            }
            setLoading(true);
            setError('');
            try {
                  const res = await fetch('http://localhost:8080/api/admin/verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ pin })
                  });
                  const data = await res.json();
                  if (data.valid) {
                        onSuccess();
                  } else {
                        const newAttempts = attempts + 1;
                        setAttempts(newAttempts);
                        setError(`PIN incorreto. Tentativa ${newAttempts}.`);
                        setPin('');
                        if (newAttempts >= 3) {
                              setError(`PIN incorreto. Já errou ${newAttempts} vezes.`);
                        }
                        if (inputRef.current) inputRef.current.focus();
                  }
            } catch (e) {
                  setError('Erro ao validar PIN. Servidor offline?');
            } finally {
                  setLoading(false);
            }
      };

      const handleKeyDown = (e) => {
            if (e.key === 'Enter') handleSubmit();
      };

      if (!open) return null;

      return (
            <div className="fixed inset-0 z-[100] bg-navy-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                  <div className="bg-white/95 rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden border border-white/20 animate-zoom-in">
                        <div className="p-8 space-y-6">
                              {/* Header com cadeado */}
                              <div className="flex flex-col items-center gap-3">
                                    <div className="w-20 h-20 rounded-2xl bg-navy-500/10 flex items-center justify-center">
                                          <LucideIcon name="lock" size={40} className="text-navy-500" />
                                    </div>
                                    <div className="text-center">
                                          <h2 className="text-2xl font-black text-navy-500">Acesso Administrativo</h2>
                                          <p className="text-sm text-slate-400 mt-1">Digite o PIN para entrar no Painel Administrativo.</p>
                                    </div>
                              </div>

                              {/* Input PIN */}
                              <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PIN Administrativo</label>
                                    <input
                                          ref={inputRef}
                                          type="password"
                                          inputMode="numeric"
                                          autoComplete="off"
                                          value={pin}
                                          onChange={(e) => { setPin(e.target.value); setError(''); }}
                                          onKeyDown={handleKeyDown}
                                          disabled={loading}
                                          className={`w-full px-4 py-3 rounded-xl border-2 text-center text-2xl font-black tracking-[0.5em] text-navy-500 focus:outline-none transition-colors ${
                                                error ? 'border-danger-500 bg-danger-50' : 'border-soft-200 focus:border-accent-500 bg-white'
                                          }`}
                                          placeholder="••••"
                                    />
                                    {error && (
                                          <p className="text-xs font-semibold text-danger-600 text-center">{error}</p>
                                    )}
                              </div>

                              {/* Botões */}
                              <div className="grid grid-cols-2 gap-3">
                                    <button
                                          onClick={onClose}
                                          disabled={loading}
                                          className="px-4 py-3 rounded-xl bg-soft-100 hover:bg-soft-200 text-navy-500 font-bold text-sm transition-colors disabled:opacity-50"
                                    >
                                          Cancelar
                                    </button>
                                    <button
                                          onClick={handleSubmit}
                                          disabled={loading || !pin.trim()}
                                          className="px-4 py-3 rounded-xl bg-navy-500 hover:bg-navy-600 text-white font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                          {loading ? (
                                                <>
                                                      <LucideIcon name="loader-2" size={16} className="animate-spin" />
                                                      Validando...
                                                </>
                                          ) : (
                                                <>
                                                      <LucideIcon name="unlock" size={16} />
                                                      Entrar
                                                </>
                                          )}
                                    </button>
                              </div>
                        </div>
                  </div>
            </div>
      );
}
