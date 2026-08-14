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
| 1.4 | F12 → Network | Nenhuma requisição a domínio externo (as bibliotecas são locais — ver a nota de R1 no fim desta página) |
| 1.5 | Recarregar (Ctrl+R) | ★ **Volta para a tela de login** — e isto é o comportamento CORRETO |

> ★ **1.5 — o token NÃO sobrevive a um reload, por decisão de projeto.**
> Até 11/08/2026 esta linha dizia "continua logado (token persistido)", e a
> promessa era falsa desde sempre: `js/utils/auth.js` guarda o JWT em **memória**
> (`let _token = null`), com o comentário "não localStorage por segurança em
> Electron". Um F5 no kiosk exige login de novo — de propósito, para que uma
> máquina deixada aberta não continue autenticada.
>
> A afirmação errada custou caro: numa passagem de aceitação, o passo 1.5
> "falhou", o roteiro foi tratado como quebrado e metade do percurso foi
> investigada à toa antes de alguém abrir o `auth.js`.
>
> **Reverificar em 10 segundos:**
> ```bash
> grep -n "_token" js/utils/auth.js          # let _token = null  → memória
> git log -S "localStorage.setItem" -- js/utils/auth.js   # vazio = nunca persistiu
> ```
> Se um dia a decisão mudar, os dois comandos acima mudam junto — e aí esta
> linha é que passa a estar errada.

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

## 3-bis. Régime de sortie — a faixa do PORTÃO (entrega de 14/08)

> ⚠️ Só aparece em pontos **PORT***, só para **SAÍDA** de **ALUNO**, e só com
> `magbo.regime.habilitado=true` (nasce **false** — ver `deploy/.env.example`).
> Com a regra desligada nada disto aparece, e **isso é o comportamento correto**.

| # | Ação | Esperado |
|---|---|---|
| 3b.1 | Abrir PORT1 com a regra DESLIGADA | Nenhuma faixa, nenhuma pastilha. A tela é a de sempre |
| 3b.2 | Ligar a regra, sem nenhum regime cadastrado, e registrar uma saída de aluno | Faixa **ardósia** «Régime non renseigné», ação «Contrôlez le carnet, comme avant». **Não pode** parecer recusa nem aprovação |
| 3b.3 | Cadastrar regime 1 para esse aluno e registrar outra saída às 10h | Faixa **vermelha** «Ne doit pas sortir seul», ação «Retenez l'élève et appelez la Vie Scolaire» |
| 3b.4 | ⚠️ Logo depois, registrar a saída de um aluno **sem regime** | A faixa **continua no vermelho** por 2 min, com a hora do vermelho e «N passagem(ns) depois desta». Se o vermelho sumir, é regressão |
| 3b.5 | Cadastrar regime 2 e registrar saída | Faixa **âmbar**, ação «Vérifiez l'emploi du temps et le carnet» + a ressalva de que o MAGBO não tem a grade |
| 3b.6 | Cadastrar regime 3 e registrar saída | Faixa **verde**, com a ressalva da grade (o verde responde pelo REGIME, não pelo horário) |
| 3b.7 | Criar autorização pontual (Sorties) para um aluno de regime 1 e registrar a saída | **Verde**, motivo «autorisation ponctuelle». ⚠️ Recarregar a tela 10 s depois: **continua verde** — a permissão foi consumida e o alibi tem de sobreviver |
| 3b.8 | Parar o backend e abrir PORT1 | Aviso «Régime indisponible — serveur injoignable. Contrôlez le carnet.» A ausência de faixa **não pode** ser silenciosa |
| 3b.9 | Feed de negadas do portão | As linhas de regime têm rótulo em francês/português, **não** o código cru; `REGIME_TO_VERIFY` tem cor **própria**, não o cinza de configuração |
| 3b.10 | Trocar o idioma no cabeçalho | Faixa, ações e pastilhas mudam de idioma sem recarregar |

## 3-ter. Régimes (tela da Vie Scolaire)

| # | Ação | Esperado |
|---|---|---|
| 3t.1 | Entrar como OPERATOR **com** `REGIME_WRITE` | O card «Régimes» aparece no Dashboard (não exige PIN de admin) |
| 3t.2 | Entrar como OPERATOR **sem** a permissão | O card não aparece |
| 3t.3 | Buscar um aluno **com** responsável cadastrado | «Autorisé par» mostra o nome do cadastro numa caixa verde, **sem digitar** |
| 3t.4 | Clicar «não foi este responsável» e gravar outro nome | A linha fica marcada como **exceção**, em âmbar |
| 3t.5 | ⚠️ Reabrir esse mesmo aluno | Mostra o nome **gravado** (a exceção), não o do cadastro. Se voltar ao cadastro, é regressão: a prova estaria sendo reescrita |
| 3t.6 | Substituir o regime e abrir o histórico | A linha do tempo mostra o de→para do regime **e** a troca de quem autorizou |
| 3t.7 | Ver os KPIs | «Sem regime» é o número que lidera. No dia 1 deve dizer ~923 |

