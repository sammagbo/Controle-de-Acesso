# Skill: Atualização de documentação

Gatilhos: commit funcional novo, mudança de endpoint/tabela/env var, gotcha novo vivido.
1. Identificar docs afetadas: CLAUDE.md (estado/gotchas), rules da área, docs/architecture/endpoints|banco|fluxos, docs/implantacao (quando commitada).
2. Editar de forma cirúrgica; datas ISO; nunca inserir segredos.
3. Divergência doc×código SEMPRE resolve a favor do código + nota no relatório (seção 11).
4. Commit separado `docs(...):` com OK do Sam.
