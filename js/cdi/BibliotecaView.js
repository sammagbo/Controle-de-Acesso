// =====================================================================
// BibliotecaView — Main CDI Component (Local Version)
// =====================================================================

function BibliotecaView({ onBack }) {
      const { useState, useEffect, useRef, useCallback, useMemo } = React;

      // Helper: Map Backend Data to View Format
      const mapToView = useCallback((s) => ({
            id: s.id,
            name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
            class: s.studentClass || '',
            present: !!s.present,
            lastEntry: s.lastEntry
      }), []);

      // State
      const [students, setStudents] = useState([]);
      const [presentStudents, setPresentStudents] = useState(new Set());
      const [logs, setLogs] = useState([]);
      const [loading, setLoading] = useState(true);

      // Load Data locally
      useEffect(() => {
            const init = async () => {
                  try {
                        const localStudents = await CdiBackend.getStudents();
                        const localLogs = await CdiBackend.getLogs();

                        // Seed if empty (first run)
                        if (localStudents.length === 0) {
                              const seeds = [
                                    { id: 'E001', firstName: 'Jean', lastName: 'Dupont', studentClass: '2nde A' },
                                    { id: 'E002', firstName: 'Marie', lastName: 'Curie', studentClass: '1ere S' },
                                    { id: 'E003', firstName: 'Albert', lastName: 'Einstein', studentClass: 'Terminale C' }
                              ];
                              await CdiBackend.importStudents(seeds);
                              const seeded = await CdiBackend.getStudents();
                              setStudents(seeded.map(mapToView));
                        } else {
                              setStudents(localStudents.map(mapToView));
                        }

                        setPresentStudents(new Set(localStudents.filter(s => s.present).map(s => s.id)));
                        setLogs(localLogs);
                  } catch (e) {
                        console.error("Init Error:", e);
                        setToast({ message: "Erreur chargement données", type: "error" });
                  } finally { setLoading(false); }
            };
            init();
      }, [mapToView]);

      const [muted, setMuted] = useState(() => localStorage.getItem(CDI_STORAGE.muted) === 'true');
      const [pin, setPin] = useState(() => localStorage.getItem(CDI_STORAGE.pin) || CDI_DEFAULT_PIN);

      const [encryptBackup, setEncryptBackup] = useState(() => localStorage.getItem('cdi_encrypt') === 'true');
      const [backupTime, setBackupTime] = useState(() => localStorage.getItem('cdi_backup_time') || '16:45');
      const [lastBackup, setLastBackup] = useState(() => localStorage.getItem('cdi_last_backup') || '');
      const [unsavedChanges, setUnsavedChanges] = useState(false);

      const [query, setQuery] = useState('');
      const [classFilter, setClassFilter] = useState(null);
      const [modal, setModal] = useState(null);
      const [flash, setFlash] = useState({ id: null, type: null });
      const [toast, setToast] = useState(null);
      const [emergency, setEmergency] = useState(false);
      const [verified, setVerified] = useState(new Set());
      const [locked, setLocked] = useState(false);
      const inputRef = useRef(null);
      const scanBuffer = useRef('');
      const scanTimeout = useRef(null);

      // Persist settings
      useEffect(() => { localStorage.setItem(CDI_STORAGE.muted, muted); }, [muted]);
      useEffect(() => { localStorage.setItem('cdi_encrypt', encryptBackup); }, [encryptBackup]);
      useEffect(() => { localStorage.setItem('cdi_backup_time', backupTime); }, [backupTime]);
      useEffect(() => { if (lastBackup) localStorage.setItem('cdi_last_backup', lastBackup); }, [lastBackup]);

      useEffect(() => { if (!emergency && !locked) inputRef.current?.focus(); }, [emergency, locked, modal]);
      useEffect(() => { if (!emergency) setVerified(new Set()); }, [emergency]);

      // Unsaved Changes Guard
      useEffect(() => {
            const handleBeforeUnload = (e) => { if (unsavedChanges) { e.preventDefault(); e.returnValue = ''; } };
            window.addEventListener('beforeunload', handleBeforeUnload);
            return () => window.removeEventListener('beforeunload', handleBeforeUnload);
      }, [unsavedChanges]);

      // Export Backup
      const exportBackup = useCallback((silent = false) => {
            let password = null;
            if (encryptBackup && !silent) {
                  password = prompt("🔐 Définir un mot de passe pour cette sauvegarde (optionnel mais recommandé):");
                  if (password === null) return;
            }
            // For backup, we want the raw data or we can assume state is trusted.
            // Ideally we backup internal storage state, but backing up view state is "okay" if consistent.
            // Better: fetch fresh from backend to be safe? 
            // Actually, `students` state is view-format. CdiBackend has raw format. 
            // Let's grab from Backend for consistency in backup!
            CdiBackend.getStudents().then(rawStudents => {
                  CdiBackend.getLogs().then(rawLogs => {
                        const data = {
                              version: '1.0', timestamp: new Date().toISOString(),
                              students: rawStudents, // Backup raw format
                              presentStudents: rawStudents.filter(s => s.present).map(s => s.id),
                              logs: rawLogs,
                              settings: { muted, pin, encryptBackup, backupTime }, encrypted: !!password
                        };
                        let content = JSON.stringify(data, null, 2);
                        if (password) { content = "ENC:" + SimpleCrypto.encrypt(content, password); }
                        const blob = new Blob([content], { type: 'application/json' });
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = `cdi_backup_${new Date().toISOString().slice(0, 10)}${password ? '_secure' : ''}.json`;
                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                        setLastBackup(new Date().toISOString().slice(0, 10));
                        setUnsavedChanges(false);
                        if (!silent) setToast({ message: 'Sauvegarde effectuée !', type: 'success' });
                  });
            });
      }, [muted, pin, encryptBackup, backupTime]);

      // Auto-Backup
      useEffect(() => {
            const checkBackup = () => {
                  const now = new Date();
                  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                  const today = now.toISOString().slice(0, 10);
                  if (timeStr === backupTime && lastBackup !== today) {
                        setToast({ message: '⏳ Sauvegarde automatique...', type: 'in' });
                        exportBackup(true);
                  }
            };
            const interval = setInterval(checkBackup, 60000);
            return () => clearInterval(interval);
      }, [backupTime, lastBackup, exportBackup]);

      // Class filters
      const classGroups = useMemo(() => {
            const groups = { 'Tous': students.length };
            students.forEach(s => {
                  const level = (s.class && typeof s.class === 'string') ? s.class.split(' ')[0] : 'Inconnu';
                  groups[level] = (groups[level] || 0) + 1;
            });
            return groups;
      }, [students]);

      // Toggle Presence
      const togglePresence = useCallback(async (id, fromScanner = false) => {
            if (emergency || locked) return;
            try {
                  // Local Backend Call
                  const updated = await CdiBackend.scanStudent(id); // Throws if 404
                  const mapped = mapToView(updated);

                  setStudents(prev => prev.map(s => s.id === updated.id ? mapped : s));
                  const isEntering = updated.present;
                  setPresentStudents(prev => { const next = new Set(prev); isEntering ? next.add(updated.id) : next.delete(updated.id); return next; });
                  setLogs(prev => [...prev, { studentId: updated.id, action: isEntering ? 'IN' : 'OUT', timestamp: Date.now() }]);

                  if (!muted) { isEntering ? CdiSound.success() : CdiSound.exit(); }
                  if (fromScanner) setToast({ message: `${mapped.name}: ${isEntering ? 'Entré' : 'Sorti'}`, type: isEntering ? 'in' : 'out' });
                  setFlash({ id: updated.id, type: isEntering ? 'in' : 'out' });
                  setTimeout(() => setFlash({ id: null, type: null }), 300);
            } catch (err) {
                  console.error(err);
                  if (err.status === 404 || err.message === 'Carte inconnue') {
                        if (!muted) CdiSound.error();
                        setToast({ message: 'Carte inconnue', type: 'error' });
                  } else {
                        setToast({ message: "Erreur interne", type: "error" });
                  }
            }
            setQuery(''); inputRef.current?.focus();
      }, [emergency, locked, muted, mapToView]);

      // Scanner
      useEffect(() => {
            const handleKeyDown = (e) => {
                  if (locked || emergency || modal) return;
                  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                  if (e.key === 'Enter' && scanBuffer.current.length > 0) { togglePresence(scanBuffer.current, true); scanBuffer.current = ''; return; }
                  if (/^[A-Za-z0-9]$/.test(e.key)) { scanBuffer.current += e.key.toUpperCase(); clearTimeout(scanTimeout.current); scanTimeout.current = setTimeout(() => { scanBuffer.current = ''; }, 100); }
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
      }, [togglePresence, locked, emergency, modal]);

      // Keyboard Shortcuts
      useEffect(() => {
            const handleShortcuts = (e) => {
                  if (e.key === 'Escape') {
                        if (modal) { setModal(null); e.preventDefault(); return; }
                        if (query) { setQuery(''); setClassFilter(null); e.preventDefault(); return; }
                  }
                  if (e.altKey && e.key.toLowerCase() === 'l') { e.preventDefault(); setLocked(true); return; }
                  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                  if (e.key === '/' || (e.ctrlKey && e.key.toLowerCase() === 'f')) { e.preventDefault(); inputRef.current?.focus(); return; }
            };
            window.addEventListener('keydown', handleShortcuts);
            return () => window.removeEventListener('keydown', handleShortcuts);
      }, [modal, query]);

      // Import handler
      const handleImport = async (data) => {
            const toImport = data.map(s => {
                  const parts = s.name.trim().split(' ');
                  return {
                        id: s.id,
                        firstName: parts[0],
                        lastName: parts.slice(1).join(' ') || '',
                        studentClass: s.class
                  };
            });

            await CdiBackend.importStudents(toImport);
            const refreshed = await CdiBackend.getStudents();
            setStudents(refreshed.map(mapToView)); // FIX: Map to view format
      };

      // Filter results
      const results = useMemo(() => {
            let list = students;
            if (classFilter && classFilter !== 'Tous') list = list.filter(s => s.class.startsWith(classFilter));
            if (query.length >= 2) list = list.filter(s => s.name.toLowerCase().includes(query.toLowerCase()) || s.class.toLowerCase().includes(query.toLowerCase()));
            else if (!classFilter) list = [];
            return list;
      }, [students, query, classFilter]);

      const presentList = students.filter(s => presentStudents.has(s.id));
      const count = presentStudents.size;
      const isFull = count >= CDI_CAPACITY;

      // CSS for CDI animations
      const cdiStyles = `
    @keyframes flashIn { 0% { background: #d1fae5; } 100% { background: transparent; } }
    @keyframes flashOut { 0% { background: #fee2e2; } 100% { background: transparent; } }
    @keyframes toastIn { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .flash-in { animation: flashIn 0.3s ease-out; }
    .flash-out { animation: flashOut 0.3s ease-out; }
    .toast { animation: toastIn 0.2s ease-out; }
  `;

      // Loading
      if (loading) return (
            <div className="h-full flex flex-col items-center justify-center bg-slate-100">
                  <style>{cdiStyles}</style>
                  <div className="w-7 h-7 bg-blue-600 text-white rounded flex items-center justify-center text-xs font-bold mb-4">CDI</div>
                  <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
                  <p className="mt-4 text-slate-500 text-sm">Chargement des données...</p>
            </div>
      );

      if (locked) return (
            <React.Fragment>
                  <style>{cdiStyles}</style>
                  <CdiLockScreen onUnlock={() => setLocked(false)} pin={pin} count={count} />
            </React.Fragment>
      );

      // EMERGENCY MODE
      if (emergency) {
            return (
                  <div className="h-full flex flex-col bg-black">
                        <style>{cdiStyles}</style>
                        <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 shrink-0">
                              <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-red-600 text-white rounded flex items-center justify-center"><CdiIcon name="shield-alert" size={24} /></div>
                                    <span className="font-bold text-white text-lg">MODE CONFINEMENT</span>
                              </div>
                              <span className="font-mono text-white"><CdiClock /></span>
                        </header>
                        <div className="py-6 text-center bg-gray-900/50 border-b border-gray-800">
                              <div className="text-8xl font-bold text-white">{count}</div>
                              <p className="text-xl text-gray-400 uppercase">PRÉSENTS CONFIRMÉS</p>
                              <p className="text-green-500 mt-2">{verified.size} / {count} vérifiés</p>
                        </div>
                        <main className="flex-1 overflow-y-auto p-6">
                              <div className="max-w-3xl mx-auto space-y-3">
                                    {presentList.map(s => {
                                          const isV = verified.has(s.id);
                                          return (
                                                <div key={s.id} onClick={() => setVerified(p => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}
                                                      className={`p-5 rounded-xl flex justify-between items-center cursor-pointer border-2 ${isV ? 'bg-green-900/30 border-green-500' : 'bg-gray-900 border-gray-700'}`}>
                                                      <div className="flex items-center gap-4">
                                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold ${isV ? 'bg-green-500' : 'bg-gray-700'} text-white`}>
                                                                  {isV ? <CdiIcon name="check" size={24} /> : s.name[0]}
                                                            </div>
                                                            <div>
                                                                  <div className="text-2xl font-bold text-white">{s.name}</div>
                                                                  <div className="text-lg text-yellow-400">{s.class}</div>
                                                            </div>
                                                      </div>
                                                </div>
                                          );
                                    })}
                              </div>
                        </main>
                        <footer className="h-14 bg-gray-900 border-t border-gray-800 flex items-center justify-center shrink-0 gap-4">
                              <button onClick={() => window.print()} className="px-6 py-2 bg-slate-700 text-white rounded font-bold flex items-center gap-2 hover:bg-slate-600">
                                    <CdiIcon name="printer" size={18} /> IMPRIMER LISTE
                              </button>
                              <button onClick={() => setEmergency(false)} className="px-6 py-2 bg-red-600 text-white rounded font-bold flex items-center gap-2 hover:bg-red-500">
                                    <CdiIcon name="shield-off" size={18} /> DÉSACTIVER
                              </button>
                        </footer>
                  </div>
            );
      }

      // NORMAL MODE
      return (
            <div className="h-full flex flex-col bg-slate-100">
                  <style>{cdiStyles}</style>

                  {toast && <CdiToast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

                  {/* CDI Header */}
                  <header className="h-12 bg-white border-b flex items-center justify-between px-5 shrink-0">
                        <div className="flex items-center gap-3">
                              <button onClick={onBack} className="flex items-center gap-1 text-slate-500 hover:text-blue-600 text-sm font-medium">
                                    <CdiIcon name="arrow-left" size={18} /> Dashboard
                              </button>
                              <div className="w-px h-6 bg-slate-200"></div>
                              <div className="w-7 h-7 bg-blue-600 text-white rounded flex items-center justify-center text-xs font-bold">CDI</div>
                              <span className="font-semibold text-slate-700">SafeTrack — Biblioteca</span>
                        </div>
                        <div className="flex items-center gap-2">
                              <CdiClock />
                              <button onClick={() => setModal('stats')} title="Statistiques" className="w-8 h-8 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><CdiIcon name="bar-chart-3" size={18} /></button>
                              <button onClick={() => setModal('students')} title="Base Élèves" className="w-8 h-8 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><CdiIcon name="users" size={18} /></button>
                              <button onClick={() => setModal('history')} title="Historique" className="w-8 h-8 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><CdiIcon name="history" size={18} /></button>
                              <button onClick={() => setModal('help')} title="Aide & Support" className="w-8 h-8 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><CdiIcon name="help-circle" size={18} /></button>
                              <button onClick={() => setLocked(true)} title="Verrouiller (Alt+L)" className="w-8 h-8 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><CdiIcon name="lock" size={18} /></button>
                              <button onClick={() => setModal('settings')} title="Paramètres" className="w-8 h-8 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><CdiIcon name="settings" size={18} /></button>
                        </div>
                  </header>

                  {/* Main Split View */}
                  <main className="flex-1 flex overflow-hidden">
                        {/* Left Panel — Search & Students */}
                        <section className="w-1/2 bg-slate-50 border-r flex flex-col p-4">
                              <div className="relative mb-2">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><CdiIcon name="search" size={18} /></span>
                                    <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
                                          className="w-full pl-10 pr-3 py-3 border-2 rounded-lg focus:border-blue-600 outline-none" placeholder="Rechercher... (/)" />
                              </div>
                              <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
                                    {Object.entries(classGroups).map(([level, cnt]) => (
                                          <button key={level} onClick={() => setClassFilter(classFilter === level ? null : level)}
                                                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap flex items-center gap-1
                  ${classFilter === level ? 'bg-blue-600 text-white' : 'bg-white border text-slate-600 hover:border-blue-600'}`}>
                                                {level} <span className="opacity-60">({cnt})</span>
                                          </button>
                                    ))}
                              </div>
                              <div className="flex-1 overflow-y-auto space-y-1">
                                    {results.length === 0 ? (
                                          <div className="text-center text-slate-400 mt-10">
                                                <CdiIcon name="search" size={32} />
                                                <p className="mt-2">{query.length < 2 && !classFilter ? 'Tapez ou filtrez' : 'Aucun résultat'}</p>
                                          </div>
                                    ) : results.map(s => {
                                          const isIn = presentStudents.has(s.id);
                                          return (
                                                <div key={s.id} onClick={() => togglePresence(s.id)}
                                                      className={`p-3 rounded-lg border flex justify-between items-center cursor-pointer ${flash.id === s.id ? (flash.type === 'in' ? 'flash-in' : 'flash-out') : ''} ${isIn ? 'bg-slate-100 opacity-50' : 'bg-white hover:border-blue-600'}`}>
                                                      <div>
                                                            <span className="font-medium text-slate-800">{s.name}</span>
                                                            <span className="ml-2 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded">{s.class}</span>
                                                      </div>
                                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isIn ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                                            <CdiIcon name={isIn ? 'log-out' : 'log-in'} size={16} />
                                                      </div>
                                                </div>
                                          );
                                    })}
                              </div>
                        </section>

                        {/* Right Panel — Present Students */}
                        <section className="w-1/2 bg-white flex flex-col p-4">
                              <div className={`text-center mb-4 pb-4 border-b ${isFull ? 'bg-red-50 -mx-4 px-4 pt-4' : ''}`}>
                                    {isFull && <p className="text-red-600 text-sm font-semibold mb-1">⚠️ CAPACITÉ MAX</p>}
                                    <div className={`text-5xl font-bold ${isFull ? 'text-red-600' : 'text-blue-600'}`}>{count}</div>
                                    <div className="text-slate-400 text-sm">/ {CDI_CAPACITY}</div>
                              </div>
                              <div className="flex-1 overflow-y-auto space-y-1">
                                    {!presentList.length ? (
                                          <div className="text-center text-slate-300 mt-10"><CdiIcon name="users" size={40} /><p className="mt-2">Vide</p></div>
                                    ) : presentList.map(s => (
                                          <div key={s.id} className={`p-3 bg-slate-50 rounded-lg flex justify-between items-center group ${flash.id === s.id && flash.type === 'out' ? 'flash-out' : ''}`}>
                                                <div className="flex items-center gap-3">
                                                      <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">{s.name[0]}</div>
                                                      <div><div className="font-semibold text-slate-800">{s.name}</div><div className="text-xs text-slate-400">{s.class}</div></div>
                                                </div>
                                                <button onClick={() => togglePresence(s.id)} className="text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100">
                                                      <CdiIcon name="x" size={18} />
                                                </button>
                                          </div>
                                    ))}
                              </div>
                        </section>
                  </main>

                  {/* Footer */}
                  <footer className="h-14 bg-white border-t flex items-center justify-between px-5 shrink-0">
                        <div className="flex flex-col text-xs text-slate-400">
                              <span>© 2026 SafeTrack. Tous droits réservés.</span>
                              <span>Developed with <span className="text-red-500">♥</span> by <a href="https://www.linkedin.com/in/sam-magbo-02086555/" target="_blank" rel="noopener noreferrer" className="font-bold text-slate-600 hover:text-blue-600 hover:underline">Magbo Studio</a></span>
                        </div>
                        <button onClick={() => setEmergency(true)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-red-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors">
                              <CdiIcon name="shield-alert" size={16} /> <span className="font-semibold">MODE URGENCE</span>
                        </button>
                  </footer>

                  {/* Modals */}
                  <CdiSettingsModal open={modal === 'settings'} onClose={() => setModal(null)} onImport={handleImport}
                        onReset={() => { setPresentStudents(new Set()); setLogs([]); CdiBackend.clearLogs(); }}
                        onRestore={async (data) => {
                              await CdiBackend.restore(data);
                              const restored = await CdiBackend.getStudents();
                              const logs = await CdiBackend.getLogs();
                              setStudents(restored.map(mapToView)); // FIX: Map to view format
                              setPresentStudents(new Set(restored.filter(s => s.present).map(s => s.id)));
                              setLogs(logs);
                        }}
                        onExport={() => exportBackup()}
                        count={students.length} muted={muted} setMuted={setMuted} pin={pin} setPin={setPin}
                        encryptBackup={encryptBackup} setEncryptBackup={setEncryptBackup}
                        backupTime={backupTime} setBackupTime={setBackupTime}
                        students={students} presentStudents={presentStudents} logs={logs} />
                  <CdiHistoryModal open={modal === 'history'} onClose={() => setModal(null)} logs={logs} students={students} />
                  <CdiStatsModal open={modal === 'stats'} onClose={() => setModal(null)} logs={logs} students={students} />
                  <CdiStudentManagerModal open={modal === 'students'} onClose={() => setModal(null)} students={students} setStudents={setStudents} setToast={setToast} />
                  <CdiHelpModal open={modal === 'help'} onClose={() => setModal(null)} />
            </div>
      );
}
