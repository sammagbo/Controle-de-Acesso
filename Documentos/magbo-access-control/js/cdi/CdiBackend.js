// =====================================================================
// CDI Backend (Client-Side Storage)
// =====================================================================

const CdiBackend = {
      // Helpers
      _get: (key) => JSON.parse(localStorage.getItem(key) || '[]'),
      _set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),

      // Students
      getStudents: async () => {
            return CdiBackend._get(CDI_STORAGE.students);
      },

      addStudent: async (student) => {
            const students = CdiBackend._get(CDI_STORAGE.students);
            if (students.some(s => s.id === student.id)) throw new Error('ID existe déjà');
            const newStudent = { ...student, present: false, lastEntry: null };
            students.push(newStudent);
            CdiBackend._set(CDI_STORAGE.students, students);
            return newStudent;
      },

      updateStudent: async (id, updates) => {
            const students = CdiBackend._get(CDI_STORAGE.students);
            const index = students.findIndex(s => s.id === id);
            if (index === -1) throw new Error('Étudiant introuvable');
            const updated = { ...students[index], ...updates };
            students[index] = updated;
            CdiBackend._set(CDI_STORAGE.students, students);
            return updated;
      },

      deleteStudent: async (id) => {
            const students = CdiBackend._get(CDI_STORAGE.students);
            const filtered = students.filter(s => s.id !== id);
            if (filtered.length === students.length) throw new Error('Étudiant introuvable');
            CdiBackend._set(CDI_STORAGE.students, filtered);
            // Remove from logs and present list too? Ideally yes, but keeping it simple for now
            return true;
      },

      // Scanning & Presence
      scanStudent: async (id) => {
            const students = CdiBackend._get(CDI_STORAGE.students);
            const index = students.findIndex(s => s.id === id);
            if (index === -1) throw { status: 404, message: 'Carte inconnue' };

            const student = students[index];
            const isEntering = !student.present;
            const now = Date.now();

            // Toggle presence
            student.present = isEntering;
            if (isEntering) student.lastEntry = now;

            // Update Student
            students[index] = student;
            CdiBackend._set(CDI_STORAGE.students, students);

            // Create Log
            const logs = CdiBackend._get(CDI_STORAGE.logs);
            logs.push({
                  studentId: id,
                  action: isEntering ? 'IN' : 'OUT',
                  timestamp: now
            });
            CdiBackend._set(CDI_STORAGE.logs, logs);

            return student;
      },

      // Logs
      getLogs: async () => {
            return CdiBackend._get(CDI_STORAGE.logs);
      },

      clearLogs: async () => {
            CdiBackend._set(CDI_STORAGE.logs, []);
            // Also reset presence?
            const students = CdiBackend._get(CDI_STORAGE.students);
            const resetStudents = students.map(s => ({ ...s, present: false }));
            CdiBackend._set(CDI_STORAGE.students, resetStudents);
            return true;
      },

      // Bulk Import
      importStudents: async (newStudents) => {
            const current = CdiBackend._get(CDI_STORAGE.students);
            const existingIds = new Set(current.map(s => s.id));
            const toAdd = newStudents.filter(s => !existingIds.has(s.id)).map(s => ({
                  ...s, present: false, lastEntry: null
            }));
            const final = [...current, ...toAdd];
            CdiBackend._set(CDI_STORAGE.students, final);
            return { added: toAdd.length, total: final.length };
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
