// =====================================================================
// API SERVICE — Centralised HTTP calls to Spring Boot backend
// =====================================================================

const API_BASE = 'http://localhost:8080/api';

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

// ─────────────────────────────────────────────────────────────
// fetchUser(id) — GET /api/users/{id}
// Returns { user, responsavel } or null on error
// ─────────────────────────────────────────────────────────────
async function fetchUser(id) {
      try {
            const res = await fetch(`${API_BASE}/users/${encodeURIComponent(id)}`);
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
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
            });
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
            const res = await fetch(`${API_BASE}/access/logs/${encodeURIComponent(pointId)}`);
            if (!res.ok) return [];
            const data = await res.json();
            return (data || []).map(normaliseLog);
      } catch (err) {
            console.error('[API] fetchLogs error:', err);
            throw err;
      }
}
