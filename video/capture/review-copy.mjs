// Copia as capturas de uma pasta em WebP, com o manifest.json, para o revisor montar o vídeo a partir delas: os PNG
// continuam onde estão, para o render, e a cópia cabe num anexo. O WebP sai do encoder do próprio Chrome, a 90 %;
// acima de 16 383 px de lado o WebP não cabe, e aquela captura vai em PNG.
//
//   node review-copy.mjs ../public/portfolio-day /tmp/magbo-dia-capturas
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const [from, to] = process.argv.slice(2).map((dir) => resolve(dir));
if (!from || !to) {
      console.error('usage: node review-copy.mjs <captures folder> <copy folder>');
      process.exit(2);
}
mkdirSync(to, { recursive: true });
const files = readdirSync(from).filter((file) => file.endsWith('.png')).sort();
if (!files.length) throw new Error(`no capture in ${from}`);

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage();
let bytes = 0;
for (const file of files) {
      const png = readFileSync(resolve(from, file)).toString('base64');
      const url = await page.evaluate(async (png) => {
            const image = new Image();
            image.src = `data:image/png;base64,${png}`;
            await image.decode();
            const canvas = Object.assign(document.createElement('canvas'), { width: image.naturalWidth, height: image.naturalHeight });
            canvas.getContext('2d').drawImage(image, 0, 0);
            return canvas.toDataURL('image/webp', 0.9);
      }, png);
      if (url.startsWith('data:image/webp')) {
            const data = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
            writeFileSync(resolve(to, file.replace(/\.png$/, '.webp')), data);
            bytes += data.length;
      } else {
            copyFileSync(resolve(from, file), resolve(to, file));
            bytes += readFileSync(resolve(from, file)).length;
      }
}
copyFileSync(resolve(from, 'manifest.json'), resolve(to, 'manifest.json'));
await browser.close();
console.log(`review copy: ${files.length} captures, ${(bytes / 1e6).toFixed(1)} MB, in ${to}`);
