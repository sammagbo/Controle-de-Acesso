# PROMPT — FASE K: Documentação e ADRs

## CONTEXTO DO PROJETO
**MAGBO Access Control** — Lycée Molière (Rio). O projeto mantém documentação viva no repositório, usada tanto por humanos quanto por assistentes de IA (`CLAUDE.md` é lido automaticamente pelo Claude Code ao abrir o projeto).
**Documento normativo:** `docs/architecture/ESPECIFICACAO-TECNICA-v1.md` — **leia a seção 15**.

### ESTRUTURA DE DOCUMENTAÇÃO EXISTENTE (ler antes de escrever)
```
CLAUDE.md                                  ← contexto permanente, regras, gotchas, estado atual
.claude/rules/backend.md                   ← padrões do backend
.claude/rules/frontend.md                  ← padrões do frontend
.claude/rules/database.md                  ← padrões de banco
.claude/rules/hikvision.md                 ← integração + tabela de subtipos
.claude/rules/deploy-seguranca.md          ← deploy e segurança
.claude/skills/                            ← 10 skills operacionais
docs/architecture/visao-geral.md · fluxos.md · endpoints.md · banco-de-dados.md
docs/architecture/relatorio-auditoria-2026-07-10.md
docs/testing/                              ← planos e registros de teste
```

### REGRAS INVIOLÁVEIS
- ❌ **NUNCA** `git commit`/`push`.
- ❌ ★ **NUNCA** inserir segredos: senhas, tokens, JWT secrets, IPs internos sensíveis. (O repositório é **público**.)
- ❌ **NUNCA** documentar comportamento que não existe no código.
- ❌ **NUNCA** apagar histórico: o `relatorio-auditoria-2026-07-10.md` é registro histórico — se precisar de auditoria nova, criar arquivo com data nova.
- ✅ Divergência entre doc e código → **o código vence**; corrigir a doc e anotar.
- ✅ Datas em ISO (`2026-07-15`).
- ✅ Contradição → **PARE e reporte**.

---

## OBJETIVO DA FASE K
Deixar a documentação refletindo o sistema real após as Fases A–J, e registrar as decisões arquiteturais (ADRs) para que ninguém — humano ou IA — as reabra sem contexto.

## DEPENDÊNCIAS
**Fases A–J concluídas.** A documentação descreve o que **foi** implementado, não o que se pretende implementar.

---

## ARQUIVOS

### Novos (5)
```
docs/architecture/decisoes/ADR-001-attempts-vs-logs.md
docs/architecture/decisoes/ADR-002-cartao-nao-persistido.md
docs/architecture/decisoes/ADR-003-webhook-pos-evento.md
docs/testing/plano-validacao-estrutural.md
docs/operacional/procedimento-hikcentral.md
```
### Alterados (9)
```
CLAUDE.md
.claude/rules/backend.md
.claude/rules/database.md
.claude/rules/hikvision.md
.claude/rules/frontend.md
docs/architecture/visao-geral.md
docs/architecture/fluxos.md
docs/architecture/endpoints.md
docs/architecture/banco-de-dados.md
```

---

## ORDEM DE IMPLEMENTAÇÃO

### Passo 1 — ADRs (o mais importante desta fase)
Formato de cada ADR: **Contexto · Decisão · Alternativas consideradas · Consequências · Evidência · Status/Data**.

**`ADR-001-attempts-vs-logs.md`** — Separar tentativas negadas em tabela própria.
- *Contexto:* `access_logs` é a fonte de presença, refeições, ocupação e 15+ consultas. Era preciso registrar tentativas negadas sem contaminar nada disso.
- *Alternativas:* **(A)** flags em `access_logs` (`granted`, `authorization_result`…) — exigiria filtrar `granted=true` em **todas** as 15+ queries; um esquecimento corrompe estatística **em silêncio**. **(B)** tabela `access_attempts` separada.
- *Decisão:* **B**.
- *Consequências:* as restrições do cliente ("negada nunca vira acesso/refeição/localização") viram **propriedade estrutural**, não disciplina de filtro. Custo aceito: linha do tempo unificada exige UNION/endpoint composto.
- *Status:* Aceita, 2026-07-14, por Sam.

**`ADR-002-cartao-nao-persistido.md`** — O MAGBO não armazena número de cartão.
- *Evidência (obrigatório citar):* testes com hardware em **2026-07-14** (Testes 1–5). Face → `employeeNoString=9999999`, `subEventType=75`. Cartão `3478915054` → `employeeNoString=9999999`, `subEventType=1`. **O terminal traduz o cartão para o Employee ID internamente; `cardNo` nunca é enviado.** Confirmado também com `0001764` (Luis) e `0003906` (Xande) — zeros à esquerda preservados.
- *Decisão:* nenhuma coluna de cartão, nenhuma tabela de credenciais, nenhuma importação de cartão. O vínculo cartão↔pessoa vive no terminal/HikCentral.
- *Consequências:* face e cartão identificam a mesma pessoa sem código adicional. Distinção do método só pelo `subEventType` (75 vs 1) — gravado em `access_logs.auth_method`. **Não é possível** distinguir face de cartão por outro campo.
- *Status:* Aceita, 2026-07-14.

