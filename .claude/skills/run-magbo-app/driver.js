// =====================================================================
// MAGBO — driver E2E do app Electron real (playwright-core)
// =====================================================================
// Biblioteca + CLI. Consolida os padrões provados em 16-17/07/2026
// (provas R1/F7a/F7c/GeneralReport). Uso previsto: bateria V01-V14.
//
// CLI:   node .claude/skills/run-magbo-app/driver.js smoke [kiosk|offline|online]
// Lib:   const d = require('./.claude/skills/run-magbo-app/driver.js');
//
// Pré-requisitos: backend UP (perfil prod, magbodb — gotcha #2 do CLAUDE.md)
// e playwright-core no node_modules (npm install --no-save playwright-core).
// =====================================================================

const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..'); // repo root
const SHOTS = path.join(os.tmpdir(), 'magbo-driver');
const PSQL = 'docker exec magbo-postgres psql -U magbo -d magbodb -t -A -c';

// ---------------------------------------------------------------------
// SQL (banco REAL magbo-postgres — sempre limpar o que inserir!)
// ---------------------------------------------------------------------
// 1ª linha = valor do RETURNING (a 2ª é o status "INSERT 0 1" do psql)
const sql = q => execSync(`${PSQL} "${q}"`, { encoding: 'utf8' }).trim().split('\n')[0].trim();

/** Insere uma tentativa negada de teste (REFEI1, MEAL_NOT_ENTITLED). Retorna o id.
 *  Timestamp em hora de parede BRT (o container é UTC; o backend grava BRT). */
function insertTestAttempt(raw = '0007777', nome = 'Teste Driver') {
      return sql(`INSERT INTO access_attempts (user_id, employee_no_raw, nome_snapshot, point_id, action, auth_method, auth_result, authorization_result, denial_reason, timestamp, door_mapping_fallback) VALUES (NULL,'${raw}','${nome}','REFEI1','ENTRADA','FACE','SUCCESS','DENIED','MEAL_NOT_ENTITLED',(now() at time zone 'America/Sao_Paulo'),false) RETURNING id;`);
}

/** Remove attempts de teste por ids. Chamar SEMPRE num finally. */
function deleteAttempts(ids) {
      if (!ids || !ids.length) return '';
      return sql(`DELETE FROM access_attempts WHERE id IN (${ids.join(',')}) RETURNING id;`);
}

// ---------------------------------------------------------------------
// Launch
// ---------------------------------------------------------------------
/** Lança o app Electron REAL. network: 'kiosk' (internet morta, localhost ok —
 *  cenário do piloto) | 'offline' (TUDO morto, até localhost) | 'online'.
 *  Retorna { app, page, externals, consoleErrors, close }. */
