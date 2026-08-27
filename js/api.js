// =====================================================================
// API INTEGRATION LAYER
// =====================================================================

// API URL: reads from Electron preload config (production) or falls back to localhost (dev)
/**
 * A razão do servidor, ou null quando o corpo é o envelope do /error do Spring.
 *
 * ⚠️ ESTA FUNÇÃO EXISTE POR CAUSA DE UM DEFEITO QUE EU MESMO CRIEI EM 20/08/2026.
 * Ao ensinar o front a ler os DOIS dialetos de erro do backend
 * (`{error}` e `{status,message}`), passei a preferir `data.error` — e o
 * envelope do /error do Spring TAMBÉM tem um campo `error`, que é a
 * REASON PHRASE HTTP EM INGLÊS:
 *
 *     { "timestamp": "...", "status": 403, "error": "Forbidden", "path": "..." }
 *
 * Resultado medido com uma conta OPERATOR real: a aba Personnels mostrava um
 * toast dizendo «Forbidden» — inglês, numa interface francesa — em vez do
 * texto traduzido. Antes da minha mudança caía no genérico; depois dela,
 * piorou. Achado ao PERCORRER A TELA, não pelos testes.
 *
 * Os dois formatos distinguem-se sem ambiguidade: o envelope do Spring traz
 * `status` E `path`; um erro de aplicação deste backend traz `error` (ou
 * `status:"error"` + `message`) e nunca `path`.
 */
function razaoDoServidor(data) {
      if (!data || typeof data !== 'object') return null;
      const envelopeDoSpring = ('path' in data) && ('status' in data) && typeof data.status === 'number';
      if (envelopeDoSpring) return null;   // `error` ali é "Forbidden"/"Not Found", não uma razão
      return data.message || data.error || null;
}

const API_BASE_URL = ((window.magboConfig?.getCached?.()?.apiUrl) || 'http://localhost:8080') + '/api';

function authHeaders(extra = {}) {
  const token = window.auth?.getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...extra
  };
}
// Mensagens de erro DA CAMADA (as do backend passam cruas — dívida 5-bis).
// Fallback identidade: sem i18n carregado, a chave ainda é legível no log.
const T = (k) => (typeof window !== 'undefined' && window.MagboI18n ? window.MagboI18n.t(k) : k);

// Expose for other files
if (typeof window !== 'undefined') {
  window.authHeaders = authHeaders;
}

/**
 * Só o Authorization — para envio de FormData e de corpo binário.
 *
 * authHeaders() sempre declara Content-Type: application/json. Com FormData
 * isso substitui o multipart/form-data + boundary que o navegador geraria, e o
 * servidor recebe um corpo que não sabe separar em partes: o upload chega
 * vazio, sem erro visível. Com corpo binário, declara o tipo errado.
 */
