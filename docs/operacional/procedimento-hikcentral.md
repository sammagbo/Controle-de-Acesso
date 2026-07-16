# Procedimento Operacional — HikCentral (provisionamento) e cantina (bloqueio operacional assistido)

**Status:** CONSOLIDADO após a reunião com o Fabiano (SI) em 2026-07-16. Restam **6 pendências
finais** (lista no fim) — pontos que dependem de informação a levantar com o Fabiano/bancada.
**Base:** especificação técnica §16, `docs/architecture/decisoes/ADR-003-webhook-pos-evento.md`
e `docs/architecture/decisoes/ADR-004-bloqueio-operacional-assistido.md`. **Data:** 2026-07-16.

> As decisões operacionais foram tomadas em 2026-07-16 (Sam, pós-*smoke test* e reunião com o
> Fabiano) e estão registradas no **ADR-004**. Este documento descreve **o que ficou decidido**.
> Os poucos pontos que ainda dependem de dado externo estão reunidos na **lista final de
> pendências** — são a pauta curta que sobra.

## O que mudou (decisão de 2026-07-16)
Este documento **deixou de ser** "como a escola bloqueia refeição fisicamente pelo HikCentral".
A refeição **não é bloqueada fisicamente** — nem agora nem no roadmap (**ADR-004**). O modelo é:

- **Terminal valida IDENTIDADE** (face/cartão). **MAGBO valida a REGRA** (direito / horário /
  dedup). **Operador aplica a EXCEÇÃO** (bloqueio operacional **assistido**).
- O **HikCentral é provisionamento puro**: cadastro e ciclo de vida de pessoas. **Não** guarda
  direitos de refeição e **não** faz bloqueio de cantina.
- Os **direitos de refeição vivem só no MAGBO** — sem sincronização MAGBO↔HikCentral de direitos.

## Papéis e responsabilidades
- **Direção / Vice-Direção:** administram os níveis de acesso e **decidem** quem é autorizado à
  refeição.
- **Operador da cantina:** **executa** as alterações de *entitlement* no MAGBO e aplica as
  exceções durante o serviço (registro manual — ver §4).
- **Equipe de TI do Fabiano (SI):** importa o CSV de pessoas no HikCentral, executa o *Apply to
  Device* e confere a aplicação (0 falhas); solicita as reservas de IP ao SI.

## Fatos conhecidos (contexto)
- HikCentral (HCP) vive em **`192.168.1.90`** (VLAN 192.168.1.x). A **VM já foi criada** e
  aguarda o fim dos testes para a instalação definitiva.
- Os **~923 alunos atuais** são a base do piloto; os demais usuários que já existem no HCP
  **permanecem lá** — o piloto não os remove.
- `1194` credenciais faciais já distribuídas de `1197` pessoas (3 faltando — verificar quem).
- **Smoke test 2026-07-16 (hardware):** face → `access_log` REFEI1/FACE/75; cartão → `access_log`
  CARD/1; validade expirada → **0 logs** + 1 `access_attempt` `DEVICE_DENIED` (sub 8). FACE e
  CARD para o mesmo aluno funcionam (ADR-002). A **Écoute HTTP** manda o evento **direto**
  terminal→MAGBO, sem passar pelo HCP (base da seção "Funcionamento sem HikCentral").

---

## 1. HikCentral = provisionamento de pessoas (ciclo de vida)
O HikCentral cadastra e distribui **pessoas/credenciais** aos terminais. Ele **não** participa da
regra de refeição. O ciclo de vida de pessoas (feature futura **F7b** do MAGBO):

1. **MAGBO gera o CSV de importação** (formato HikCentral). *(F7b — ainda não implementado.)*
2. A **equipe de TI do Fabiano importa** o CSV no HCP.
3. **Apply to Device** distribui as pessoas/credenciais aos terminais.
4. **Conferir 0 falhas de aplicação** — a importação **só é considerada concluída com 0 falhas**
   (status por pessoa/dispositivo, ver §2).

### Regra crítica do CSV (zeros à esquerda)
- **`Person ID` = `hikvision_employee_id` como TEXTO**, com os **zeros à esquerda** preservados
  (IDs Pronote têm 7 dígitos, ex.: `0001764`).