async function launchMagbo(network = 'kiosk') {
      const { _electron } = require(path.join(ROOT, 'node_modules', 'playwright-core'));
      const exe = require(path.join(ROOT, 'node_modules', 'electron')); // caminho do electron.exe
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE; // shell do VSCode exporta =1 → electron viraria Node puro ("bad option")

      const app = await _electron.launch({ executablePath: exe, args: ['.'], cwd: ROOT, env });
      const page = await app.firstWindow();

      // ⚠️ NÃO usar session.enableNetworkEmulation({offline:true}) — é NO-OP neste
      // Electron (testado 17/07: fetch localhost E example.com passaram). O bloqueio
      // real é via webRequest (file:// não passa por aqui, a UI local sempre carrega).
      if (network === 'offline') {
            await app.evaluate(({ session }) => {
                  session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
                        cb({ cancel: /^https?:\/\//.test(d.url) }); // TUDO http(s), inclusive localhost
                  });
            });
      } else if (network === 'kiosk') {
            await app.evaluate(({ session }) => {
                  session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
                        cb({ cancel: /^https?:\/\//.test(d.url) && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(d.url) });
                  });
            });
      }

      const externals = [], consoleErrors = [];
      page.on('requestfailed', r => { if (/^https?:\/\//.test(r.url()) && !/localhost|127\.0\.0\.1/.test(r.url())) externals.push(r.url()); });
      page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

      // reload: carga limpa JÁ sob a política de rede escolhida
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.getElementById('root')?.childElementCount > 0, null, { timeout: 45000 });

      return { app, page, externals, consoleErrors, close: () => app.close() };
}

// ---------------------------------------------------------------------
// Navegação (seletores PROVADOS — cuidado: innerText vem em UPPERCASE
// pelo CSS; usar regex /i, nunca includes() com acento/caixa exata)
// ---------------------------------------------------------------------
async function login(page, user = 'admin', pass = 'admin1234') {
      await page.locator('input').first().fill(user);
      await page.locator('input[type="password"]').fill(pass);
      await page.getByRole('button', { name: 'ACCÉDER' }).click(); // botão, não o texto (2 matches)
      await page.waitForFunction(() => !document.body.innerText.includes('Bienvenue'), null, { timeout: 30000 });
      await page.waitForTimeout(1000);
}

/** Painel Administrativo: cadeado no header → modal de PIN (default dev 1234).
 *  Lockout do backend: 5 erros → 60s. Não insistir com PIN errado. */
async function enterAdminPanel(page, pin = '1234') {
      await page.locator('button[title="Painel Administrativo"]').click();
      await page.waitForTimeout(1200);
      await page.keyboard.type(pin);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.body.innerText.includes('Painel Administrativo'), null, { timeout: 10000 });
      await page.waitForTimeout(800);
}

/** Dashboard → Monitor Cantine (card clicável direto; feed poll 3s). */
async function gotoMonitorCantine(page) {
      await page.getByText('Monitor Cantine', { exact: false }).first().click();
      await page.waitForFunction(() => /tentatives refus/i.test(document.body.innerText), null, { timeout: 20000 });
      await page.waitForTimeout(4000); // 1º poll
}

/** AdminPanel → Rapport Général. O card NÃO é clicável — o clicável é o
 *  botão "Ouvrir le rapport" dentro dele. */
async function gotoRapportGeneral(page) {
      await page.getByRole('button', { name: 'Ouvrir le rapport' }).click();
      await page.waitForFunction(() => /tentatives refus/i.test(document.body.innerText), null, { timeout: 20000 });
      await page.waitForTimeout(6000); // 1º poll (5s)
}

/** Espião do beep do feed (F7a): conta invocações SEM silenciar o som. */
async function spyBeep(page) {
      await page.evaluate(() => {
            window.__beeps = 0;
            const o = window.playDeniedFeedBeep;
            window.playDeniedFeedBeep = () => { window.__beeps++; o && o(); };
      });
      return () => page.evaluate(() => window.__beeps);
}

/** Destaques ativos do feed (linhas novas, ~8s): .ring-2.animate-pulse */
function countHighlights(page) {
      return page.evaluate(() => document.querySelectorAll('.ring-2.animate-pulse').length);
}

async function screenshot(page, name) {
      fs.mkdirSync(SHOTS, { recursive: true });
      const p = path.join(SHOTS, `${name}-${Date.now()}.png`);
      await page.screenshot({ path: p });
      return p;
}

// ---------------------------------------------------------------------
// CLI: smoke — login → dashboard → screenshot → 0 externos/erros
// ---------------------------------------------------------------------
async function smoke(network = 'kiosk') {
      const s = await launchMagbo(network);
      try {
            // offline = backend inalcançável → fica na tela de login (prova de render local);
            // kiosk/online = login real até o dashboard.
            if (network !== 'offline') await login(s.page);
            const checks = await s.page.evaluate(() => ({
                  react: window.React?.version, babel: window.Babel?.version,
                  lucide: !!window.lucide, jspdf: !!window.jspdf, tailwind: !!window.tailwind,
                  fontInter: document.fonts.check('16px Inter'),
                  tela: document.body.innerText.slice(0, 80).replace(/\n+/g, ' | '),
            }));
            const shot = await screenshot(s.page, `smoke-${network}`);
            // offline: erros de console de fetch bloqueado a localhost são ESPERADOS (não reprovam)
            const consoleOk = network === 'offline' || s.consoleErrors.length === 0;
            const ok = !!(checks.react && checks.fontInter && s.externals.length === 0 && consoleOk);
            console.log(JSON.stringify({ network, checks, externos: s.externals.length, errosConsole: s.consoleErrors, screenshot: shot, veredito: ok ? 'OK' : 'FALHOU' }, null, 2));
            if (!ok) process.exitCode = 1;
      } finally {
            await s.close();
      }
}

module.exports = { ROOT, launchMagbo, login, enterAdminPanel, gotoMonitorCantine, gotoRapportGeneral, spyBeep, countHighlights, screenshot, sql, insertTestAttempt, deleteAttempts, smoke };

if (require.main === module) {
      const [cmd, arg] = process.argv.slice(2);
      if (cmd === 'smoke') smoke(arg || 'kiosk').catch(e => { console.error('SMOKE FALHOU:', e.message); process.exit(1); });
      else { console.log('uso: node driver.js smoke [kiosk|offline|online]'); process.exit(2); }
}
