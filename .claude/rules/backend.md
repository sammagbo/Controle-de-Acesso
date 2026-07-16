# Regras — Backend (Spring Boot)

- Pacote raiz `com.magbo.access`; camadas: controllers / services / repositories / models / dto / config / security / bootstrap.
- Lombok em tudo (`@RequiredArgsConstructor`, `@Builder`); injeção por construtor. Naming físico: CamelCase→snake_case.
- IDs de pessoas são **String** (Pronote, 7 dígitos com zeros à esquerda). `hikvision_employee_id` = mesmo id (unique).
- Datas: `LocalDateTime` local (BRT), banco `timestamp without time zone`. **Nunca** setar `hibernate.jdbc.time_zone`. Jackson tz America/Sao_Paulo.
- Flags de negócio: String livre (≤32) em `access_logs.flag`. Existentes: `FORA_HORARIO`, `EXCEDEU_TEMPO`. Novas flags: aditivas, nomes UPPER_SNAKE.
- Regras de janela: só no webhook (acesso manual NÃO valida janela — inconsistência conhecida I1, decidir antes de "corrigir").
- Segurança: JWT stateless; permitAll apenas login/health/webhooks/h2-console. Autorização por área via `@PreAuthorize("@areaSecurity.can('...')")` + `SystemUser.canOperateSector`. Comparações de segredo: `MessageDigest.isEqual`.
- Webhook: deny-by-default (token ausente na config = 503/rejeita). Token via header `X-MAGBO-WEBHOOK-TOKEN` OU `?token=`. Parse tolerante multipart/JSON em `parsePayload` (F6b) — não regredir.
- Novos endpoints admin: prefixo `/api/admin/...`. Escrita sensível: `hasRole('ADMIN') OR @areaSecurity.hasPermission('...')`; leitura por área: `@areaSecurity.can('...')`.
- **Testes automatizados existem (Fase I):** `mvn test` → 183 testes (7 unitários + 17 ITs). O `pom.xml` tem `maven-surefire-plugin` com `<include>**/*IT.java` — **sem isso os ITs são pulados em silêncio** (convenção: Surefire ignora `*IT`). Mudanças ainda validam também por bench/curl (plano de testes). 2 nativas PostgreSQL-only ficam `@Disabled` (H2) → conferência manual (V13).

## Camada de decisão (Fases A–E) — taxonomia e regras
- **`access_logs` = acesso efetivo/autorizado · `access_attempts` = tentativa negada.** `access_logs` **nunca** recebe evento negado (ADR-001). Nenhuma query existente de `access_logs` pode mudar de resultado.
- **4 eixos** em `access_attempts`: `auth_method` (método FACE/CARD/UNKNOWN) · `auth_result` (decisão do **terminal**) · `authorization_result` (decisão do **MAGBO**) · `denial_reason` (motivo). `access_logs` **não** ganha esses campos — estar lá já significa SUCCESS.
- **Serviços novos** (`services`): `HikvisionEventClassifier` (subtipo→método/resultado, puro) · `DeduplicationService` (janela configurável) · `MealEntitlementService` (avalia direito + CRUD/histórico transacional) · `ExitPermissionService` (avalia saída + revoke + consumo SINGLE) · `AccessAttemptService` (`record(...)`) · `AccessDecisionService` (**orquestrador** `@Transactional` — única classe que conhece a ordem das regras).
- **Ordem OBRIGATÓRIA das regras da cantina** (a 1ª que decidir DENY encerra): **dedup → entitlement → janela de horário**. Só `action=ENTRADA` em REFEI*/CANTINA*; SAIDA mantém a lógica atual (`validateExitTime`/`EXCEDEU_TEMPO`).
- **Regra de ouro da refatoração:** `validateEntryWindow`/`validateExitTime`/`getLunchTimeForDay`/`parseHour` movidos **sem alterar lógica**. Mudança de comportamento aí = bug.
- **Políticas por properties** (`PolicyProperties`, prefix `magbo.policy` + `magbo.dedup`): OBSERVATION grava log+attempt; DENY grava só attempt. Alternar sem recompilar.
- **Dívidas conhecidas congeladas (NÃO corrigir sem decisão):** `DEVICE_DENIED` usado p/ subtipo desconhecido (falta `UNKNOWN_EVENT`); `@PreAuthorize` sem token → 403 (não 401). **Corrigidas na B.1 (`e450cd3`, 16/07):** `summary()` agora usa `UserType.ALUNO` e responde 200 (`MealEntitlementFlowIT#summaryRetornaContagensCorretas`); guard do webhook usa `isBlank()`.
