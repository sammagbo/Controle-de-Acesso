# Regras — Integração Hikvision

- **Terminais MinMoe (DS-K1T344MX)**: enviam `multipart/form-data` (boundary MIME_boundary) com part `AccessControllerEvent` (JSON) + part `Picture` (jpeg ~25-46KB). Sem doorNo em eventos de autenticação; campo é `cardReaderNo` (não mapeado). heartbeat a cada ~30s. **Enfileiram e reenviam** eventos quando o destino cai (observado 2x).
- **Câmeras DeepinView (portaria .167/.166)**: JSON puro `EventNotificationAlert` — schema distinto, payload real AINDA NÃO capturado.
- **Tabela de subEventTypes (fw V4.13.0, confirmada com hardware em 13/07/2026):**
  - **75** = autenticação APROVADA — vale para face E cartão (não distinguíveis por subtipo); traz employeeNoString. Único que hoje vira AccessLog.
  - **8** = autenticação NEGADA/expirada — ⚠️ TAMBÉM traz employeeNoString e hoje é gravado como entrada válida (registro falso). É a lacuna que o F5d fecha: whitelist deve aceitar 75 e IGNORAR 8. Confirmado colocando validade da pessoa no passado → terminal nega por voz → evento sub 8 chega mesmo assim.
  - **1** = verificação/leitura de cartão (observado em cadastro só-cartão).
  - **9** = evento de dispositivo (sem pessoa).
  - **21/22** = porta abriu / fechou (sem pessoa).
  - **major 1/2/3** com subs 1024/1028/1031/39/80/112 = eventos de boot/config do terminal (burst na inicialização).
- Implicação para o F5d: filtrar por subEventType **não basta** para distinguir face de cartão (ambos 75); se essa distinção for necessária no futuro, exigirá outro campo do payload.
- Endpoints: `POST /api/hikvision/webhook` (produção, token header OU `?token=`) · `POST /api/hikvision/webhook/capture` (descoberta: loga headers/corpo/parts, NÃO persiste).
- Resolução de ponto: `door_mappings` por (doorNo,readerNo,IP) com fallback **findIpOnlyMatch** (exige `door_no IS NULL` e `ativo=true`); sem match → legado PORT1+ENTRADA `fallback=true`.
- Config no aparelho: Configuration → Réseau → Service réseau → **Écoute HTTP** (IP do backend, porta 8080, URL com `?token=`, HTTP). Aparelho local: fuso de fábrica **GMT+8** — corrigir p/ GMT-3 e reacertar hora (senão "autenticação expirada").
- Regra de bancada: **nunca** resetar/limpar aparelho da escola; só ADICIONAR usuário de teste e remover no fim. Admin local do aparelho não deve ter face cadastrada (gera eventos-ruído id=1).
- Payload dateTime carrega o fuso do aparelho; backend usa `LocalDateTime.now()` do servidor para o log (não o dateTime do payload).
