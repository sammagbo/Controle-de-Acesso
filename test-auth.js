// Mock window and API_BASE_URL
global.window = global;
global.API_BASE_URL = 'http://localhost:8080/api';

// Load the auth.js file
require('./js/utils/auth.js');

async function runTests() {
  console.log("--- VALIDAÇÃO B-α ---");
  
  // 3. Executar: window.auth
  console.log("\n3. window.auth:");
  console.log(Object.keys(window.auth));

  // 4. Executar: window.auth.getToken()
  console.log("\n4. window.auth.getToken():");
  console.log(window.auth.getToken());

  // 5. Executar: window.auth.isLoggedIn()
  console.log("\n5. window.auth.isLoggedIn():");
  console.log(window.auth.isLoggedIn());

  // 6. Executar: await window.auth.login('admin', 'admin1234')
  console.log("\n6. await window.auth.login('admin', 'admin1234'):");
  try {
    const loginResult = await window.auth.login('admin', 'admin1234');
    console.log({
      token: loginResult.token ? "<JWT_STRING>" : null,
      username: loginResult.username,
      role: loginResult.role,
      setoresPermitidos: loginResult.setoresPermitidos
    });
  } catch(e) {
    console.log("Login falhou:", e.message);
  }

  // 7. Executar: window.auth.getToken()
  console.log("\n7. window.auth.getToken() (após login):");
  const token = window.auth.getToken();
  console.log(token ? `<STRING_LONGA_JWT: ${token.substring(0,20)}...>` : null);

  // 8. Executar: window.auth.isAdmin()
  console.log("\n8. window.auth.isAdmin():");
  console.log(window.auth.isAdmin());
}

runTests();