## 3-quater. PPMS — quem está dentro

| # | Ação | Esperado |
|---|---|---|
| 3q.1 | Abrir PPMS (qualquer operador autenticado) | Abre. **Não** exige área específica — é tela de evacuação |
| 3q.2 | Ver a ordem das zonas | CDI e enfermaria **antes** de «Dans l'établissement — zone inconnue», mesmo com menos gente |
| 3q.3 | Registrar entrada e saída de alguém no CDI | Ele sai do card «CDI» e vai para a zona desconhecida, com «CDI» na linha como último lugar visto |
| 3q.4 | Ter alguém na enfermaria | Aparece o terceiro aviso, sobre ponto sem fechamento automático |
| 3q.5 | Parar o backend e recarregar | Mostra o retrato guardado **com a hora**, em faixa de aviso |
| 3q.6 | Sair da sessão e reentrar sem rede | **Nenhum** retrato antigo aparece — o cache é apagado no logout |
| 3q.7 | Procurar botão de exportar CSV | **Não existe.** Só impressão. Se voltar, é regressão da decisão do dono |

---

## 4. Rapport Général

Cabeçalho → **Rapport Général**.

### 4.1 Vue d'ensemble

> ⚠️ **A "Durée moyenne" de semana/mês CAIU visivelmente em 12/08/2026, e a
> queda foi DELIBERADA — não é defeito.** Até então a média incluía os pares
> `ENTRADA→SAIDA(FECHAMENTO_AUTO)` das 17:00 (dia inteiro sintético) e as
> passagens-relâmpago; era por isso que ela *crescia* de hoje→semana→mês
> ("hoje" antes das 17h ainda não tem fechamentos). Desde 12/08 a query aplica
> as **mesmas réguas do Rapport do CDI**: fechamento automático fora, piso de
> `min-visit-seconds`. Contrato em `AvgStayRulesIT` (4 testes). Se alguém
> reportar "a média despencou em agosto", a resposta é esta nota.

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

### 5.4-bis "É um aluno" — reclassificar um FUNC-### criado por engano (★ novo)

> Caso real: 74 alunos estavam fora do departamento ALUNOS no HikCentral com ID
> de 10 dígitos, então a importação criou FUNC-### segurando a face deles e as
> passagens entravam nos relatórios como de servidor. A correção em massa foi
> feita em SQL; esta é a ferramenta para o próximo caso.

| # | Ação | Esperado |
|---|---|---|
| 5.4b.1 | Numa linha **ativa**, clicar **"É um aluno"** | Abre o painel com o nome já na busca; mostra a face e o nº de passagens do registro |
| 5.4b.2 | Registro **inativo** | O botão **não aparece** (não haveria o que mudar) |
| 5.4b.3 | Digitar o nome do aluno | Candidatos — **só ALUNO** |
| 5.4b.4 | Escolher um aluno | ★ **Os dois lados**: quem recebe a face (com "nome, turma e tipo não são alterados") e o servidor que será inativado (com "as passagens ficam neste registro") |
| 5.4b.5 | ★ Antes de confirmar, checar o banco | **Nada mudou** |
| 5.4b.6 | Confirmar | Toast dizendo o identificador transferido e o registro inativado |
| 5.4b.7 | ★ Conferir no banco | Aluno com o `hikvision_employee_id`; FUNC-### com o campo **NULO** e `ativo=false`; **passagens dele intactas** |
| 5.4b.8 | ★ Buscar um aluno que **não existe** no MAGBO | Mensagem exata: *"Este aluno não está no MAGBO; ele deve entrar primeiro pela importação do Pronote"* — e **nenhum aluno é criado** |
| 5.4b.9 | ★ Escolher um aluno que **já tem outra face** | Aparece a caixa de substituição consciente mostrando os **dois** identificadores; o botão fica **desabilitado** até marcar |
| 5.4b.10 | Marcar a caixa e confirmar | Troca acontece; a face antiga deixa de reconhecer o aluno |
| 5.4b.11 | Depois de reclassificar | A linha volta na lista como **inativa**, sem ID Hikvision |
| 5.4b.12 | Passar o rosto desse aluno no terminal (se houver hardware) | ★ Reconhecido como **aluno**; a passagem entra nos relatórios do CDI |

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