function somenteAutorizacao() {
  const token = window.auth?.getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

const api = {
    /**
     * Helper para lidar com falhas de rede (ex: servidor offline)
     * e respostas HTTP de erro.
     */
    async handleResponse(response) {
        // ⚠️ SO 401 E SESSAO — ver o comentario longo em js/utils/api.js.
        // Deslogar por 403 fazia a importacao de refeicoes dizer "sessao
        // expirada" para um erro de FORMATO DE DATA.
        if (response.status === 401) {
            window.auth?.logout();
            throw new Error(T('api.sessao.expirada'));
        }
        if (response.status === 403 && !window.auth?.getToken?.()) {
            window.auth?.logout();
            throw new Error(T('api.sessao.expirada'));
        }
        if (!response.ok) {
            let errorMsg = null;
            try {
                const data = await response.json();
                // ⚠️ O BACKEND FALA DOIS DIALETOS DE ERRO, e este ramo lia só um:
                //   {"error": "..."}                     Access, ExitPermission,
                //                                        MealEntitlement, SystemUser, User
                //   {"status":"error","message":"..."}   Staff, Regime, Photo, Totvs
                // Ler apenas `message` jogava METADE das razões reais no lixo e
                // punha "Erreur de communication avec le serveur" no lugar. É por
                // isso que as telas de foto e de pessoal pareciam bem e o portão
                // não: era o dialeto, não a tela.
                errorMsg = razaoDoServidor(data);
            } catch (e) {
                // corpo não-JSON: cai nos genéricos abaixo
            }
            if (!errorMsg) {
                // ⚠️ FORA do catch, e é ESTE o ponto. Não há @ControllerAdvice no
                // backend, então uma exceção não tratada cai no /error do Spring,
                // que devolve JSON VÁLIDO e SEM `message`
                // (server.error.include-message=on_param). Com estes ramos dentro
                // do catch, `response.json()` tinha sucesso, o catch nunca corria,
                // e um 500 de verdade chegava ao operador como "erro de
                // comunicação" — ou seja, como problema de REDE. Eram código morto
                // em produção.
                if (response.status === 404) errorMsg = T('api.nao.encontrado');
                else if (response.status === 409) errorMsg = T('api.duplicidade');
                else if (response.status === 403) errorMsg = T('api.sem.permissao.acao');
                else if (response.status >= 500) errorMsg = T('api.erro.servidor');
                else errorMsg = T('api.erro.requisicao') + ' (HTTP ' + response.status + ')';
            }
            const erro = new Error(errorMsg);
            erro.status = response.status;
            // O App detecta refeição duplicada pelo code — a mensagem agora
            // muda de idioma e não serve mais de sentinela sozinha.
            if (response.status === 409) erro.code = 'DUPLICATE';
            throw erro;
        }
        // Guard: handle empty response bodies gracefully
        try {
            return await response.json();
        } catch (e) {
            return {};
        }
    },

    /**
     * Busca um usuário pelo ID.
     * @returns { user, responsavel }
     */
    async fetchUser(id) {
        try {
            const res = await fetch(`${API_BASE_URL}/users/${id}`, { headers: authHeaders() });
            return await this.handleResponse(res);
        } catch (err) {
            if (err.name === 'TypeError') {
                throw new Error(T('api.indisponivel'));
            }
            throw err;
        }
    },

    /**
     * Registra entrada ou saída no ponto
     */
    async registerAccess(userId, pointId, action) {
        try {
            const res = await fetch(`${API_BASE_URL}/access`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ userId, pointId, action })
            });
            // Opcional: tratar status 409 Conflict se o backend retornar
            if (res.status === 409) {
                 throw new Error('DUPLICATE_MEAL');
            }
            return await this.handleResponse(res);
        } catch (err) {
            if (err.name === 'TypeError') {
                throw new Error(T('api.indisponivel'));
            }
            throw err;
        }
    },

    /**
     * Busca os logs de um setor específico.
     * ALWAYS returns an array — guards against non-array API responses.
     */
    async fetchLogs(pointId) {
        try {
            const res = await fetch(`${API_BASE_URL}/access/logs/${pointId}`, { headers: authHeaders() });
            const data = await this.handleResponse(res);
            return Array.isArray(data) ? data : [];
        } catch (err) {
            if (err.name === 'TypeError') {
                throw new Error(T('api.indisponivel.logs'));
            }
            throw err;
        }
    },

    /**
     * Busca logs globais (todos os setores).
     * ALWAYS returns an array. Accepts optional filters object.
     * @param {Object} filters - { pointId, action, dateFrom, dateTo, eleve, limit }
     *   limit defaults to 500 when not specified.
     *   eleve = nome (parcial) OU matrícula; o backend casa os dois, sobre o
     *   período inteiro (filtrar no cliente só alcançaria as linhas carregadas).
     */
    async fetchAllLogs(filters = {}) {
        try {
            const params = new URLSearchParams({ limit: String(filters.limit || 500) });
            if (filters.pointId)  params.set('pointId',  filters.pointId);
            if (filters.action)   params.set('action',   filters.action);
            if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
            if (filters.dateTo)   params.set('dateTo',   filters.dateTo);
            if (filters.eleve)    params.set('eleve',    filters.eleve);
            // O Journal é a visão de AUDITORIA: sem tipo, mostra tudo.
            if (filters.tipo)     params.set('tipo',     filters.tipo);
            // Lente de POSTO FIXO: '' = tudo (padrão), 'SEULEMENT' = só as
            // repetições de quem está de serviço no ponto, 'SANS' = tudo menos
            // elas. Vazio nunca vira parâmetro — filtro em branco não pode
            // estreitar a visão de auditoria.
            if (filters.repeticoes) params.set('repeticoes', filters.repeticoes);
            const res = await fetch(`${API_BASE_URL}/access/logs/all?${params}`, { headers: authHeaders() });
            const data = await this.handleResponse(res);
            return Array.isArray(data) ? data : [];
        } catch (err) {
            if (err.name === 'TypeError') {
                throw new Error(T('api.indisponivel.relatorios'));
            }
            throw err;
        }
    },

    /**
     * Busca estatísticas globais para o painel admin.
     * @returns { totalToday, activeUsers, totalUsers }
     */
    async fetchGlobalStats() {
        try {
            const res = await fetch(`${API_BASE_URL}/stats/global`, { headers: authHeaders() });
            return await this.handleResponse(res);
        } catch (err) {
            if (err.name === 'TypeError') {
                throw new Error(T('api.indisponivel.stats'));
            }
            throw err;
        }
    },

    /**
     * Busca dados agregados para a Vue d'ensemble (Admin)
     */
    async fetchOverview(filters = {}) {
        const params = new URLSearchParams();
        if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
        if (filters.dateTo) params.set('dateTo', filters.dateTo);
        // Só os números do CDI reagem a isto (ver AccessController.overview):
        // cantina e enfermaria seguem com as agregações já validadas.
        if (filters.incluirFuncionarios) params.set('incluirFuncionarios', 'true');
        try {
            const res = await fetch(`${API_BASE_URL}/access/overview?${params.toString()}`, {
                headers: authHeaders()
            });
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            console.error('[API] fetchOverview error:', e);
            return null;
        }
    },

    /**
     * Busca logs de um aluno específico por período.
     * @param {string} userId
     * @param {Object} filters - { dateFrom, dateTo }
     * @returns Array de AccessLog (máx 500)
     */
    async fetchUserLogs(userId, filters = {}) {
        const params = new URLSearchParams();
        if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
        if (filters.dateTo)   params.set('dateTo',   filters.dateTo);
        try {
            const res = await fetch(`${API_BASE_URL}/access/logs/user/${encodeURIComponent(userId)}?${params.toString()}`, {
                headers: authHeaders()
            });
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.error('[API] fetchUserLogs error:', e);
            return [];
        }
    },

    /**
     * Força sincronização manual com o Pronote.
     * @returns { success, message }
     */
    async forcePronoteSync() {
        try {
            const res = await fetch(`${API_BASE_URL}/pronote/sync`, {
                method: 'POST',
                headers: authHeaders()
            });
            return await this.handleResponse(res);
        } catch (err) {
            if (err.name === 'TypeError') {
                throw new Error(T('api.indisponivel.sync'));
            }
            throw err;
        }
    },

    /**
     * Cria um novo usuário ou responsável
     * @param {Object} userData 
     */
    async createUser(userData) {
        try {
            const res = await fetch(`${API_BASE_URL}/users`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(userData)
            });
            return await this.handleResponse(res);
        } catch (err) {
            if (err.name === 'TypeError') {
                throw new Error(T('api.indisponivel.cadastrar'));
            }
            throw err;
        }
    },

    /**
     * Importação em lote via Excel.
     * @param {Array} usersArray - Array de UserRegistrationDto
     * @returns { status, totalRecebido, sucesso, falhas, detalheErros }
     */
    async createUsersBulk(usersArray) {
        try {
            const res = await fetch(`${API_BASE_URL}/users/bulk`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(usersArray)
            });
            return await this.handleResponse(res);
        } catch (err) {
            if (err.name === 'TypeError') {
                throw new Error(T('api.indisponivel.importar'));
            }
            throw err;
        }
    },

    // ── Servidores da escola (professores, Vie Scolaire, serviços gerais,
    //    administração, direção) ────────────────────────────────────────────
    // Endpoints próprios: o cadastro de ALUNO vem do Pronote e tem regras
    // diferentes. Todas as recusas chegam como erro com mensagem pronta para a
    // tela — o formulário antigo dizia "sucesso" mesmo quando nada era gravado.

    /** Próxima matrícula FUNC-### livre, para mostrar no formulário. */
    async fetchNextStaffMatricula() {
        const res = await fetch(`${API_BASE_URL}/users/staff/next-matricula`, { headers: authHeaders() });
        const data = await this.handleResponse(res);
        return data?.matricula || '';
    },

    /** @param {Object} staff - { matricula?, nome, hikvisionEmployeeId?, tipo, departamento? } */
    async createStaff(staff) {
        try {
            const res = await fetch(`${API_BASE_URL}/users/staff`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(staff)
            });
            return await this.handleResponse(res);
        } catch (err) {
            if (err.name === 'TypeError') {
                throw new Error(T('api.indisponivel.cadastrar.servidor'));
            }
            throw err;
        }
    },

    /**
     * SIMULAÇÃO do import do HikCentral — não grava nada.
     * @param {Array} rows - [{ linha, id, prenom, nom, service }]
     */
    async previewHikCentralImport(rows) {
        const res = await fetch(`${API_BASE_URL}/users/staff/import/preview`, {
            method: 'POST', headers: authHeaders(), body: JSON.stringify(rows)
        });
        return await this.handleResponse(res);
    },

    /** Aplica o import do HikCentral. O plano é refeito no servidor. */
    async applyHikCentralImport(rows) {
        const res = await fetch(`${API_BASE_URL}/users/staff/import`, {
            method: 'POST', headers: authHeaders(), body: JSON.stringify(rows)
        });
        return await this.handleResponse(res);
    },

    /**
     * F7b — CSV que a TI importa no HikCentral (caminho inverso do import).
     *
     * Baixa via blob e não por link direto: o endpoint exige o JWT no header, e
     * um `<a href>` não carrega header nenhum.
     *
     * ⚠️ NÃO abrir o arquivo no Excel. Ele come os zeros à esquerda das
     * matrículas (0001764 → 1764) e o HikCentral importaria pessoas com o
     * identificador errado. Editar só em editor de texto.
     *
     * @param {'missing-face'|'all'} scope
     * @returns {Promise<{linhas: number, nomeArquivo: string}>}
     */
    async exportHikCentralCsv(scope) {
        const res = await fetch(
            `${API_BASE_URL}/admin/hikvision-mapping/export-csv?scope=${encodeURIComponent(scope || 'missing-face')}`,
            { headers: authHeaders() });
        if (!res.ok) {
            throw new Error(`Falha ao gerar o CSV (HTTP ${res.status}).`);
        }

        const texto = await res.text();

        // Nome vindo do servidor (já datado); o header pode não chegar em
        // algumas configurações de CORS, daí o fallback.
        const disposicao = res.headers.get('Content-Disposition') || '';
        const casado = disposicao.match(/filename="?([^"]+)"?/);
        const nomeArquivo = casado ? casado[1]
            : `magbo-hikcentral-${new Date().toISOString().slice(0, 10)}.csv`;

        // text/csv e não text/csv;charset=... : o Blob não deve reescrever nada,
        // e BOM nenhum pode ser acrescentado aqui — o destino é o HCP.
        const blob = new Blob([texto], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Menos o cabeçalho, e sem contar a linha vazia final.
        const linhas = texto.split('\r\n').filter(l => l !== '').length - 1;
        return { linhas: Math.max(0, linhas), nomeArquivo };
    },

    /**
     * Parâmetros de relatório do servidor (hoje: o piso de visita curta).
     *
     * FONTE ÚNICA: o número vive em magbo.report.min-visit-seconds e é buscado
     * daqui. O `reportFilters` tem só um fallback para o caso de a rede piscar.
     */
    async fetchReportConfig() {
        const res = await fetch(`${API_BASE_URL}/access/report-config`, { headers: authHeaders() });
        return await this.handleResponse(res);
    },

    // ── Manutenção do cadastro de servidores ──────────────────────────────
    // A importação do HikCentral cria FUNC-### para toda linha fora do
    // departamento ALUNOS; parte dessas pessoas são alunos cujo id no HCP não
    // é a matrícula. Daí corrigir tipo/departamento, tirar de circulação o que
    // foi criado por engano, e casar a face com o aluno certo.

    async listStaff() {
        const res = await fetch(`${API_BASE_URL}/users/staff`, { headers: authHeaders() });
        const data = await this.handleResponse(res);
        return Array.isArray(data) ? data : [];
    },

    /**
     * @param {Object} campos - { tipo, departamento, postoFixoPointId }
     *   postoFixoPointId: string vazia LIMPA o posto; `undefined` (chave
     *   ausente no JSON) não mexe nele. O backend distingue os dois, então a
     *   chave só entra no corpo quando o formulário de fato a preencheu — sem
     *   isso, editar o departamento de alguém apagaria a marcação de posto.
     */
    async updateStaff(id, { tipo, departamento, postoFixoPointId }) {
        const corpo = { tipo, departamento };
        if (postoFixoPointId !== undefined) corpo.postoFixoPointId = postoFixoPointId;
        const res = await fetch(`${API_BASE_URL}/users/staff/${encodeURIComponent(id)}`, {
            method: 'PUT', headers: authHeaders(), body: JSON.stringify(corpo)
        });
        return await this.handleResponse(res);
    },

    async deactivateStaff(id) {
        const res = await fetch(`${API_BASE_URL}/users/staff/${encodeURIComponent(id)}/deactivate`, {
            method: 'POST', headers: authHeaders()
        });
        return await this.handleResponse(res);
    },

    async reactivateStaff(id) {
        const res = await fetch(`${API_BASE_URL}/users/staff/${encodeURIComponent(id)}/reactivate`, {
            method: 'POST', headers: authHeaders()
        });
        return await this.handleResponse(res);
    },

    // ── Planning da cantina: os créneaux (V021) ───────────────────────────
    // ⚠️ Todas guardadas no servidor: leitura por área `cantine`, escrita por
    // MEAL_SLOT_WRITE. Nenhuma rota nova em isAuthenticated().

    async fetchMealSlots() {
        const res = await fetch(`${API_BASE_URL}/admin/meal-slots`, { headers: authHeaders() });
        return await this.handleResponse(res);
    },

    async fetchMealSlotOfStudent(userId) {
        const res = await fetch(`${API_BASE_URL}/admin/meal-slots/eleve/${encodeURIComponent(userId)}`,
            { headers: authHeaders() });
        return await this.handleResponse(res);
    },

    async linkMealSlotClass(slotId, turma) {
        const res = await fetch(
            `${API_BASE_URL}/admin/meal-slots/${slotId}/turmas/${encodeURIComponent(turma)}`,
            { method: 'POST', headers: authHeaders() });
        return await this.handleResponse(res);
    },

    async unlinkMealSlotClass(slotId, turma) {
        const res = await fetch(
            `${API_BASE_URL}/admin/meal-slots/${slotId}/turmas/${encodeURIComponent(turma)}`,
            { method: 'DELETE', headers: authHeaders() });
        return await this.handleResponse(res);
    },

    /** Ação de massa: «toda a 6ème para este créneau». Devolve o que ligou. */
    async linkMealSlotPrefix(slotId, prefixo) {
        const res = await fetch(
            `${API_BASE_URL}/admin/meal-slots/${slotId}/turmas-por-prefixo/${encodeURIComponent(prefixo)}`,
            { method: 'POST', headers: authHeaders() });
        return await this.handleResponse(res);
    },

    async setMealSlotException(slotId, userId, motivo) {
        const res = await fetch(
            `${API_BASE_URL}/admin/meal-slots/${slotId}/eleve/${encodeURIComponent(userId)}`,
            { method: 'POST', headers: authHeaders(), body: JSON.stringify({ motivo: motivo || null }) });
        return await this.handleResponse(res);
    },

    // ── Recherche globale / parcours du jour ──────────────────────────────
    // ⚠️ Endpoint PROPRE, guardado por PARCOURS_READ. Não passa por
    // /api/users/search (isAuthenticated()): a dívida de segurança nº1 do
    // projeto fica exatamente do tamanho que tinha.

    async searchParcours(q) {
        const res = await fetch(
            `${API_BASE_URL}/admin/parcours/search?q=${encodeURIComponent(q)}`,
            { headers: authHeaders() });
        const d = await this.handleResponse(res);
        return Array.isArray(d) ? d : [];
    },

    async fetchParcours(userId) {
        const res = await fetch(`${API_BASE_URL}/admin/parcours/${encodeURIComponent(userId)}`,
            { headers: authHeaders() });
        return await this.handleResponse(res);
    },

    /** Cria um creneau (dia + hora). Gate MEAL_SLOT_WRITE no servidor. */
    async createMealSlot(diaSemana, hora, rotulo, ordem) {
        const res = await fetch(`${API_BASE_URL}/admin/meal-slots`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ diaSemana, hora, rotulo: rotulo || null, ordem: ordem || null })
        });
        return await this.handleResponse(res);
    },

    /** Tolerancias / rotulo / ativo de um creneau. */
    async updateMealSlot(slotId, corpo) {
        const res = await fetch(`${API_BASE_URL}/admin/meal-slots/${slotId}`, {
            method: 'PUT', headers: authHeaders(), body: JSON.stringify(corpo || {})
        });
        return await this.handleResponse(res);
    },

    /** A lista INTEIRA de turmas dispensadas de badge (substitui). */
    async saveMealSlotDispensees(turmas) {
        const res = await fetch(`${API_BASE_URL}/admin/meal-slots/dispensees`, {
            method: 'PUT', headers: authHeaders(), body: JSON.stringify({ turmas: turmas || [] })
        });
        return await this.handleResponse(res);
    },

    // ── Reglages do sistema (V024) ────────────────────────────────────────
    async fetchSettings() {
        const res = await fetch(`${API_BASE_URL}/admin/settings`, { headers: authHeaders() });
        const d = await this.handleResponse(res);
        return Array.isArray(d) ? d : [];
    },

    /** valor vazio/null = voltar ao default (apaga a linha). */
    async saveSetting(chave, valor) {
        const res = await fetch(`${API_BASE_URL}/admin/settings/${encodeURIComponent(chave)}`, {
            method: 'PUT', headers: authHeaders(), body: JSON.stringify({ valor: valor == null ? '' : String(valor) })
        });
        return await this.handleResponse(res);
    },

    // ── Moniteur Cantine: retirar uma linha (V020) ────────────────────────
    // ⚠️ Nada disto toca em `access_logs`. É um gesto de ECRÃ: a passagem
    // continua gravada, a presença do PPMS continua aberta e os relatórios de
    // visita não mudam. Ver o cabeçalho de V020__cantine_removals.sql.

    /** As retiradas ATIVAS de hoje. Leitura por área — quem vê o efeito vê a causa. */
    async fetchCantineRemovals() {
        const res = await fetch(`${API_BASE_URL}/admin/cantine/removals`, { headers: authHeaders() });
        return await this.handleResponse(res);
    },

    /**
     * Retira a linha desta pessoa NESTE PONTO.
     *
     * ⚠️ O ponto vai no caminho porque é ele que o `@PreAuthorize` do backend
     * lê (`@areaSecurity.can(#pointId)`): a permissão granular é global, o
     * direito sobre o ponto não é. Mandar só a matrícula deixaria o servidor
     * sem o que verificar.
     */
    async removeCantineLine(pointId, userId, motivo) {
        const res = await fetch(
            `${API_BASE_URL}/admin/cantine/removals/${encodeURIComponent(pointId)}/${encodeURIComponent(userId)}`,
            { method: 'POST', headers: authHeaders(), body: JSON.stringify({ motivo: motivo || null }) });
        return await this.handleResponse(res);
    },

    /** Devolve a linha à tela. Idempotente do lado do servidor. */
    async undoCantineRemoval(pointId, userId) {
        const res = await fetch(
            `${API_BASE_URL}/admin/cantine/removals/${encodeURIComponent(pointId)}/${encodeURIComponent(userId)}`,
            { method: 'DELETE', headers: authHeaders() });
        return await this.handleResponse(res);
    },

    /** Remoção definitiva — o backend recusa quando há histórico. */
    async deleteStaff(id) {
        const res = await fetch(`${API_BASE_URL}/users/staff/${encodeURIComponent(id)}`, {
            method: 'DELETE', headers: authHeaders()
        });
        return await this.handleResponse(res);
    },

    /**
     * "Este servidor é na verdade um aluno" — prévia. Não grava nada.
     * Parte do servidor (que segura a face) e não do identificador, porque o
     * registro pode nem ter identificador e ainda assim precisar sair de cena.
     */
    async previewReclassify(servidorId, alunoId) {
        const params = new URLSearchParams({ alunoId });
        const res = await fetch(
            `${API_BASE_URL}/users/staff/${encodeURIComponent(servidorId)}/reclassify/preview?${params}`,
            { headers: authHeaders() });
        return await this.handleResponse(res);
    },

    /**
     * Confirma a reclassificação: numa transação, o identificador volta ao
     * aluno e o registro de servidor é inativado (as passagens dele ficam).
     * `confirmarSubstituicao` é exigido quando o aluno já tem outro.
     */
    async reclassifyStaffAsStudent(servidorId, alunoId, confirmarSubstituicao) {
        const res = await fetch(
            `${API_BASE_URL}/users/staff/${encodeURIComponent(servidorId)}/reclassify`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ alunoId, confirmarSubstituicao: !!confirmarSubstituicao })
            });
        return await this.handleResponse(res);
    },

    /** Prévia do casamento: mostra os dois lados antes de gravar. */
    async previewStudentMatch(alunoId, hikvisionId) {
        const params = new URLSearchParams({ alunoId, hikvisionId });
        const res = await fetch(`${API_BASE_URL}/users/staff/match/preview?${params}`, {
            headers: authHeaders()
        });
        return await this.handleResponse(res);
    },

    /**
     * Liga o identificador ao aluno certo e, se ele estava preso a um FUNC-###,
     * inativa esse registro na MESMA transação (a coluna é UNIQUE).
     */
    async confirmStudentMatch(alunoId, hikvisionId) {
        const res = await fetch(`${API_BASE_URL}/users/staff/match`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ alunoId, hikvisionId })
        });
        return await this.handleResponse(res);
    },

    /** Importação em lote de servidores. Devolve o relatório por linha. */
    async createStaffBulk(staffArray) {
        try {
            const res = await fetch(`${API_BASE_URL}/users/staff/bulk`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(staffArray)
            });
            return await this.handleResponse(res);
        } catch (err) {
            if (err.name === 'TypeError') {
                throw new Error(T('api.indisponivel.importar.servidores'));
            }
            throw err;
        }
    },

    /**
     * Atualiza um usuário ou responsável existente
     * @param {string} id
     * @param {Object} userData
     */
    async updateUser(id, userData) {
        try {
            const res = await fetch(`${API_BASE_URL}/users/${id}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify(userData)
            });
            return await this.handleResponse(res);
        } catch (err) {
            if (err.name === 'TypeError') {
                throw new Error(T('api.indisponivel.atualizar'));
            }
            throw err;
        }
    },

    /**
     * Desativa (soft-delete) um usuário
     * @param {string} id 
     */
    async deleteUser(id) {
        try {
            const res = await fetch(`${API_BASE_URL}/users/${id}`, {
                method: 'DELETE',
                headers: authHeaders()
            });
            return await this.handleResponse(res);
        } catch (err) {
            if (err.name === 'TypeError') {
                throw new Error(T('api.indisponivel.desativar'));
            }
            throw err;
        }
    },

    // ── Fotos de identificação ───────────────────────────────────────
    // ⚠️ São fotos de MENORES. Três coisas que não podem mudar aqui:
    // o endpoint de leitura é autenticado (por isso o fetch com cabeçalho, e
    // não um <img src> direto); não existe rota de exportação em massa; e
    // nenhum byte de imagem é logado.

    /**
     * A foto de uma pessoa, como Blob — ou null quando não há.
     *
     * null é resposta normal e frequente (404): a tela cai no avatar de
     * iniciais, que é o que ela já fazia. Erro de rede também devolve null —
     * uma foto que não carregou nunca pode impedir a linha de aparecer.
     */
    async fetchUserPhoto(userId) {
        try {
            const res = await fetch(
                `${API_BASE_URL}/users/${encodeURIComponent(userId)}/photo`,
                { headers: authHeaders() });
            if (res.status === 404) return null;
            if (!res.ok) return null;
            return await res.blob();
        } catch (e) {
            return null;
        }
    },

    /** Quantas pessoas já têm foto. */
    async fetchPhotoSummary() {
        const res = await fetch(`${API_BASE_URL}/admin/photos/summary`, { headers: authHeaders() });
        return await this.handleResponse(res);
    },

    /**
     * SIMULAÇÃO da importação de arquivos soltos (a pasta escolhida na tela).
     * Não grava nada. `aplicar=true` executa, com o plano REFEITO no servidor.
     */
    async importPhotos(files, aplicar) {
        const form = new FormData();
        // Nome do arquivo passado explicitamente: com uma pasta escolhida, o
        // navegador manda o caminho relativo (webkitRelativePath) e o nome da
        // part perderia a subpasta — o backend corta o diretório de qualquer
        // forma, mas o nome tem que chegar inteiro para o relatório por linha.
        files.forEach(f => form.append('files', f, f.webkitRelativePath || f.name));
        const res = await fetch(
            `${API_BASE_URL}/admin/photos/import${aplicar ? '' : '/preview'}`,
            // ⚠️ SEM Content-Type. authHeaders() sempre põe application/json;
            // com FormData, qualquer Content-Type declarado à mão substitui o
            // multipart/form-data + boundary que o navegador gera, e o servidor
            // recebe um corpo que não sabe separar. Só o Authorization.
            { method: 'POST', headers: somenteAutorizacao(), body: form });
        return await this.handleResponse(res);
    },

    /**
     * O mesmo, a partir de um ZIP, enviado como CORPO CRU.
     *
     * Não é multipart de propósito: os limites de multipart do projeto (10MB
     * por parte) existem para proteger o webhook das câmeras da portaria, e um
     * ZIP de 1200 fotos passa deles. Afrouxá-los por causa desta tela seria
     * mexer no número errado.
     */
    async importPhotosZip(file, aplicar) {
        const res = await fetch(
            `${API_BASE_URL}/admin/photos/import${aplicar ? '' : '/preview'}/zip`,
            {
                method: 'POST',
                headers: { ...somenteAutorizacao(), 'Content-Type': 'application/zip' },
                body: file
            });
        return await this.handleResponse(res);
    },

    /** Apaga a foto de uma pessoa — DELETE de verdade, sem lixeira. */
    async deleteUserPhoto(userId) {
        const res = await fetch(
            `${API_BASE_URL}/admin/photos/${encodeURIComponent(userId)}`,
            { method: 'DELETE', headers: authHeaders() });
        return await this.handleResponse(res);
    }
};

window.api = api;
