// Captura as telas reais da instância demo para a composição Portfolio (video/src/Portfolio.tsx), com o
// Playwright conduzindo o Chrome ou o Chromium em deviceScaleFactor 2, no fuso horário da escola.
// Rodar numa instância nova e já cadastrada (seed.mjs): o script faz as passagens ele mesmo, e uma segunda
// rodada criaria duplicatas.
//
//   MAGBO_DEMO_WEBHOOK_TOKEN=… node capture.mjs        (CHROME=/caminho/do/chrome se não for /usr/bin/google-chrome)
//
// Grava video/public/portfolio/*.png e manifest.json (as caixas em que o vídeo dá zoom). O git ignora os dois.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { demo } from './demo.mjs';

const OUT = new URL('../public/portfolio/', import.meta.url);
const VIEWPORT = { width: 1440, height: 900 }; // 16:10, como o vídeo
const SCALE = 2;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const HUGO = '9000001'; // autorizado: entra pelo rosto
const LINA = '9000002'; // recusada primeiro, pelo crachá; autorizada na tela de direitos, depois entra pelo rosto
const BACKGROUND = ['9000003', '9000004', '9000005', '9000006', '9000007']; // já almoçando

mkdirSync(OUT, { recursive: true });
const token = await demo.login();
await demo.assertLicenceValid(token);
console.log(`meal slot: ${await demo.openMealService(token)}`);

// A cantina alguns minutos depois de abrir o serviço.
for (const [i, id] of BACKGROUND.entries()) await demo.pass(id, 'face', { secondsAgo: 70 * (BACKGROUND.length - i) });

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true });
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE, timezoneId: demo.schoolZone, locale: 'fr-FR' });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (error) => problems.push(String(error)));
page.on('console', (message) => {
      // os alunos não têm foto de propósito: as telas mostram as iniciais
      if (message.type() === 'error' && !/status of 404/.test(message.text())) problems.push(message.text());
});

