# Roteiro de aceitação do frontend — MAGBO Access Control

Passo a passo manual de **todas as telas**. É a passagem de aceitação: o Sam
executa e marca. Cada passo tem o que fazer e **o que tem de acontecer**.

> **Por que existe:** o projeto tem testes de backend (`mvn test`) e agora de
> lógica pura do frontend (`npm test`), mas **nenhum teste de tela**. Três
> espécies de bug já passaram por aqui invisíveis aos testes e só apareceram
> quando alguém percorreu as telas clicando (ver `docs/testing/` — Fase H).
> A moral registrada no CLAUDE.md continua valendo: **smoke pós-deploy inclui
> CLIQUES, não só curls.**

## Antes de começar

| Item | Comando / onde | Esperado |
|---|---|---|
| Postgres de pé | `docker ps` | `magbo-postgres` rodando (se `magbo-db` estiver de pé, é o legado — parar) |
| Backend | 4 env vars do gotcha #2 + `mvn spring-boot:run "-Dspring-boot.run.profiles=prod"` | sobe sem erro de schema; 2 WARN `SECURITY [prod]` são normais no PC |
| Health | `Invoke-WebRequest http://localhost:8080/api/health -UseBasicParsing` | `"database":"CONNECTED"` |
| Migração nova | `deploy/migrations/V007__app_users_departamento.sql` | aplicada na VM (no PC o `ddl-auto` resolve) |
| App | `npm start` (ou `npm run start:prod` para kiosk) | janela abre no login |
| Testes | `mvn test` e `npm test` | verdes antes de começar |

Anotar: **data/hora**, versão do backend, e se o banco é o de produção ou uma cópia.

---

## 1. Login e sessão

| # | Ação | Esperado |
|---|---|---|
| 1.1 | Abrir o app | Tela de login, sem erro no console (F12) |
| 1.2 | Usuário/senha errados | Mensagem de erro; **não** entra |
| 1.3 | Login correto (admin) | Entra no Dashboard; nome do operador no cabeçalho |
| 1.4 | F12 → Network | Nenhuma requisição a domínio externo (kiosk offline não pode depender de CDN) |
| 1.5 | Recarregar (Ctrl+R) | Continua logado (token persistido) |

---

## 2. Dashboard e setores

| # | Ação | Esperado |
|---|---|---|
| 2.1 | Ver o Dashboard | Cards de setor; contadores carregam sem "NaN" nem vazio |
| 2.2 | Entrar num setor de portaria (PORT1) | Lista de passagens das últimas 24h |
| 2.3 | Buscar uma pessoa pelo nome | Resultados vêm do servidor (debounce ~250 ms) |
| 2.4 | Registrar entrada manual | Toast de sucesso; a linha aparece na lista |
| 2.5 | Voltar ao Dashboard e reentrar | A lista **atualiza sozinha** (não só na entrada) |
| 2.6 | Enfermaria / Cantina | Abrem, listam, e os números **não mudaram** com esta entrega |

> ⚠️ **Cantina e enfermaria não foram alteradas** nesta entrega. Se algum número
> ali mudou, é regressão — anotar.

---

## 3. CDI (Biblioteca) — filtro de tipo e passagem rápida

Esta é a área que mudou mais. Ir em Dashboard → **CDI / Biblioteca**.

| # | Ação | Esperado |
|---|---|---|
| 3.1 | Abrir o CDI | Lista de alunos à esquerda, presentes à direita |
| 3.2 | Olhar o contador de presentes | Abaixo do número há **"Inclure le personnel"**, DESMARCADO |
| 3.3 | Conferir a lista de presentes | **Nenhum FUNC-### aparece** |
| 3.4 | Marcar "Inclure le personnel" | A lista e o contador **crescem** (servidores aparecem); recarrega na hora, sem esperar o ciclo de 3 s |
| 3.5 | Desmarcar | Volta a só alunos |
| 3.6 | Fechar e reabrir o CDI | A escolha foi **lembrada** (localStorage) |
| 3.7 | Escanear/registrar uma entrada de aluno | Aparece nos presentes; o contador sobe |
| 3.8 | Registrar a saída do mesmo aluno | Sai dos presentes; o contador desce |

### 3.9 Rapport CDI (botão de gráfico no cabeçalho do CDI)

