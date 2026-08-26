-- =====================================================================
-- R021 — desfaz V021 (creneaux de cantine)
-- =====================================================================
-- ⚠️ ISTO APAGA A CONFIGURACAO DO PLANNING. Os creneaux, as afetacoes por
-- turma e as excecoes por aluno desaparecem. Nao ha copia noutro sitio:
-- `class_schedules` continua onde estava, mas ele NAO tem o planning novo —
-- tem a grade velha, a de 2025, que foi a razao dos 63 OUTSIDE_MEAL_TIME.
-- Recuperar exige o `pg_dump` anterior, ou reaplicar V021 + o seed V023.
--
-- ⚠️ E O BACKEND NOVO NAO SOBREVIVE A ISTO. `MealSlotService` consulta estas
-- tabelas em cada passagem do refeitorio. A ordem e: derrubar o backend,
-- voltar o jar ANTERIOR (que ainda le `class_schedules`), e so entao correr
-- este ficheiro. Com o jar novo no ar, toda passagem de cantina estoura.
--
-- ⚠️ NENHUMA PASSAGEM se perde: `access_logs` nao e tocado. O que volta e a
-- regra de janela antiga — a do `class_schedules`, com os defeitos que ela ja
-- tinha. Voltar atras aqui e voltar ao problema, nao a um estado neutro.
--
-- Uso legitimo: a V021 foi aplicada no ambiente errado, ou a funcionalidade e
-- revertida por inteiro.
-- =====================================================================

BEGIN;

-- As duas filhas caem por CASCADE, mas o DROP explicito cobre quem tiver
-- aplicado a V021 pela metade.
DROP TABLE IF EXISTS meal_slot_students;
DROP TABLE IF EXISTS meal_slot_classes;
DROP TABLE IF EXISTS meal_slots;

COMMIT;

-- Conferencia:  SELECT to_regclass('meal_slots');   -> NULL
-- ⚠️ Com o backend NOVO ainda no ar, o `ddl-auto=update` recria as tabelas no
-- proximo boot — VAZIAS, e com o schema escrito pelo Hibernate em vez de pelo
-- procedimento. E a divergencia que a V017 existiu para fechar. Confirmar que
-- o jar antigo esta a correr ANTES de dar isto por concluido.
