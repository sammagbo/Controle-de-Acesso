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
                if (data.message) errorMsg = data.message;
            } catch (e) {
                // Ignore json parsing error if response is not JSON
                if (response.status === 404) errorMsg = 'Usuário ou Recurso Não Encontrado';
                else if (response.status === 409) errorMsg = 'Duplicidade de Registro';
                else if (response.status >= 500) errorMsg = 'Erro Interno no Servidor Java';
            }
            throw new Error(errorMsg);
        }
        return response.json();
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
     * Busca os logs de um setor específico
     */
    async fetchLogs(pointId) {
        try {
            const res = await fetch(`${API_BASE_URL}/access/logs/${pointId}`);
            return await this.handleResponse(res);
        } catch (err) {
            if (err.name === 'TypeError') {
                throw new Error('Servidor indisponível ao buscar logs. Verifique a conexão.');
            }
            throw err;
        }
    }
};

window.api = api;
