// =====================================================================
const T = (k) => (typeof window !== 'undefined' && window.MagboI18n ? window.MagboI18n.t(k) : k);
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

      // ⚠️ SO 401 E SESSAO. O 403 e RECUSA DE PERMISSAO — outra coisa, e
      // deslogar por causa dele mente para quem esta usando o sistema.
      //
      // Custou caro: enquanto /error nao estava no permitAll, TODO erro do
      // backend (400, 404, 500) chegava aqui como 403 de corpo vazio. A
      // importacao de direitos de refeicao falhava por uma data em formato
      // frances e a tela dizia "Session expirée. Reconnectez-vous." — a pessoa
      // reconectava, tentava de novo e falhava igual, sem nunca ver que o
      // problema era uma linha da planilha. (21/08/2026.)
      //
      // ⚠️ Divida conhecida do projeto: um endpoint @PreAuthorize chamado SEM
      // token devolve 403, nao 401. Por isso o 403 continua deslogando QUANDO
      // nao ha token guardado — a distincao esta no token, nao no numero.
function checkAuthError(res) {
      if (res.status === 401) {
            window.auth?.logout();
            throw new Error(T('api.sessao.expirada'));
      }
      if (res.status === 403 && !window.auth?.getToken?.()) {
            window.auth?.logout();
            throw new Error(T('api.sessao.expirada'));
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
// fetchFinDeJournee(pointId, date?) — GET /api/presence/auto-close/preview
//
// ⚠️ TRES estados distintos, e a tela precisa dos tres:
//   • null  → o ponto NAO tem fechamento configurado; a pergunta nao se aplica
//             ali (o backend devolve 204). Mostrar "ninguem sera fechado" seria
//             mentira com cara de boa noticia.
//   • []    → tem fechamento e nao ha ninguem aberto. Boa noticia de verdade.
//   • [...] → a lista.
// Colapsar 204 em [] apagaria a diferenca entre "esta tudo certo" e "isto aqui
// nunca fecha ninguem".
// ─────────────────────────────────────────────────────────────
async function fetchFinDeJournee(pointId, date) {
    try {
        const params = new URLSearchParams({ pointId });
        if (date) params.set('date', date);
        const res = await fetch(`${API_BASE}/presence/auto-close/preview?${params.toString()}`, {
            headers: window.authHeaders ? window.authHeaders() : {}
        });
        // 204 = o ponto não tem fechamento configurado: a pergunta não se aplica ali.
        if (res.status === 204) return { estado: 'NAO_APLICAVEL', linhas: [] };
        if (!res.ok) return { estado: 'ERRO', linhas: [] };
        return { estado: 'OK', linhas: await res.json() };
    } catch (e) {
        console.error('[API] fetchFinDeJournee error:', e);
        return { estado: 'ERRO', linhas: [] };
    }
}

// ⚠️ ESTA FUNCAO JA SUMIU UMA VEZ. Ela entrou em f28a879 e desapareceu no
// remendo do merge 9fc4961 ("restore api.js — the merge resolution left it
// unparseable"). Ninguem percebeu por cinco dias porque o chamador a protege com
// `typeof fetchIncompleteMovements === 'function'` (js/components/GeneralReport.js):
// sem a funcao, o botao "Voir qui" devolvia lista VAZIA, em silencio, sem um
// erro no console — a tela dizia "nenhum movimento incompleto" e quem lesse
// acreditaria. Restaurada literalmente do commit de origem em 20/08/2026.
// ─────────────────────────────────────────────────────────────
// fetchIncompleteMovements(filters?) — GET /api/access/incomplete-movements
//
// O "quais" do número que o card já mostrava. Devolve [] em falha, como as
// irmãs acima — a tela distingue vazio de erro pelo estado que ela mesma
// mantém, e um throw aqui derrubaria o relatório inteiro por causa de um painel.
// ─────────────────────────────────────────────────────────────
async function fetchIncompleteMovements(filters = {}) {
    try {
        const params = new URLSearchParams();
        if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
        if (filters.dateTo) params.set('dateTo', filters.dateTo);
        const res = await fetch(`${API_BASE}/access/incomplete-movements?${params.toString()}`, {
            headers: window.authHeaders ? window.authHeaders() : {}
        });
        if (!res.ok) return [];
        return await res.json();
    } catch (e) {
        console.error('[API] fetchIncompleteMovements error:', e);
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
            if (res.status === 403) throw new Error(T('api.sem.permissao.dados'));
            throw new Error(T('api.erro.droits'));
      }
      return await res.json();
}

async function getMealEntitlementSummary() {
      const res = await fetch(`${API_BASE}/admin/meal-entitlements/summary`, {
            headers: window.authHeaders ? window.authHeaders() : {}
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error(T('api.sem.permissao.dados'));
            throw new Error(T('api.erro.resumo'));
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
            if (res.status === 403) throw new Error(T('api.sem.permissao.dados'));
            throw new Error(T('api.erro.droit'));
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
            if (res.status === 403) throw new Error(T('api.sem.permissao.direito'));
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || T('api.erro.sauvegarde'));
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
            if (res.status === 403) throw new Error(T('api.sem.permissao.historico'));
            throw new Error(T('api.erro.historico'));
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
            if (res.status === 403) throw new Error(T('api.sem.permissao.importar'));
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || T('api.erro.importacao'));
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
            if (res.status === 403) throw new Error(T('api.sem.permissao.importar'));
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || T('api.erro.importacao.massa'));
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
            if (res.status === 403) throw new Error(T('api.sem.permissao.dados'));
            throw new Error(T('api.erro.autorizacoes'));
      }
      return await res.json();
}

