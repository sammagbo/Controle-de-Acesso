# Skill: Troubleshooting bench (árvore rápida)

Evento não chega no backend:
1. `ipconfig` → IP do PC mudou? → corrigir Écoute HTTP no terminal.
2. `ping <IP-terminal>` falha? → IP do terminal mudou (display) ou cabo/VLAN.
3. `netstat -an | Select-String ":8080"` durante o rosto → nada = rede/destino; conexão presente = app.
4. Firewall: regra "MAGBO Backend 8080" `Enabled=True, Profile=Any` (`Get-NetFirewallRule`).
5. Backend vivo? health CONNECTED. Container certo? gotcha docker.

Evento chega mas não vira log:
- `Payload ignored: no employeeNoString` = heartbeat/porta (normal).
- warn `sem correspondencia` = F5b (id não existe em app_users) — esperado p/ ids de teste/admin.
- `fallback=true PORT1` = door_mapping ausente/IP errado → skill door-mapping.
- 401 = token (query/header, CRLF/trim, valor do setx).
Terminal nega autenticação: relógio/fuso do aparelho (GMT-3!), validade da pessoa, modo de autenticação.
Backend não sobe: 4 env vars na MESMA sessão; porta 8080 presa (matar processo); senha do banco literal `<...>`.