## 6-bis. Ocupação atual com posto fixo — conferência em SQL, obrigatória

> **Por que este bloco existe e por que é em SQL, não em cliques.**
> `currentOccupancyByPoint` usa `DISTINCT ON`, que é **exclusivo do
> PostgreSQL**: o teste dela está `@Disabled` no H2 e **a suíte não a protege**.
> Em 10/08/2026 a primeira versão do filtro de posto fixo passou nas 546 e
> **estava errada** — só apareceu numa execução manual em Postgres real.
> Repetir isto **depois de todo deploy que toque `AccessLogRepository`**.

**O defeito que este roteiro pega:** se a exclusão do posto fixo tirar *toda*
linha marcada (em vez de só a ENTRADA), quem tem posto fixo fica preso na
primeira entrada do dia e aparece como **"dentro" até a meia-noite, mesmo tendo
ido embora** — a saída real dele é marcada e some junto. O fechamento
automático **não** corrige: ele olha o último evento cru, vê uma SAIDA e
corretamente não faz nada.

### Como semear (banco de teste, **nunca** o de produção)

```sql
-- 4 pessoas com posto fixo + 2 alunos. A "verdade" está nos comentários.
UPDATE app_users SET posto_fixo_point_id='PORT1'  WHERE id='<porteiro>';
UPDATE app_users SET posto_fixo_point_id='ENFERM' WHERE id='<enfermeira>';
UPDATE app_users SET posto_fixo_point_id='BIBLIO' WHERE id='<bibliotecaria>';
UPDATE app_users SET posto_fixo_point_id='REFEI1' WHERE id='<cantina>';

INSERT INTO access_logs (user_id,point_id,action,timestamp,flag) VALUES
 -- bibliotecária: entrou 08:00 e FOI EMBORA às 17:00 (saída marcada)
 ('<bibliotecaria>','BIBLIO','ENTRADA',CURRENT_DATE+time '08:00',NULL),
 ('<bibliotecaria>','BIBLIO','ENTRADA',CURRENT_DATE+time '09:00','POSTO_FIXO'),
 ('<bibliotecaria>','BIBLIO','SAIDA'  ,CURRENT_DATE+time '17:00','POSTO_FIXO'),
 -- cantina: entrou 11:00 e SAIU 11:30 (saída marcada)
 ('<cantina>','REFEI1','ENTRADA',CURRENT_DATE+time '11:00',NULL),
 ('<cantina>','REFEI1','SAIDA'  ,CURRENT_DATE+time '11:30','POSTO_FIXO'),
 -- porteiro: vai e volta o tempo todo, ÚLTIMO evento é SAÍDA 08:10
 ('<porteiro>','PORT1','ENTRADA',CURRENT_DATE+time '07:30',NULL),
 ('<porteiro>','PORT1','SAIDA'  ,CURRENT_DATE+time '08:00','POSTO_FIXO'),
 ('<porteiro>','PORT1','ENTRADA',CURRENT_DATE+time '08:05','POSTO_FIXO'),
 ('<porteiro>','PORT1','SAIDA'  ,CURRENT_DATE+time '08:10','POSTO_FIXO'),
 -- enfermeira: entrou 08:00 e NUNCA passou o rosto na saída
 ('<enfermeira>','ENFERM','ENTRADA',CURRENT_DATE+time '08:00',NULL),
 ('<enfermeira>','ENFERM','ENTRADA',CURRENT_DATE+time '10:00','POSTO_FIXO'),
 ('<enfermeira>','ENFERM','ENTRADA',CURRENT_DATE+time '12:00','POSTO_FIXO'),
 -- dois alunos, sem posto fixo, de fato dentro
 ('<alunoA>','REFEI1','ENTRADA',CURRENT_DATE+time '11:00',NULL),
 ('<alunoB>','BIBLIO','ENTRADA',CURRENT_DATE+time '14:00',NULL);
```

### A consulta

```sql
SELECT point_id, COUNT(*) FROM (
  SELECT DISTINCT ON (user_id, point_id) user_id, point_id, action
  FROM access_logs WHERE timestamp >= CURRENT_DATE
    AND (flag IS NULL OR flag <> 'POSTO_FIXO' OR action <> 'ENTRADA')
  ORDER BY user_id, point_id, timestamp DESC
) last WHERE action='ENTRADA' GROUP BY point_id ORDER BY 1;
```

