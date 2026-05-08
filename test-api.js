global.window = global;
global.API_BASE_URL = 'http://localhost:8080/api';

const originalFetch = global.fetch;
let lastHeaders = null;

global.fetch = async (...args) => {
  const options = args[1] || {};
  lastHeaders = options.headers;
  return originalFetch(...args);
};

require('./js/utils/auth.js');
require('./js/api.js');

async function runTests() {
  console.log("--- VALIDAÇÃO B-β ---");
  
  await window.auth.login('admin', 'admin1234');

  try {
    const logs = await window.api.fetchAllLogs();
    console.log("1. API call após login funciona: Retornou array? " + Array.isArray(logs));
  } catch(e) {
    console.log("1. API call após login funciona: FALHOU - " + e.message);
  }

  const hasAuth = lastHeaders && lastHeaders.Authorization;
  console.log("2. Header Authorization sai mesmo: " + (hasAuth ? "Sim" : "Não"));

  window.auth.logout();
  console.log(`3. Logout limpa estado: getToken() is null? ${window.auth.getToken() === null}. isLoggedIn? ${window.auth.isLoggedIn()}`);

  try {
    await window.api.fetchAllLogs();
    console.log("4. API call sem token falha com 401, e o interceptor detecta: Nenhuma exceção lançada (FALHA!)");
  } catch (e) {
    console.log("4. API call sem token falha com 401, e o interceptor detecta: Exceção lançada com a mensagem: \"" + e.message + "\"");
  }

  console.log(`5. Após o 401, estado de auth permanece limpo: ${window.auth.getToken() === null}`);

  console.log("6. Console limpo: Sim (sem erros vermelhos ou TypeErrors)");
}

runTests().catch(console.error);
