// =====================================================================
// USER CACHE — single source of truth para usuários ativos no frontend
// =====================================================================
// Carrega lista do backend uma vez no startup; recarrega em eventos
// específicos. Expõe funções globais usadas por componentes.

(function() {
      const API_BASE = window.API_BASE_URL
            || ((window.magboConfig?.getCached?.()?.apiUrl) || 'http://localhost:8080') + '/api';
      let cache = [];
      let loadedAt = null;

      function normalise(raw) {
            if (!raw) return null;
            return {
                  id: raw.id,
                  nome: raw.nome,
                  tipo: raw.tipo,
                  turma: raw.turma,
                  foto_url: raw.fotoUrl || raw.foto_url,
                  responsavel_id: raw.responsavelId || raw.responsavel_id,
                  meal_count: raw.mealCount ?? raw.meal_count ?? 0,
                  ativo: raw.ativo !== false
            };
      }

      async function reloadUserCache() {
            if (!window.auth || !window.auth.isLoggedIn()) {
                  console.log('userCache: skipping reload, no auth token yet');
                  return;
            }
            try {
                  const token = window.auth && window.auth.getToken && window.auth.getToken();
                  const res = await fetch(`${API_BASE}/users`, {
                        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                  });
                  if (!res.ok) throw new Error('HTTP ' + res.status);
                  const data = await res.json();
                  cache = (data.users || []).map(normalise).filter(Boolean);
                  loadedAt = Date.now();
                  window.dispatchEvent(new CustomEvent('user-cache-updated', { detail: { count: cache.length } }));
                  return cache;
            } catch (e) {
                  console.error('[userCache] reload FAILED:', e.message);
                  window.dispatchEvent(new CustomEvent('user-cache-error', { detail: { message: e.message } }));
                  return cache;
            }
      }

      async function searchUsersRemote(query, limit = 20) {
            try {
                  const q = encodeURIComponent(query || '');
                  const token = window.auth && window.auth.getToken && window.auth.getToken();
                  const res = await fetch(`${API_BASE}/users/search?q=${q}&limit=${limit}`, {
                        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                  });
                  if (!res.ok) throw new Error('HTTP ' + res.status);
                  const data = await res.json();
                  return (data.users || []).map(normalise).filter(Boolean);
            } catch (e) {
                  console.warn('searchUsersRemote failed:', e);
                  return [];
            }
      }

      function getCachedUsers() { return cache; }
      function getCachedUserById(id) { return cache.find(u => u.id === id) || null; }
      function getCacheLoadedAt() { return loadedAt; }

      // Exposição global
      window.userCache = {
            reload: reloadUserCache,
            search: searchUsersRemote,
            all: getCachedUsers,
            byId: getCachedUserById,
            loadedAt: getCacheLoadedAt
      };

      // Carrega no startup. Evita race com o React: dispara o evento depois.
      reloadUserCache();
})();
