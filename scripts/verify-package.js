#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// MAGBO Access Control — verificação do pacote gerado (release gate)
// =====================================================================
// Lê o app.asar produzido pelo electron-builder e prova duas coisas:
//   1. NENHUM caminho interno vazou (docs, testes, backend, .claude,
//      video, deploy, segredos .env, scripts de bancada…);
//   2. TODOS os arquivos que o app precisa em runtime estão lá.
//
// Uso:  npm run verify:package  [-- caminho/para/app.asar]
// Sai com código 1 se qualquer regra falhar — serve de portão antes de
// publicar uma release.
// =====================================================================

const path = require('path');
const fs = require('fs');
const indexAssets = require('./indexAssets');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_ASAR = path.join(REPO_ROOT, 'dist', 'win-unpacked', 'resources', 'app.asar');

// Caminhos que JAMAIS podem entrar no pacote entregue à escola.
// Cada regra tem um rótulo para o relatório ficar legível.
const FORBIDDEN = [
      { label: 'backend Java', re: /^backend\// },
      { label: 'deploy / infra', re: /^deploy\// },
      { label: 'documentação', re: /^docs\// },
      { label: 'testes automatizados', re: /^tests?\// },
      { label: 'instruções internas (.claude)', re: /^\.claude\// },
      { label: 'projeto de vídeo', re: /^video\// },
      { label: 'scripts de bancada', re: /^scripts\// },
      { label: 'metadados git', re: /^\.git(\/|$)|^\.mailmap$|^\.gitignore$/ },
      { label: 'config de IDE', re: /^\.vscode\// },
      { label: 'markdown', re: /\.md$/i },
      { label: 'SEGREDO (.env)', re: /(^|\/)\.env($|\.)/i },
      { label: 'dump SQL', re: /\.sql$/i },
      { label: 'scripts de teste soltos', re: /^test[-.].*\.(js|ps1|json)$/i },
      { label: 'config de teste', re: /^vitest\.config\.js$/ },
      { label: 'docker-compose', re: /^docker-compose\.ya?ml$/ },
      { label: 'lockfile', re: /^package-lock\.json$/ },
      { label: 'certificado / chave', re: /\.(pem|key|p12|pfx)$/i },
];

// O app não sobe sem estes — e a lista é DERIVADA do index.html, não escrita
// à mão.
//
// ⚠️ NÃO VOLTE A ESCREVER ESTA LISTA. Ela era estática e conhecia 26 arquivos,
// nomeados antes de postoFixo.js, photoCache.js e PersonPhoto.js existirem: um
// pacote sem esses três era APROVADO pelo portão. Uma lista à mão só sabe do
// que existia no dia em que foi escrita, e o modo de falhar é silencioso —
// aprova o pacote incompleto e o defeito aparece na tela do operador.
//
// Sem bundler, o index.html JÁ É a lista de dependências do app; derivar dele
// é ler a única fonte que não pode ficar desatualizada, porque é ela que faz o
// arquivo existir em runtime. Mesmo parser do tests/wiring.test.js
// (scripts/indexAssets.js) — uma leitura, uma implementação.
function arquivosObrigatorios() {
      return indexAssets.requiredPackageFiles();
}

function loadAsar() {
      try {
            // @electron/asar vem junto com o electron-builder (devDependency).
            return require('@electron/asar');
      } catch (err) {
            console.error('ERRO: @electron/asar não encontrado. Rode `npm install` antes.');
            process.exit(2);
      }
}

function listFiles(asarPath) {
      const asar = loadAsar();
      const raw = asar.listPackage(asarPath, { isPack: false });
      const normalized = raw.map((entry) => entry.replace(/\\/g, '/').replace(/^\//, ''));

      // listPackage devolve diretórios junto com arquivos; só arquivos interessam.
      // Um diretório é qualquer entrada que seja prefixo de outra.
      const dirs = new Set();
      normalized.forEach((entry) => {
            const parts = entry.split('/');
            for (let i = 1; i < parts.length; i += 1) {
                  dirs.add(parts.slice(0, i).join('/'));
            }
      });

      return normalized.filter((entry) => !dirs.has(entry)).sort();
}

/**
 * O veredito, sobre uma lista de caminhos — sem tocar em disco.
 *
 * Separado do main() para que os testes possam exercer o portão sem construir
 * um app.asar de verdade (o build leva minutos e exige o electron-builder).
 * O que se testa aqui é a REGRA; o main() só lê o pacote e imprime.
 *
 * @param arquivos      caminhos dentro do pacote, com barra normal
 * @param obrigatorios  o que tem de estar lá (default: derivado do index.html)
 * @returns {{leaks: Array, missing: string[], obrigatorios: string[]}}
 */
function analisar(arquivos, obrigatorios) {
      const lista = Array.isArray(arquivos) ? arquivos : [];
      const exigidos = obrigatorios || arquivosObrigatorios();

      const leaks = [];
      lista.forEach((f) => {
            FORBIDDEN.forEach((rule) => {
                  if (rule.re.test(f)) leaks.push({ file: f, label: rule.label });
            });
      });

      const present = new Set(lista);
      return {
            leaks,
            missing: exigidos.filter((f) => !present.has(f)),
            obrigatorios: exigidos,
      };
}

function main() {
      const asarPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_ASAR;

      if (!fs.existsSync(asarPath)) {
            console.error(`ERRO: pacote não encontrado em ${asarPath}`);
            console.error('Rode `npm run build:portable` antes de verificar.');
            process.exit(2);
      }

      const files = listFiles(asarPath);

      console.log('='.repeat(70));
      console.log(`PACOTE: ${asarPath}`);
      console.log(`ARQUIVOS EMBARCADOS: ${files.length}`);
      console.log('='.repeat(70));
      files.forEach((f) => console.log(`  ${f}`));
      console.log('');

      const { leaks, missing, obrigatorios } = analisar(files);

      // Informativo, NÃO altera o veredito: a página não deveria citar nenhum
      // endereço remoto (risco R1 — o kiosk roda sem internet). Fica visível
      // aqui porque é o momento em que alguém está olhando o pacote.
      const remotas = indexAssets.referenciasRemotas(indexAssets.readIndexHtml());
      if (remotas.length > 0) {
            console.log(`AVISO  o index.html cita ${remotas.length} endereço(s) REMOTO(s) — o kiosk offline não os carrega:`);
            remotas.forEach((u) => console.log(`   ${u}`));
            console.log('');
      }

      console.log('-'.repeat(70));
      if (leaks.length === 0) {
            console.log(`OK  vazamentos: 0  (${FORBIDDEN.length} regras de exclusão aplicadas)`);
      } else {
            console.log(`FALHA  vazamentos: ${leaks.length}`);
            leaks.forEach((l) => console.log(`   [${l.label}] ${l.file}`));
      }

      if (missing.length === 0) {
            console.log(`OK  arquivos obrigatórios: ${obrigatorios.length}/${obrigatorios.length} presentes`
                  + '  (derivados do index.html)');
      } else {
            console.log(`FALHA  arquivos obrigatórios ausentes: ${missing.length} de ${obrigatorios.length}`
                  + '  (a lista vem do index.html — o pacote está DESATUALIZADO ou incompleto)');
            missing.forEach((m) => console.log(`   ${m}`));
      }
      console.log('-'.repeat(70));

      if (leaks.length > 0 || missing.length > 0) {
            console.log('RESULTADO: REPROVADO — não publicar.');
            process.exit(1);
      }
      console.log('RESULTADO: APROVADO — pacote limpo.');
}

// Roda como CLI; exporta a regra para o teste. `require.main === module` é o
// que impede o `require` do teste de disparar o process.exit do main().
if (require.main === module) main();

module.exports = { analisar, arquivosObrigatorios, FORBIDDEN, listFiles, DEFAULT_ASAR };
