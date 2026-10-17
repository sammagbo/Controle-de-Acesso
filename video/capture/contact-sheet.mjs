// Junta as capturas de uma pasta numa folha só, contact-sheet.png, para conferir os enquadramentos de uma vez:
// em grade, com o nome de cada captura embaixo, até 1600 px de largura.
//
//   node contact-sheet.mjs ../public/portfolio-day-ensaio
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const dir = resolve(process.argv[2] ?? '.');
const manifestFile = resolve(dir, 'manifest.json');
const files = readdirSync(dir).filter((file) => file.endsWith('.png') && file !== 'contact-sheet.png');
// a ordem do roteiro, a do manifest; o que não estiver nele vai no fim
const order = existsSync(manifestFile) ? Object.keys(JSON.parse(readFileSync(manifestFile, 'utf8')).shots) : [];
files.sort((a, b) => {
      const ia = order.indexOf(a.replace(/\.png$/, '')), ib = order.indexOf(b.replace(/\.png$/, ''));
      return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib) || a.localeCompare(b);
});
if (!files.length) throw new Error(`no capture in ${dir}`);

// as capturas de página inteira são mais altas: cabem inteiras na moldura 16:10, encolhidas
const cells = files.map((file) => `
      <figure>
        <div class="frame"><img src="${pathToFileURL(resolve(dir, file)).href}"></div>
        <figcaption>${file.replace(/\.png$/, '')}</figcaption>
      </figure>`).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; padding: 16px; background: #1b1b1b; font: 14px/1.3 system-ui, sans-serif; color: #f2f0eb; }
  main { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px 12px; }
  figure { margin: 0; }
  .frame { aspect-ratio: 16 / 10; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  img { max-width: 100%; max-height: 100%; object-fit: contain; }
  figcaption { padding-top: 6px; font-family: ui-monospace, monospace; }
</style></head><body><main>${cells}</main></body></html>`;
const page = resolve(dir, 'contact-sheet.html');
writeFileSync(page, html);

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true });
const tab = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await tab.goto(pathToFileURL(page).href, { waitUntil: 'load' });
await tab.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
await tab.screenshot({ path: resolve(dir, 'contact-sheet.png'), fullPage: true });
await browser.close();
console.log(`contact-sheet.png: ${files.length} captures`);
