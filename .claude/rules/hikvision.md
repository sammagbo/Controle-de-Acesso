# Regras — Integração Hikvision

- **Terminais MinMoe (DS-K1T344MX)**: enviam `multipart/form-data` (boundary MIME_boundary) com part `AccessControllerEvent` (JSON) + part `Picture` (jpeg ~25-46KB). Sem doorNo em eventos de autenticação; campo é `cardReaderNo` (não mapeado). heartbeat a cada ~30s. **Enfileiram e reenviam** eventos quando o destino cai (observado 2x).
- **Câmeras DeepinView (portaria .167/.166)**: JSON puro `EventNotificationAlert` — schema distinto, payload real AINDA NÃO capturado.
- Eventos observados (fw V4.13.0): major 5 / sub **75** = face autenticada (tem employeeNoString) · sub **21/22** = porta abriu/fechou (sem pessoa) · sub **8** = evento com identidade do admin local (semântica não confirmada — F5d) · `heartBeat`.
- Endpoints: `POST /api/hikvision/webhook` (produção, token header OU `?token=`) · `POST /api/hikvision/webhook/capture` (descoberta: loga headers/corpo/parts, NÃO persiste).
- Resolução de ponto: `door_mappings` por (doorNo,readerNo,IP) com fallback **findIpOnlyMatch** (exige `door_no IS NULL` e `ativo=true`); sem match → legado PORT1+ENTRADA `fallback=true`.
- Config no aparelho: Configuration → Réseau → Service réseau → **Écoute HTTP** (IP do backend, porta 8080, URL com `?token=`, HTTP). Aparelho local: fuso de fábrica **GMT+8** — corrigir p/ GMT-3 e reacertar hora (senão "autenticação expirada").
- Regra de bancada: **nunca** resetar/limpar aparelho da escola; só ADICIONAR usuário de teste e remover no fim. Admin local do aparelho não deve ter face cadastrada (gera eventos-ruído id=1).
- Payload dateTime carrega o fuso do aparelho; backend usa `LocalDateTime.now()` do servidor para o log (não o dateTime do payload).
