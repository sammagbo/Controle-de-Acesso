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
    _token = null;
    _user = null;
    listeners.forEach(fn => fn(null));
  }

  function getToken() { return _token; }
  function getUser() { return _user; }
  function isLoggedIn() { return !!_token; }
  function isAdmin() { return _user && _user.role === 'ADMIN'; }
  function isOperator() { return _user && _user.role === 'OPERATOR'; }

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

  function onAuthChange(fn) {
    listeners.push(fn);
    return () => {
      const idx = listeners.indexOf(fn);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }

  async function login(username, password) {
    // We assume API_BASE_URL is available globally or we default to localhost
    const baseUrl = typeof window !== 'undefined' && window.API_BASE_URL ? window.API_BASE_URL : 'http://localhost:8080/api';
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Credenciais inválidas');
    }
    const data = await res.json();
    setAuth(data.token, {
      username: data.username,
      nomeCompleto: data.nomeCompleto,
      role: data.role,
      setoresPermitidos: data.setoresPermitidos
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
    isAdmin, isOperator, canOperateSector, onAuthChange
  };
})();
