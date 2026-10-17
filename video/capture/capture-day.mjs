// Captura o dia inteiro do MAGBO, do login ao fechamento do dia, nas telas reais da instância demo, para o vídeo
// novo do portfólio. Duas sessões, cada uma numa instância já preparada por seed-day.mjs:
//
//   MAGBO_DEMO_WEBHOOK_TOKEN=… node capture-day.mjs --session midi    (começar entre 11:55 e 12:20, dia útil)
//   MAGBO_DEMO_WEBHOOK_TOKEN=… node capture-day.mjs --session soir    (começar entre 16:15 e 16:40; espera até 17:05)
//
// Com --ensaio, pula as conferências de horário e grava em video/public/portfolio-day-ensaio/; sem ele, em
// video/public/portfolio-day/. Cada pasta tem um manifest.json com as caixas em que o vídeo dá zoom. O git
// ignora as duas. As passagens entram cena a cena, logo antes da captura que as mostra.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { demo } from './demo.mjs';
import { boxAround, boxOf, guard, union } from './screens.mjs';

const args = process.argv.slice(2);
const session = args[args.indexOf('--session') + 1];
const ensaio = args.includes('--ensaio');
if (!['midi', 'soir'].includes(session)) {
      console.error('usage: node capture-day.mjs --session midi|soir [--ensaio]');
      process.exit(2);
}

const OUT = new URL(ensaio ? '../public/portfolio-day-ensaio/' : '../public/portfolio-day/', import.meta.url);
const VIEWPORT = { width: 1440, height: 900 }; // 16:10, como o vídeo
const SCALE = 2;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const name = (id) => demo.byId(id).name;
const log = (line) => console.log(`${new Intl.DateTimeFormat('fr-FR', { timeZone: demo.schoolZone, timeStyle: 'medium' }).format(new Date())}  ${line}`);

// Os personagens e os grupos do roteiro.
const HUGO = '9000001'; // autorizado: entra na cantina pelo rosto
const LINA = '9000002'; // sem direito: recusada pelo crachá, depois autorizada, entra pelo rosto
const NOAH = '9000004'; // sai sem autorização à tarde, depois com ela
const EMMA = '9000011'; // o parcours do dia
const ABSENT = ['9000027', '9000028', '9000029', '9000030']; // não passam pelo portão de manhã
const GATE_BY_CARD = ['9000005', '9000012', '9000018', '9000021', '9000024', '9000026'];
const CDI_MORNING = ['9000003', '9000006', '9000009', '9000011', '9000013', '9000017', '9000019', '9000025'];
const CDI_LEAVE_1050 = ['9000011', '9000013', '9000017', '9000019', '9000025']; // Inès, Léo e Zoé ficam até o fechamento
const INCOMPLETE_SUBTITLE = 'Qui, où et à quelle heure — pour pouvoir aller voir';
const CANTINE_FIRST = ['9000004', '9000007', '9000008', '9000011', '9000014', '9000015', '9000016', '9000020', '9000022', '9000023'];

const token = await demo.login();
await demo.assertLicenceValid(token);

/** A hora do servidor, no fuso da demo. */
async function serverParts() {
      const health = await (await fetch(`${demo.apiUrl}/api/health`)).json();
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
            timeZone: demo.schoolZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(new Date(health.timestamp)).map((part) => [part.type, part.value]));
      return { weekday: parts.weekday, hhmm: `${parts.hour}:${parts.minute}` };
}

// As conferências de horário: dia útil, e a sessão começa na sua janela.
if (!ensaio) {
      const { weekday, hhmm } = await serverParts();
      const window = session === 'midi' ? ['11:55', '12:20'] : ['16:15', '16:40'];
      if (['Sat', 'Sun'].includes(weekday)) throw new Error(`today is ${weekday}: the sessions run on a weekday`);
      if (hhmm < window[0] || hhmm > window[1]) throw new Error(`server time ${hhmm}: the ${session} session starts between ${window[0]} and ${window[1]}`);
      log(`clock check: ${weekday} ${hhmm}, inside ${window.join('–')}`);
} else if (demo.schoolNow().hour < '11:00') {
      throw new Error('a rehearsal needs to run after 11:00: the morning passes go up to 10:50 and the backend refuses future ones');
}

