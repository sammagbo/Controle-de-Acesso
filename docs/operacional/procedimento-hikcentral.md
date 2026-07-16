# Procedimento Operacional — Bloqueio Físico via HikCentral

**Status:** RASCUNHO — depende de decisões operacionais do Fabiano (SI) e da direção.
**Base:** especificação técnica §16. **Data:** 2026-07-16.

> ⚠️ Este **não é um documento de código** — é um procedimento operacional. Os pontos marcados
> **`[A DEFINIR COM FABIANO]`** dependem de informação que **ainda não temos** e **não podem ser
> inventados**. São a pauta obrigatória da reunião com o Fabiano antes do piloto.

## Por que este documento existe
O MAGBO é **observacional**: ele registra e mede, mas **não fecha porta** (ver
`docs/architecture/decisoes/ADR-003-webhook-pos-evento.md`). O **único** bloqueio físico real
está no lado do dispositivo — o **HikCentral** distribui *access levels* / *schedules* para os
terminais. Este procedimento descreve como a escola opera esse bloqueio, usando o MAGBO como
**fonte da lista de autorizados**.

## Fatos conhecidos (contexto para a reunião)
- HikCentral (HCP) vive em **`192.168.1.90`** (VLAN 192.168.1.x).
- **1 controlador com porta em anomalia** e **34 pessoas pendentes de envio** — observado no
  painel do HCP em **2026-07-08**. **Pauta obrigatória** (spec §17-R3): resolver antes do piloto.
- **1194 credenciais faciais** já distribuídas de **1197 pessoas** (3 faltando — verificar quem).
- Caminho de export do MAGBO (lista de autorizados à refeição):
  `GET /api/admin/meal-entitlements?status=AUTHORIZED` → exportação para CSV **pela tela de
  gestão da cantina** (`MealEntitlementManagement`, botão exportar) → importação no HikCentral.
  > Nota (código vence a doc): o endpoint devolve **JSON paginado**; a geração do **CSV é feita
  > no frontend**. Não existe endpoint de CSV no backend.

---

## 1. Quem cria os grupos / níveis de acesso
- **Responsável:** `[A DEFINIR COM FABIANO]` (Fabiano/SI ou Vie Scolaire?).
- **Nomenclatura dos grupos:** sugestão `CANTINA-AUTORIZADOS`, `SAIDA-AUTORIZADOS` — confirmar
  padrão com o Fabiano: `[A DEFINIR COM FABIANO]`.
- **A quais terminais cada grupo se aplica** (REFEI* para cantina; PORT* para saída):
  `[A DEFINIR COM FABIANO]`.

## 2. Como alunos autorizados são incluídos
1. No MAGBO: gerar a lista `status=AUTHORIZED` (caminho de export acima).
2. Importar o CSV no HikCentral e atribuir as pessoas ao *access level* dos terminais REFEI*.
- **Formato de CSV que o HikCentral aceita na importação** (colunas, encoding, separador):
  `[A DEFINIR COM FABIANO]`.
- **Quem executa a importação e com que login no HCP:** `[A DEFINIR COM FABIANO]`.

## 3. Como alunos são removidos
- Mesma via da inclusão, retirando a pessoa do *access level* (nunca apagar a pessoa do HCP).
- **Periodicidade da sincronização** (diária? semanal? sob demanda?): `[A DEFINIR COM FABIANO]`.
- **Gatilho** (mudança de `NOT_AUTHORIZED` no MAGBO dispara remoção manual? em lote?):
  `[A DEFINIR COM FABIANO]`.

## 4. Como os terminais recebem a atualização
- O HikCentral distribui credenciais/níveis aos terminais.
- **Tempo de propagação** até o terminal e **se exige ação manual** ("Aplicar"/"Sincronizar"
  no HCP): `[A DEFINIR COM FABIANO]`.
- **Comportamento durante a distribuição** (o terminal fica indisponível? enfileira?):
  `[A DEFINIR COM FABIANO]`.

## 5. Como validar a sincronização
- Conferir no HCP o número de **"pessoas pendentes de envio"** (hoje **34** — tem de zerar) e o
  **controlador em anomalia** (hoje **1** — tem de ser resolvido).
- Teste físico com **aluno de teste**: autorizar no MAGBO → sincronizar → o terminal aceita;
  remover → sincronizar → o terminal recusa.
- **Onde exatamente no HCP se lê o "pendentes de envio"** e qual o critério de "sincronizado":
  `[A DEFINIR COM FABIANO]`.

## 6. Como funciona offline
- O terminal **autentica localmente** com as credenciais já distribuídas — **é isso que faz o
  almoço/portão continuarem funcionando se a rede ou a VM cair.** Propriedade **desejada**, não
  falha (ver ADR-003).
- **Por quanto tempo o terminal opera sem contato com o HCP** e se há expiração local de
  credenciais: `[A DEFINIR COM FABIANO]`.

## 7. Rollback
- Reverter o *access level* no HCP → os alunos voltam a ser aceitos pelo terminal; o MAGBO
  **continua registrando** (observacional), sem perda de dados.
- **Procedimento e responsável pelo rollback no HCP:** `[A DEFINIR COM FABIANO]`.

## 8. Divergência física × lógica
- Enquanto o bloqueio físico via HikCentral **não** estiver ativo, um aluno `MEAL_NOT_ENTITLED`
  (ou `EXIT_NOT_AUTHORIZED`) **entra/sai fisicamente** e o MAGBO apenas **registra a tentativa**.
- Isso é **esperado e mensurável** pelo KPI **`divergenciaHoje`** (`auth_result=SUCCESS` **E**
  `authorization_result=DENIED`). **A direção da escola precisa saber e aceitar isso** antes do
  piloto — é a medida de quanto o bloqueio via HCP ainda não cobre.

---

## Pauta consolidada para a reunião com o Fabiano
- [ ] Resolver **1 controlador em anomalia** + **34 pendentes de envio** (2026-07-08).
- [ ] Identificar as **3 pessoas sem credencial facial** (1194/1197).
- [ ] Fechar todos os `[A DEFINIR COM FABIANO]` acima (grupos, CSV, propagação, validação,
      offline, rollback).
- [ ] Confirmar com a **direção** a aceitação da divergência da seção 8 durante o piloto.
