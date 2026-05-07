// =====================================================================
// TOAST COMPONENT
// =====================================================================

function Toast({ toast, onDismiss }) {
      if (!toast) return null;

      React.useEffect(() => {
            const timer = setTimeout(() => onDismiss(), toast.duration || 6000);
            return () => clearTimeout(timer);
      }, [toast, onDismiss]);

      // Variante 1: Notificação de Responsável Vinculado (existente)
      if (toast.responsavelId) {
            const responsavel = (window.userCache?.byId(toast.responsavelId)) || null;
            if (!responsavel) return null;

            return (
                  <div className="fixed top-6 right-6 z-50 animate-toast">
                        <div className="bg-white rounded-2xl shadow-2xl border border-soft-200 p-5 max-w-sm">
                              <div className="flex items-start gap-4">
                                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                                          <LucideIcon name="user-check" size={24} className="text-purple-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                          <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-1">Responsável Vinculado</p>
                                          <p className="text-base font-bold text-navy-500 truncate">{responsavel.nome}</p>
                                          <div className="flex items-center gap-2 mt-2">
                                                <LucideIcon name="phone" size={14} className="text-slate-400" />
                                                <span className="text-sm text-slate-600 font-medium">{responsavel.telefone}</span>
                                          </div>
                                          <p className="text-xs text-slate-400 mt-2">
                                                Aluno: <span className="font-semibold text-slate-600">{toast.alunoNome}</span>
                                          </p>
                                    </div>
                                    <button onClick={onDismiss} className="flex-shrink-0 p-1 rounded-lg hover:bg-soft-100 transition-colors">
                                          <LucideIcon name="x" size={16} className="text-slate-400" />
                                    </button>
                              </div>
                        </div>
                  </div>
            );
      }

      // Variante 2: Notificação Genérica (usada na Importação, etc)
      const colors = {
            success: 'bg-emerald-100 text-emerald-600 border-emerald-200',
            error: 'bg-red-100 text-red-600 border-red-200',
            warning: 'bg-amber-100 text-amber-600 border-amber-200',
            info: 'bg-blue-100 text-blue-600 border-blue-200'
      };
      
      const icons = {
            success: 'check-circle',
            error: 'alert-circle',
            warning: 'alert-triangle',
            info: 'info'
      };

      const type = toast.type || 'info';
      const colorClass = colors[type];
      const iconName = icons[type];

      return (
            <div className="fixed top-6 right-6 z-50 animate-toast">
                  <div className="bg-white rounded-2xl shadow-2xl border border-soft-200 p-4 max-w-sm flex items-start gap-4">
                        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${colorClass}`}>
                              <LucideIcon name={iconName} size={20} />
                        </div>
                        <div className="flex-1 min-w-0 pt-1">
                              {toast.title && <p className="text-sm font-bold text-navy-500">{toast.title}</p>}
                              {toast.message && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{toast.message}</p>}
                        </div>
                        <button onClick={onDismiss} className="flex-shrink-0 p-1 rounded-lg hover:bg-soft-100 transition-colors">
                              <LucideIcon name="x" size={16} className="text-slate-400" />
                        </button>
                  </div>
            </div>
      );
}
