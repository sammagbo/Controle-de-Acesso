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
            foto_url:        raw.fotoUrl || raw.foto_url || 'https://api.dicebear.com/7.x/initials/svg?seed=' + (raw.nome || 'U'),
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
                        || 'https://api.dicebear.com/7.x/initials/svg?seed=' + (raw.nome || 'R'),
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
