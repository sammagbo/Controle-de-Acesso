# Release do aplicativo (portátil + instalador) — procedimento

**Para quem:** o Sam (único responsável pela publicação).
**Versão deste documento:** 2026-08-06 · Referente à release **v2.1.0**.

Este documento é o passo a passo de **publicação**. A preparação (empacotamento
e verificação) já está feita na branch `release/portable-v2.1` — o que falta é
decisão e execução do Sam.

---

> # ⛔ NÃO DISTRIBUA O QUE ESTÁ EM `dist/` HOJE
>
> **Estado em 11/08/2026:** o `dist/win-unpacked/resources/app.asar` foi
> construído em **06/08/2026** e a `main` recebeu **20 merges** desde então. O
> pacote **não contém** posto fixo, fotos de identificação, `JA_PRESENTE`, o
> casamento por matrícula das câmeras, nem o atalho das Sorties para o
> operador — e **não contém** os módulos `js/utils/postoFixo.js`,
> `js/utils/photoCache.js` e `js/components/PersonPhoto.js`.
>
> **Reverificar antes de qualquer publicação:**
> ```bash
> ls -l dist/win-unpacked/resources/app.asar          # data do artefato
> git log --oneline --merges --since="<essa data>" | wc -l   # merges depois dela
> npx @electron/asar list dist/win-unpacked/resources/app.asar | grep -c postoFixo
> ```
> Se a contagem de merges for > 0, ou o `grep` devolver 0, **rebuild antes de
> distribuir** (`npm run dist` e depois `npm run verify:package`).
>
> ⚠️ **`npm run verify:package` passando NÃO garante que o pacote está
> atualizado.** Ele responde duas perguntas — "vazou algo interno?" e "os
> obrigatórios estão presentes?" — e a lista de obrigatórios é **estática**
> (`scripts/verify-package.js`), escrita antes destes módulos existirem. Um
> pacote velho, ou um build novo que perdesse `postoFixo.js`/`photoCache.js`/
> `PersonPhoto.js`, **passa no portão**. É a mesma classe de acidente das tags
> perdidas no `index.html`, que já mordeu duas vezes.
>
> **Melhoria sugerida (não feita):** derivar a lista de `js/` obrigatórios do
> próprio `index.html`, que o `tests/wiring.test.js` já garante completo, em vez
> de manter uma segunda lista à mão.

---

## 1. O que mudou no empacotamento (v2.0.0 → v2.1.0)

A v2.0.0 foi empacotada com uma **lista de exclusão** (`"**/*"` + `!alguns`).
Isso reprova por construção: tudo que for criado depois entra sozinho. O
resultado medido no `app.asar` publicado em 23/07:

| | v2.0.0 (publicado) | v2.1.0 (esta branch) |
|---|---|---|
| Arquivos no `app.asar` | **142** | **65** |
| Arquivos internos vazados | **81** (57%) | **0** |
| `MAGBO-Access-Control-Portable.exe` | 76 538 987 bytes | 75 741 847 bytes |
| Versão no executável | 1.0.0 (não batia com a tag) | **2.1.0** |

O que ia junto e não devia: `docs/` inteiro (47 arquivos, incluindo a
especificação técnica, os ADRs, o relatório de auditoria e as evidências de
teste), `.claude/` (17 — regras e skills internas), `video/` (10),
`scripts/`, `test-*.js`, `test.ps1`, `.mailmap`, `LICENSE`.

Nenhum segredo vazou — o `.env` fica em `deploy/` e `deploy/**` já estava
excluído na v2.0.0. Mas o `docs/` continha a arquitetura completa do sistema,
que não tem por que viajar dentro do app instalado num PC da escola.

A v2.1.0 usa **lista de permissão** (`files` no `package.json`): entra apenas
`main.js`, `preload.js`, `index.html`, `package.json`, `css/`, `js/`, `libs/`
e `build/icon.ico`. Arquivo novo fora dessas pastas **não entra sem alguém
decidir que entra** — que é o comportamento certo.

### Portão automático

```
npm run build:portable
npm run verify:package
```

