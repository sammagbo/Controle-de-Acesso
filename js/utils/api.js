// =====================================================================
// API SERVICE — Centralised HTTP calls to Spring Boot backend
// =====================================================================

const API_BASE = ((window.magboConfig?.getCached?.()?.apiUrl) || 'http://localhost:8080') + '/api';

/**
 * Normalise a backend User object (camelCase) to the frontend format (snake_case).
 */
function normaliseUser(raw) {
      if (!raw) return null;
      return {
            id:              raw.id,
            nome:            raw.nome,
            tipo:            raw.tipo,
            turma:           raw.turma   || null,
            foto_url:        raw.fotoUrl || raw.foto_url || window.localAvatar(raw.nome || 'U'),
            responsavel_id:  raw.responsavelId || raw.responsavel_id || null,
            mealCount:       raw.mealCount || 0,
      };
}

/**
 * Normalise a backend Responsavel object to the frontend format.
 * Backend returns { id, nome, parentesco, telefone, fotoUrl }
 */
function normaliseResponsavel(raw) {
      if (!raw) return null;
      return {
            id:         raw.id,
            nome:       raw.nome,
            parentesco: raw.parentesco || null,
            telefone:   raw.telefone   || null,
            foto_url:   raw.fotoUrl || raw.foto_url
                        || window.localAvatar(raw.nome || 'R'),
      };
}

/**
 * Normalise a backend AccessLog object to the frontend format.
 * Backend returns { id (Long), userId, pointId, action ("ENTRADA"/"SAIDA"), timestamp (ISO string) }
 * Frontend expects { id, userId, pointId, status ("ENTRADA"/"SAIDA"), timestamp (epoch ms), duration }
 */
function normaliseLog(raw) {
      if (!raw) return null;
      return {
            id:        String(raw.id),
            userId:    raw.userId,
            pointId:   raw.pointId,
            status:    raw.action,          // backend calls it "action", frontend calls it "status"
            timestamp: new Date(raw.timestamp).getTime(),
            duration:  null,
      };
}

function checkAuthError(res) {
      if (res.status === 401 || res.status === 403) {
            window.auth?.logout();
            throw new Error('Sessão expirada. Faça login novamente.');
      }
}

// ─────────────────────────────────────────────────────────────
// fetchUser(id) — GET /api/users/{id}
// Returns { user, responsavel } or null on error
// ─────────────────────────────────────────────────────────────
async function fetchUser(id) {
      try {
            const res = await fetch(`${API_BASE}/users/${encodeURIComponent(id)}`, {
                  headers: window.authHeaders ? window.authHeaders() : {}
            });
            checkAuthError(res);
            if (!res.ok) return null;
            const data = await res.json();
            return {
                  user:        normaliseUser(data.user),
                  responsavel: data.responsavel ? normaliseResponsavel(data.responsavel) : null,
            };
      } catch (err) {
            console.error('[API] fetchUser error:', err);
            throw err;   // let caller show "Servidor Offline" toast
      }
}

