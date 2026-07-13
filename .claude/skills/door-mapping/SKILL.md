# Skill: Criar/atualizar DoorMapping

Sempre via API (nunca SQL). doorNo fica NULL para match por IP (obrigatório p/ terminais MinMoe e câmeras).

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/auth/login -ContentType "application/json" -Body '{"username":"admin","password":"<SENHA>"}'
$h = @{ Authorization = "Bearer $($login.token)" }
# criar
Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/admin/door-mappings -Headers $h -ContentType "application/json" -Body '{"terminalIp":"<IP>","pointId":"REFEI1","action":"ENTRADA","label":"<rótulo>","ativo":true}'
# atualizar IP (id conhecido)
Invoke-RestMethod -Method Put -Uri http://localhost:8080/api/admin/door-mappings/<ID> -Headers $h -ContentType "application/json" -Body '{"terminalIp":"<IP-NOVO>","pointId":"REFEI1","action":"ENTRADA","label":"<rótulo>","ativo":true}'
```
pointIds válidos: REFEI1/REFEI2 (cantine), BIBLIO (cdi), ENFERM (infirmerie), PORT1-3 (portail). DELETE = soft (ativo=false). Cantina 4 terminais: 4 linhas, mesmo pointId REFEI1, 2×ENTRADA + 2×SAIDA, labels Alto/Baixo.
