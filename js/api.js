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
     * @param {Object} filters - { pointId, action, dateFrom, dateTo, limit }
     *   limit defaults to 500 when not specified.
     */
    async fetchAllLogs(filters = {}) {
        try {
            const params = new URLSearchParams({ limit: String(filters.limit || 500) });
            if (filters.pointId)  params.set('pointId',  filters.pointId);
            if (filters.action)   params.set('action',   filters.action);
            if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
            if (filters.dateTo)   params.set('dateTo',   filters.dateTo);
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
