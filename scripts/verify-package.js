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

// O app não sobe sem estes. Se algum sumir, o allowlist apertou demais.
const REQUIRED = [
      'main.js',
      'preload.js',
      'index.html',
      'package.json',
      'css/styles.css',
      'js/App.js',
      'js/api.js',
      'js/utils/api.js',
      'js/utils/auth.js',
      'js/utils/helpers.js',
      'js/utils/reportFilters.js',
      'js/utils/hikcentralSheet.js',
      'js/utils/listPaging.js',
      'js/data/constants.js',
      'js/components/LoginScreen.js',
      'js/components/AdminDashboard.js',
      'js/cdi/BibliotecaView.js',
      'libs/react-18.3.1.min.js',
      'libs/react-dom-18.3.1.min.js',
      'libs/babel-standalone-8.0.4.min.js',
      'libs/tailwindcss-play-3.4.17.js',
      'libs/lucide-1.24.0.min.js',
      'libs/jspdf-2.5.1.umd.min.js',
      'libs/jspdf-autotable-3.5.28.min.js',
      'libs/xlsx.min.js',
      'libs/fonts.css',
];

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

      const leaks = [];
      files.forEach((f) => {
            FORBIDDEN.forEach((rule) => {
                  if (rule.re.test(f)) leaks.push({ file: f, label: rule.label });
            });
      });

      const present = new Set(files);
      const missing = REQUIRED.filter((f) => !present.has(f));

      console.log('-'.repeat(70));
      if (leaks.length === 0) {
            console.log(`OK  vazamentos: 0  (${FORBIDDEN.length} regras de exclusão aplicadas)`);
      } else {
            console.log(`FALHA  vazamentos: ${leaks.length}`);
            leaks.forEach((l) => console.log(`   [${l.label}] ${l.file}`));
      }

      if (missing.length === 0) {
            console.log(`OK  arquivos obrigatórios: ${REQUIRED.length}/${REQUIRED.length} presentes`);
      } else {
            console.log(`FALHA  arquivos obrigatórios ausentes: ${missing.length}`);
            missing.forEach((m) => console.log(`   ${m}`));
      }
      console.log('-'.repeat(70));

      if (leaks.length > 0 || missing.length > 0) {
            console.log('RESULTADO: REPROVADO — não publicar.');
            process.exit(1);
      }
      console.log('RESULTADO: APROVADO — pacote limpo.');
}

main();
