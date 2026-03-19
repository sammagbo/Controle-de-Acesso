// =====================================================================
// CDI Backend (Client-Side Storage)
// =====================================================================

const CdiBackend = {
      // Helpers
      _get: (key) => JSON.parse(localStorage.getItem(key) || '[]'),
      _set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),

      // Students
      getStudents: async () => {
            const globalUsers = window.USERS || [];
            
            let activeLogMap = {};
            try {
                // Sincroniza presenças em tempo real com o backend Java!
                if (window.api && window.api.fetchLogs) {
                    const logs = await window.api.fetchLogs('BIBLIO');
                    const latest = {};
                    logs.forEach(l => {
                        const lTime = new Date(l.timestamp).getTime();
                        if (!latest[l.userId] || lTime > latest[l.userId].time) {
                            latest[l.userId] = { action: l.action || l.status, time: lTime };
                        }
                    });
                    
                    for (const uId in latest) {
                        if (latest[uId].action === 'ENTRADA') {
                            activeLogMap[uId] = latest[uId].time;
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to fetch logs for Biblioteca presence", e);
            }

            return globalUsers.map(u => {
                const parts = u.nome.split(' ');
                const isPresent = !!activeLogMap[u.id];
                return {
                    id: u.id,
                    firstName: parts[0] || u.nome,
                    lastName: parts.slice(1).join(' ') || '',
                    studentClass: u.turma || u.horario_saida || (u.tipo === 'RESPONSAVEL' ? 'Responsável' : u.tipo),
                    present: isPresent,
                    lastEntry: isPresent ? activeLogMap[u.id] : null
                };
            });
      },

      addStudent: async (student) => { throw new Error('Utilize o painel principal de configurações do App para cadastrar usuários.'); },
      updateStudent: async (id, updates) => { throw new Error('Somente leitura no CDI.'); },
      deleteStudent: async (id) => { throw new Error('Não suportado.'); },

      // Scanning & Presence connect to Java API
      scanStudent: async (id) => {
            const user = window.USERS?.find(u => u.id === id);
            if (!user) throw { status: 404, message: 'Carte inconnue' };

            const students = await CdiBackend.getStudents();
            const studentState = students.find(s => s.id === id) || { id, firstName: user.nome.split(' ')[0], present: false };
            
            const isEntering = !studentState.present;
            const action = isEntering ? 'ENTRADA' : 'SAIDA';
            
            try {
                if (window.api && window.api.registerAccess) {
                    await window.api.registerAccess(id, 'BIBLIO', action);
                }
            } catch(e) {
                console.error(e);
                throw { status: 500, message: 'Erro na API' };
            }

            studentState.present = isEntering;
            studentState.lastEntry = isEntering ? Date.now() : null;
            
            return studentState;
      },

      // Logs
      // Logs mapped from Java API
      getLogs: async () => {
            try {
                if (window.api && window.api.fetchLogs) {
                    const logs = await window.api.fetchLogs('BIBLIO');
                    return logs.map(l => ({
                        studentId: l.userId, 
                        action: (l.action || l.status) === 'ENTRADA' ? 'IN' : 'OUT', 
                        timestamp: new Date(l.timestamp).getTime()
                    }));
                }
            } catch (e) { console.error(e); }
            return [];
      },

      clearLogs: async () => { throw new Error('Não suportado. Backups são lidos do servidor Java Central.'); },

      // Bulk Import
      // Bulk Import (Disabled natively, handled by Master App)
      importStudents: async (newStudents) => {
            return { added: 0, total: window.USERS ? window.USERS.length : 0 };
      },

      // Full Restore (Backup)
      restore: async (data) => {
            if (data.students) CdiBackend._set(CDI_STORAGE.students, data.students);
            if (data.logs) CdiBackend._set(CDI_STORAGE.logs, data.logs);
            if (data.settings) {
                  if (data.settings.muted !== undefined) localStorage.setItem(CDI_STORAGE.muted, data.settings.muted);
                  if (data.settings.pin) localStorage.setItem(CDI_STORAGE.pin, data.settings.pin);
            }
            return true;
      }
};
