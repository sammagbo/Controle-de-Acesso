# Skill: Análise de payload Hikvision

Quando usar: aparelho novo, firmware novo, evento desconhecido, câmera DeepinView.

1. Apontar o aparelho para `POST /api/hikvision/webhook/capture?token=<TOKEN>` (endpoint de descoberta: loga tudo, não persiste).
2. Gerar o evento (rosto/senha/negação) e copiar o bloco `=== HIKVISION CAPTURE ===` COMO TEXTO.
3. Extrair: Content-Type (multipart? parts?), nó raiz (`AccessControllerEvent` vs `EventNotificationAlert`), `employeeNoString` (formato/zeros), `majorEventType/subEventType`, doorNo/cardReaderNo, dateTime (fuso!), serialNo.
4. Comparar com `HikvisionEventDto` e `.claude/rules/hikvision.md` (tabela de subtipos). Novo subtipo → registrar na tabela + decidir tratamento (F5d).
5. Divergência de envelope/campo → patch cirúrgico no `parsePayload`/DTO, nunca no fluxo de negócio junto.
6. Voltar o aparelho para `/api/hikvision/webhook?token=<TOKEN>` ao terminar.
