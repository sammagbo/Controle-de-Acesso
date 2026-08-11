// =====================================================================
// MAGBO Access Control — o que o index.html carrega (fonte única)
// =====================================================================
// Este projeto não tem bundler: um arquivo existe em runtime porque há uma
// linha `<script src=...>` ou `<link href=...>` no index.html, e por nenhum
// outro motivo. Logo, o index.html É a lista de dependências do app — não há
// segunda fonte, e manter uma à mão é o defeito que este módulo elimina.
//
// Dois consumidores, um parser:
//   • tests/wiring.test.js    — confere a fiação (todo js/ carregado, na ordem)
//   • scripts/verify-package.js — confere o PACOTE (tudo que a página carrega
//                                 está dentro do app.asar)
//
// ⚠️ POR QUE ISTO EXISTE. O portão de release conferia uma lista ESTÁTICA de
// 26 arquivos, escrita antes de postoFixo.js, photoCache.js e PersonPhoto.js
// existirem. Um pacote sem esses três passava no portão — a mesma classe de
// acidente das duas tags perdidas na resolução do index.html em 06/08/2026,
// só que na hora de empacotar em vez de na hora do merge. Lista escrita à mão
// não sabe do arquivo que nasceu depois dela.
//
// CommonJS de propósito: o package.json não tem "type": "module", o
// verify-package.js roda por `require` e o Vitest importa por interop.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Os quatro arquivos que o index.html NÃO tem como declarar.
 *
 * main.js e preload.js são o processo principal do Electron — quem carrega a
 * página, não algo que a página carrega. O package.json é lido pelo runtime
 * antes de existir janela. E o index.html não se referencia. São os únicos
 * nomes que sobram escritos à mão, e a lista não cresce: qualquer arquivo NOVO
 * do app entra pela página, logo entra sozinho.
 */
const ENTRYPOINTS = ['main.js', 'preload.js', 'index.html', 'package.json'];

/** Abre a tag e captura o bloco de atributos; a ordem deles não importa. */
const TAG = /<(script|link|img)\b([^>]*)>/gi;
const ATTR_URL = /\s(?:src|href)\s*=\s*"([^"]*)"/i;

/** Blocos `<script>` sem src — código escrito dentro do próprio index.html. */
const SCRIPT_INLINE = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;

/**
 * O caminho é um arquivo NOSSO, que precisa viajar dentro do pacote?
 *
 * Fora: qualquer coisa com esquema (`https:`, `data:`, `mailto:`), o
 * protocolo-relativo `//cdn…` e âncoras. Fora também o absoluto `/x`: dentro
 * do Electron a página roda em file://, onde `/` é a raiz do disco e não a do
 * app — um caminho assim não é um arquivo empacotável.
 */
function ehCaminhoLocal(valor) {
      if (!valor) return false;
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(valor)) return false;
      if (valor.charAt(0) === '#' || valor.charAt(0) === '/') return false;
      return true;
}

/**
 * Tira o cache-buster e normaliza a barra.
 *
 * `js/utils/auth.js?v=1` e `js/utils/auth.js` são o MESMO arquivo no disco —
 * o `?v=` só existe para o Electron não servir a versão velha do cache.
 * Comparar sem tirá-lo faria o portão pedir um arquivo que não existe.
 */
function normalizar(valor) {
      return String(valor).split('?')[0].split('#')[0].replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Toda referência a arquivo local do HTML, na ordem em que aparece.
 *
 * @returns [{ arquivo, pos, tag }] — `pos` é a posição EM CARACTERES, para
 *          poder ser comparada com a de um `<script>` inline.
 */
function referencias(html) {
      const texto = String(html || '');
      const out = [];
      TAG.lastIndex = 0;
      for (const m of texto.matchAll(TAG)) {
            const attrs = m[2] || '';
            const url = attrs.match(ATTR_URL);
            if (!url) continue;
            if (!ehCaminhoLocal(url[1])) continue;
            out.push({ arquivo: normalizar(url[1]), pos: m.index, tag: m[1].toLowerCase() });
      }
      return out;
}

/** Só os `<script src=...>`, na ordem — é a ordem que decide quem existe primeiro. */
function scriptSources(html) {
      return referencias(html).filter((r) => r.tag === 'script');
}

/** Blocos de script escritos dentro do index.html. */
function inlineScripts(html) {
      const texto = String(html || '');
      const out = [];
      SCRIPT_INLINE.lastIndex = 0;
      for (const m of texto.matchAll(SCRIPT_INLINE)) {
            out.push({ conteudo: m[1], pos: m.index });
      }
      return out;
}

/** Endereços REMOTOS citados pela página — nenhum deve existir (risco R1). */
function referenciasRemotas(html) {
      const texto = String(html || '');
      const out = [];
      TAG.lastIndex = 0;
      for (const m of texto.matchAll(TAG)) {
            const url = (m[2] || '').match(ATTR_URL);
            if (url && /^(?:https?:|\/\/)/i.test(url[1])) out.push(url[1]);
      }
      return out;
}

/** Todo arquivo local que a página carrega, sem repetição e em ordem. */
function localAssets(html) {
      return [...new Set(referencias(html).map((r) => r.arquivo))].sort();
}

function readIndexHtml() {
      return fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
}

/**
 * O que o pacote TEM de conter, derivado do index.html.
 *
 * Sem argumento, lê o index.html do repositório. Recebendo um HTML, responde
 * sobre ele — é assim que o teste prova que a lista é DERIVADA e não copiada:
 * tirar uma tag tem de tirar o arquivo da exigência.
 */
function requiredPackageFiles(html) {
      const texto = html == null ? readIndexHtml() : html;
      return [...new Set([...ENTRYPOINTS, ...localAssets(texto)])].sort();
}

module.exports = {
      ENTRYPOINTS,
      REPO_ROOT,
      ehCaminhoLocal,
      normalizar,
      referencias,
      scriptSources,
      inlineScripts,
      referenciasRemotas,
      localAssets,
      readIndexHtml,
      requiredPackageFiles,
};