/** Para quando uma tela mostra o que o vídeo não pode mostrar: aviso de licença, endereço ou nome de máquina. */
async function guard(name) {
      const text = await page.locator('body').innerText();
      const leak = text.match(/licen[cs]e|\b\d{1,3}(?:\.\d{1,3}){3}\b|localhost|adm\.local|\/opt\/|\/srv\//i);
      if (leak) throw new Error(`${name}: the screen shows "${leak[0]}", stop`);
      const unknown = [...text.matchAll(/\b(\p{Lu}\p{Ll}+) (Exemple|Démo|Fictif)\b/gu)].map((m) => m[0])
            .filter((who) => !demo.students.some((student) => student.name === who));
      if (unknown.length) throw new Error(`${name}: unexpected people on screen: ${unknown.join(', ')}`);
}

/** A caixa, em pixels CSS, do primeiro elemento em volta de `text` cujo tamanho cabe nos limites. */
async function boxAround(text, { minWidth = 0, minHeight = 0, maxHeight = Infinity, side } = {}) {
      return page.evaluate(({ text, minWidth, minHeight, maxHeight, side }) => {
            const all = [...document.querySelectorAll('body *')].filter((el) =>
                  el.children.length === 0 && el.textContent.trim().toLowerCase() === text.toLowerCase());
            for (const leaf of all) {
                  for (let el = leaf; el && el !== document.body; el = el.parentElement) {
                        const r = el.getBoundingClientRect();
                        if (r.width >= minWidth && r.height >= minHeight && r.height <= maxHeight) {
                              if (side === 'left' && r.left > innerWidth / 2) break;
                              if (side === 'right' && r.left < innerWidth / 2) break;
                              return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
                        }
                  }
            }
            return null;
      }, { text, minWidth, minHeight, maxHeight, side });
}

const manifest = { viewport: VIEWPORT, scale: SCALE, shots: {} };
async function shot(name, boxes = {}) {
      await guard(name);
      await page.screenshot({ path: new URL(`${name}.png`, OUT).pathname });
      manifest.shots[name] = boxes;
      console.log(`${name}.png ${JSON.stringify(boxes)}`);
}

const openMonitor = async () => {
      await page.getByRole('button', { name: /Surveillance Cantine/ }).click();
      await page.getByText('Moniteur Cantine').first().waitFor();
      await sleep(3500); // uma rodada de atualização (3 s)
};
const waitForCard = (name) => page.getByText(name, { exact: true }).first().waitFor({ timeout: 15000 });

// Entra com o administrador local e abre o Moniteur Cantine.
await page.goto(demo.frontend, { waitUntil: 'load' });
await page.locator('input[type=text]').fill(demo.admin.username);
await page.locator('input[type=password]').fill(demo.admin.password);
await page.getByRole('button', { name: /accéder/i }).click();
await openMonitor();
const column = () => boxAround('Dans la cantine', { minWidth: 200, minHeight: 400, side: 'left' });
const feed = () => boxAround('Tentatives refusées', { minWidth: 300, minHeight: 400, side: 'right' });
await shot('monitor-0', { column: await column(), feed: await feed() });

// Cena 1: um aluno autorizado, reconhecido pelo rosto, aparece em «Dans la cantine».
await demo.pass(HUGO, 'face');
await waitForCard(demo.byId(HUGO).name);
await sleep(800);
await shot('monitor-1', {
      column: await column(),
      card: await boxAround(demo.byId(HUGO).name, { minWidth: 200, maxHeight: 120, side: 'left' }),
});

// Cena 2: uma aluna sem direito à refeição, pelo crachá, aparece em «Tentatives refusées».
await demo.pass(LINA, 'card');
await page.getByText('Pas de droit au repas').first().waitFor({ timeout: 15000 });
await sleep(9000); // uma tentativa nova fica destacada por uns 8 s: espera o contraste normal
await shot('monitor-2', {
      feed: await feed(),
      row: await boxAround(demo.byId(LINA).name, { minWidth: 300, maxHeight: 160, side: 'right' }),
});

// Cena 3: o direito à refeição é dado na tela de gestão…
await page.getByRole('button', { name: /^Administration$/ }).click();
await page.locator('input[type=password]').fill(demo.adminPin); // a janela do PIN nunca é capturada
await page.getByRole('button', { name: /^Entrer$/ }).click();
await page.getByRole('button', { name: /Gérer les droits/ }).click();
await page.getByText(demo.byId(LINA).name, { exact: true }).first().waitFor();
const search = page.locator('input[type=text], input[type=search]').first();
await search.fill('Exemple');
await sleep(1500);
const row = () => page.locator('tr', { hasText: demo.byId(LINA).name });
const rowBox = async () => { const b = await row().boundingBox(); return b && { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) }; };
await row().evaluate((el) => el.scrollIntoView({ block: 'center' })); // a mesma rolagem nas duas capturas
await sleep(800);
await shot('rights-0', { row: await rowBox() });
await row().getByRole('button').first().click();
await row().getByText('Autorisé', { exact: true }).waitFor({ timeout: 15000 });
await sleep(800);
await shot('rights-1', { row: await rowBox() });

// …e a passagem seguinte, pelo rosto, entra.
await page.getByRole('button', { name: /Tableau de bord/ }).first().click();
await openMonitor();
await demo.pass(LINA, 'face');
await page.locator('text=' + demo.byId(LINA).name).nth(1).waitFor({ timeout: 15000 }); // na coluna, além da tentativa recusada
await sleep(800);
await shot('monitor-3', {
      column: await column(),
      card: await boxAround(demo.byId(LINA).name, { minWidth: 200, maxHeight: 120, side: 'left' }),
      feed: await feed(),
});

writeFileSync(new URL('manifest.json', OUT), JSON.stringify(manifest, null, 2) + '\n');
await browser.close();
if (problems.length) throw new Error(`the page logged errors:\n${problems.join('\n')}`);
console.log(`captures written to ${OUT.pathname}`);