**`ADR-003-webhook-pos-evento.md`** — O MAGBO não bloqueia fisicamente.
- *Evidência (obrigatório citar):* **2026-07-13**, teste CANT-09: validade da pessoa colocada no passado → o terminal **negou por voz antes de qualquer HTTP**; o evento `subEventType=8` chegou **depois**. Sequência observada: 21 (porta abre) → 75/1 (autenticação) → 22 (porta fecha) — a porta já operou quando o webhook chega. A resposta HTTP do MAGBO é ignorada pelo aparelho. O terminal enfileira e reenvia eventos quando o destino cai (observado 2x).
- *Decisão:* o webhook é **pós-evento**. `DENY` no MAGBO = classificação lógica + auditoria, **nunca** ação física. Bloqueio físico real só via HikCentral (access levels/schedules).
- *Consequências:* enquanto não houver bloqueio via HikCentral, um aluno sem direito **entra fisicamente** e o MAGBO registra a tentativa. Essa divergência é medida pelo KPI `divergenciaHoje` (`auth_result=SUCCESS` **E** `authorization_result=DENIED`). **A direção da escola precisa saber disso.** Efeito colateral positivo: se a VM/rede cair, o almoço continua funcionando.
- *Status:* Aceita, 2026-07-15.

### Passo 2 — `CLAUDE.md`
Atualizar **§Estado atual** (não reescrever o arquivo inteiro):
- Novas tabelas: `access_attempts`, `meal_entitlements`, `meal_entitlement_events`, `student_exit_permissions`.
- Taxonomia dos 4 eixos (método / resultado físico / decisão MAGBO / motivo).
- Políticas configuráveis em properties (listar as 7 + dedup).
- **Fato:** o backend é observacional; não bloqueia porta (ver ADR-003).
- Regra: `access_logs` = efetivo · `access_attempts` = negado.
- Testes automatizados agora existem (`mvn test`).
- **Manter** todos os gotchas operacionais existentes (docker, 4 env vars, IPs dinâmicos, health) — eles continuam válidos.

### Passo 3 — `.claude/rules/backend.md`
Acrescentar: taxonomia dos 4 eixos · ordem obrigatória das regras da cantina (**dedup → entitlement → horário**) · `access_logs` nunca recebe evento negado · serviços novos e responsabilidades (`HikvisionEventClassifier`, `AccessDecisionService`, `MealEntitlementService`, `ExitPermissionService`, `DeduplicationService`, `AccessAttemptService`) · políticas em properties · permissões granulares (`hasPermission` para escrita; `can(area)` para leitura).

### Passo 4 — `.claude/rules/database.md`
Acrescentar: as 4 tabelas novas com suas colunas · CHECK constraints espelham os enums Java (**atualizar juntos**) · `meal_entitlements` sem linha = PENDING (dado não preenchido ≠ negado) · histórico obrigatório em toda alteração de entitlement · política de SQL versionado em `deploy/migrations/` (e por que não Flyway ainda) · campos reservados `days_of_week`/`meal_type` não usados pela regra atual.

### Passo 5 — `.claude/rules/hikvision.md`
O arquivo **já tem** a tabela de subtipos (atualizada em 13/07). Acrescentar:
- Cartão é traduzido pelo terminal → `employeeNoString`; `cardNo` **não existe** no payload (ADR-002).
- **Whitelist rígida:** só `{75, 1}` geram `access_logs`. Subtipo 8 → `access_attempts`. Subtipo desconhecido → tentativa, nunca acesso.
- `auth_method` gravado em `access_logs` desde o commit `2a66f21`.

### Passo 6 — `.claude/rules/frontend.md`
Acrescentar: componentes novos e o `DeniedAttemptsFeed` reutilizável · labels espelhados em `constants.js` (mudar junto com o backend) · acessos válidos e tentativas negadas **visualmente separados** · `PENDING` apresentado como dado não preenchido · sem permissão → campos desabilitados, não escondidos · ★ cuidado com xlsx e zeros à esquerda.

### Passo 7 — `docs/architecture/*`
- **`visao-geral.md`:** acrescentar a camada de decisão (`AccessDecisionService`) e o conceito de observacionalidade.
- **`fluxos.md`:** os fluxos das seções 4.3 / 4.4 / 4.5 da spec (webhook completo, cantina, portão) — em texto, no estilo do arquivo.
- **`endpoints.md`:** **todos** os endpoints novos na tabela existente, com auth e descrição. Atualizar a nota de `blockedToday` (agora tem alias `alertasHoje`).
- **`banco-de-dados.md`:** as 4 tabelas novas + `system_users.permissoes` + as colunas do F1 em `access_logs`.