O `verify:package` lista o conteúdo do pacote, aplica 17 regras de exclusão
(inclusive `.env`, `.sql`, `.pem`/`.key`) e confere 26 arquivos obrigatórios.
Sai com código 1 se qualquer regra falhar. **Não publicar sem ele aprovar.**

---

## 2. A questão do `MAGBO_API_URL` — decidir ANTES de publicar

O executável **não guarda configuração**. O `main.js` lê variáveis de ambiente
no arranque e cai em `http://localhost:8080` se não achar nada:

```js
const MAGBO_API_URL = process.env.MAGBO_API_URL || 'http://localhost:8080';
```

Consequência prática: **abrir o `.exe` com duplo clique faz o app subir sem
dados** — ele fica tentando um backend que não existe naquele PC. Não dá erro
de instalação; dá tela vazia, que é pior, porque parece o sistema quebrado.

Hoje isso é resolvido pelo `Abrir-MAGBO.bat` que fica ao lado do `.exe`:

```bat
set MAGBO_API_URL=http://192.168.1.253:8080
start "" "%~dp0MAGBO-Access-Control-Portable.exe"
```

Esse arquivo **não estava versionado** — vivia solto na pasta de distribuição.
Agora existe um modelo em [`deploy/portable/Abrir-MAGBO.bat`](../../deploy/portable/Abrir-MAGBO.bat),
com `MAGBO_SECTOR` e o bloco de quiosque comentado.

**Três caminhos possíveis. Escolher um antes de publicar:**

| | Como funciona | A favor | Contra |
|---|---|---|---|
| **A. Manter o `.bat`** (é o de hoje) | O `.bat` viaja junto no ZIP e define a variável antes de abrir | Zero código; troca de IP = editar 1 linha | Quem abrir o `.exe` direto vê tela vazia; depende de instruir o usuário |
| **B. Variáveis de máquina** | `deploy/setup-client.ps1 -Sector X -ApiUrl Y` grava no Windows (precisa de admin) | O `.exe` funciona sozinho, de qualquer atalho; já suporta setor e quiosque | Exige admin em cada PC; trocar de IP = rodar de novo em todos |
| **C. Arquivo de config ao lado do exe** | O `main.js` passaria a ler um `magbo.config.json` | Robusto, sem admin, sem `.bat` | **Não existe hoje** — é mudança de código, não entra nesta release |

Recomendação: **A para o portátil** (é o que já está em uso e testado) e
**B para os PCs fixos** que forem receber o instalador NSIS, já que o
`setup-client.ps1` também configura setor, quiosque e auto-start.

C é uma boa ideia para depois do piloto — fica registrado, não implementado.

> Nota: com a v2.1.0 o `setup-client.ps1` passa a procurar
> `MAGBO-Access-Control-Setup-2.1.0.exe` (o padrão antigo apontava para 1.0.0).

---

## 3. Checklist de publicação — executar na ordem

Nada abaixo foi executado. É tudo decisão e ação do Sam.

### 3.1 Antes de gerar

- [ ] **1.** Conferir que a branch `release/portable-v2.1` foi revisada e mergeada em `main`.
- [ ] **2.** `git checkout main && git pull`.
- [ ] **3.** Decidir o caminho do `MAGBO_API_URL` (seção 2). Se for A, editar
      `deploy/portable/Abrir-MAGBO.bat` com o IP e o setor corretos.
- [ ] **4.** Confirmar o IP do backend na VM. **O IP muda por DHCP** — conferir
      antes, não confiar no que está escrito. A reserva de IP foi pedida ao SI
      (D7) e ainda não está confirmada.
- [ ] **5.** `npm ci` (garante que as dependências batem com o lockfile).
- [ ] **6.** `npm test` → deve dar **58 testes, 0 falhas**.

### 3.2 Gerar e verificar

- [ ] **7.** `npm run build:portable` (para o portátil) e/ou `npm run build:win` (instalador NSIS).
- [ ] **8.** `npm run verify:package` → tem que terminar em **`RESULTADO: APROVADO`**.
      Se aparecer qualquer linha de vazamento, **parar** e corrigir o `files` do `package.json`.
