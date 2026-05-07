# MAGBO Access Control — Smoke Tests Pós-Deploy

Checklist de validação a executar após cada implantação ou atualização.

---

## Pré-condições

- [ ] Servidor central ligado e acessível na rede
- [ ] PostgreSQL rodando (`sudo systemctl status postgresql`)
- [ ] Serviço MAGBO ativo (`sudo systemctl status magbo`)
- [ ] Pelo menos 1 terminal cliente instalado e configurado

---

## Testes do Servidor

| # | Teste | Comando/Ação | Critério de Sucesso |
|---|-------|-------------|---------------------|
| S1 | Health check local | `curl http://localhost:8080/api/health` | JSON com `"status": "UP"` e `"database": "UP"` |
| S2 | Health check remoto | `curl http://<IP_SERVIDOR>:8080/api/health` | Mesma resposta que S1 |
| S3 | Listar usuários | `curl http://localhost:8080/api/users` | JSON com array `users` não vazio |
| S4 | Logs de serviço | `sudo tail -20 /var/log/magbo/application.log` | Logs recentes sem stack traces de erro |
| S5 | Backup manual | `sudo /opt/magbo/backup.sh` | Arquivo `.sql.gz` criado em `/var/backups/magbo/` |
| S6 | Restore test | `gunzip -c <backup>.sql.gz \| psql -U magbo magbo_test` | Restore sem erros (usar DB de teste) |

---

## Testes do Terminal Cliente

| # | Teste | Ação | Critério de Sucesso |
|---|-------|------|---------------------|
| C1 | Abertura manual | Clicar no atalho MAGBO | App abre, header mostra setor correto |
| C2 | Indicador de conexão | Observar footer | 🟢 "Sistema Operacional" exibido |
| C3 | Auto-start no boot | Reiniciar o PC | App abre automaticamente em fullscreen após login |
| C4 | Bloqueio Alt+F4 | Pressionar Alt+F4 | Nada acontece (modo kiosk) |
| C5 | Bloqueio Ctrl+W | Pressionar Ctrl+W | Nada acontece |
| C6 | Saída de emergência | Pressionar Ctrl+Shift+Alt+Q | Prompt de PIN aparece |
| C7 | PIN correto | Digitar PIN admin | App fecha normalmente |
| C8 | PIN incorreto | Digitar PIN errado | App permanece aberta, mensagem de erro |

---

## Testes de Rede

| # | Teste | Comando (do terminal cliente) | Critério de Sucesso |
|---|-------|------------------------------|---------------------|
| N1 | Ping servidor | `ping magbo-access.local` | Resposta sem perda |
| N2 | Porta 8080 | `Test-NetConnection -ComputerName <IP> -Port 8080` | `TcpTestSucceeded: True` |
| N3 | Health remoto | `curl http://magbo-access.local:8080/api/health` | JSON com `"status": "UP"` |

---

## Testes de Integração

| # | Teste | Ação | Critério de Sucesso |
|---|-------|------|---------------------|
| I1 | Registro de acesso | Digitar ID de aluno no terminal | Modal de acesso exibido, log registrado no servidor |
| I2 | Queda do servidor | Desligar serviço `magbo` | Terminal exibe 🔴 "Servidor Offline" em ≤ 15s |
| I3 | Reconexão | Religar serviço `magbo` | Terminal reconecta em ≤ 30s, exibe 🟢 |
| I4 | Webhook Hikvision | `curl -X POST -H "X-MAGBO-WEBHOOK-TOKEN: <token>" -H "Content-Type: application/json" -d '{"AccessControllerEvent":{"employeeNoString":"ALU001","doorNo":1,"readerNo":1}}' http://localhost:8080/api/hikvision/webhook` | `200 OK`, log registrado |
| I5 | Webhook sem token | Mesmo curl sem header token | `401 Unauthorized` (se token configurado) |

---

## Testes de Resiliência

| # | Teste | Ação | Critério de Sucesso |
|---|-------|------|---------------------|
| R1 | Reinício do servidor | `sudo systemctl restart magbo` | Serviço volta em < 30s, clientes reconectam |
| R2 | Reinício do PostgreSQL | `sudo systemctl restart postgresql` | Backend reconecta ao banco automaticamente |
| R3 | Corte de rede | Desconectar cabo do terminal | Terminal exibe offline, não trava, não fecha |
| R4 | Reconexão de rede | Reconectar cabo | Terminal volta ao normal automaticamente |

---

## Critérios de Aceite (Onda 1)

- [ ] Backend rodando 24/7 no servidor central
- [ ] PostgreSQL com backup noturno automatizado
- [ ] ≥ 1 terminal cliente operacional
- [ ] Câmeras Hikvision enviando eventos com sucesso (quando disponíveis)
- [ ] Modo kiosk validado (não é possível fechar a app)
- [ ] Auto-start no boot validado
- [ ] Reconexão automática validada (queda + retorno)
- [ ] 1 semana de operação em paralelo ao processo manual sem incidente bloqueante