### A verdade esperada, ponto a ponto

| Ponto | Esperado | Quem, e por quê |
|---|---|---|
| `BIBLIO` | **1** | só o aluno B. A bibliotecária saiu às 17:00 e a saída marcada **tem de** fechar |
| `ENFERM` | **1** | a enfermeira — ela de fato **nunca** passou o rosto na saída, então está certo constar dentro |
| `REFEI1` | **1** | só o aluno A. A cantina saiu às 11:30 |
| `PORT1` | **ausente** (0) | o porteiro saiu às 08:10; a re-entrada marcada **não** pode reabrir presença |

> **Se `BIBLIO`, `REFEI1` ou `PORT1` vierem maiores, o filtro voltou a ser
> simétrico** (`flag <> 'POSTO_FIXO'` sem o `OR action <> 'ENTRADA'`) e o
> sistema está afirmando que gente que foi embora continua dentro.

> ⚠️ **A armadilha do NULL.** A forma "equivalente"
> `AND NOT (flag = 'POSTO_FIXO' AND action = 'ENTRADA')` devolve **ZERO linhas**:
> `flag = 'POSTO_FIXO'` é `NULL` quando a flag é nula, `NOT NULL` é `NULL`, e
> toda linha sem flag — que é quase toda a base — é descartada. Foi verificada e
> falha assim. Manter sempre a forma com `flag IS NULL OR ...`.

### Medição de referência (10/08/2026, PostgreSQL 16.14, cenário acima)

| Versão da consulta | BIBLIO | ENFERM | REFEI1 | PORT1 |
|---|---|---|---|---|
| antes do posto fixo (sem filtro) | 1 | 1 | 1 | — |
| filtro **simétrico** (defeituoso) | **2** | 1 | **2** | **1** |
| filtro **assimétrico** (em vigor) | 1 | 1 | 1 | — |

### A outra PG-only, na mesma tacada

`countUnregisteredExits` (`interval '4 hours'`) também é `@Disabled` no H2. No
mesmo cenário ela deve devolver **2**: o aluno A (entrou na cantina e não saiu)
e a enfermeira (primeira entrada do dia, sem saída). A cantina **não** pode
aparecer — a entrada dela às 11:00 foi fechada pela **saída marcada** das 11:30.

### `JA_PRESENTE` — a segunda flag de repetição, no mesmo cenário

Desde 10/08/2026 há **duas** flags de repetição, e as consultas as excluem
**juntas** (`flag NOT IN ('POSTO_FIXO','JA_PRESENTE')`, lista única em
`AccessLogRepository.REPETICOES`). O caso: o aluno 0003053 entrou no CDI quatro
vezes em cinco minutos — 12:49, 12:51, 12:51, 12:54 — **sem saída entre elas**.

Acrescentar ao seed:

```sql
INSERT INTO access_logs (user_id,point_id,action,timestamp,flag) VALUES
 ('<alunoC>','BIBLIO','ENTRADA',CURRENT_DATE+time '12:49',NULL),
 ('<alunoC>','BIBLIO','ENTRADA',CURRENT_DATE+time '12:51','JA_PRESENTE'),
 ('<alunoC>','BIBLIO','ENTRADA',CURRENT_DATE+time '12:51','JA_PRESENTE'),
 ('<alunoC>','BIBLIO','ENTRADA',CURRENT_DATE+time '12:54','JA_PRESENTE');
```

| Verificação | Esperado | Por quê |
|---|---|---|
| `currentOccupancyByPoint` → `BIBLIO` | **+1** (o aluno C, uma vez) | ele entrou e não saiu; as três repetições não podem contar como quatro pessoas |
| `countUnregisteredExits` | **inalterado** | `BIBLIO` não está na lista (`REFEI1`,`REFEI2`,`ENFERM`) — se mudar, alguém alterou a consulta |
| `countRelevantesSince` | **+1**, não +4 | é a contagem de tela |
| `countByTimestampGreaterThanEqual` | **+4** | a contagem crua prova que nada foi apagado |
| `countBlockedSince` | **inalterado** | `JA_PRESENTE` não é alerta — a marca criada para calar ruído não pode virar ruído |

