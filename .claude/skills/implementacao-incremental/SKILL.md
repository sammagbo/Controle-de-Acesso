# Skill: Implementação incremental (o método do projeto)

1. UMA mudança por ciclo. Definir critério de validação ANTES do patch.
2. Ler o arquivo real atual (main sincronizado) → âncoras únicas.
3. Patch ORIGINAL/NOVO literal. Âncora ausente/duplicada = PARAR.
4. Aplicar (Sam/Claude Code) → restart backend → validar pelo critério (log/curl/bench).
5. Só então propor commit (mensagem em inglês, prefixo feat/fix/docs + escopo) e AGUARDAR OK explícito do Sam.
6. Atualizar docs afetadas (skill atualizar-docs) no mesmo ciclo ou registrar pendência.
Proibido: mudar regra de negócio junto com refactor; commits em lote; alterar schema de forma não-aditiva.