async function getActiveExitPermissions() {
      const res = await fetch(`${API_BASE}/admin/exit-permissions/active`, {
            headers: window.authHeaders ? window.authHeaders() : {}
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error(T('api.sem.permissao.dados'));
            throw new Error(T('api.erro.autorizacoes.ativas'));
      }
      return await res.json();
}

async function getExitPermissionsByUser(userId) {
      const res = await fetch(`${API_BASE}/admin/exit-permissions/user/${encodeURIComponent(userId)}`, {
            headers: window.authHeaders ? window.authHeaders() : {}
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error(T('api.sem.permissao.dados'));
            throw new Error(T('api.erro.autorizacoes.usuario'));
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
            if (res.status === 403) throw new Error(T('api.sem.permissao.criar'));
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || T('api.erro.autorizacao.salvar'));
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
            if (res.status === 403) throw new Error(T('api.sem.permissao.revogar'));
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || T('api.erro.autorizacao.revogar'));
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
            if (res.status === 403) throw new Error(T('api.sem.permissao.tentativas'));
            throw new Error(T('api.erro.tentativas'));
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
            if (res.status === 403) throw new Error(T('api.sem.permissao.stats'));
            throw new Error(T('api.erro.stats'));
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

// ── RÉGIME DE SORTIE (V014) ──────────────────────────────────────────
// O direito ANUAL de sair. Distinto das autorizações pontuais acima: aquelas
// são a exceção do dia, esta é a regra do ano — e a exceção vence.

async function getRegimeDoAluno(userId) {
      const res = await fetch(`${API_BASE}/admin/regimes/user/${encodeURIComponent(userId)}`, {
            headers: window.authHeaders ? window.authHeaders() : {}
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error(T('api.sem.permissao.dados'));
            throw new Error(T('regime.erro'));
      }
      return await res.json();
}

async function getRegimeSummary() {
      const res = await fetch(`${API_BASE}/admin/regimes/summary`, {
            headers: window.authHeaders ? window.authHeaders() : {}
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error(T('api.sem.permissao.dados'));
            throw new Error(T('regime.erro'));
      }
      return await res.json();
}

/** O veredicto AGORA — é o que a tela do portão consome. */
async function avaliarRegime(userId) {
      const res = await fetch(`${API_BASE}/admin/regimes/evaluate/${encodeURIComponent(userId)}`, {
            headers: window.authHeaders ? window.authHeaders() : {}
      });
      checkAuthError(res);
      if (!res.ok) return null;   // o portão nunca trava por falta de veredicto
      return await res.json();
}

/**
 * Os veredictos das últimas saídas de alunos NESTE portão.
 *
 * ⚠️ Nunca lança: esta é a tela do portão em hora de pico. Se o servidor
 * demora ou recusa, a lista de passagens continua funcionando exatamente como
 * antes do regime existir — o apoio some, a operação não.
 */
async function veredictosNoPortao(pointId, limite) {
      try {
            const res = await fetch(
                  `${API_BASE}/admin/regimes/gate/${encodeURIComponent(pointId)}?limite=${limite || 20}`,
                  { headers: window.authHeaders ? window.authHeaders() : {} });
            // null = falhou; [] = não há saída de aluno hoje. A tela precisa
            // distinguir: sem isso, rede caída fica idêntica a "tudo certo".
            if (!res.ok) return null;
            return await res.json();
      } catch (e) {
            return null;
      }
}

async function simularImportRegimes(linhas) {
      const res = await fetch(`${API_BASE}/admin/regimes/import/preview`, {
            method: 'POST',
            headers: window.authHeaders ? window.authHeaders() : {},
            body: JSON.stringify(linhas)
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error(T('api.sem.permissao.direito'));
            throw new Error(T('regime.erro'));
      }
      return await res.json();
}

async function aplicarImportRegimes(linhas) {
      const res = await fetch(`${API_BASE}/admin/regimes/import/apply`, {
            method: 'POST',
            headers: window.authHeaders ? window.authHeaders() : {},
            body: JSON.stringify(linhas)
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error(T('api.sem.permissao.direito'));
            throw new Error(T('regime.erro'));
      }
      return await res.json();
}

async function salvarRegime(payload) {
      const res = await fetch(`${API_BASE}/admin/regimes`, {
            method: 'POST',
            headers: window.authHeaders ? window.authHeaders() : {},
            body: JSON.stringify(payload)
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error(T('api.sem.permissao.direito'));
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || T('regime.erro'));
      }
      return await res.json();
}

async function encerrarRegime(userId, note) {
      const params = new URLSearchParams();
      if (note) params.set('note', note);
      const res = await fetch(
            `${API_BASE}/admin/regimes/user/${encodeURIComponent(userId)}?${params.toString()}`, {
            method: 'DELETE',
            headers: window.authHeaders ? window.authHeaders() : {}
      });
      checkAuthError(res);
      if (!res.ok) {
            if (res.status === 403) throw new Error(T('api.sem.permissao.direito'));
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || T('regime.erro'));
      }
      return await res.json();
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
      // Régime de sortie. ⚠️ Anexar aqui é obrigatório: em 17/07 dez funções
      // ficaram órfãs por esquecimento e as telas caíram no fallback vazio, em
      // silêncio.
      //
      // ⚠️ NÃO HÁ TESTE COBRINDO ESTA LIGAÇÃO. Uma versão anterior deste
      // comentário afirmava que `tests/wiring.test.js` a cobria; ele cobre
      // outra coisa — as tags <script> do index.html e os globais
      // window.Magbo*. Nenhum teste verifica que uma função de api.js foi
      // anexada ao window.api, que é exatamente o defeito de 17/07. Fica dito
      // como está, em vez de prometido: um comentário que inventa prova é pior
      // que um sem prova nenhuma. (Painel de revisão, 14/08/2026.)
      window.api.getRegimeDoAluno = getRegimeDoAluno;
      window.api.getRegimeSummary = getRegimeSummary;
      window.api.avaliarRegime = avaliarRegime;
      window.api.veredictosNoPortao = veredictosNoPortao;
      window.api.simularImportRegimes = simularImportRegimes;
      window.api.aplicarImportRegimes = aplicarImportRegimes;
      window.api.salvarRegime = salvarRegime;
      window.api.encerrarRegime = encerrarRegime;
}