- **O arquivo NUNCA passa pelo Excel.** No Excel, `0001764` vira `1764` — exatamente o cenário
  que o `ZeroPaddingIT` cobre no MAGBO, mas **em produção, dentro do HCP**, ninguém pega. Editar
  o CSV só em editor de texto / ferramenta que trate a coluna como texto.
- O **template exato** do HCP (colunas, encoding, separador) deve ser baixado da própria tela de
  importação do HCP → ver **pendência 3**.

## 2. Propagação HCP → terminais (*Apply to Device*)
- O mecanismo de distribuição é o **"Apply to Device"** do HCP.
- **Ordens de grandeza observadas/esperadas:**
  - **Incremental** (poucas pessoas, sem foto nova): **segundos a ~1 min**.
  - **Lote com fotos faciais:** **minutos a dezenas de minutos**.
- O HCP mostra o **status de aplicação por pessoa/dispositivo**: `Applied` / `Applying` /
  `Failed`.
- **Regra operacional:** a importação **só está concluída quando há 0 `Failed`**. Qualquer
  `Failed` tem de ser reprocessado antes de considerar o provisionamento pronto.
- Os **menus exatos e se há auto-apply** variam por versão do HCP → ver **pendência 2**.

## 3. Cantina = bloqueio operacional assistido
Fluxo durante o serviço (ADR-004):

1. O aluno autentica no terminal (face/cartão) → o terminal valida **identidade** e opera a porta
   localmente.
2. O evento chega ao MAGBO pela Écoute HTTP; o MAGBO aplica a **regra** (direito / janela /
   dedup) e classifica: acesso efetivo (`access_logs`) **ou** tentativa negada
   (`access_attempts`, com `DenialReason`).
3. O **operador** acompanha o **feed de tentativas negadas** em tempo real (`CantineMonitor`,
   polling 3s, com `DeniedAttemptsFeed`, polling 5s, *badges* por motivo) e **aplica a exceção**
   quando cabível.
4. **Exceção operacional = registro manual:** `POST /api/access` com `created_by_user`
   (decisão consciente e auditável do operador).

> **Não há bloqueio físico via HikCentral para refeição.** O MAGBO **não fecha porta** (ADR-003).
> A eficácia do modelo depende de **operador presente** e do **feed** — por isso o realce
> visual/sonoro de item novo no feed é backlog pré-piloto (**F7a**).

## 4. Direitos de refeição (só no MAGBO)
- Vivem **exclusivamente no MAGBO** (`meal_entitlements`). **Sem** sincronização com o HCP.
- **Administração:** Direção/Vice decidem; **operador executa** no MAGBO (edição inline / import
  em lote na tela `MealEntitlementManagement`).
- **Produção:** `magbo.policy.meal-pending=DENY` (aluno sem direito confirmado **não** conta como
  refeição). **Pré-requisito operacional:** a Direção importa a **lista de autorizados em lote**
  (Fase G, *bulk*) **antes do dia 1** do piloto — senão todo aluno `PENDING` seria negado.
- `PENDING` = **dado não preenchido** (aluno sem linha de *entitlement*), não é "negado por
  decisão" — daí o pré-requisito do *bulk* acima.

## 5. Funcionamento sem HikCentral (offline)
Se o HCP (ou a rede/VM) cair, **o almoço e o portão continuam funcionando** — propriedade
**desejada**, não falha (ADR-003).

- **Capacidade local do terminal** (datasheet oficial DS-K1T344MX-E1, hikvision.com): **3000
  faces / 3000 cartões / 150000 eventos** locais. Folga confortável: **3000 faces para 1197
  pessoas (~2,5×)**.
- A **Écoute HTTP vai DIRETO terminal→MAGBO** — **não passa pelo HCP**. Com o HCP fora, o
  terminal **decide sozinho** (credenciais já distribuídas) e o **MAGBO continua recebendo
  eventos** (provado 2026-07-16).
- **Credenciais só expiram pela validade individual** de cada pessoa (não por perda de contato
  com o HCP).
- **Continua funcionando sem HCP:** decisão local no terminal, envio de eventos ao MAGBO, feed de
  negadas, relatórios.
- **Para de funcionar sem HCP:** alterações de pessoas (novos cadastros / remoções), monitoramento
  central e **comando remoto de porta**.
