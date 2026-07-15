# MAGBO — Roteiro Oficial de Implementação (Prompts Antigravity)
**Versão:** 1.0 · **Data:** 2026-07-15 · **Base:** main @ `2a66f21`
**Documento normativo:** `docs/architecture/ESPECIFICACAO-TECNICA-v1.md`

## Antes de começar (ação do Sam, uma única vez)
1. Copiar `ESPECIFICACAO-TECNICA-v1.md` para `docs/architecture/` do repositório.
2. Copiar esta pasta de prompts para `docs/architecture/prompts/` (opcional, mas ajuda o Antigravity a se localizar).
3. Commitar (com tua autorização) — assim o Antigravity lê a spec direto do repo.

## Ordem de execução — NÃO PULAR, NÃO REORDENAR

| # | Prompt | Fase | Risco | Bloqueia? |
|---|---|---|---|---|
| 1 | `01-FASE-A-fundacao-dominio.md` | Enums, entidades, repositories, properties | Baixo | — |
| 2 | `02-FASE-B-classificacao-webhook.md` | ★ Roteamento do webhook | **ALTO** | Tudo |
| 3 | `03-FASE-C-direito-refeicao.md` | Entitlements + regra da cantina | Médio | Fase G, H |
| 4 | `04-FASE-D-autorizacao-saida.md` | Exit permissions + regra do portão | Médio | Fase H |
| 5 | `05-FASE-E-endpoints-kpis.md` | Leitura de tentativas + stats | Baixo | Fase H |
| 6 | `06-FASE-F-permissoes.md` | Permissões granulares | Baixo | — |
| 7 | `07-FASE-G-importacao-lote.md` | Bulk de entitlements | Baixo | — |
| 8 | `08-FASE-H-frontend.md` | Telas e componentes | Médio | — |
| 9 | `09-FASE-I-testes.md` | ★ Testes automatizados | **OBRIGATÓRIA** | Entrega |
| 10 | `10-FASE-J-sql-migracao.md` | SQLs versionados | Baixo | Deploy VM |
| 11 | `11-FASE-K-documentacao.md` | Docs e ADRs | Baixo | Entrega |

## Protocolo de uso de cada prompt
1. Sam cola o prompt inteiro no Antigravity.
2. Antigravity implementa a fase completa.
3. Antigravity reporta o checklist de conclusão preenchido.
4. **Sam revisa o código** (`git diff`) antes de qualquer commit.
5. Sam decide: commitar (autorizando explicitamente) ou corrigir.
6. Só então o próximo prompt.

## Invariante do roteiro
**Ao fim de cada fase o projeto deve compilar e o webhook continuar funcionando.** Se uma fase deixar o projeto quebrado, ela não está concluída — não avançar.

## Validação com hardware
Só depois da **Fase I** (testes verdes). Roteiro: seção 13.5 da especificação (V01–V14). Antes disso, não faz sentido testar no terminal — o sistema está em construção.
