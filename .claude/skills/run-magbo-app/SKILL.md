---
name: run-magbo-app
description: Rodar/dirigir o app Electron MAGBO de verdade (run, launch, screenshot, prova E2E, smoke) via playwright-core — login real, navegação, feed de negadas, insert SQL de teste com cleanup. Base da bateria V01–V14.
---

# Skill: Rodar e dirigir o app MAGBO (prova E2E real)

O dashboard Electron é dirigido pelo **driver commitado nesta pasta**
(`.claude/skills/run-magbo-app/driver.js`, caminhos relativos à raiz do repo):
lança o `electron.exe` do próprio projeto via `playwright-core`, com bloqueio de
rede real por `webRequest`, login de verdade e screenshots. Conquistado nas provas
R1/F7a/F7c/GeneralReport (16–17/07/2026). **Não é headless**: a janela abre no
desktop do PC por alguns segundos por rodada.

## Pré-requisitos (verificados)

1. **Backend UP** (senão o login falha com `ERR_CONNECTION_REFUSED`) — gotcha #2 do CLAUDE.md:
   ```bash
   cd backend && MAGBO_DB_URL="jdbc:postgresql://localhost:5432/magbodb" MAGBO_DB_USERNAME=magbo MAGBO_DB_PASSWORD=magbo_dev_pass_2026 mvn spring-boot:run "-Dspring-boot.run.profiles=prod"
   ```
   (`MAGBO_WEBHOOK_TOKEN` vem do `setx`; conferir `curl -s http://localhost:8080/api/health` → `CONNECTED`.)
2. **playwright-core** no `node_modules` (não vai pro package.json — decisão):
   ```bash
   npm install --no-save playwright-core
   ```

## Caminho do agente — CLI smoke

```bash
node .claude/skills/run-magbo-app/driver.js smoke kiosk    # internet morta, localhost ok → login + dashboard
node .claude/skills/run-magbo-app/driver.js smoke offline  # TUDO http(s) morto → tela de login renderiza do disco
```

Sai JSON com veredito (`OK`/`FALHOU`, exit code 1 se falhou), libs/fontes locais,
contagem de requests externos, erros de console e o caminho do **screenshot**
(`%TEMP%\magbo-driver\`). **Sempre abrir e olhar o screenshot.**

## Caminho do agente — biblioteca (bateria V01–V14)

Snippet verificado (F7a compacta: navegar, espiar beep, insert SQL, destaque, cleanup):

```js
const d = require('./.claude/skills/run-magbo-app/driver.js');
const ids = [];
const s = await d.launchMagbo('kiosk');          // 'kiosk' | 'offline' | 'online'
try {
  await d.login(s.page);                          // admin/admin1234 (defaults dev)
  await d.gotoMonitorCantine(s.page);             // ou: d.enterAdminPanel(page) → d.gotoRapportGeneral(page)
  const beeps = await d.spyBeep(s.page);          // conta window.playDeniedFeedBeep sem silenciar
  ids.push(d.insertTestAttempt('0007777', 'X'));  // banco REAL — anotar o id!
  await s.page.waitForFunction(() => document.querySelectorAll('.ring-2.animate-pulse').length > 0, null, { timeout: 10000 });
  await d.screenshot(s.page, 'meu-teste');
} finally {
  d.deleteAttempts(ids);                          // cleanup GARANTIDO, mesmo com falha
  await s.close();
}
```

Exports: `launchMagbo, login, enterAdminPanel, gotoMonitorCantine, gotoRapportGeneral,
spyBeep, countHighlights, screenshot, sql, insertTestAttempt, deleteAttempts, smoke`.
`s.externals` / `s.consoleErrors` acumulam desde o load — asserte no fim.

## Caminho humano

`npm start` abre a janela normal (sem bloqueio de rede, sem instrumentação). Inútil para prova.

## Gotchas (cicatrizes reais — não descobrir de novo)

- **`ELECTRON_RUN_AS_NODE=1` vem exportado pelo shell do VSCode** → o electron.exe vira
  Node puro e o launch morre com `bad option: --remote-debugging-port=0`. O driver já
  remove do env — não remover essa linha.
- **`session.enableNetworkEmulation({offline:true}) é NO-OP** neste Electron (testado
  17/07 com fetch real: localhost E example.com passaram). Bloqueio de verdade é só via
  `webRequest.onBeforeRequest` — é o que o driver usa nos dois modos.
- **`innerText` chega em UPPERCASE** (CSS `uppercase` dos títulos) → esperar texto com
  regex `/i` (`/tentatives refus/i`), nunca `includes('Tentatives Refusées')`.
- **"ACCÉDER" casa 2 elementos** (parágrafo + botão) → `getByRole('button', {name})`.
- **O card "Rapport Général" do Painel Admin NÃO é clicável** — o clicável é o botão
  **"Ouvrir le rapport"** dentro dele. Monitor Cantine é card clicável direto.
- **Painel Administrativo exige PIN** (dev: 1234; lockout do backend: 5 erros → 60s —
  não insistir com PIN errado em loop).
- **`psql -t -A` com `RETURNING` devolve 2 linhas** (`id` + `INSERT 0 1`) → usar só a
  1ª (o `sql()` do driver já faz), senão o DELETE do cleanup quebra e **deixa lixo no
  banco real**.
- **Timestamp de teste em BRT**: o container Postgres é UTC; o backend grava hora de
  parede BRT → inserts usam `(now() at time zone 'America/Sao_Paulo')`.
- **Feed da cantina vazio ≠ bug**: `/access/attempts/refectory` filtra **últimas 12h**
  (feed operacional). O Rapport Général usa o endpoint geral (sem janela).
- **Dados de teste**: só criar via `insertTestAttempt` e **sempre** `deleteAttempts`
  no `finally`. Nunca tocar em registros reais (id=1 é histórico do smoke de 16/07).

## Troubleshooting (erros realmente vividos)

| Sintoma | Causa → fix |
|---|---|
| `bad option: --remote-debugging-port=0` | `ELECTRON_RUN_AS_NODE=1` no env → o driver remove; se rodar na mão, `delete env.ELECTRON_RUN_AS_NODE` |
| `Process failed to launch!` | playwright não achou o exe → passar `executablePath: require('electron')` (o driver já passa) |
| Login trava em "Bienvenue" + `Failed to fetch` | Backend fora → subir com o comando dos pré-requisitos |
| `strict mode violation: getByText('ACCÉDER')` | usar `getByRole('button', ...)` |
| Espera de texto nunca resolve | uppercase do CSS → regex `/i` |
