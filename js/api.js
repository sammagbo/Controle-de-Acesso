// =====================================================================
// API INTEGRATION LAYER
// =====================================================================

const API_BASE_URL = 'http://localhost:8080/api';

const api = {
    /**
     * Helper para lidar com falhas de rede (ex: servidor offline)
     * e respostas HTTP de erro.
     */
    async handleResponse(response) {
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
            const res = await fetch(`${API_BASE_URL}/users/${id}`);
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
                headers: { 'Content-Type': 'application/json' },
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
            const res = await fetch(`${API_BASE_URL}/access/logs/${pointId}`);
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
     * Busca os últimos 50 logs globais (todos os setores).
     * ALWAYS returns an array.
     */
    async fetchAllLogs() {
        try {
            const res = await fetch(`${API_BASE_URL}/access/logs/all?limit=50`);
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
            const res = await fetch(`${API_BASE_URL}/stats/global`);
            return await this.handleResponse(res);
        } catch (err) {
            if (err.name === 'TypeError') {
                throw new Error('Servidor indisponível ao buscar estatísticas.');
            }
            throw err;
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
                headers: { 'Content-Type': 'application/json' }
            });
            return await this.handleResponse(res);
        } catch (err) {
            if (err.name === 'TypeError') {
                throw new Error('Servidor indisponível. Sincronização Pronote falhou.');
            }
            throw err;
        }
    }
};

window.api = api;
