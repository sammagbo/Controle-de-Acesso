# Regras — Backend (Spring Boot)

- Pacote raiz `com.magbo.access`; camadas: controllers / services / repositories / models / dto / config / security / bootstrap.
- Lombok em tudo (`@RequiredArgsConstructor`, `@Builder`); injeção por construtor. Naming físico: CamelCase→snake_case.
- IDs de pessoas são **String** (Pronote, 7 dígitos com zeros à esquerda). `hikvision_employee_id` = mesmo id (unique).
- Datas: `LocalDateTime` local (BRT), banco `timestamp without time zone`. **Nunca** setar `hibernate.jdbc.time_zone`. Jackson tz America/Sao_Paulo.
- Flags de negócio: String livre (≤32) em `access_logs.flag`. Existentes: `FORA_HORARIO`, `EXCEDEU_TEMPO`. Novas flags: aditivas, nomes UPPER_SNAKE.
- Regras de janela: só no webhook (acesso manual NÃO valida janela — inconsistência conhecida I1, decidir antes de "corrigir").
- Segurança: JWT stateless; permitAll apenas login/health/webhooks/h2-console. Autorização por área via `@PreAuthorize("@areaSecurity.can('...')")` + `SystemUser.canOperateSector`. Comparações de segredo: `MessageDigest.isEqual`.
- Webhook: deny-by-default (token ausente na config = 503/rejeita). Token via header `X-MAGBO-WEBHOOK-TOKEN` OU `?token=`. Parse tolerante multipart/JSON em `parsePayload` (F6b) — não regredir.
- Novos endpoints admin: prefixo `/api/admin/...` + `hasRole('ADMIN')`.
- Sem testes automatizados hoje (D2): mudanças validam por bench/curl documentado no plano de testes.
