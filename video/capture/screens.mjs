// O que capture.mjs e capture-day.mjs compartilham diante da tela: a conferência antes de cada captura e as
// caixas em que o vídeo dá zoom.
import { demo } from './demo.mjs';

/** Para quando uma tela mostra o que o vídeo não pode mostrar: aviso de licença, endereço, nome de máquina,
 *  caminho de servidor, a janela do PIN de administração ou uma pessoa fora do arquivo de demo. */
export async function guard(page, name) {
      const text = await page.locator('body').innerText();
      const leak = text.match(/licen[cs]e|\b\d{1,3}(?:\.\d{1,3}){3}\b|localhost|adm\.local|\/opt\/|\/srv\//i);
      if (leak) throw new Error(`${name}: the screen shows "${leak[0]}", stop`);
      // a janela do PIN é a única com este campo (placeholder «••••»)
      if (await page.locator('input[placeholder="••••"]').isVisible().catch(() => false)) {
            throw new Error(`${name}: the PIN dialog is on screen, stop`);
      }
      const known = new Set([...demo.students.map((student) => student.name), demo.adminName]);
      const unknown = [...text.matchAll(/\b(\p{Lu}\p{Ll}+) (Exemple|Démo|Fictif)\b/gu)].map((m) => m[0])
            .filter((who) => !known.has(who));
      if (unknown.length) throw new Error(`${name}: unexpected people on screen: ${unknown.join(', ')}`);
}

/** A caixa, em pixels CSS, do primeiro elemento em volta de `text` cujo tamanho cabe nos limites. */
export async function boxAround(page, text, { minWidth = 0, minHeight = 0, maxHeight = Infinity, side } = {}) {
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

/** A caixa de um locator do Playwright, arredondada, ou null se ele não estiver na tela. */
export async function boxOf(locator) {
      const b = await locator.boundingBox().catch(() => null);
      return b && { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
}

/** A menor caixa que contém todas as caixas dadas (as nulas são ignoradas). */
export function union(...boxes) {
      const list = boxes.filter(Boolean);
      if (!list.length) return null;
      const x = Math.min(...list.map((b) => b.x));
      const y = Math.min(...list.map((b) => b.y));
      const right = Math.max(...list.map((b) => b.x + b.width));
      const bottom = Math.max(...list.map((b) => b.y + b.height));
      return { x, y, width: right - x, height: bottom - y };
}
