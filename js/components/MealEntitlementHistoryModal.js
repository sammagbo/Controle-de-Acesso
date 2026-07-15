// =====================================================================
// MEAL ENTITLEMENT HISTORY MODAL
// =====================================================================

function MealEntitlementHistoryModal({ userId, onClose }) {
      const [history, setHistory] = React.useState([]);
      const [loading, setLoading] = React.useState(true);
      const [error, setError] = React.useState('');

      React.useEffect(() => {
            const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
            window.addEventListener('keydown', handleEsc);
            return () => window.removeEventListener('keydown', handleEsc);
      }, [onClose]);

      React.useEffect(() => {
            const loadHistory = async () => {
                  try {
                        const data = await window.api.getMealEntitlementHistory(userId);
                        // Sort newest first
                        data.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
                        setHistory(data);
                  } catch (err) {
                        setError(err.message || "Erreur de chargement de l'historique.");
                  } finally {
                        setLoading(false);
                  }
            };
            loadHistory();
      }, [userId]);

      const formatDate = (isoString) => {
            if (!isoString) return '—';
            const date = new Date(isoString);
            return isNaN(date) ? '—' : date.toLocaleDateString('fr-FR');
      };

      const formatDateTime = (isoString) => {
            if (!isoString) return '—';
            const date = new Date(isoString);
            return isNaN(date) ? '—' : date.toLocaleDateString('fr-FR') + ' à ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      };

      const getStatusBadge = (status) => {
            const label = window.ENTITLEMENT_STATUS_LABELS?.[status] || status || 'VIDE';
            if (status === 'AUTHORIZED') return <span className="text-[10px] font-bold text-success-700 bg-success-100 px-1.5 py-0.5 rounded">{label}</span>;
            if (status === 'NOT_AUTHORIZED') return <span className="text-[10px] font-bold text-danger-700 bg-danger-100 px-1.5 py-0.5 rounded">{label}</span>;
            return <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{label}</span>;
      };

      const getSourceBadge = (source) => {
            if (source === 'BULK') return <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded flex items-center gap-1"><LucideIcon name="file-spreadsheet" size={10}/> Import</span>;
            if (source === 'UI') return <span className="text-[10px] font-bold text-navy-700 bg-navy-100 px-1.5 py-0.5 rounded flex items-center gap-1"><LucideIcon name="monitor" size={10}/> Manuel</span>;
            return <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{source || 'API'}</span>;
      };

      const user = window.userCache?.byId(userId);
      const userName = user ? user.nome : userId;

      return (
            <div className="fixed inset-0 z-[400] bg-navy-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                  <div className="bg-white rounded-[24px] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-zoom-in">
                        {/* Header */}
                        <div className="bg-navy-500 p-6 flex items-center justify-between flex-shrink-0">
                              <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                                          <LucideIcon name="history" size={20} className="text-white" />
                                    </div>
                                    <div>
                                          <h2 className="text-lg font-bold text-white">Historique d'accès cantine</h2>
                                          <p className="text-xs text-navy-100">{userName}</p>
                                    </div>
                              </div>
                              <button onClick={onClose} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors">
                                    <LucideIcon name="x" size={20} />
                              </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-6 bg-soft-50">
                              {loading ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                          <LucideIcon name="loader-2" size={24} className="animate-spin mb-2" />
                                          <p className="text-sm">Chargement de l'historique...</p>
                                    </div>
                              ) : error ? (
                                    <div className="bg-danger-50 text-danger-600 p-4 rounded-xl text-sm border border-danger-100 flex items-center gap-2">
                                          <LucideIcon name="alert-circle" size={18} />
                                          {error}
                                    </div>
                              ) : history.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                          <LucideIcon name="clock-3" size={32} className="mb-3 text-slate-300" />
                                          <p className="text-sm font-medium">Aucun historique disponible</p>
                                    </div>
                              ) : (
                                    <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-soft-200 before:to-transparent">
                                          {history.map((h, i) => (
                                                <div key={h.id || i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                                      <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-soft-100 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                                                            <LucideIcon name={h.source === 'BULK' ? 'file-spreadsheet' : 'user'} size={14} />
                                                      </div>
                                                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-4 rounded-2xl border border-soft-200 shadow-sm">
                                                            <div className="flex items-center justify-between mb-2">
                                                                  <span className="text-xs font-bold text-navy-500">{formatDateTime(h.changedAt)}</span>
                                                                  {getSourceBadge(h.source)}
                                                            </div>
                                                            <div className="mb-2">
                                                                  <div className="flex items-center gap-2 text-sm">
                                                                        <span className="text-slate-500 font-medium">Statut:</span>
                                                                        {getStatusBadge(h.oldStatus)}
                                                                        <LucideIcon name="arrow-right" size={12} className="text-slate-300" />
                                                                        {getStatusBadge(h.newStatus)}
                                                                  </div>
                                                            </div>
                                                            <div className="mb-2">
                                                                  <div className="flex items-center gap-2 text-xs">
                                                                        <span className="text-slate-500 font-medium">Validité:</span>
                                                                        <span className="text-slate-400 line-through">{formatDate(h.oldValidUntil)}</span>
                                                                        <LucideIcon name="arrow-right" size={10} className="text-slate-300" />
                                                                        <span className="font-semibold text-navy-500">{formatDate(h.newValidUntil)}</span>
                                                                  </div>
                                                            </div>
                                                            {h.note && (
                                                                  <div className="mt-2 bg-soft-50 p-2 rounded-lg text-xs text-slate-600 border border-soft-100">
                                                                        <span className="font-bold">Note: </span>{h.note}
                                                                  </div>
                                                            )}
                                                            <div className="mt-3 text-[10px] text-slate-400 text-right">
                                                                  Par {h.changedBy || 'Système'}
                                                            </div>
                                                      </div>
                                                </div>
                                          ))}
                                    </div>
                              )}
                        </div>
                  </div>
            </div>
      );
}
