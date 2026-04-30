// =====================================================================
// CDI Settings Modal — Import, Backup, Config
// =====================================================================

function CdiSettingsModal({ open, onClose, onImport, onReset, onRestore, onExport, count, muted, setMuted, pin, setPin, encryptBackup, setEncryptBackup, backupTime, setBackupTime, students, presentStudents, logs }) {
      const [text, setText] = React.useState('');
      const [newPin, setNewPin] = React.useState(pin);
      const fileInputRef = React.useRef(null);
      const csvInputRef = React.useRef(null);
      if (!open) return null;

      const parse = () => {
            const lines = text.trim().split('\n'), data = [];
            for (const line of lines) {
                  if (!line.trim() || line.toLowerCase().startsWith('id')) continue;
                  const sep = line.includes(';') ? ';' : ',';
                  const p = line.split(sep).map(x => x.trim().replace(/^["']|["']$/g, ''));
                  if (p.length >= 3) data.push({ id: p[0], name: p[1], class: p[2] });
            }
            if (!data.length) try { JSON.parse(text).forEach(i => i.id && i.name && i.class && data.push(i)); } catch { }
            return data;
      };

      const handleRestore = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                  try {
                        let content = ev.target.result;
                        if (content.startsWith("ENC:")) {
                              const pass = prompt("🔐 Fichier chiffré. Entrez le mot de passe :");
                              if (!pass) return;
                              const decrypted = SimpleCrypto.decrypt(content.slice(4), pass);
                              if (!decrypted) { alert("Mot de passe incorrect ou fichier corrompu."); return; }
                              content = decrypted;
                        }
                        const data = JSON.parse(content);
                        if (!data.students || !data.presentStudents) { alert('Format de sauvegarde invalide'); return; }
                        if (!confirm('⚠️ Ceci va remplacer toutes les données actuelles. Continuer?')) return;
                        onRestore(data);
                        onClose();
                  } catch (err) {
                        console.error(err);
                        alert('Erreur de lecture du fichier : ' + err.message);
                  }
            };
            reader.readAsText(file);
            e.target.value = '';
      };

      return (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
                  <div className="bg-white rounded-xl w-full max-w-md mx-4 p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                              <h2 className="font-bold text-lg">Paramètres</h2>
                              <button onClick={onClose}><CdiIcon name="x" size={20} /></button>
                        </div>
                        <div className="py-3 border-b bg-amber-50 rounded px-3 mb-2">
                              <h3 className="font-bold text-sm text-amber-800 mb-2 flex items-center gap-2"><CdiIcon name="shield" size={16} /> Sécurité & Sauvegardes</h3>
                              <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium text-amber-900">Chiffrer les backups</label>
                                    <button onClick={() => setEncryptBackup(!encryptBackup)} className={`w-10 h-6 rounded-full relative ${encryptBackup ? 'bg-amber-500' : 'bg-slate-300'}`}>
                                          <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow transition-all ${encryptBackup ? 'left-4.5' : 'left-0.5'}`}></div>
                                    </button>
                              </div>
                              <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-amber-900">Heure Auto-Backup</label>
                                    <input type="time" value={backupTime} onChange={e => setBackupTime(e.target.value)} className="border rounded px-2 py-1 text-sm bg-white" />
                              </div>
                        </div>
                        <div className="flex items-center justify-between py-3 border-b">
                              <span className="font-medium">Sons</span>
                              <button onClick={() => setMuted(!muted)} className={`w-10 h-6 rounded-full relative ${muted ? 'bg-slate-300' : 'bg-green-500'}`}>
                                    <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow transition-all ${muted ? 'left-0.5' : 'left-4.5'}`}></div>
                              </button>
                        </div>
                        <div className="py-3 border-b">
                              <label className="text-sm font-medium">Code PIN</label>
                              <input type="password" value={newPin} onChange={e => setNewPin(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded text-center tracking-widest" maxLength={6} />
                              <button onClick={() => { setPin(newPin); localStorage.setItem('cdi_pin', newPin); }} className="mt-2 text-sm text-blue-600">Sauvegarder</button>
                        </div>
                        <div className="py-3 border-b">
                              <label className="text-sm font-medium">Importer élèves (Excel/CSV)</label>
                              <div className="flex gap-2 mt-2 mb-2">
                                    <button onClick={() => csvInputRef.current?.click()} className="flex-1 py-2 bg-green-100 text-green-700 rounded text-sm flex items-center justify-center gap-1 hover:bg-green-200">
                                          <CdiIcon name="file-spreadsheet" size={16} /> Fichier Excel/CSV
                                    </button>
                                    <input ref={csvInputRef} type="file" accept=".xlsx,.xls,.csv,.txt,.json" onChange={(e) => {
                                          const file = e.target.files[0];
                                          if (!file) return;
                                          if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                                                const reader = new FileReader();
                                                reader.onload = (ev) => {
                                                      try {
                                                            const workbook = XLSX.read(ev.target.result, { type: 'array' });
                                                            const sheetName = workbook.SheetNames[0];
                                                            const sheet = workbook.Sheets[sheetName];
                                                            const data = XLSX.utils.sheet_to_csv(sheet);
                                                            setText(data);
                                                      } catch (err) { alert('Erreur lecture Excel: ' + err.message); }
                                                };
                                                reader.readAsArrayBuffer(file);
                                          } else {
                                                const reader = new FileReader();
                                                reader.onload = (ev) => setText(ev.target.result);
                                                reader.readAsText(file);
                                          }
                                          e.target.value = '';
                                    }} className="hidden" />
                              </div>
                              <textarea value={text} onChange={e => setText(e.target.value)} className="w-full h-20 p-2 border rounded font-mono text-sm" placeholder={"ID,Nom,Classe\n2024001,Dupont Marie,2nde A"} />
                              <button onClick={() => { const d = parse(); if (d.length) { onImport(d); setText(''); alert(`${d.length} élèves importés!`); onClose(); } else { alert('Aucun élève détecté. Vérifiez le format: ID, Nom, Classe'); } }} className="mt-2 px-4 py-2 bg-blue-600 text-white rounded text-sm w-full">Importer {text ? `(${parse().length} élèves)` : ''}</button>
                        </div>
                        <div className="py-3 border-b">
                              <label className="text-sm font-medium flex items-center gap-2"><CdiIcon name="database" size={16} /> Sauvegarde Système</label>
                              <div className="flex gap-2 mt-2">
                                    <button onClick={onExport} className="flex-1 py-2 bg-green-50 text-green-700 rounded text-sm flex items-center justify-center gap-1">
                                          <CdiIcon name="download" size={16} /> Exporter
                                    </button>
                                    <button onClick={() => fileInputRef.current?.click()} className="flex-1 py-2 bg-blue-50 text-blue-600 rounded text-sm flex items-center justify-center gap-1">
                                          <CdiIcon name="upload" size={16} /> Restaurer
                                    </button>
                                    <input ref={fileInputRef} type="file" accept=".json" onChange={handleRestore} className="hidden" />
                              </div>
                        </div>
                        <div className="pt-3">
                              <p className="text-sm text-slate-500 mb-2">{count} élèves • {logs.length} mouvements</p>
                              <button onClick={() => confirm('Réinitialiser toutes les présences?') && (onReset(), onClose())} className="w-full py-2 bg-red-50 text-red-600 rounded text-sm">Réinitialiser présences</button>
                        </div>
                  </div>
            </div>
      );
}
