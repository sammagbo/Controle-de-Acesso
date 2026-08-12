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
            // A flag do backend (FORA_HORARIO, EXCEDEU_TEMPO, FECHAMENTO_AUTO,
            // POSTO_FIXO). Vem para a tela poder DIZER por que uma linha está
            // ali quando o operador liga "mostrar posto fixo" — sem ela, as
            // repetições reapareceriam sem nada que as distinguisse das outras.
            flag:      raw.flag || null,
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
// fetchLogs(pointId, opts?) — GET /api/access/logs/{pointId}
// Returns array of normalised logs or [] on error
//
// opts.incluirRepeticoes (default false) = mostra também as linhas de REPETIÇÃO:
// a do dia de quem está POSTADO no ponto (POSTO_FIXO) e a ENTRADA de quem já
// estava dentro (JA_PRESENTE).
// Escondido por padrão porque era ele que enchia a tela do Portail de linhas
// iguais; nada é apagado, e o Journal sempre lista todas.
//
// O filtro é do SERVIDOR de propósito: a resposta tem teto de 500 linhas, e
// filtrar aqui devolveria menos de 500 com passagens reais sobrando fora da
// página — o mesmo defeito que fez o filtro de aluno do Journal migrar para a
// consulta.
// ─────────────────────────────────────────────────────────────
async function fetchLogs(pointId, opts = {}) {
      try {
            const params = new URLSearchParams();
            if (opts.incluirRepeticoes) params.set('incluirRepeticoes', 'true');
            // Janela explícita (dateFrom/dateTo): o caminho do Rapport do CDI.
            // Sem ela o servidor devolve as últimas 24h — e foi assim que
            // "Cette Semaine" e "Ce Mois" mostraram só um dia durante meses.
            if (opts.dateFrom) params.set('dateFrom', opts.dateFrom);
            if (opts.dateTo) params.set('dateTo', opts.dateTo);
            if (opts.limit) params.set('limit', String(opts.limit));
            const qs = params.toString();
            const res = await fetch(
                  `${API_BASE}/access/logs/${encodeURIComponent(pointId)}${qs ? '?' + qs : ''}`, {
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
// fetchLogsCount(filters?) — GET /api/access/logs/count
// O TOTAL do banco com os MESMOS filtros de fetchAllLogs. Um contador NUNCA
// mede o comprimento de uma lista paginada: em 12/08/2026 o banco tinha 612
// movimentos do dia e o card dizia 500 — o teto da lista, não o total.
// ─────────────────────────────────────────────────────────────
async function fetchLogsCount(filters = {}) {
      try {
            const params = new URLSearchParams();
            if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
            if (filters.dateTo) params.set('dateTo', filters.dateTo);
            if (filters.pointId) params.set('pointId', filters.pointId);
            if (filters.action) params.set('action', filters.action);
            if (filters.eleve) params.set('eleve', filters.eleve);
            if (filters.tipo) params.set('tipo', filters.tipo);
            if (filters.repeticoes) params.set('repeticoes', filters.repeticoes);
            const res = await fetch(`${API_BASE}/access/logs/count?${params.toString()}`, {
                  headers: window.authHeaders ? window.authHeaders() : {}
            });
            checkAuthError(res);
            if (!res.ok) return null;
            const data = await res.json();
            const n = data && Number(data.total);
            return (typeof n === 'number' && isFinite(n) && n >= 0) ? n : null;
      } catch (e) {
            // null, nunca 0: "não sei" e "zero movimento" são respostas
            // diferentes, e o card trata cada uma como o que é.
            return null;
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

      const res = await fetch(`${API_BASE}/admin/meal-entitlements?${params.toString()}`, {
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
      const res = await fetch(`${API_BASE}/admin/meal-entitlements/summary`, {
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
      const res = await fetch(`${API_BASE}/admin/meal-entitlements/${encodeURIComponent(userId)}`, {
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
      const res = await fetch(`${API_BASE}/admin/meal-entitlements/${encodeURIComponent(userId)}`, {
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
      // O upsert devolve 200 SEM corpo (ok().build()) — tolerar vazio.
      const text = await res.text();
      return text ? JSON.parse(text) : null;
}

async function getMealEntitlementHistory(userId) {
      const res = await fetch(`${API_BASE}/admin/meal-entitlements/${encodeURIComponent(userId)}/history`, {
            headers: window.authHeaders ? window.authHeaders() : {}
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error("Vous n'avez pas l'autorisation d'accéder à l'historique.");
            throw new Error('Erreur lors du chargement de l\'historique.');
      }
      return await res.json();
}

/**
 * Importação de direitos em DUAS PASSADAS (molde do import do HikCentral).
 *
 * `preview` simula e não grava; `apply` refaz o plano no servidor e executa.
 * O plano NÃO viaja de volta de propósito: entre a conferência e a confirmação
 * alguém pode ter mexido num direito pela tela, e aplicar o plano velho seria
 * escrever com base em algo que já não é verdade.
 */
async function previewMealEntitlementImport(items) {
      return await postImportDeRefeicao('/admin/meal-entitlements/import/preview', items);
}

async function applyMealEntitlementImport(items) {
      return await postImportDeRefeicao('/admin/meal-entitlements/import', items);
}

async function postImportDeRefeicao(caminho, items) {
      const res = await fetch(`${API_BASE}${caminho}`, {
            method: 'POST',
            headers: window.authHeaders ? window.authHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify(items)
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error("Vous n'avez pas l'autorisation d'importer des données.");
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || "Erreur lors de l'importation.");
      }
      return await res.json();
}

async function postMealEntitlementBulk(items, overwrite = false) {
      const res = await fetch(`${API_BASE}/admin/meal-entitlements/bulk?overwrite=${overwrite}`, {
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

      const res = await fetch(`${API_BASE}/admin/exit-permissions?${params.toString()}`, {
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
      const res = await fetch(`${API_BASE}/admin/exit-permissions/active`, {
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
      const res = await fetch(`${API_BASE}/admin/exit-permissions/user/${encodeURIComponent(userId)}`, {
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
      const res = await fetch(`${API_BASE}/admin/exit-permissions`, {
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
      const res = await fetch(`${API_BASE}/admin/exit-permissions/${encodeURIComponent(id)}/revoke`, {
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
      window.api.getAttemptStats = getAttemptStats;
      window.api.getMealEntitlements = getMealEntitlements;
      window.api.getMealEntitlementSummary = getMealEntitlementSummary;
      window.api.putMealEntitlement = putMealEntitlement;
      window.api.postMealEntitlementBulk = postMealEntitlementBulk;
      window.api.previewMealEntitlementImport = previewMealEntitlementImport;
      window.api.applyMealEntitlementImport = applyMealEntitlementImport;
      window.api.getMealEntitlementHistory = getMealEntitlementHistory;
      window.api.getActiveExitPermissions = getActiveExitPermissions;
      window.api.postExitPermission = postExitPermission;
      window.api.revokeExitPermission = revokeExitPermission;
}