// ─────────────────────────────────────────────────────────────
// registerAccess(payload) — POST /api/access
// payload: { userId, pointId, action: "ENTRADA" | "SAIDA" }
// Returns normalised log or null on error
// ─────────────────────────────────────────────────────────────
async function registerAccess(payload) {
      try {
            const res = await fetch(`${API_BASE}/access`, {
                  method: 'POST',
                  headers: window.authHeaders ? window.authHeaders() : { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
            });
            checkAuthError(res);
            if (!res.ok) return null;
            const data = await res.json();
            return normaliseLog(data);
      } catch (err) {
            console.error('[API] registerAccess error:', err);
            throw err;
      }
}

// ─────────────────────────────────────────────────────────────
// fetchLogs(pointId) — GET /api/access/logs/{pointId}
// Returns array of normalised logs or [] on error
// ─────────────────────────────────────────────────────────────
async function fetchLogs(pointId) {
      try {
            const res = await fetch(`${API_BASE}/access/logs/${encodeURIComponent(pointId)}`, {
                  headers: window.authHeaders ? window.authHeaders() : {}
            });
            checkAuthError(res);
            if (!res.ok) return [];
            const data = await res.json();
            return (data || []).map(normaliseLog);
      } catch (err) {
            console.error('[API] fetchLogs error:', err);
            throw err;
      }
}

// ─────────────────────────────────────────────────────────────
// fetchRefectoryLogs(filters?) — GET /api/access/logs/refectory
// Accepts optional { dateFrom, dateTo, action, limit }
// Called without args by CantineMonitor (gets last 30d, limit 500)
// ─────────────────────────────────────────────────────────────
async function fetchRefectoryLogs(filters = {}) {
      try {
            const params = new URLSearchParams();
            if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
            if (filters.dateTo)   params.set('dateTo',   filters.dateTo);
            if (filters.action)   params.set('action',   filters.action);
            params.set('limit', String(filters.limit || 500));
            const res = await fetch(`${API_BASE}/access/logs/refectory?${params.toString()}`, {
                  headers: window.authHeaders ? window.authHeaders() : {}
            });
            if (!res.ok) return [];
            return await res.json();
      } catch (e) {
            console.error('[API] fetchRefectoryLogs error:', e);
            return [];
      }
}

// ─────────────────────────────────────────────────────────────
// fetchRefectoryMeals(filters?) — GET /api/access/refectory/meals
// Returns paired meals (entry+exit) with duration and on-time flag.
// ─────────────────────────────────────────────────────────────
async function fetchRefectoryMeals(filters = {}) {
    try {
        const params = new URLSearchParams();
        if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
        if (filters.dateTo) params.set('dateTo', filters.dateTo);
        const res = await fetch(`${API_BASE}/access/refectory/meals?${params.toString()}`, {
            headers: window.authHeaders ? window.authHeaders() : {}
        });
        if (!res.ok) return [];
        return await res.json();
    } catch (e) {
        console.error('[API] fetchRefectoryMeals error:', e);
        return [];
    }
}

// ─────────────────────────────────────────────────────────────
// fetchInfirmaryVisits(filters?) — GET /api/access/infirmary/visits
// ─────────────────────────────────────────────────────────────
async function fetchInfirmaryVisits(filters = {}) {
    try {
        const params = new URLSearchParams();
        if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
        if (filters.dateTo) params.set('dateTo', filters.dateTo);
        const res = await fetch(`${API_BASE}/access/infirmary/visits?${params.toString()}`, {
            headers: window.authHeaders ? window.authHeaders() : {}
        });
        if (!res.ok) return [];
        return await res.json();
    } catch (e) {
        console.error('[API] fetchInfirmaryVisits error:', e);
        return [];
    }
}

// ─────────────────────────────────────────────────────────────
// MEAL ENTITLEMENTS (Phase H)
// ─────────────────────────────────────────────────────────────

async function getMealEntitlements(filters = {}) {
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      if (filters.turma) params.set('turma', filters.turma);
      if (filters.status) params.set('status', filters.status);
      if (filters.page !== undefined) params.set('page', filters.page);
      if (filters.size !== undefined) params.set('size', filters.size);

      const res = await fetch(`${API_BASE}/meal-entitlements?${params.toString()}`, {
            headers: window.authHeaders ? window.authHeaders() : {}
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error("Vous n'avez pas l'autorisation d'accéder à ces données.");
            throw new Error('Erreur lors du chargement des droits de repas.');
      }
      return await res.json();
}

async function getMealEntitlementSummary() {
      const res = await fetch(`${API_BASE}/meal-entitlements/summary`, {
            headers: window.authHeaders ? window.authHeaders() : {}
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error("Vous n'avez pas l'autorisation d'accéder à ces données.");
            throw new Error('Erreur lors du chargement du résumé.');
      }
      return await res.json();
}

async function getMealEntitlement(userId) {
      const res = await fetch(`${API_BASE}/meal-entitlements/${encodeURIComponent(userId)}`, {
            headers: window.authHeaders ? window.authHeaders() : {}
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 404) return null;
            if (res.status === 403) throw new Error("Vous n'avez pas l'autorisation d'accéder à ces données.");
            throw new Error('Erreur lors du chargement du droit de repas.');
      }
      return await res.json();
}

async function putMealEntitlement(userId, payload) {
      const res = await fetch(`${API_BASE}/meal-entitlements/${encodeURIComponent(userId)}`, {
            method: 'PUT',
            headers: window.authHeaders ? window.authHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error("Vous n'avez pas l'autorisation de modifier ce droit.");
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || 'Erreur lors de la sauvegarde.');
      }
      return await res.json();
}

async function getMealEntitlementHistory(userId) {
      const res = await fetch(`${API_BASE}/meal-entitlements/${encodeURIComponent(userId)}/history`, {
            headers: window.authHeaders ? window.authHeaders() : {}
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error("Vous n'avez pas l'autorisation d'accéder à l'historique.");
            throw new Error('Erreur lors du chargement de l\'historique.');
      }
      return await res.json();
}

async function postMealEntitlementBulk(items, overwrite = false) {
      const res = await fetch(`${API_BASE}/meal-entitlements/bulk?overwrite=${overwrite}`, {
            method: 'POST',
            headers: window.authHeaders ? window.authHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify(items)
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error("Vous n'avez pas l'autorisation d'importer des données.");
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || 'Erreur lors de l\'importation en masse.');
      }
      return await res.json();
}

// ─────────────────────────────────────────────────────────────
// EXIT PERMISSIONS (Phase H)
// ─────────────────────────────────────────────────────────────

async function getExitPermissions(filters = {}) {
      const params = new URLSearchParams();
      if (filters.userId) params.set('userId', filters.userId);
      if (filters.status) params.set('status', filters.status);
      if (filters.type) params.set('type', filters.type);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.page !== undefined) params.set('page', filters.page);
      if (filters.size !== undefined) params.set('size', filters.size);

      const res = await fetch(`${API_BASE}/exit-permissions?${params.toString()}`, {
            headers: window.authHeaders ? window.authHeaders() : {}
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error("Você não tem permissão para acessar estes dados.");
            throw new Error('Erro ao carregar autorizações.');
      }
      return await res.json();
}

async function getActiveExitPermissions() {
      const res = await fetch(`${API_BASE}/exit-permissions/active`, {
            headers: window.authHeaders ? window.authHeaders() : {}
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error("Você não tem permissão para acessar estes dados.");
            throw new Error('Erro ao carregar autorizações ativas.');
      }
      return await res.json();
}

async function getExitPermissionsByUser(userId) {
      const res = await fetch(`${API_BASE}/exit-permissions/user/${encodeURIComponent(userId)}`, {
            headers: window.authHeaders ? window.authHeaders() : {}
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error("Você não tem permissão para acessar estes dados.");
            throw new Error('Erro ao carregar autorizações do usuário.');
      }
      return await res.json();
}

async function postExitPermission(payload) {
      const res = await fetch(`${API_BASE}/exit-permissions`, {
            method: 'POST',
            headers: window.authHeaders ? window.authHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error("Você não tem permissão para criar autorizações.");
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || 'Erro ao salvar autorização.');
      }
      return await res.json();
}

async function revokeExitPermission(id, note) {
      const res = await fetch(`${API_BASE}/exit-permissions/${encodeURIComponent(id)}/revoke`, {
            method: 'POST',
            headers: window.authHeaders ? window.authHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note })
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error("Você não tem permissão para revogar autorizações.");
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || 'Erro ao revogar autorização.');
      }
      return await res.json();
}

// ─────────────────────────────────────────────────────────────
// DENIED ATTEMPTS (Phase H)
// ─────────────────────────────────────────────────────────────

async function getAttempts(filters = {}) {
      const params = new URLSearchParams();
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.pointId) params.set('pointId', filters.pointId);
      if (filters.userId) params.set('userId', filters.userId);
      if (filters.reason) params.set('reason', filters.reason);
      if (filters.method) params.set('method', filters.method);
      if (filters.page !== undefined) params.set('page', filters.page);
      if (filters.size !== undefined) params.set('size', filters.size);

      const res = await fetch(`${API_BASE}/access/attempts?${params.toString()}`, {
            headers: window.authHeaders ? window.authHeaders() : {}
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error("Você não tem permissão para acessar as tentativas negadas.");
            throw new Error('Erro ao carregar tentativas.');
      }
      return await res.json();
}

async function getAttemptStats(filters = {}) {
      const params = new URLSearchParams();
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);

      const res = await fetch(`${API_BASE}/access/attempts/stats?${params.toString()}`, {
            headers: window.authHeaders ? window.authHeaders() : {}
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error("Você não tem permissão para acessar estatísticas.");
            throw new Error('Erro ao carregar estatísticas.');
      }
      return await res.json();
}

async function getRefectoryAttempts() {
      const res = await fetch(`${API_BASE}/access/attempts/refectory`, {
            headers: window.authHeaders ? window.authHeaders() : {}
      });
      checkAuthError(res);
      if (!res.ok) {
            // Se 403 ou erro, retorna lista vazia silenciosamente (para não quebrar polling)
            return [];
      }
      return await res.json();
}

async function getGateAttempts() {
      const res = await fetch(`${API_BASE}/access/attempts/gate`, {
            headers: window.authHeaders ? window.authHeaders() : {}
      });
      checkAuthError(res);
      if (!res.ok) {
            // Se 403 ou erro, retorna lista vazia silenciosamente
            return [];
      }
      return await res.json();
}

async function getAllAttempts() {
      // Endpoint GERAL (todos os pontos) — devolve Page paginado; o feed usa o .content
      const res = await fetch(`${API_BASE}/access/attempts?size=50`, {
            headers: window.authHeaders ? window.authHeaders() : {}
      });
      checkAuthError(res);
      if (!res.ok) {
            // Se 403 ou erro, retorna lista vazia silenciosamente (para não quebrar polling)
            return [];
      }
      const page = await res.json();
      return page?.content || [];
}

// Liga as funções da Fase H ao window.api — os componentes consomem
// window.api.X; sem esta ligação (esquecida na Fase H) os feeds caíam no
// fallback vazio e as telas de gestão (Droits Repas / Sorties) nunca
// carregaram dados pela UI. Inventário completo fechado em 17/07 (10 órfãs).
if (window.api) {
      window.api.getRefectoryAttempts = getRefectoryAttempts;
      window.api.getGateAttempts = getGateAttempts;
      window.api.getAllAttempts = getAllAttempts;
      window.api.getMealEntitlements = getMealEntitlements;
      window.api.getMealEntitlementSummary = getMealEntitlementSummary;
      window.api.putMealEntitlement = putMealEntitlement;
      window.api.postMealEntitlementBulk = postMealEntitlementBulk;
      window.api.getMealEntitlementHistory = getMealEntitlementHistory;
      window.api.getActiveExitPermissions = getActiveExitPermissions;
      window.api.postExitPermission = postExitPermission;
      window.api.revokeExitPermission = revokeExitPermission;
}