/** No ensaio, depois do horário da escola, o fechamento automático do servidor roda a cada 5 min e fecha toda
 *  presença aberta; espera o começo de um ciclo para a cena caber nele. Só no ensaio: num dia útil, nas janelas das
 *  sessões, o fechamento não passa. */
async function freshCloseCycle(label) {
      if (!ensaio) return;
      for (;;) {
            const now = new Date();
            if (now.getMinutes() % 5 === 0 && now.getSeconds() >= 5 && now.getSeconds() < 40) break;
            await sleep(1000);
      }
      log(`rehearsal: ${label} starts at the beginning of a 5-minute close cycle`);
}

// O manifest acumula as duas sessões na mesma pasta.
mkdirSync(OUT, { recursive: true });
const manifestFile = new URL('manifest.json', OUT);
const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : { viewport: VIEWPORT, scale: SCALE, shots: {} };

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true });
const problems = [];
async function newPage() {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE, timezoneId: demo.schoolZone, locale: 'fr-FR' });
      const page = await context.newPage();
      page.on('pageerror', (error) => problems.push(String(error)));
      page.on('console', (message) => {
            // os alunos não têm foto de propósito: as telas mostram as iniciais
            if (message.type() === 'error' && !/status of 404/.test(message.text())) problems.push(message.text());
      });
      return { context, page };
}

/** Confere a tela, grava a captura e as caixas. `fullPage` para as telas que passam da janela: aí as caixas estão
 *  em coordenadas da página, medidas com a página no topo. */
async function shot(page, file, boxes, { fullPage = false } = {}) {
      await guard(page, file);
      await page.screenshot({ path: new URL(`${file}.png`, OUT).pathname, fullPage });
      const entry = { ...boxes };
      if (fullPage) entry.page = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
      manifest.shots[file] = entry;
      writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
      log(`${file}.png  guard ok  ${JSON.stringify(entry)}`);
}

const loginPanel = (page) => boxAround(page, 'Bienvenue', { minWidth: 300, minHeight: 300 });
async function logIn(page) {
      await page.locator('input[type=text]').fill(demo.admin.username);
      await page.locator('input[type=password]').fill(demo.admin.password);
      await page.getByRole('button', { name: /accéder/i }).click();
      await page.getByText('Choisissez le poste de travail').waitFor();
}
async function openAdministration(page) {
      await page.getByRole('button', { name: /^Administration$/ }).click();
      await page.locator('input[placeholder="••••"]').fill(demo.adminPin); // a janela do PIN nunca é capturada
      await page.getByRole('button', { name: /^Entrer$/ }).click();
      await page.getByText('Panneau administratif', { exact: true }).first().waitFor();
}
async function toDashboard(page) {
      await page.getByRole('button', { name: /Tableau de bord/ }).first().click();
      await page.getByText('Choisissez le poste de travail').waitFor();
}
async function openSector(page, label, ready) {
      await page.getByRole('button', { name: label }).click();
      await page.getByText(ready).first().waitFor();
      await page.evaluate(() => window.scrollTo(0, 0)); // o cartão clicado pode ter rolado o Tableau de bord
      await sleep(3500); // uma rodada de atualização (3 s)
}

/** O corpo da tela do CDI, sem a barra do alto nem o rodapé (os dois dizem «SafeTrack»), e a barra como `crop`. */
async function cdiBoxes(page) {
      const crop = await boxAround(page, 'SafeTrack — Centre de Documentation', { minWidth: 1000, maxHeight: 90 });
      const footer = await boxAround(page, 'MODE URGENCE', { minWidth: 1000, maxHeight: 120 });
      const top = crop ? crop.y + crop.height : 0;
      const bottom = footer ? footer.y : VIEWPORT.height;
      return { body: { x: 0, y: top, width: VIEWPORT.width, height: bottom - top }, crop };
}

