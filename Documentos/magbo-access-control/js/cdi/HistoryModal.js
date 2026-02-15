// =====================================================================
// CDI History Modal
// =====================================================================

function CdiHistoryModal({ open, onClose, logs, students }) {
      if (!open) return null;

      const getName = (id) => students.find(s => s.id === id)?.name || id;
      const getClass = (id) => students.find(s => s.id === id)?.class || '';

      const exportCSV = () => {
            const rows = ['Heure,Nom,Classe,Action', ...logs.map(l =>
                  `${new Date(l.timestamp).toLocaleTimeString('fr-FR')},${getName(l.studentId)},${getClass(l.studentId)},${l.action}`
            )].join('\n');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([rows], { type: 'text/csv' }));
            a.download = `cdi_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
      };

      return (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
                  <div className="bg-white rounded-xl w-full max-w-lg mx-4 p-5 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                              <h2 className="font-bold text-lg">Historique</h2>
                              <button onClick={onClose}><CdiIcon name="x" size={20} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-1 mb-4">
                              {logs.length === 0 ? (
                                    <p className="text-center text-slate-400 py-8">Aucun mouvement</p>
                              ) : [...logs].reverse().map((l, i) => (
                                    <div key={i} className={`p-2 rounded flex items-center gap-3 ${l.action === 'IN' ? 'bg-green-50' : 'bg-red-50'}`}>
                                          <span className="text-xs text-slate-500 font-mono w-12">{new Date(l.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                                          <CdiIcon name={l.action === 'IN' ? 'log-in' : 'log-out'} size={16} />
                                          <span className="font-medium">{getName(l.studentId)}</span>
                                    </div>
                              ))}
                        </div>
                        <button onClick={exportCSV} className="w-full py-2 bg-slate-100 rounded text-sm font-medium flex items-center justify-center gap-2">
                              <CdiIcon name="download" size={16} /> Exporter CSV
                        </button>
                  </div>
            </div>
      );
}
