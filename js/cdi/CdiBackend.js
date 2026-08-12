// =====================================================================
// CDI Backend (Client-Side Storage)
// =====================================================================

const CdiBackend = {
      // Helpers
      _get: (key) => JSON.parse(localStorage.getItem(key) || '[]'),
      _set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),

      /**
       * Incluir SERVIDORES nas telas e nos números do CDI.
       *
       * Padrão false: com 152 FUNCIONARIO + 49 PROFESSOR cadastrados, os
       * servidores entram por segundos, quase nunca passam o rosto na saída, e
       * o fechamento das 17:00 transforma isso em "permanência" de um dia
       * inteiro — ontem ~15 FUNC-### foram fechados assim. O CDI é sobre
       * alunos; ver o resto é uma escolha explícita de quem está olhando.
       *
       * Só afeta EXIBIÇÃO. access_logs continua recebendo tudo, e o Journal
       * continua mostrando tudo.
       */
      incluirFuncionarios: false,

      setIncluirFuncionarios(valor) {
            CdiBackend.incluirFuncionarios = !!valor;
      },

      /**
       * Lê UMA vez os eventos do ponto BIBLIO.
       *
       * Devolve [] em qualquer falha: a tela do CDI não pode quebrar porque o
       * servidor piscou — sem eventos, todo mundo aparece como ausente, que é
       * o mesmo comportamento de antes.
       */
      _fetchBiblioLogs: async () => {
            try {
                  if (window.api && window.api.fetchLogs) {
                        return await window.api.fetchLogs('BIBLIO');
                  }
            } catch (e) {
                  console.error("Failed to fetch logs for Biblioteca presence", e);
            }
            return [];
      },

      /** Presença derivada do ÚLTIMO evento de cada pessoa no ponto. */
      _studentsFrom: (logs) => {
            const todos = (window.userCache?.all()) || [];
            // Um único ponto de filtro: tira o servidor da lista, da contagem
            // de presentes, da chamada de emergência, da tela de bloqueio e do
            // exportador de backup de uma vez só.
            const globalUsers = window.MagboReport
                  ? window.MagboReport.filterPeopleByTipo(todos, CdiBackend.incluirFuncionarios)
                  : todos;

            const latest = {};
            (logs || []).forEach(l => {
                  const lTime = new Date(l.timestamp).getTime();
                  if (!latest[l.userId] || lTime > latest[l.userId].time) {
                        latest[l.userId] = { action: l.action || l.status, time: lTime };
                  }
            });

            const activeLogMap = {};
            for (const uId in latest) {
                  if (latest[uId].action === 'ENTRADA') {
                        activeLogMap[uId] = latest[uId].time;
                  }
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

      /** Os mesmos eventos no formato que as telas do CDI consomem. */
      _logsFrom: (logs) => {
            const visiveis = window.MagboReport
                  ? window.MagboReport.filterLogsByTipo(
                        logs || [], (id) => window.userCache?.byId(id), CdiBackend.incluirFuncionarios)
                  : (logs || []);
            return visiveis.map(l => ({
                  studentId: l.userId,
                  action: (l.action || l.status) === 'ENTRADA' ? 'IN' : 'OUT',
                  timestamp: new Date(l.timestamp).getTime(),
                  // A flag TEM de viajar: é ela que distingue a saída real
                  // da SAIDA sintética das 17:00, que não pode entrar em
                  // média de permanência.
                  flag: l.flag || null
            }));
      },

      /**
       * As DUAS visões da tela a partir de UMA leitura.
       *
       * `getStudents()` e `getLogs()` liam o mesmo `/access/logs/BIBLIO` cada
       * uma por sua conta. A tela chamava as duas em sequência, e o polling de
       * 3s multiplicava isso: duas requisições idênticas de até 500 linhas a
       * cada ciclo, uma delas inteiramente desperdiçada. Elas continuam
       * existindo para quem precisa de uma coisa só (`scanStudent`); quem
       * precisa das duas usa isto.
       */
      getSnapshot: async () => {
            const brutos = await CdiBackend._fetchBiblioLogs();
            return {
                  students: CdiBackend._studentsFrom(brutos),
                  logs: CdiBackend._logsFrom(brutos)
            };
      },

      // Students
      getStudents: async () => CdiBackend._studentsFrom(await CdiBackend._fetchBiblioLogs()),

      addStudent: async (student) => { throw new Error('Utilize o painel principal de configurações do App para cadastrar usuários.'); },
      updateStudent: async (id, updates) => { throw new Error('Somente leitura no CDI.'); },
      deleteStudent: async (id) => { throw new Error('Não suportado.'); },

      // Scanning & Presence connect to Java API
      scanStudent: async (id) => {
            const user = (window.userCache?.byId(id)) || null;
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

      // Logs mapped from Java API
      getLogs: async () => CdiBackend._logsFrom(await CdiBackend._fetchBiblioLogs()),

      /**
       * Eventos do BIBLIO numa JANELA EXPLÍCITA — a fonte do Dashboard &
       * Rapports.
       *
       * ⚠️ Existe porque o snapshot da tela vem de /access/logs/BIBLIO, que
       * devolve as últimas 24 HORAS (teto 500) — e era ele que alimentava o
       * relatório: "Cette Semaine" e "Ce Mois" filtravam uma lista que só
       * tinha um dia dentro. Os botões funcionavam; os dados não. Descoberto
       * em 12/08/2026 na varredura dos contadores.
       *
       * Passa pelo MESMO _logsFrom do snapshot: mesmo filtro de tipo, mesma
       * forma, mesma flag viajando — duas fontes, uma normalização.
       *
       * @returns lista no formato do CDI, ou null quando a busca falhou —
       *          null e não []: "não consegui" deixa a tela usar o snapshot
       *          de 24h como degradação anunciada; [] diria "não houve
       *          movimento", que é outra afirmação.
       */
      getLogsRange: async (dateFrom, dateTo) => {
            try {
                  if (typeof fetchLogs === 'function') {
                        const brutos = await fetchLogs('BIBLIO', { dateFrom, dateTo, limit: 5000 });
                        return CdiBackend._logsFrom(brutos);
                  }
            } catch (e) {
                  console.error('Failed to fetch BIBLIO logs for range', e);
            }
            return null;
      },

      // Bulk Import
      // Bulk Import (Disabled natively, handled by Master App)
      importStudents: async (newStudents) => {
            return { added: 0, total: (window.userCache?.all().length || 0) };
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