/** As primeiras linhas da lista «Derniers passages». */
async function firstPassages(page, count) {
      return page.evaluate((count) => {
            const card = [...document.querySelectorAll('body *')].find((el) => el.children.length === 0 && el.textContent.trim().toLowerCase() === 'derniers passages');
            let box = card;
            while (box && box.getBoundingClientRect().height < 300) box = box.parentElement;
            const times = [...box.querySelectorAll('*')].filter((el) => el.children.length === 0 && /^\d\d:\d\d:\d\d$/.test(el.textContent.trim()));
            const rows = times.slice(0, count).map((el) => {
                  let row = el;
                  while (row.parentElement && row.parentElement.getBoundingClientRect().height < 110) row = row.parentElement;
                  const r = row.getBoundingClientRect();
                  return { x: r.left, y: r.top, width: r.width, height: r.height };
            });
            const x = Math.min(...rows.map((r) => r.x)), y = Math.min(...rows.map((r) => r.y));
            const right = Math.max(...rows.map((r) => r.x + r.width)), bottom = Math.max(...rows.map((r) => r.y + r.height));
            return { x: Math.round(x), y: Math.round(y), width: Math.round(right - x), height: Math.round(bottom - y) };
      }, count);
}

if (session === 'midi') {
      // ── A manhã, com o relógio do navegador na hora de cada cena ──
      let { context, page } = await newPage();
      await page.clock.setFixedTime(demo.todayAt('07:27'));
      await page.goto(demo.frontend, { waitUntil: 'load' });
      await page.getByRole('button', { name: /accéder/i }).waitFor();
      await shot(page, 'login-0', { form: await loginPanel(page) });

      await page.clock.setFixedTime(demo.todayAt('07:28'));
      await page.locator('input[type=text]').fill(demo.admin.username);
      await page.locator('input[type=password]').fill(demo.admin.password);
      await shot(page, 'login-1', { form: await loginPanel(page) });

      await page.clock.setFixedTime(demo.todayAt('07:29'));
      await page.getByRole('button', { name: /accéder/i }).click();
      await page.getByText('Choisissez le poste de travail').waitFor();
      await sleep(1500);
      const counters = union(...await Promise.all(["Mouvements aujourd'hui", 'Personnes enregistrées', "Points d'accès"]
            .map((label) => boxAround(page, label, { minWidth: 150, minHeight: 60, maxHeight: 140 }))));
      const sectors = union(...await Promise.all((await page.getByRole('button', { name: /Ouvrir le secteur/ }).all()).map(boxOf)));
      await shot(page, 'dashboard', { counters, grid: sectors, card: await boxOf(page.getByRole('button', { name: /Portail Principal/ })) }, { fullPage: true });

      // O portão entre 07:30 e 07:45: todos menos quatro, uma passagem a cada 31 a 35 s.
      const gate = demo.students.filter((student) => !ABSENT.includes(student.id));
      let at = demo.todayAt('07:30').getTime();
      for (const student of gate) {
            await demo.passAt(student.id, GATE_BY_CARD.includes(student.id) ? 'card' : 'face', { point: 'PORT1', at: new Date(at) });
            at += 31_000 + Math.floor(Math.random() * 4_000);
      }
      log(`gate: ${gate.length} entries, 07:30 to ${new Intl.DateTimeFormat('fr-FR', { timeZone: demo.schoolZone, timeStyle: 'short' }).format(new Date(at))}`);
      await page.clock.setFixedTime(demo.todayAt('07:46'));
      await openSector(page, /Portail Principal/, 'Derniers passages');
      await shot(page, 'portail', { list: await boxAround(page, 'Derniers passages', { minWidth: 500, minHeight: 300 }) });

      // O CDI entre 09:48 e 10:04.
      await freshCloseCycle('the CDI');
      const from = demo.todayAt('09:48').getTime(), step = (demo.todayAt('10:04').getTime() - from) / (CDI_MORNING.length - 1);
      for (const [i, id] of CDI_MORNING.entries()) await demo.passAt(id, 'face', { point: 'BIBLIO', at: new Date(from + i * step) });
      await page.clock.setFixedTime(demo.todayAt('10:06'));
      await toDashboard(page);
      await openSector(page, /^CDI/, '/ 50');
      await page.getByText(String(CDI_MORNING.length), { exact: true }).first().waitFor();
      await shot(page, 'cdi', await cdiBoxes(page));

      // Às 10:50, cinco saem do CDI; Inès, Léo e Zoé ficam até o fechamento. Nada é capturado.
      for (const id of CDI_LEAVE_1050) await demo.passAt(id, 'face', { point: 'BIBLIO', action: 'SAIDA', at: demo.todayAt('10:50') });
      log(`CDI: ${CDI_LEAVE_1050.length} exits at 10:50`);
      await context.close();

      // ── A cantina, com o relógio real, num contexto novo; o login acontece fora da câmera ──
      if (ensaio) log(`rehearsal: extra meal slot ${await demo.openMealService(token)}`);
      ({ context, page } = await newPage());
      await page.goto(demo.frontend, { waitUntil: 'load' });
      await logIn(page);
      await freshCloseCycle('the cantine');
      const now = Date.now(), first = now - 9 * 60_000, gap = (7 * 60_000) / (CANTINE_FIRST.length - 1);
      for (const [i, id] of CANTINE_FIRST.entries()) await demo.passAt(id, 'face', { point: 'REFEI1', at: new Date(first + i * gap) });
      await openSector(page, /Surveillance Cantine/, 'Moniteur Cantine');
      const column = () => boxAround(page, 'Dans la cantine', { minWidth: 200, minHeight: 400, side: 'left' });
      const feed = () => boxAround(page, 'Tentatives refusées', { minWidth: 300, minHeight: 400, side: 'right' });
      await shot(page, 'cantine-0', { column: await column(), feed: await feed() });

      await demo.passAt(HUGO, 'face', { point: 'REFEI1' });
      await page.getByText(name(HUGO), { exact: true }).first().waitFor({ timeout: 15000 });
      await sleep(800);
      await shot(page, 'cantine-1', { column: await column(), card: await boxAround(page, name(HUGO), { minWidth: 200, maxHeight: 120, side: 'left' }) });

      const refusedAt = Date.now();
      await demo.passAt(LINA, 'card', { point: 'REFEI1' });
      await page.getByText('Pas de droit au repas').first().waitFor({ timeout: 15000 });
      await sleep(9000); // uma tentativa nova fica destacada por uns 8 s: espera o contraste normal
      await shot(page, 'cantine-2', { feed: await feed(), row: await boxAround(page, name(LINA), { minWidth: 300, maxHeight: 160, side: 'right' }) });

      await openAdministration(page);
      await page.getByRole('button', { name: /Gérer les droits/ }).click();
      await page.getByText(name(LINA), { exact: true }).first().waitFor();
      await page.locator('input[type=text], input[type=search]').first().fill('Exemple');
      await sleep(1500);
      const row = () => page.locator('tr', { hasText: name(LINA) });
      await row().evaluate((el) => el.scrollIntoView({ block: 'center' })); // a mesma rolagem nas duas capturas
      await sleep(800);
      await shot(page, 'droits-0', { row: await boxOf(row()) });
      await row().getByRole('button').first().click();
      await row().getByText('Autorisé', { exact: true }).waitFor({ timeout: 15000 });
      await sleep(800);
      await shot(page, 'droits-1', { row: await boxOf(row()) });

      await toDashboard(page);
      await openSector(page, /Surveillance Cantine/, 'Moniteur Cantine');
      const pause = refusedAt + 31_000 - Date.now(); // duas passagens da Lina na cantina, a mais de 30 s uma da outra
      if (pause > 0) await sleep(pause);
      await demo.passAt(LINA, 'face', { point: 'REFEI1' });
      await page.locator('text=' + name(LINA)).nth(1).waitFor({ timeout: 15000 }); // na coluna, além da tentativa recusada
      await sleep(800);
      await shot(page, 'cantine-3', {
            column: await column(),
            card: await boxAround(page, name(LINA), { minWidth: 200, maxHeight: 120, side: 'left' }),
            feed: await feed(),
      });
      await context.close();
}

