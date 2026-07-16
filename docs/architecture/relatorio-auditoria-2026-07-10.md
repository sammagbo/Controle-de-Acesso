# Relatório de Auditoria — 2026-07-10 (main @ 0f655b4)

Legenda: [IMPL]=implementado · [VAL]=validado · [NVH]=não validado com hardware · [PARC]=parcial · [PEND]=pendente · [BLOQ]=bloqueador · [OPC]=opcional

## 1. Estrutura real
Monorepo: `backend/` (Spring Boot, 40 classes), raiz = app Electron (`main.js`, `index.html`, `js/` ~25 componentes + módulo `js/cdi/`), `deploy/` (compose canônico + scripts), `docs/` (2 guias + screenshots), `scripts/convert_pronote.py`, `video/` (Remotion, demo comercial), `test-*.js` (scripts manuais de dev), `libs/xlsx.min.js`. Sem `.github/`, sem testes automatizados, sem CLAUDE.md prévio.

## 2. Fluxo evento Hikvision — [VAL] hardware 10/07
Ver docs/architecture/fluxos.md §1. Comprovado: multipart+Picture, token ?token=, IP-only mapping, F5b, resiliência de fila do aparelho (2 reentregas observadas), REFEI1/fallback=false.

## 3. Fluxo acesso manual — [IMPL]/[NVH nesta fase]
POST /api/access com autorização por setor. **Não aplica** validateEntryWindow/ExitTime (ver I1).

## 4. Fluxo frontend→banco — [IMPL][VAL em uso diário]
fluxos.md §3. Busca backend-driven consolidada (userCache + eventos); mockData removido; branch feat/backend-driven-search absorvida e apagada (pendências antigas RESOLVIDAS).

## 5. Regras implementadas
[VAL] Janela cantina no webhook (Lycée fixo 11–15h; turmas via class_schedules; 'N'→FORA_HORARIO; flag=null observado p/ turma sem horário). [IMPL] EXCEDEU_TEMPO (>1h) na SAIDA. [IMPL] Enfermaria longStay>30min (relatório). [VAL] F5b ignore sem correspondência. [VAL] Webhook deny-by-default + lockout PIN. [IMPL] Autorização por setor (manual).

## 6. Parciais
[PARC] Pronote via API (stub; só CSV ativo). [PARC] docs/implantacao (23 docs auditados, zip fora do repo — desatualizados quanto ao F6b). [PARC] Portaria: câmeras online no HCP, payload real não capturado, VLAN isola PC. [PEND] F5c dedupe · F5d classificação (sub 8 sem semântica confirmada) · flags refinadas + política + rename KPI.

## 7. Mortas / não utilizadas
`meal_count` (nunca incrementado — contagem deriva de logs) · `data.sql` em prod (sintaxe H2, falha silenciosa) · `PointType` enum sem uso efetivo no fluxo · `test-*.js` raiz (dev, manter fora do build) · REFEI2/PORT2/PORT3/ENFERM sem hardware (pontos previstos, ok).

## 8. Inconsistências
**I1** Acesso manual não gera flags de janela (refeição manual nunca é FORA_HORARIO) — decidir: aplicar regra ou documentar como isenção de operador. **I2** KPI `blockedToday` conta flags, nada é bloqueado (rename decidido). **I3** `ACCESS_POINTS` (front) × `AreaMapping` (back) duplicados por design — exige alteração casada. **I4** Compose deploy usa `SPRING_DATASOURCE_*`; runbook do PC usa `MAGBO_DB_*` (ambos válidos; documentado). **I5** Compose da raiz (legado) ainda presente — remover/renomear é decisão pendente do Sam.

## 9. Riscos
**R1 [BLOQ p/ piloto]** Frontend depende de CDNs (React/Tailwind/Babel/lucide/jspdf) — kiosk offline não renderiza. Ação: vendorizar em `libs/`. **R2 [RESOLVIDO 2026-07-16]** String com padrão de senha exposta como e-mail de autor (valor omitido deste registro). Verificação de 16/07: os 135 commits do `main` têm autor limpo (`--no-use-mailmap`); as 3 ocorrências viviam apenas no branch `gh-pages` (demo abandonada de 24/02, sem relação com o `main`), removido do remoto. Senha **rotacionada** nos serviços onde era usada. `.mailmap` limpo. Nenhuma reescrita de histórico do `main` foi necessária — o `filter-repo` foi avaliado e descartado como desproporcional. **R3** IPs por DHCP (PC e terminal) — 3 trocas em 3 dias; pedir reservas ao SI. **R4** Defaults inseguros sem env: ADMIN_PIN=1234 (sem WARN de startup — melhoria M2), admin/admin1234, JWT dev. Cobertos parcialmente por WARNs. **R5** ddl-auto não relaxa constraints (precedente door_no). **R6** CORS `*`+credentials (aceitável interno; revisar na VM). **R7** Zero testes automatizados — regressões dependem de bench manual.

## 10. Dívida técnica
**D1** Dupla camada HTTP no front (`js/api.js` + `js/utils/api.js`). **D2** Sem testes (unit/integration). **D3** GeneralReport.js monolítico (1.172 linhas). **D4** docs/implantacao fora do repo. **D5** Compose legado na raiz. **D6** SimpleCrypto XOR no CDI (baixo impacto, local).

## 11. Documentação × código
README/DEPLOYMENT anteriores ao F6b: **não mencionam** parse multipart nem `?token=` no webhook de produção (docs falam token só por header) → atualizar junto do commit da docs/implantacao. Handoff 07/07 divergia do main em 2 pontos hoje resolvidos (branch absorvida; mockData removido).

## 12. Endpoints reais → docs/architecture/endpoints.md
## 13. Tabelas/colunas → docs/architecture/banco-de-dados.md
## 14. Variáveis de ambiente
Backend: MAGBO_DB_URL/USERNAME/PASSWORD · MAGBO_WEBHOOK_TOKEN · MAGBO_JWT_SECRET · ADMIN_PIN · SERVER_PORT · SPRING_PROFILES_ACTIVE (+SPRING_DATASOURCE_* no compose). Electron: MAGBO_API_URL · MAGBO_SECTOR · MAGBO_KIOSK_PIN · NODE_ENV. Deploy .env: POSTGRES_DB/USER/PASSWORD + os MAGBO_*.

## 15. Estado dos testes
Automatizados: inexistentes. Bench: T0–T7 **PASSOU** (07–10/07, evidências nos logs das conversas; commit testado 0f655b4). T8: agendado 13/07 (plano dedicado). Smoke VM: roteiro existe (deploy/smoke-tests.md), nunca executado [PEND].

## 16. Próximos passos (ordem recomendada)
1. **Seg 13/07:** plano de testes (baseline T8 incluído) → evidências.
2. F5c dedupe (janela configurável, service-only) → bench → commit.
3. F5d whitelist de subtipos (usar dados do bloco de negação do dia 13).
4. Flags refinadas + política em properties + rename blockedToday.
5. Commit docs/implantacao atualizada (F6b) + este pacote de contexto.
6. Infra: reservas DHCP (SI) · vendorizar CDNs (R1) · confirmar R2.
7. VM: deploy + migração + smoke → provisioning cantina (4 mappings) quando terminais chegarem.
