// =====================================================================
// CDI Student Manager Modal (Local Version)
// =====================================================================

function CdiStudentManagerModal({ open, onClose, students, setStudents, setToast }) {
      const [newStudent, setNewStudent] = React.useState({ name: '', class: '', id: '' });
      const [editing, setEditing] = React.useState(null);
      if (!open) return null;

      const generateId = () => 'E' + String(Math.max(...students.map(s => parseInt(s.id.slice(1)) || 0), 0) + 1).padStart(3, '0');

      const handleAdd = async () => {
            if (!newStudent.name || !newStudent.class) return;
            const id = newStudent.id || generateId();
            if (students.some(s => s.id === id)) { setToast({ message: 'ID déjà existant', type: 'error' }); return; }

            const parts = newStudent.name.trim().split(' ');
            const firstName = parts[0];
            const lastName = parts.slice(1).join(' ') || '';

            try {
                  // Local Backend Call
                  const saved = await CdiBackend.addStudent({
                        id, firstName, lastName, studentClass: newStudent.class
                  });

                  const mapped = {
                        id: saved.id,
                        name: `${saved.firstName || ''} ${saved.lastName || ''}`.trim(),
                        class: saved.studentClass,
                        present: saved.present,
                        lastEntry: saved.lastEntry
                  };
                  setStudents([...students, mapped]);
                  setNewStudent({ name: '', class: '', id: '' });
                  setToast({ message: 'Élève ajouté', type: 'success' });
            } catch (e) {
                  console.error(e);
                  setToast({ message: "Erreur ajout", type: 'error' });
            }
      };

      const handleDelete = async (id) => {
            if (!confirm('Supprimer cet élève ?')) return;
            try {
                  // Local Backend Call
                  await CdiBackend.deleteStudent(id);

                  setStudents(students.filter(s => s.id !== id));
                  setToast({ message: 'Élève supprimé', type: 'success' });
            } catch (e) {
                  console.error(e);
                  setToast({ message: "Erreur suppression", type: 'error' });
            }
      };

      const handleEdit = (s) => setEditing({ ...s });

      const handleSaveEdit = async () => {
            const parts = editing.name.trim().split(' ');
            const firstName = parts[0];
            const lastName = parts.slice(1).join(' ') || '';

            try {
                  // Local Backend Call
                  const saved = await CdiBackend.updateStudent(editing.id, {
                        firstName, lastName, studentClass: editing.class
                  });

                  const mapped = {
                        id: saved.id,
                        name: `${saved.firstName || ''} ${saved.lastName || ''}`.trim(),
                        class: saved.studentClass,
                        present: saved.present,
                        lastEntry: saved.lastEntry
                  };
                  setStudents(students.map(s => s.id === editing.id ? mapped : s));
                  setEditing(null);
                  setToast({ message: 'Modifications enregistrées', type: 'success' });
            } catch (e) {
                  console.error(e);
                  setToast({ message: "Erreur modification", type: 'error' });
            }
      };

      return (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
                  <div className="bg-white rounded-xl w-full max-w-lg mx-4 p-5 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                              <h2 className="font-bold text-lg">Base Élèves ({students.length})</h2>
                              <button onClick={onClose}><CdiIcon name="x" size={20} /></button>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3 mb-4">
                              <div className="grid grid-cols-3 gap-2 mb-2">
                                    <input placeholder="Nom Prénom" value={newStudent.name} onChange={e => setNewStudent({ ...newStudent, name: e.target.value })} className="px-2 py-1.5 border rounded text-sm" />
                                    <input placeholder="Classe" value={newStudent.class} onChange={e => setNewStudent({ ...newStudent, class: e.target.value })} className="px-2 py-1.5 border rounded text-sm" />
                                    <input placeholder="ID (auto)" value={newStudent.id} onChange={e => setNewStudent({ ...newStudent, id: e.target.value })} className="px-2 py-1.5 border rounded text-sm" />
                              </div>
                              <button onClick={handleAdd} className="w-full py-1.5 bg-blue-600 text-white rounded text-sm font-medium flex items-center justify-center gap-1">
                                    <CdiIcon name="plus" size={16} /> Ajouter
                              </button>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-1">
                              {students.map(s => (
                                    <div key={s.id} className="p-2 bg-slate-50 rounded flex items-center justify-between">
                                          {editing?.id === s.id ? (
                                                <div className="flex-1 flex gap-2 mr-2">
                                                      <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="flex-1 px-2 py-1 border rounded text-sm" />
                                                      <input value={editing.class} onChange={e => setEditing({ ...editing, class: e.target.value })} className="w-24 px-2 py-1 border rounded text-sm" />
                                                      <button onClick={handleSaveEdit} className="text-green-600"><CdiIcon name="check" size={18} /></button>
                                                      <button onClick={() => setEditing(null)} className="text-slate-400"><CdiIcon name="x" size={18} /></button>
                                                </div>
                                          ) : (
                                                <>
                                                      <div className="flex items-center gap-2">
                                                            <span className="text-xs text-slate-400 font-mono">{s.id}</span>
                                                            <span className="font-medium text-sm">{s.name}</span>
                                                            <span className="text-xs bg-slate-200 px-1.5 rounded">{s.class}</span>
                                                      </div>
                                                      <div className="flex gap-1">
                                                            <button onClick={() => handleEdit(s)} className="text-slate-400 hover:text-blue-600"><CdiIcon name="pencil" size={16} /></button>
                                                            <button onClick={() => handleDelete(s.id)} className="text-slate-400 hover:text-red-600"><CdiIcon name="trash-2" size={16} /></button>
                                                      </div>
                                                </>
                                          )}
                                    </div>
                              ))}
                        </div>
                  </div>
            </div>
      );
}