if (session === 'soir') {
      const { page } = await newPage();
      await page.goto(demo.frontend, { waitUntil: 'load' });
      await logIn(page);

      // Noah tenta sair sem autorização.
      const firstExit = new Date();
      await demo.passAt(NOAH, 'face', { point: 'PORT1', action: 'SAIDA', at: firstExit });
      await openAdministration(page);
      await page.getByRole('button', { name: /Gérer les sorties/ }).click();
      await page.getByText('Sortie non autorisée').first().waitFor({ timeout: 15000 });
      await sleep(9000); // o destaque da tentativa nova
      await shot(page, 'sorties-0', { row: await boxAround(page, name(NOAH), { minWidth: 400, minHeight: 50, maxHeight: 200 }) });

      // A autorisation, preenchida antes de salvar.
      await page.getByRole('button', { name: /Nouvelle autorisation/ }).first().click();
      await page.locator('input[placeholder^="Rechercher par nom"]').fill('Noah');
      await page.getByRole('button', { name: new RegExp(name(NOAH)) }).click();
      await page.locator('input[placeholder="Membre de la Vie Scolaire"]').fill('Vie scolaire');
      await page.locator('select').filter({ hasText: 'Sortie unique' }).selectOption({ label: 'Sortie unique (date/heure précise)' });
      const { hour } = demo.schoolNow(5);
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: demo.schoolZone }).format(new Date());
      let until = '17:00';
      if (hour >= '16:55') {
            if (!ensaio) throw new Error(`it is ${hour}: an exit until 17:00 must start before 16:55`);
            until = '23:55';
            log(`rehearsal: it is past 16:55, the exit runs until ${until} instead of 17:00`);
      }
      const [start, end] = await page.locator('input[type="datetime-local"]').all();
      await start.fill(`${today}T${hour}`);
      await end.fill(`${today}T${until}`);
      await shot(page, 'sorties-1', { form: await boxAround(page, 'Nouvelle autorisation de sortie', { minWidth: 400, minHeight: 500 }) });

      await page.getByRole('button', { name: "Enregistrer l'autorisation" }).click();
      await page.getByText('Nouvelle autorisation de sortie').waitFor({ state: 'hidden' });
      await page.getByText(name(NOAH), { exact: true }).first().waitFor();
      await sleep(1500);
      await shot(page, 'sorties-2', { row: await boxAround(page, name(NOAH), { minWidth: 400, minHeight: 50, maxHeight: 200 }) });

      // A mesma saída, agora autorizada, mais de 30 s depois da primeira.
      const wait = firstExit.getTime() + 31_000 - Date.now();
      if (wait > 0) await sleep(wait);
      await demo.passAt(NOAH, 'face', { point: 'PORT1', action: 'SAIDA' });
      await toDashboard(page);
      await openSector(page, /Portail Principal/, 'Derniers passages');
      // o Noah já está na lista pela entrada da manhã: espera a saída dele no alto
      await page.waitForFunction((who) => {
            const label = [...document.querySelectorAll('body *')].find((el) => el.children.length === 0 && el.textContent.trim().toLowerCase() === 'derniers passages');
            let card = label;
            while (card && card.getBoundingClientRect().height < 300) card = card.parentElement;
            const time = card && [...card.querySelectorAll('*')].find((el) => el.children.length === 0 && /^\d\d:\d\d:\d\d$/.test(el.textContent.trim()));
            let row = time;
            while (row && row.parentElement && row.parentElement.getBoundingClientRect().height < 110) row = row.parentElement;
            return !!row && row.innerText.includes(who) && row.innerText.includes('Sortie');
      }, name(NOAH), { timeout: 15000 });
      await shot(page, 'portail-sortie', { rows: await firstPassages(page, 3) });

      // O parcours do dia da Emma.
      await toDashboard(page);
      const search = page.locator('input[placeholder^="Chercher une personne"]');
      await search.fill('Emma');
      // a sugestão é um <button> com outro papel de acessibilidade: achada pelo seletor CSS, não por getByRole
      const suggestion = page.locator('button', { hasText: name(EMMA) }).filter({ hasText: EMMA });
      await suggestion.waitFor();
      await shot(page, 'recherche-0', { search: union(await boxOf(search), await boxOf(suggestion)) });
      await suggestion.click();
      await page.getByText('Parcours du jour').first().waitFor();
      await sleep(800);
      await shot(page, 'recherche-1', { parcours: await boxAround(page, 'Parcours du jour', { minWidth: 500, minHeight: 150 }) });

      // O Rapport Général do dia.
      await openAdministration(page);
      await page.getByRole('button', { name: /Ouvrir le rapport/ }).click();
      await page.getByRole('button', { name: "Vue d'ensemble" }).waitFor();
      await page.getByRole('button', { name: "Aujourd'hui", exact: true }).click();
      await sleep(3000);
      await page.evaluate(() => window.scrollTo(0, 0));
      const card = () => boxAround(page, 'Sorties non enregistrées', { minWidth: 100, minHeight: 60, maxHeight: 220 });
      await shot(page, 'rapport-0', {
            indicators: await boxAround(page, "Présents aujourd'hui", { minWidth: 1000, minHeight: 80 }),
            card: await card(),
      }, { fullPage: true });
      const seeWho = page.getByRole('button', { name: 'Voir qui' });
      if (await seeWho.isVisible().catch(() => false)) {
            await seeWho.click();
            await page.getByText(INCOMPLETE_SUBTITLE).waitFor();
            await sleep(1500);
      } else {
            log('rapport-1: no «Voir qui» button, the card counts no open cantine or infirmary entry right now');
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      // «Mouvements incomplets» também é o rótulo de um indicador: a lista é achada pelo subtítulo dela
      await shot(page, 'rapport-1', { list: await boxAround(page, INCOMPLETE_SUBTITLE, { minWidth: 600, minHeight: 100 }) }, { fullPage: true });

      // O fechamento das 17:00 no CDI.
      if (!ensaio) {
            for (;;) {
                  const { hhmm } = await serverParts();
                  if (hhmm >= '17:05') break;
                  log(`waiting for 17:05 (server ${hhmm})`);
                  await sleep(60_000);
            }
      }
      await toDashboard(page);
      await openSector(page, /^CDI/, '/ 50');
      const indicator = page.locator('button[title^="Encore à l"]');
      await shot(page, 'fin-0', { indicator: await boxOf(indicator), crop: (await cdiBoxes(page)).crop });
      await indicator.click();
      await page.getByRole('button', { name: 'Masquer' }).waitFor();
      await sleep(800);
      const closed = await page.getByText('Déjà clos aujourd’hui').first().isVisible().catch(() => false);
      if (!closed) log('fin-1: the list does not say «Déjà clos aujourd’hui» yet');
      await shot(page, 'fin-1', { window: await boxAround(page, 'Encore à l’intérieur', { minWidth: 400, minHeight: 150 }) });

      // Fim do dia.
      await page.getByRole('button', { name: 'Masquer' }).click();
      await page.getByRole('button', { name: /Tableau de bord/ }).first().click();
      await page.getByText('Choisissez le poste de travail').waitFor();
      await page.locator('button[title="Se déconnecter"]').click();
      await page.getByRole('button', { name: /accéder/i }).waitFor();
      await sleep(800);
      await shot(page, 'logout', { form: await loginPanel(page) });
}

await browser.close();
if (problems.length) throw new Error(`the page logged errors:\n${problems.join('\n')}`);
log(`${session}: captures written to ${OUT.pathname}`);
