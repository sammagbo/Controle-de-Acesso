# Regras — Integração Hikvision

- **Terminais MinMoe (DS-K1T344MX)**: enviam `multipart/form-data` (boundary MIME_boundary) com part `AccessControllerEvent` (JSON) + part `Picture` (jpeg ~25-46KB). Sem doorNo em eventos de autenticação; campo é `cardReaderNo` (não mapeado). heartbeat a cada ~30s. **Enfileiram e reenviam** eventos quando o destino cai (observado 2x).
- **Câmeras DeepinView (portaria .167/.166)**: JSON puro `EventNotificationAlert` — schema distinto, payload real AINDA NÃO capturado.
- **Tabela de subEventTypes (fw V4.13.0, confirmada com hardware em 13/07/2026):**
  - **75** = autenticação por **FACE** APROVADA; traz employeeNoString. Gera AccessLog com `auth_method=FACE` (whitelist).
  - **8** = autenticação NEGADA/expirada — TAMBÉM traz employeeNoString. **Lacuna FECHADA (Fase B):** a whitelist aceita 75/1 e IGNORA 8 → sub 8 vira `access_attempts` (`DEVICE_DENIED`), **não** AccessLog. Confirmado colocando validade da pessoa no passado → terminal nega por voz → evento sub 8 chega mesmo assim.
  - **1** = autenticação por **CARTÃO** APROVADA (confirmado 14/07 com cartão real). Gera AccessLog com `auth_method=CARD` (whitelist).
  - **9** = evento de dispositivo (sem pessoa).
  - **21/22** = porta abriu / fechou (sem pessoa).
  - **major 1/2/3** com subs 1024/1028/1031/39/80/112 = eventos de boot/config do terminal (burst na inicialização).
- **Face × cartão SÃO distinguíveis** pelo subtipo: 75=FACE, 1=CARD (evidência 14/07 — corrige a leitura antiga de "ambos 75"). O que **não** se distingue é *qual* cartão: o terminal traduz o cartão para `employeeNoString` internamente e o **`cardNo` nunca chega ao payload** (ADR-002) — por isso o MAGBO não guarda número de cartão.
- **Whitelist rígida (Fase B, `HikvisionEventClassifier`):** só `{75→FACE, 1→CARD}` são candidatos a `access_logs`; `8` → `access_attempts` (`DEVICE_DENIED`); subtipo desconhecido com employeeNoString → tentativa, **nunca** acesso; sem employeeNoString → ignorado com 200 (heartbeat, 21/22, 9, boot). `auth_method` é gravado em `access_logs` (F1). ⚠️ dívida congelada: subtipo desconhecido usa `DEVICE_DENIED` (falta `UNKNOWN_EVENT` no enum).
- Endpoints: `POST /api/hikvision/webhook` (produção, token header OU `?token=`) · `POST /api/hikvision/webhook/capture` (descoberta: loga headers/corpo/parts, NÃO persiste).
- Resolução de ponto: `door_mappings` por (doorNo,readerNo,IP) com fallback **findIpOnlyMatch** (exige `door_no IS NULL` e `ativo=true`); sem match → legado PORT1+ENTRADA `fallback=true`.
- Config no aparelho: Configuration → Réseau → Service réseau → **Écoute HTTP** (IP do backend, porta 8080, URL com `?token=`, HTTP). Aparelho local: fuso de fábrica **GMT+8** — corrigir p/ GMT-3 e reacertar hora (senão "autenticação expirada").
- ⚠️ **IPs mudam via DHCP e quebram a Écoute HTTP + os `door_mappings` EM SILÊNCIO** (aconteceu em 16/07: terminal `.12`→`.10`, PC →`.9` — nenhum erro, só param de chegar/casar eventos). **Antes de QUALQUER sessão de hardware**, conferir: IP do PC (`ipconfig`), IP no display do terminal, URL da **Écoute HTTP** (aponta pro IP atual do PC?) e os `door_mappings` (o `terminal_ip` bate com o IP atual do terminal?). Reserva de IP (terminais + VM) **solicitada ao SI** pelo Fabiano (D7).
- Regra de bancada: **nunca** resetar/limpar aparelho da escola; só ADICIONAR usuário de teste e remover no fim. Admin local do aparelho não deve ter face cadastrada (gera eventos-ruído id=1).
- Payload dateTime carrega o fuso do aparelho; backend usa `LocalDateTime.now()` do servidor para o log (não o dateTime do payload).