- [ ] **9.** Conferir a versão gravada no executável:
      ```powershell
      (Get-Item "dist\MAGBO-Access-Control-Portable.exe").VersionInfo.FileVersion
      ```
      Tem que responder `2.1.0`.
- [ ] **10.** **Teste de fumaça no próprio PC, com o `.bat`** (não com duplo clique no `.exe`):
      copiar o `.exe` e o `Abrir-MAGBO.bat` para uma pasta limpa, abrir pelo `.bat`,
      fazer login, abrir o Dashboard e um relatório. Se a tela vier vazia, é o
      `MAGBO_API_URL` — volte à seção 2.

### 3.3 Publicar no GitHub

- [ ] **11.** `git tag -a v2.1.0 -m "Release v2.1.0"` e `git push origin v2.1.0`.
- [ ] **12.** Criar a Release no GitHub a partir da tag `v2.1.0`.
- [ ] **13.** Anexar um **ZIP** contendo os dois arquivos juntos
      (`MAGBO-Access-Control-Portable.exe` + `Abrir-MAGBO.bat`), e não o `.exe` solto.
      O `.exe` sozinho é a armadilha da seção 2.
- [ ] **14.** No corpo da release, escrever em uma linha: *"Abrir sempre pelo
      `Abrir-MAGBO.bat`. O `.exe` sozinho não sabe onde fica o servidor."*
- [ ] **15.** Marcar a **v2.0.0 como obsoleta** (editar a descrição dela apontando
      para a v2.1.0). Não apagar — o histórico serve.

### 3.4 Trocar o app nos PCs da escola

Fazer **fora do horário de serviço da cantina e da portaria** — o app é a tela
de trabalho do operador; enquanto ele estiver fechado, ninguém vê as tentativas
negadas. O backend continua gravando tudo normalmente (o webhook não depende do
app), então nada se perde: o que se perde é a **vigilância ao vivo**.

Por PC:

- [ ] **16.** Anotar o setor daquele PC antes de mexer (`MAGBO_SECTOR`) — a tela
      inicial mostra qual é.
- [ ] **17.** Fechar o app (`Ctrl+Shift+Alt+Q` + PIN, se estiver em quiosque).
- [ ] **18.** Renomear a pasta antiga para `MAGBO-v2.0.0-BACKUP` — **não apagar**.
      É o caminho de volta se algo der errado no meio do dia.
- [ ] **19.** Copiar a pasta nova (`.exe` + `.bat`).
- [ ] **20.** Editar o `.bat`: `MAGBO_API_URL` e `MAGBO_SECTOR` daquele PC.
- [ ] **21.** Abrir pelo `.bat`. Login, e conferir **na tela** que os dados
      aparecem (não só que a janela abriu).
- [ ] **22.** Se o PC usa atalho na área de trabalho ou auto-start, refazer o
      atalho apontando para o **`.bat`**, nunca para o `.exe`.
- [ ] **23.** Só depois de os PCs todos estarem OK por um dia inteiro de uso,
      apagar as pastas `MAGBO-v2.0.0-BACKUP`.

### 3.5 Depois

- [ ] **24.** Atualizar o `docs/manual-utilisateur.md`: enquanto a v2.1.0 não
      estiver nos PCs, o manual diz que o app roda por `npm start`. Depois da
      troca, essa ressalva sai.
- [ ] **25.** Registrar a data da troca no documento de transição
      (`docs/operacional/handoff.md`).

---

## 4. O que esta branch **não** fez

- **Não publicou nada.** Nenhuma tag foi criada, nenhuma Release tocada,
  nenhum arquivo enviado para o GitHub Releases.
- **Não instalou nada em PC nenhum.**
- Não gerou o instalador NSIS (só o portátil foi construído e verificado).
  O NSIS usa o mesmo `files`, então o conteúdo é o mesmo — mas **não foi
  construído nem verificado nesta sessão**. Rodar o passo 7 com `build:win`
  e o passo 8 de novo antes de distribuir o instalador.
- Não testou o app em execução (não há Electron disponível no ambiente desta
  sessão). Os passos **10** e **21** são a validação que ninguém fez ainda —
  são os mais importantes da lista.