### Passo 8 — `docs/testing/plano-validacao-estrutural.md`
Transcrever a bateria **V01–V14** da seção 13.5 da spec, no formato dos planos existentes em `docs/testing/`. Incluir: pré-condições (Bloco A do plano de 13/07: IPs, containers, backend, backup), tabela de testes com esperado, e espaço para registro de resultado.
⚠️ Deixar explícito: **esta bateria só faz sentido depois de `mvn test` verde.**

### Passo 9 — `docs/operacional/procedimento-hikcentral.md`
⚠️ Este documento tem **lacunas propositais** — depende de decisões operacionais do Fabiano e da direção. **Escreva a estrutura com as perguntas explícitas**, marcando claramente `[A DEFINIR COM FABIANO]`. **Não invente respostas.**
Seções obrigatórias (seção 16 da spec): quem cria os grupos · como incluir autorizados · como remover · como os terminais recebem a atualização · como validar sincronização · como funciona offline · rollback · divergência.
Incluir os fatos conhecidos: o HikCentral vive em `192.168.1.90`; há **1 controlador com porta em anomalia** e **34 pessoas pendentes de envio** (observado em 08/07) — **pauta obrigatória com o Fabiano**; 1194 credenciais faciais já distribuídas de 1197 pessoas.
Incluir o caminho de export: `GET /api/admin/meal-entitlements?status=AUTHORIZED` → CSV → importação no HikCentral.

---

## REGRAS QUE NÃO PODEM SER QUEBRADAS
1. ★ **Zero segredos.** Repositório público.
2. Documentar só o que existe no código.
3. Código vence a doc em caso de divergência.
4. Não apagar documentos históricos (criar novos com data nova).
5. ADRs com **evidência real e datada** dos testes de hardware.
6. `[A DEFINIR COM FABIANO]` onde a informação não existe — nunca inventar.
7. Datas ISO.
8. Manter os gotchas operacionais do `CLAUDE.md`.

## CRITÉRIOS DE ACEITE
- [ ] 3 ADRs criados com Contexto/Decisão/Alternativas/Consequências/Evidência/Status.
- [ ] ADR-002 e ADR-003 citam as datas e os testes reais (14/07 Testes 1–5; 13/07 CANT-09).
- [ ] `CLAUDE.md` §Estado atual reflete o sistema pós Fases A–J, com gotchas preservados.
- [ ] As 4 rules atualizadas.
- [ ] 4 docs de arquitetura atualizados; `endpoints.md` com todas as rotas novas.
- [ ] `plano-validacao-estrutural.md` com V01–V14.
- [ ] `procedimento-hikcentral.md` com as 8 seções e os `[A DEFINIR COM FABIANO]` explícitos.
- [ ] ★ **Nenhum segredo** em nenhum arquivo (token, senha, JWT secret).
- [ ] Nenhuma afirmação de comportamento inexistente.
- [ ] Nenhum documento histórico apagado.

## CHECKLIST DE CONCLUSÃO
- [ ] 3 ADRs · 2 docs novos (validação + hikcentral) · 9 docs atualizados
- [ ] Grep de segredos feito: `grep -riE "senha|password|token|secret" docs/ CLAUDE.md .claude/` → só menções conceituais, **nenhum valor**
- [ ] Datas ISO
- [ ] **Nenhum commit**

## RISCOS
| Risco | Severidade | Mitigação |
|---|---|---|
| ★ Vazar segredo em doc (repo público) | **CRÍTICA** | Grep obrigatório antes de reportar |
| Documentar comportamento inexistente | Alta | Conferir contra o código; ADRs com evidência datada |
| Reescrever `CLAUDE.md` e perder os gotchas | **Alta** (custaram dias de teste) | Editar cirurgicamente, só a §Estado atual |
| Inventar o procedimento do HikCentral | Alta | `[A DEFINIR COM FABIANO]` explícito |
| Apagar o relatório de auditoria histórico | Média | Proibido; criar arquivo novo com data nova |

## ROLLBACK
`git checkout -- docs/ CLAUDE.md .claude/` — documentação não afeta runtime. Rollback trivial e sem consequências.

## AO TERMINAR
1. Listar os arquivos criados/atualizados.
2. Colar o resultado do grep de segredos.
3. Confirmar: "nenhum comportamento inexistente foi documentado; os gotchas do CLAUDE.md foram preservados".
4. Listar os pontos marcados `[A DEFINIR COM FABIANO]` para o Sam levar à reunião.
5. **NÃO commitar.**

---

## 🏁 APÓS ESTA FASE — ENTREGA COMPLETA

Com a Fase K concluída, o ciclo está fechado. O Sam deve então:
1. Revisar todo o código (`git diff` por fase, se commitou incrementalmente).
2. Rodar `mvn clean test` → verde.
3. Executar a bateria **V01–V14** com hardware real (`docs/testing/plano-validacao-estrutural.md`).
4. Conferir o **critério de aceite final** (seção 18 da especificação técnica).
5. Só então: deploy na VM (Fase J + skill `deploy-vm`).
