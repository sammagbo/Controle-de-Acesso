// =====================================================================
// AUTH UTILITY
// =====================================================================
// Gerencia o estado de autenticação no frontend.
// Token guardado em memória (não localStorage por segurança em Electron).
// Em caso de reload, o usuário precisa logar novamente.

(function () {
  let _token = null;
  let _user = null;
  const listeners = [];

  function setAuth(token, user) {
    _token = token;
    _user = user;
    listeners.forEach(fn => fn(_user));
  }

  function clearAuth() {
      // ⚠️ O retrato do PPMS é uma lista nominativa de menores em disco. A
      // sessão terminou; ela não pode sobreviver a isso. (Painel de revisão,
      // proteção de dados, 14/08.)
      if (typeof window !== 'undefined' && window.MagboPpmsCache) window.MagboPpmsCache.apagar();
      else try { localStorage.removeItem('magbo.ppms.ultimo'); } catch (e) { /* ignora */ }
    _token = null;
    _user = null;
    listeners.forEach(fn => fn(null));
  }

  function getToken() { return _token; }
  function getUser() { return _user; }
  function isLoggedIn() { return !!_token; }
  function isAdmin() { return _user && _user.role === 'ADMIN'; }
  function isOperator() { return _user && _user.role === 'OPERATOR'; }

  // Permissão granular de ESCRITA (espelha SystemUser.hasPermission do backend):
  // ADMIN sempre passa; "*" = todas; senão o CSV `permissoes` precisa conter o valor.
  // O backend é a autoridade real (@PreAuthorize); isto só governa o estado da UI.
  function hasPermission(permission) {
    if (!_user) return false;
    if (_user.role === 'ADMIN') return true;
    if (!_user.permissoes) return false;
    const p = _user.permissoes.trim();
    if (p === '*') return true;
    return p
      .split(',')
      .map(s => s.trim().toUpperCase())
      .includes(String(permission).toUpperCase());
  }

  function canOperateSector(sectorId) {
    if (!_user) return false;
    if (_user.role === 'ADMIN') return true;
    if (!_user.setoresPermitidos) return false;
    if (_user.setoresPermitidos.trim() === '*') return true;
    return _user.setoresPermitidos
      .split(',')
      .map(s => s.trim().toUpperCase())
      .includes(String(sectorId).toUpperCase());
  }

  function canAccessArea(area) {
      if (!_user) return false;
      if (_user.role === 'ADMIN') return true;
      if (!_user.setoresPermitidos) return false;
      const perms = _user.setoresPermitidos.trim();
      if (perms === '*') return true;
      return perms.split(',').map(s => s.trim().toLowerCase()).includes((area || '').toLowerCase());
  }

  function onAuthChange(fn) {
    listeners.push(fn);
    return () => {
      const idx = listeners.indexOf(fn);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }

  async function login(username, password) {
    // ⚠️⚠️ LA CONNEXION PARTAIT SUR localhost SUR TOUS LES POSTES.
    //
    // Cette ligne lisait `window.API_BASE_URL`, qui n'est affecte NULLE PART
    // dans le depot. `js/api.js` declare bien `const API_BASE_URL`, mais un
    // `const` de premier niveau va dans l'environnement lexical global, PAS en
    // propriete de `window` — le seul global que ce fichier publie est
    // `window.api`. La condition etait donc toujours fausse et le repli
    // toujours pris : `window.auth.login()` interrogeait
    // `http://localhost:8080/api/auth/login` sur chaque poste de l'ecole.
    //
    // ⚠️ C'est aussi ce qui empechait le chantier « premier lancement » d'aller
    // au bout : sur un PC neuf, l'ecran de configuration reussissait et l'ecran
    // SUIVANT ne pouvait pas fonctionner. Trouve par le panel de revue
    // (qualite, 02/09/2026) ; le defaut est ANTERIEUR au chantier.
    //
    // Meme forme que js/utils/userCache.js : la valeur posee a la main gagne si
    // elle existe un jour, sinon on lit le pont Electron, et le localhost n'est
    // plus qu'un dernier filet pour une page ouverte hors Electron.
    //
    // ⚠️ LES PARENTHESES DE LA DERNIERE LIGNE NE SONT PAS DECORATIVES : `+` lie
    // plus fort que `||`. Sans elles, le jour ou quelqu'un poserait vraiment
    // `window.API_BASE_URL` — ce que la ligne annonce comme possible —,
    // `baseUrl` vaudrait cette valeur SANS `/api`, et la connexion partirait
    // sur `.../auth/login` au lieu de `.../api/auth/login`. Le meme defaut
    // dort dans `js/utils/userCache.js`, dont cette forme est copiee ; il y est
    // corrige dans la meme passe. (Panel de revue — qualite, 2e tour.)
    const racine = (typeof window !== 'undefined' && window.magboConfig
           && window.magboConfig.getCached && window.magboConfig.getCached()
           && window.magboConfig.getCached().apiUrl) || 'http://localhost:8080';
    const baseUrl = ((typeof window !== 'undefined' && window.API_BASE_URL) || racine) + '/api';
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const traduzido = (typeof window !== 'undefined' && window.MagboI18n)
            ? window.MagboI18n.t('api.credenciais') : null;
      throw new Error(traduzido || err.error || 'api.credenciais');
    }
    const data = await res.json();
    setAuth(data.token, {
      username: data.username,
      nomeCompleto: data.nomeCompleto,
      role: data.role,
      setoresPermitidos: data.setoresPermitidos,
      permissoes: data.permissoes
    });
    return data;
  }

  function logout() {
    clearAuth();
  }

  // To support testing in Node.js easily, we attach to globalThis if window is not available
  const globalObj = typeof window !== 'undefined' ? window : globalThis;
  
  globalObj.auth = {
    login, logout, getToken, getUser, isLoggedIn,
    isAdmin, isOperator, hasPermission, canOperateSector, canAccessArea, onAuthChange
  };
})();
