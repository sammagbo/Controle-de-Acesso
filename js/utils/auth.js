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
    // ⚠️⚠️ LE « /api » EN TROP QUI A BLOQUÉ TOUTE L'ÉCOLE — 03/09/2026.
    //
    // Ce qu'on voyait : « Identifiants invalides » avec le BON mot de passe,
    // sur un serveur qui répondait, et seulement sur le portable reconstruit.
    // Ce qui partait réellement, mesuré dans l'Electron réel :
    //
    //       http://192.168.1.253:8080/api/api/auth/login
    //                                 ^^^^ ^^^^
    //
    // Ce chemin n'est pas dans la liste `permitAll` de SecurityConfig : Spring
    // Security le refuse par un 403 et la requête n'atteint JAMAIS
    // AuthController. Le front, lui, traduisait tout non-2xx en « identifiants
    // invalides » — voir plus bas, c'est le second défaut de la même panne.
    //
    // ⚠️ LA CAUSE EST UNE CROYANCE FAUSSE, ÉCRITE ICI MÊME. La version
    // précédente affirmait que `window.API_BASE_URL` « n'est affecté nulle
    // part dans le dépôt », au motif qu'un `const` de premier niveau va dans
    // l'environnement lexical global et non en propriété de `window`. C'est
    // vrai d'un `<script>` ordinaire. `js/api.js` n'en est pas un : il est
    // chargé en `<script type="text/babel">` (index.html:73), Babel le
    // transpile AVANT exécution, le préréglage `env` ramène le `const` à un
    // `var`, et un `var` de premier niveau EST une propriété de `window`.
    // La globale existe donc, et sa valeur se termine DÉJÀ par `/api`.
    // (Mesuré : `delete window.API_BASE_URL` rend `false` dans le renderer —
    // signature d'une liaison `var`, non configurable.)
    //
    // ⚠️ ET C'EST CE QUI EXPLIQUE QUE L'ANCIEN PARC MARCHE. Le code d'avant
    // (8cfc8a3) faisait `window.API_BASE_URL ? window.API_BASE_URL : …` — il
    // prenait la globale TELLE QUELLE. Si elle avait vraiment été absente,
    // tous les postes seraient partis sur localhost et aucun n'aurait jamais
    // fonctionné. Que l'ancien portable marche PROUVE qu'elle est définie.
    //
    // La correction ne rétablit pas cette dépendance : elle la supprime. On
    // construit l'adresse à partir du pont Electron, comme le font déjà
    // js/api.js:33, js/utils/api.js:6 et js/cdi/cdiData.js:11. Personne ne
    // doit plus avoir à deviner ce que contient une globale que le dépôt
    // n'écrit nulle part explicitement.
    // Gardé par tests/adresseDuLogin.test.js, qui charge js/api.js par le
    // vrai Babel vendorisé : sans ce chargement, le test ne prouverait rien.
    const baseUrl = ((typeof window !== 'undefined' && window.magboConfig
           && window.magboConfig.getCached && window.magboConfig.getCached()
           && window.magboConfig.getCached().apiUrl) || 'http://localhost:8080') + '/api';
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      // ⚠️ LE MESSAGE QUI MENTAIT SUR LA NATURE DE LA PANNE — et qui a coûté
      // la journée de diagnostic du 03/09/2026. La forme précédente était
      //
      //       throw new Error(traduzido || err.error || 'api.credenciais');
      //
      // où `traduzido` valait TOUJOURS « Identifiants invalides » dès que
      // l'i18n était chargé. Un 403, un 404, un 502 et une panne du serveur
      // disaient donc tous les quatre à l'AED que son mot de passe était
      // faux. On envoyait quelqu'un réclamer un mot de passe pendant que le
      // poste parlait à la mauvaise adresse.
      //
      // Seul un 401 parle des identifiants : c'est le seul statut que
      // AuthController émette quand l'authentification échoue. Tout le reste
      // porte son numéro, pour qu'une capture d'écran suffise au diagnostic.
      const err = await res.json().catch(() => ({}));
      const t = (cle, params) => ((typeof window !== 'undefined' && window.MagboI18n)
            ? window.MagboI18n.t(cle, params) : null);
      if (res.status === 401) {
        throw new Error(t('api.credenciais') || err.error || 'api.credenciais');
      }
      const erreur = new Error(t('login.erro.statut', { statut: res.status })
            || `HTTP ${res.status}`);
      erreur.status = res.status;
      throw erreur;
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