| # | Ação | Esperado |
|---|---|---|
| 3.9.1 | Abrir "Dashboard & Rapports" | Abre com os cards Visites / Uniques / Durée moy. / Top classe |
| 3.9.2 | Ler a linha acima dos cards | Diz **"Élèves seulement"** (ou "Élèves + personnel" se o toggle estiver ligado) |
| 3.9.3 | Se houver passagens rápidas no período | Aparece **"N passage(s) éclair ignoré(s)"** |
| 3.9.4 | Card **Durée moy.** | ★ **Nunca negativo.** Valor plausível (dezenas de minutos, não horas nem dias) |
| 3.9.5 | Card **Top classe** | ★ Mostra uma **turma real** (6A, 3B...), **não** "Inconnu" |
| 3.9.6 | Alternar semana/mês | Números mudam coerentemente |
| 3.9.7 | "Générer Rapport (PDF Print)" | Abre a versão de impressão; o diálogo de impressão aparece |

> ★ 3.9.4 e 3.9.5 são correções desta entrega. Antes: o pareamento assumia
> alternância perfeita numa lista que chega do mais novo para o mais antigo, e
> produzia duração negativa; e o "Top classe" lia um campo que não existe
> (`class` em vez de `studentClass`), então dizia sempre "Inconnu".

---

## 4. Rapport Général

Cabeçalho → **Rapport Général**.

### 4.1 Vue d'ensemble

| # | Ação | Esperado |
|---|---|---|
| 4.1.1 | Abrir a aba | KPIs e cards por área carregam |
| 4.1.2 | Localizar **"Inclure le personnel (CDI)"** | Existe, à direita do seletor de período, DESMARCADO |
| 4.1.3 | Olhar o card **CDI** | "Entrées" agora é **visitas** (par ENTRADA→SAIDA), não linhas soltas |
| 4.1.4 | Marcar o toggle | ★ **Só o card do CDI muda.** Cantina e enfermaria ficam idênticas |
| 4.1.5 | Duração média do CDI | Plausível; não inclui as saídas das 17:00 |
| 4.1.6 | Trocar o período (hoje / semana / mês / personalizado) | Recarrega; sem erro |

### 4.2 Par élève