> ⚠️ **`JA_PRESENTE` NÃO roda no portão** (decisão do Sam, 10/08/2026). Ali a
> saída escapa — sai-se por fora do campo da câmera —, então "já está dentro" é
> palpite, e marcar uma reentrada esconderia uma **entrada real**. O ruído do
> portão já tem dono: `POSTO_FIXO`, marcado por pessoa e por decisão explícita.
> A noção é `AreaMapping.temPresencaConfiavel` (derivada da ÁREA), então
> cantina e enfermaria entram sozinhas quando forem comissionadas.
>
> **Conferência:** semear 3 ENTRADAS seguidas em `PORT1` sem saída, para a
> mesma pessoa. Nenhuma pode sair com `JA_PRESENTE`; as três contam como três
> movimentos. Se alguma vier marcada, a regra vazou para o portão.

> ⚠️ **A assimetria vale para as duas flags.** `JA_PRESENTE` só marca ENTRADA
> por construção, mas o predicado assimétrico de `currentOccupancyByPoint`
> continua sendo o que protege a SAÍDA — e agora ele protege contra as duas.
> Se alguém marcar uma SAÍDA com qualquer flag de repetição, é o defeito de
> 10/08 de volta.

### Se as contagens divergirem, o primeiro lugar a olhar

`AccessLogRepository.REPETICOES` é a lista **única**. Uma flag nova que entre
numa consulta e falte noutra não quebra nada — só faz a décima contar diferente.
`AccessLogRepositoryQueryGuardTest` cobra que toda consulta que cita uma flag de
repetição passe por essa lista, mas ele lê **string**: só pega o que estiver
escrito no `@Query`, não o que uma consulta nova faça em código Java.

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
mvn test    →  Tests run: N, Failures: 0, Errors: 0, Skipped: 2
npm test    →  Tests: M passed
```

**O que importa é `Failures: 0` e `Errors: 0`, não o valor de N e M.** Eles
crescem a cada entrega, e um número fixo escrito aqui envelhece em dias — esta
seção já disse "350 / 58" por duas gerações, o que é pior que não dizer nada:
quem executa vê 603, acha que quebrou alguma coisa e vai investigar o nada.

**Referência de quando esta página foi conferida:** `main` @ `8fef0f9`,
11/08/2026 → **backend 603** (2 `@Disabled`) e **npm 279**.

- Se o seu número for **maior**, é porque houve entrega com testes novos —
  normal, siga.
- Se for **menor**, alguém apagou teste: descubra qual antes de continuar.
- `Skipped` tem de ser **exatamente 2** (as duas nativas PostgreSQL-only). Se
  virar 3, alguém desligou um teste — a seção 6-bis explica por que isso é grave
  neste projeto.

⚠️ **Rode o backend do zero antes de acreditar no número:**
```bash
cd backend && rm -rf target && mvn -o test
```
`mvn test` incremental já deu **BUILD SUCCESS falso** quando só a assinatura de
um construtor mudou (Lombok `@RequiredArgsConstructor` + `target/test-classes`
obsoleto): três testes quebrados passaram despercebidos em 10/08/2026.

### Piso de visita curta — fonte única

O número (60 s) vive **só** em `magbo.report.min-visit-seconds`. A tela o busca
uma vez em `GET /api/access/report-config`. Para conferir que a fonte é única:

1. mudar a property para `120` e reiniciar o backend;
2. reabrir o app e o **Rapport CDI**: visitas entre 1 e 2 minutos **deixam de
   contar**, e o card do CDI no **Vue d'ensemble** mostra o mesmo critério;
3. devolver a property para `60`.

Se as duas telas discordarem, a fonte voltou a estar duplicada.

Registrar em `docs/testing/evidencias/<data>/`: capturas dos pontos ★, o SQL de
antes/depois do 5.2 e do 5.3, e qualquer passo que falhou com o que apareceu.

### Limites conhecidos deste roteiro

- Não há teste automatizado de **tela**: `npm test` cobre lógica pura
  (leitura da planilha do HCP, filtro de tipo, passagem rápida, paginação de
  lista). O resto é este roteiro.
- Os passos com hardware (5.3.10) dependem do terminal e das conferências de IP
  do `.claude/rules/hikvision.md` — IPs mudam por DHCP e quebram em silêncio.
- **Duas consultas nativas são PostgreSQL-only e ficam `@Disabled` no H2**
  (`currentOccupancyByPoint`, `DISTINCT ON`; `countUnregisteredExits`,
  `interval '4 hours'`). A suíte **não** as protege: `mvn test` fica verde com
  elas erradas — aconteceu em 10/08/2026. A conferência delas é a **seção
  6-bis**, e ela é obrigatória depois de qualquer mudança em
  `AccessLogRepository`.
- **Cantina e enfermaria não foram alteradas** nesta entrega; se um número ali
  mudou, é regressão.