- A **profundidade do buffer de reenvio** da Écoute HTTP (por quantos eventos/tempo o terminal
  enfileira com o MAGBO fora) ainda não foi medida → ver **pendência 4**.

## 6. Rede e IP fixo
- **IPs por DHCP quebram, EM SILÊNCIO, a Écoute HTTP e os `door_mappings`.** Aconteceu em
  2026-07-16: terminal `172.20.40.12`→`172.20.40.10`, PC mudou também. `door_mappings` id 15 foi
  corrigido `172.20.40.12`→`172.20.40.10`; o id 14 (`172.20.40.17`) ficou **órfão** de DHCP —
  inofensivo, limpar depois.
- **Ação:** o **Fabiano solicitará reservas de IP ao SI** para os terminais e a VM. A execução
  das reservas (e quais IPs ficaram fixos) precisa ser confirmada → ver **pendência 6**.
- Enquanto não houver reserva: **toda sessão de hardware** confere IP do PC, IP do terminal,
  Écoute HTTP e `door_mappings` (regra decorada na `.claude/rules/hikvision.md`).

## 7. Estado do painel do HCP (a reconferir)
- No print de **2026-07-08** o painel do HCP mostrava **1 porta em anomalia** e **34 pendentes**.
  Podem já estar resolvidos → **reconferir** e, se persistirem, tratar antes do piloto → ver
  **pendência 5**.

## 8. Versão e licença do HCP
- A **versão/licença do HCP** (e se a **OpenAPI** está disponível para futura automação da
  importação) ainda não foram confirmadas → ver **pendência 1**.

## 9. Divergência física × lógica (agora por design, para refeição)
- Um aluno sem direito **entra fisicamente** e o MAGBO **registra a tentativa** — para refeição
  isso é **permanente e desejado** (não há bloqueio físico; ADR-004), não uma lacuna a fechar.
- É medido pelo KPI **`divergenciaHoje`** (`auth_result=SUCCESS` **E**
  `authorization_result=DENIED`). Deixa de ser "quanto o HCP ainda não cobre" e passa a ser
  **carga de exceção do operador**. **A direção precisa saber e aceitar isso** para o piloto.

---

## Pendências finais com o Fabiano / bancada (pauta curta)
Só estes 6 pontos ainda dependem de informação externa:

1. **Versão/licença do HCP** — qual versão, e a **OpenAPI está disponível**? `[A DEFINIR COM FABIANO]`
2. **Auto-apply e propagação real** — o *Apply to Device* é **automático ou manual** e qual o
   **tempo de propagação realmente observado** (incremental e lote com fotos)? `[A DEFINIR COM FABIANO]`
3. **Template exato do CSV de importação do HCP** — baixar da própria tela de importação do HCP
   (colunas, encoding, separador) para o MAGBO gerar o CSV compatível (F7b). `[A DEFINIR COM FABIANO]`
4. **Profundidade do buffer de reenvio da Écoute HTTP** — por quantos eventos/tempo o terminal
   enfileira com o MAGBO fora (medir na bancada ou confirmar com o Fabiano). `[A DEFINIR COM FABIANO]`
5. **Reconferir o painel do HCP** — a "**1 porta em anomalia**" e os "**34 pendentes**" (números
   do print de 08/07) ainda existem? `[A DEFINIR COM FABIANO]`
6. **Confirmação das reservas de IP pelo SI** — foram executadas? Quais IPs (terminais + VM)
   ficaram fixos? `[A DEFINIR COM FABIANO]`

## Checklist antes do piloto
- [ ] Direção importou a **lista de autorizados em lote** no MAGBO (pré-requisito do
      `meal-pending=DENY`).
- [ ] **Operador** definido e treinado no feed de negadas + registro manual de exceção.
- [ ] Provisionamento de pessoas no HCP com **0 falhas** de aplicação (*Apply to Device*).
- [ ] Identificar as **3 pessoas sem credencial facial** (1194/1197).
- [ ] Fechar as **6 pendências** acima.
- [ ] Confirmar com a **direção** a aceitação da divergência da §9 durante o piloto.
- [ ] Reservas de IP executadas (ou rotina de conferência de IP em toda sessão até lá).