| # | Ação | Esperado |
|---|---|---|
| 4.2.1 | Buscar um aluno pelo nome | Resultados aparecem |
| 4.2.2 | Selecionar | Chips de presença + movimentos por dia |
| 4.2.3 | Buscar um servidor (FUNC-###) | Também encontra — esta aba não filtra por tipo |

### 4.3 Journal (visão de auditoria)

| # | Ação | Esperado |
|---|---|---|
| 4.3.1 | Abrir o Journal | Lista de movimentos do dia; contador "N mouvements" |
| 4.3.2 | ★ Sem tocar em nada | **Mostra TUDO** — alunos e servidores. O Journal é auditoria |
| 4.3.3 | Filtro **Type** → Élèves | Só alunos; o contador cai |
| 4.3.4 | Type → Personnel | Só FUNCIONARIO |
| 4.3.5 | Type → Tous | Volta a tudo |
| 4.3.6 | ★ Passagem rápida (visita de segundos) | **Continua listada** — o Journal não esconde linha nenhuma |
| 4.3.7 | ★ Saída de fechamento automático | **Continua listada** (é a das 17:00, `created_by_user=system`) |
| 4.3.8 | Filtro Élève por matrícula (ex.: `0004048`) | Encontra pelas passagens do período inteiro |
| 4.3.9 | Filtro Élève por nome parcial | Também encontra |
| 4.3.10 | Deixar a tela aberta ~1 min com movimento novo | A lista **se atualiza sozinha** |
| 4.3.11 | Exportar CSV | Baixa; abre no Excel com acentos corretos |

---

## 5. Configurações e Cadastros

Cabeçalho → engrenagem. **Tela cheia**, com navegação à esquerda.

### 5.0 Layout (regressão da entrega anterior)

| # | Ação | Esperado |
|---|---|---|
| 5.0.1 | Abrir | Ocupa a janela inteira; cabeçalho e **X** sempre visíveis |
| 5.0.2 | Esc | Fecha |
| 5.0.3 | Tab várias vezes | O foco **não sai** da tela |
| 5.0.4 | Rolar com a roda sobre o fundo | A tela de trás **não** rola |
| 5.0.5 | Reduzir a janela / Ctrl+Menos e Ctrl+Mais | Continua utilizável; o botão de ação continua alcançável |

### 5.1 Importar Excel (alunos/responsáveis — fluxo antigo)

| # | Ação | Esperado |
|---|---|---|
| 5.1.1 | Abrir a aba | Instruções e área de arrastar |
| 5.1.2 | Enviar uma planilha com 1 linha válida | Toast de conclusão |
| 5.1.3 | Enviar com uma linha inválida | Importação **parcial**, com o motivo |

### 5.2 HikCentral (dry-run) — ★ o teste mais importante

| # | Ação | Esperado |
|---|---|---|
| 5.2.1 | Abrir a aba HikCentral | Explica cabeçalho na linha 9 e as colunas |
| 5.2.2 | Arrastar o export real (1198 linhas) | "N linhas lidas. Simulando antes de gravar." |
| 5.2.3 | Esperar a simulação | Painel de totais nos 5 rótulos |
| 5.2.4 | ★ Conferir os totais | Ordem de grandeza: ~996 **Atualizar**, ~100 **Criar**, **9 Conferir**, ~1 **Ignorar** |
| 5.2.5 | ★ Conferir o banco AGORA | **Nada foi gravado** (`SELECT count(*) FROM app_users` inalterado) |
| 5.2.6 | Ver a lista amarela "conferência manual" | 9 alunos, com linha, nome e ID de 10 dígitos |
| 5.2.7 | Abrir "linhas ignoradas ou em conflito" | Lista limitada, com contagem e "Mostrar mais" se passar de 200 |
| 5.2.8 | Só então clicar **CONFIRMAR** | Grava; toast com criados/atualizados/ignorados/conflitos/conferir |
| 5.2.9 | ★ Conferir um ALUNO que existia antes | `hikvision_employee_id` e `departamento` preenchidos; **nome e turma INTOCADOS** |
| 5.2.10 | ★ Reimportar o MESMO arquivo | Segunda passada: quase tudo **Ignorar**, **0 conflitos** (idempotente) |
| 5.2.11 | Verificar `access_logs` | **Inalterado** — o import não escreve passagem |

### 5.3 Conferir → casamento manual (★ novo)

| # | Ação | Esperado |
|---|---|---|
| 5.3.1 | Na lista amarela, clicar **Conferir** numa linha | Abre o painel com o nome do HCP já preenchido na busca |
| 5.3.2 | Digitar o nome do aluno | Aparecem candidatos — **só ALUNO** |
| 5.3.3 | Se um candidato já tiver face | Mostra "já tem face NNNN" no resultado |
| 5.3.4 | Escolher um aluno | ★ Aparecem **os dois lados**: quem recebe a face e o servidor que será inativado (com nº de passagens) |
| 5.3.5 | ★ Antes de confirmar, checar o banco | **Nada mudou** |
| 5.3.6 | Clicar **CONFIRMAR CASAMENTO** | Toast de sucesso; a linha vira "✓ matrícula" |
| 5.3.7 | ★ Conferir no banco | Aluno com o `hikvision_employee_id`; **FUNC-### com o campo NULO e `ativo=false`**; passagens dele **preservadas** |
| 5.3.8 | Tentar casar com um aluno que já tem outra face | Recusa com mensagem nomeando o dono |
| 5.3.9 | Repetir o mesmo casamento | Aceita sem quebrar (idempotente) |
| 5.3.10 | Passar o rosto desse aluno no terminal (se houver hardware) | ★ Agora é reconhecido — antes era negado `UNKNOWN_USER` |

### 5.4 Servidores (★ nova aba)

| # | Ação | Esperado |
|---|---|---|
| 5.4.1 | Abrir "Servidores" | Lista carrega: matrícula, nome, tipo, departamento, ID Hikvision, passagens |
| 5.4.2 | ★ Procurar um aluno na lista | **Nenhum ALUNO aparece** |
| 5.4.3 | Buscar por departamento (ex.: `VIE`) | Filtra |
| 5.4.4 | Editar um registro → mudar departamento → Salvar | Toast; a lista reflete |
| 5.4.5 | No editor, abrir o seletor de Tipo | Só **Funcionário** e **Professor** — sem ALUNO |
| 5.4.6 | Registro **com** passagens | O botão **Remover não aparece**; só Inativar |
| 5.4.7 | Registro **sem** passagens | Remover aparece; pede confirmação; some da lista |
| 5.4.8 | Inativar um registro | Fica esmaecido, marcado "(inativo)", com botão Reativar |
| 5.4.9 | Reativar | Volta ao normal |
| 5.4.10 | ★ Após inativar, conferir `access_logs` | **Nenhuma passagem apagada** |

### 5.5 Importar Servidores (planilha própria)

| # | Ação | Esperado |
|---|---|---|
| 5.5.1 | Abrir a aba | Colunas documentadas |
| 5.5.2 | Enviar planilha com 2 linhas boas e 1 ID repetido | Parcial: 2 entram, 1 recusada **com o motivo na tela** |
| 5.5.3 | Conferir zeros à esquerda | Preservados (matrícula e ID Hikvision) |

### 5.6 Cadastro Manual

| # | Ação | Esperado |
|---|---|---|
| 5.6.1 | Tipo = Aluno | Campos de turma/responsável |
| 5.6.2 | Tipo = **Funcionário** | Aparecem **matrícula, ID Hikvision e departamento** |
| 5.6.3 | Deixar matrícula em branco | O campo mostra "Automático: FUNC-###" |
| 5.6.4 | Enviar com nome preenchido | ★ Toast diz a **matrícula emitida** |
| 5.6.5 | ★ Salvar sem ID Hikvision | Toast de **aviso**: a face não será reconhecida |
| 5.6.6 | Repetir um ID Hikvision já usado | Recusa dizendo **de quem é** |
| 5.6.7 | Enviar sem nome | O navegador bloqueia (campo obrigatório) |
| 5.6.8 | ★ Botão de cadastrar | Fica na **barra inferior fixa**, sempre visível |

### 5.7 Gerais

| # | Ação | Esperado |
|---|---|---|
| 5.7.1 | Abrir | Toggle de tela cheia |
| 5.7.2 | Acionar | Entra/sai de tela cheia |

---

## 6. Fechamento automático das presenças

| # | Ação | Esperado |
|---|---|---|
| 6.1 | Registrar uma ENTRADA no CDI e **não** registrar saída | Pessoa fica presente |
| 6.2 | Esperar passar das 17:00 (ou rodar o job) | Até ~5 min depois, a presença **zera** |
| 6.3 | Conferir a linha criada no Journal | SAIDA às **17:00**, `flag=FECHAMENTO_AUTO`, `created_by_user=system` |
| 6.4 | ★ Rapport CDI | A duração média **não** inclui essa saída sintética |
| 6.5 | Rodar o job de novo | **Nenhuma linha duplicada** |

---

## 7. Regressões que não podem aparecer

| # | Verificação | Esperado |
|---|---|---|
| 7.1 | Leitura repetida da mesma face em segundos | **1** access_log, não 2 |
| 7.2 | Cantina: direitos de refeição e feed de negadas | Funcionam como antes |
| 7.3 | Portaria: permissões de saída | Funcionam como antes |
| 7.4 | Console (F12) durante todo o roteiro | Sem erro vermelho |
| 7.5 | Toasts | Aparecem **por cima** da tela de Configurações |

---

## Encerramento

```
mvn test    →  esperado: Tests run: 334, Failures: 0, Errors: 0, Skipped: 2
npm test    →  esperado: Test Files 3 passed, Tests 52 passed
```

Registrar em `docs/testing/evidencias/<data>/`: capturas dos pontos ★, o SQL de
antes/depois do 5.2 e do 5.3, e qualquer passo que falhou com o que apareceu.

### Limites conhecidos deste roteiro

- Não há teste automatizado de **tela**: `npm test` cobre lógica pura
  (leitura da planilha do HCP, filtro de tipo, passagem rápida, paginação de
  lista). O resto é este roteiro.
- Os passos com hardware (5.3.10) dependem do terminal e das conferências de IP
  do `.claude/rules/hikvision.md` — IPs mudam por DHCP e quebram em silêncio.
- **Cantina e enfermaria não foram alteradas** nesta entrega; se um número ali
  mudou, é regressão.
