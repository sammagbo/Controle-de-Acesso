// =====================================================================
// CDI Help Center Modal
// =====================================================================

function CdiHelpModal({ open, onClose }) {
      const [tab, setTab] = React.useState('shortcuts');
      if (!open) return null;

      return (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
                  <div className="bg-white rounded-xl w-full max-w-lg mx-4 p-0 max-h-[85vh] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex bg-slate-100 border-b">
                              <button onClick={() => setTab('shortcuts')} className={`flex-1 py-3 text-sm font-medium ${tab === 'shortcuts' ? 'bg-white text-blue-600 border-t-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Raccourcis</button>
                              <button onClick={() => setTab('troubleshoot')} className={`flex-1 py-3 text-sm font-medium ${tab === 'troubleshoot' ? 'bg-white text-blue-600 border-t-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Dépannage</button>
                              <button onClick={() => setTab('support')} className={`flex-1 py-3 text-sm font-medium ${tab === 'support' ? 'bg-white text-blue-600 border-t-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Support</button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                              <div className="flex justify-between items-center mb-4">
                                    <h2 className="font-bold text-xl text-slate-800">
                                          {tab === 'shortcuts' && 'Raccourcis Clavier'}
                                          {tab === 'troubleshoot' && 'Dépannage Rapide'}
                                          {tab === 'support' && 'Support Technique'}
                                    </h2>
                                    <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100"><CdiIcon name="x" size={24} /></button>
                              </div>
                              {tab === 'shortcuts' && (
                                    <div className="space-y-2">
                                          <div className="flex justify-between items-center bg-slate-50 p-2 rounded"><span>Rechercher</span><kbd className="px-2 bg-white border rounded text-xs">/</kbd></div>
                                          <div className="flex justify-between items-center bg-slate-50 p-2 rounded"><span>Verrouiller</span><kbd className="px-2 bg-white border rounded text-xs">Alt + L</kbd></div>
                                          <div className="flex justify-between items-center bg-slate-50 p-2 rounded"><span>Fermer</span><kbd className="px-2 bg-white border rounded text-xs">Echap</kbd></div>
                                          <div className="flex justify-between items-center bg-slate-50 p-2 rounded"><span>Scanner</span><span className="text-xs text-green-600">Auto-focus</span></div>
                                    </div>
                              )}
                              {tab === 'troubleshoot' && (
                                    <div className="space-y-3">
                                          <div className="p-3 bg-red-50 rounded">
                                                <h3 className="font-semibold text-red-800 text-sm">Scanner inactif ?</h3>
                                                <p className="text-xs text-red-600">Activez VERR NUM et cliquez dans la barre de recherche.</p>
                                          </div>
                                          <div className="p-3 bg-blue-50 rounded">
                                                <h3 className="font-semibold text-blue-800 text-sm">Bug d'affichage ?</h3>
                                                <p className="text-xs text-blue-600">Touchez F5 pour actualiser. Données sécurisées.</p>
                                          </div>
                                    </div>
                              )}
                              {tab === 'support' && (
                                    <div className="text-center py-4">
                                          <p className="text-sm font-medium text-slate-700 mb-2">Service Informatique</p>
                                          <div className="text-xs text-slate-500 space-y-1">
                                                <p>support@etab.fr</p>
                                                <p>Poste 404</p>
                                          </div>
                                          <p className="mt-4 text-[10px] text-slate-300">v1.0.0</p>
                                    </div>
                              )}
                        </div>
                  </div>
            </div>
      );
}
