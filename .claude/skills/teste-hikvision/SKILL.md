# Skill: Teste de terminal Hikvision (bancada)

Quando usar: validar terminal→backend após qualquer mudança (código, rede, aparelho).

1. `docker ps` → `magbo-postgres` Up (senão: parar `magbo-db`, subir o certo).
2. Backend com as 4 env vars (CLAUDE.md §Gotchas #2) → health `"database":"CONNECTED"`.
3. `ipconfig` (IP do PC) + IP no display do terminal. Se mudaram: atualizar Écoute HTTP no aparelho e/ou `door_mappings.terminal_ip` (skill door-mapping).
4. Usuário de teste 9999999 existe? `docker exec magbo-postgres psql -U magbo -d magbodb -c "SELECT id,ativo FROM app_users WHERE id='9999999';"`
5. Rosto no terminal → log deve mostrar `Resolved by terminalIp=... -> pointId=..., action=...` + `Access Log: user=9999999 ... fallback=false`.
6. Falhou? → skill troubleshooting (árvore IP/firewall/token/mapping).
Regra: nunca resetar o aparelho; só adicionar/remover o usuário de teste.
