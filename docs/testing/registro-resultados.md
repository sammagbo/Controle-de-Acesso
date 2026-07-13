# Registro de resultados — 13/07/2026
Preencher status: PASSOU / FALHOU / BLOQUEADO / NÃO APLICÁVEL. Evidência = caminho do arquivo.

| ID | Status | Evidência | Observações |
|---|---|---|---|
| PREP-01..11 |  |  |  |
| CANT-01 | PASSOU | payloads/CANT-01-log.txt | REFEI1/ENTRADA/flag=null/fallback=false |
| CANT-02 | PASSOU | sql/CANT-02-baseline-dedup.txt | uma passada gerou 2 eventos sub75 (~1s) = 2 registros; baseline do F5c |
| CANT-03 | PASSOU | sql/CANT-03-meals.txt | 3 entradas no banco mas /refectory/meals retorna 1 refeição (pareia 1a entrada) |
| CANT-04 | PASSOU | sql/CANT-04-fora-horario.txt | turma TESTE (seg='N') → flag FORA_HORARIO, registro SALVO, porta liberada (observacional). KPI blockedToday=1 sem bloqueio real → evidência do rename p/ alertasHoje |
| CANT-05 | PASSOU | payloads/CANT-05-desconhecido.txt | cartão 3478915054 no id 8888888 (inexistente no MAGBO) → F5b ignora 3x (sub 75 e sub 1), nenhum AccessLog. Cartão usa sub 75 igual à face |
| CANT-06 |  |  | comportamento inativo: (não executado) |
| CANT-08 |  |  | (não executado — PIN bloqueado pela plataforma no terminal) |
| CANT-09 | PASSOU | payloads/CANT-09-negado-sub8.txt | ACHADO CRÍTICO: validade expirada → terminal NEGA → envia sub 8 COM employeeNoString → backend grava REFEI1/ENTRADA como válido (refeição falsa). Motiva o F5d. Registro falso apagado manualmente |
| CANT-10/11/13/14/15 |  |  |  |
| CANT-12 | BLOQUEADO | — | aguarda 4 terminais |
| BIBL-01..07 |  |  |  |
| PORT-01..03 |  |  |  |
| PORT-04 | BLOQUEADO | — | VLAN/VM |
| PORT-05 |  |  | retorno Fabiano |
| FALH-01..11 |  |  | FALH-02: evento perdido? ____ |

**Achados novos do dia:** 
**Decisões a levar pro Claude:** 
