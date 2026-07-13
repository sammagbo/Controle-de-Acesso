# Skill: Auditoria do projeto

1. `git pull` + `git log --oneline -5` (base real).
2. Diff contra o último relatório: `docs/architecture/relatorio-auditoria-*.md`.
3. Varredura: endpoints (`grep -rn 'Mapping("' controllers/`), modelos/colunas novas, properties, compose, index.html scripts, pendências (grep TODO/FIXME).
4. Reconciliar: pendências resolvidas? novas dívidas? riscos R1-R7 mudaram?
5. Atualizar o relatório com data nova (não sobrescrever o antigo) + CLAUDE.md §Estado atual.
