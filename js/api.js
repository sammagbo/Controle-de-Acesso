// =====================================================================
// API INTEGRATION LAYER
// =====================================================================

// API URL: reads from Electron preload config (production) or falls back to localhost (dev)
const API_BASE_URL = ((window.magboConfig?.getCached?.()?.apiUrl) || 'http://localhost:8080') + '/api';

function authHeaders(extra = {}) {
  const token = window.auth?.getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...extra
  };
}
// Expose for other files
if (typeof window !== 'undefined') {
  window.authHeaders = authHeaders;
}

const api = {
    /**
     * Helper para lidar com falhas de rede (ex: servidor offline)
     * e respostas HTTP de erro.
     */
    async handleResponse(response) {
        if (response.status === 401 || response.status === 403) {
            window.auth?.logout();
            throw new Error('Sessão expirada. Faça login novamente.');
        }
        if (!response.ok) {
            let errorMsg = 'Erro de Comunicação com o Servidor';
            try {
                const data = await response.json();
                if (data && data.message) errorMsg = data.message;
            } catch (e) {
                // Ignore json parsing error if response is not JSON
                if (response.status === 404) errorMsg = 'Usuário ou Recurso Não Encontrado';
                else if (response.status === 409) errorMsg = 'Duplicidade de Registro';
                else if (response.status >= 500) errorMsg = 'Erro Interno no Servidor Java';
            }
            throw new Error(errorMsg);
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
                throw new Error('Servidor indisponível. Verifique sua conexão.');
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
                throw new Error('Servidor indisponível. Verifique sua conexão.');
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
                throw new Error('Servidor indisponível ao buscar logs. Verifique a conexão.');
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
            const res = await fetch(`${API_BASE_URL}/access/logs/all?${params}`, { headers: authHeaders() });
            const data = await this.handleResponse(res);
            return Array.isArray(data) ? data : [];
        } catch (err) {
            if (err.name === 'TypeError') {
                throw new Error('Servidor indisponível ao buscar relatórios.');
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
                throw new Error('Servidor indisponível ao buscar estatísticas.');
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
                throw new Error('Servidor indisponível. Sincronização Pronote falhou.');
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
                throw new Error('Servidor indisponível ao cadastrar usuário.');
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
                throw new Error('Servidor indisponível ao importar planilha.');
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
                throw new Error('Servidor indisponível ao cadastrar servidor.');
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

    async updateStaff(id, { tipo, departamento }) {
        const res = await fetch(`${API_BASE_URL}/users/staff/${encodeURIComponent(id)}`, {
            method: 'PUT', headers: authHeaders(), body: JSON.stringify({ tipo, departamento })
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
                throw new Error('Servidor indisponível ao importar planilha de servidores.');
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
                throw new Error('Servidor indisponível ao atualizar usuário.');
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
                throw new Error('Servidor indisponível ao desativar usuário.');
            }
            throw err;
        }
    }
};

window.api = api;
