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
| S5 | Backup manual | `~/backup-magbo.sh` (na VM, como `magbo`) | Arquivo `.sql.gz` criado em `~/backups/`. ⚠️ **NÃO é `deploy/backup.sh`** — ver a nota abaixo |
| S6 | Restore test | `gunzip -c <backup>.sql.gz \| psql -U magbo magbo_test` | Restore sem erros (usar DB de teste) |
| S7 | Licença lida | `curl -s http://localhost:8080/api/health \| grep -o '"licence".*'` | `"etat":"VALIDE"`. `"motif":"ABSENTE"` = **deploy falhado** (arquivo ou montagem do volume), não um vencimento — e aí a gestão está fechada **sem cortesia** (ADR-006) |

> ⚠️ **S5 — o script que roda de verdade não é o do repositório.** O que está
> agendado na VM é `/home/magbo/backup-magbo.sh` (diário 19:00, retenção 14 dias,
> ~109 Mo por dump), e ele **não é versionado**: existe só na máquina que ele
> salva. `deploy/backup.sh` do repositório chama `pg_dump` **no host** enquanto o
> PostgreSQL roda **em container** — lançado como está, falha. Não troque um pelo
> outro. Fonte: `docs/operacional/reconstruir-do-zero.md:202-213`.
>
> 🔴 **Não há cópia fora da máquina.** Os dumps ficam na VM que eles salvam, e as
> fotos de identificação (`user_photos`) **não existem em mais lugar nenhum** —
> saem no `pg_dump` e só nele. ⚠️ **A licença NÃO sai no `pg_dump`**: ela vive num
> volume próprio em leitura-só (`./licence:/licence:ro`) e tem de ser **redepositada
> à mão** depois de uma restauração — é por isso que S7 existe.

---

## Testes do Terminal Cliente

| # | Teste | Ação | Critério de Sucesso |
|---|-------|------|---------------------|
| C1 | Abertura manual | Clicar no atalho MAGBO | App abre, header mostra setor correto |
| C2 | Indicador de conexão | Observar footer | 🟢 "Sistema Operacional" exibido |
| C3 | Auto-start no boot | Reiniciar o PC | App abre automaticamente em fullscreen após login |
| C4 | Bloqueio Alt+F4 | Pressionar Alt+F4 | Nada acontece (modo kiosk) |
| C5 | Bloqueio Ctrl+W | Pressionar Ctrl+W | Nada acontece |
| C6 | Fechar um posto travado | Ctrl+Alt+Del → Gerenciador de Tarefas → **MAGBO Access Control** → Finalizar tarefa | O app fecha. **É a única saída que existe** |
| C7 | Ctrl+Shift+Alt+Q **não faz nada** | Pressionar Ctrl+Shift+Alt+Q | **Nada acontece.** É o comportamento esperado hoje, **não é defeito** — não marcar como falha. Se aparecer um prompt de PIN, alguém ligou a saída: atualizar esta receita |

> ⚠️ **NÃO EXISTE SAÍDA DO KIOSK POR CÓDIGO.** Estas três linhas descreviam, até
> 03/09/2026, um prompt de PIN que nunca existiu: quem seguisse a receita via três
> testes falharem e concluiria que o posto estava mal instalado — ou marcaria a
> caixa sem olhar, que é o pior dos dois, porque ensina a marcar.
>
> **O que foi medido (03/09/2026):** `main.js:383` registra `Ctrl+Shift+Alt+Q` e
> emite `request-admin-pin`; `preload.js:112-123` expõe `verifyKioskPin`,
> `exitKiosk` e `onRequestAdminPin`. **Nenhum arquivo de `js/` nem o `index.html`
> os consome** (`grep -rn magboIpc` acha só `preload.js` e três documentos). Um
> `webContents.send` para um canal sem ouvinte é um **no-op silencioso** no
> Electron: nenhum erro, nenhum log, nenhuma janela. O gesto sai e se perde — e
> nada na tela diz isso, o que é exatamente o que faz o operador concluir, às 11h50
> na frente dos alunos, que o posto travou.
>
> Pelo mesmo motivo, `MAGBO_KIOSK_PIN` **não é lida por nenhuma tela** (único
> consumidor: o handler órfão `main.js:394`). Não a configure e não a anote numa
> ficha de procedimento: ela não protege nada.

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
- [ ] Modo kiosk validado (não é possível fechar a app **pela interface**; a única saída é o Gerenciador de Tarefas — ver C6/C7)
- [ ] `/api/health` mostrando `"licence":{"etat":"VALIDE"}` (S7)
- [ ] Auto-start no boot validado
- [ ] Reconexão automática validada (queda + retorno)
- [ ] 1 semana de operação em paralelo ao processo manual sem incidente bloqueante
