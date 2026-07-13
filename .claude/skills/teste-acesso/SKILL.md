# Skill: Teste de acesso (manual e simulado)

**Manual via API** (simula operador/setor sem hardware):
```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/access -Headers $h -ContentType "application/json" -Body '{"userId":"9999999","pointId":"BIBLIO","action":"SAIDA"}'
```
(Requer JWT; valida setor do operador; NÃO aplica flags de janela — inconsistência I1 conhecida.)

**Webhook simulado (câmera DeepinView / JSON puro):**
```powershell
Invoke-WebRequest -Method Post -Uri "http://localhost:8080/api/hikvision/webhook?token=$env:MAGBO_WEBHOOK_TOKEN" -ContentType "application/json" -Body '{"EventNotificationAlert":{"ipAddress":"192.168.1.167","AccessControllerEvent":{"employeeNoString":"9999999","majorEventType":5,"subEventType":75}}}'
```
Conferência no banco:
```powershell
docker exec magbo-postgres psql -U magbo -d magbodb -c "SELECT * FROM access_logs ORDER BY timestamp DESC LIMIT 10;"
```
