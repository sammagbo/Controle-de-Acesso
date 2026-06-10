-- =====================================================================
-- SEED DE MOVIMENTO DE DEMONSTRAÇÃO — usa os 923 ALUNOS REAIS
-- 6 meses de dias úteis. SQL puro (generate_series).
-- Seguro: só mexe em access_logs. NÃO toca app_users / system_users.
-- =====================================================================

BEGIN;

DELETE FROM access_logs;

-- 1) PORTARIAS — entrada manhã + saída tarde, dias úteis, ~5% falta
INSERT INTO access_logs (user_id, point_id, action, timestamp, flag)
SELECT a.id,
    (ARRAY['PORT1','PORT2','PORT3'])[1 + (abs(hashtext(a.id || d::text)) % 3)],
    'ENTRADA',
    d + time '07:30' + (abs(hashtext(a.id || d::text || 'e')) % 60) * interval '1 minute',
    NULL
FROM app_users a
CROSS JOIN generate_series(CURRENT_DATE - 180, CURRENT_DATE, interval '1 day') AS d
WHERE a.tipo = 'ALUNO' AND extract(dow from d) BETWEEN 1 AND 5
  AND (abs(hashtext(a.id || d::text || 'abs')) % 100) >= 5;

INSERT INTO access_logs (user_id, point_id, action, timestamp, flag)
SELECT a.id,
    (ARRAY['PORT1','PORT2','PORT3'])[1 + (abs(hashtext(a.id || d::text || 's')) % 3)],
    'SAIDA',
    d + time '16:00' + (abs(hashtext(a.id || d::text || 'x')) % 120) * interval '1 minute',
    NULL
FROM app_users a
CROSS JOIN generate_series(CURRENT_DATE - 180, CURRENT_DATE, interval '1 day') AS d
WHERE a.tipo = 'ALUNO' AND extract(dow from d) BETWEEN 1 AND 5
  AND (abs(hashtext(a.id || d::text || 'abs')) % 100) >= 5;

-- 2) CANTINA — 80% almoçam, 8% fora horário
INSERT INTO access_logs (user_id, point_id, action, timestamp, flag)
SELECT a.id,
    (ARRAY['REFEI1','REFEI2'])[1 + (abs(hashtext(a.id || d::text || 'r')) % 2)],
    'ENTRADA',
    d + time '12:30' + (abs(hashtext(a.id || d::text || 'cm')) % 35) * interval '1 minute',
    CASE WHEN (abs(hashtext(a.id || d::text || 'fh')) % 100) < 8 THEN 'FORA_HORARIO' ELSE NULL END
FROM app_users a
CROSS JOIN generate_series(CURRENT_DATE - 180, CURRENT_DATE, interval '1 day') AS d
WHERE a.tipo = 'ALUNO' AND extract(dow from d) BETWEEN 1 AND 5
  AND (abs(hashtext(a.id || d::text || 'lunch')) % 100) < 80;

INSERT INTO access_logs (user_id, point_id, action, timestamp, flag)
SELECT a.id,
    (ARRAY['REFEI1','REFEI2'])[1 + (abs(hashtext(a.id || d::text || 'r')) % 2)],
    'SAIDA',
    d + time '12:30' + (abs(hashtext(a.id || d::text || 'cm')) % 35) * interval '1 minute'
      + (20 + abs(hashtext(a.id || d::text || 'dur')) % 26) * interval '1 minute',
    NULL
FROM app_users a
CROSS JOIN generate_series(CURRENT_DATE - 180, CURRENT_DATE, interval '1 day') AS d
WHERE a.tipo = 'ALUNO' AND extract(dow from d) BETWEEN 1 AND 5
  AND (abs(hashtext(a.id || d::text || 'lunch')) % 100) < 80
  AND (abs(hashtext(a.id || d::text || 'noexit')) % 100) < 95;

-- 3) ENFERMARIA — ~3%/dia, 15% sem saída, 20% dos que saem séjour longo
INSERT INTO access_logs (user_id, point_id, action, timestamp, flag)
SELECT a.id, 'ENFERM', 'ENTRADA',
    d + time '09:00' + (abs(hashtext(a.id || d::text || 'ih')) % 360) * interval '1 minute',
    NULL
FROM app_users a
CROSS JOIN generate_series(CURRENT_DATE - 180, CURRENT_DATE, interval '1 day') AS d
WHERE a.tipo = 'ALUNO' AND extract(dow from d) BETWEEN 1 AND 5
  AND (abs(hashtext(a.id || d::text || 'inf')) % 100) < 3;

INSERT INTO access_logs (user_id, point_id, action, timestamp, flag)
SELECT a.id, 'ENFERM', 'SAIDA',
    d + time '09:00' + (abs(hashtext(a.id || d::text || 'ih')) % 360) * interval '1 minute'
      + (CASE WHEN (abs(hashtext(a.id || d::text || 'long')) % 100) < 20
              THEN 35 + abs(hashtext(a.id || d::text || 'ld')) % 36
              ELSE 8 + abs(hashtext(a.id || d::text || 'sd')) % 21 END) * interval '1 minute',
    NULL
FROM app_users a
CROSS JOIN generate_series(CURRENT_DATE - 180, CURRENT_DATE, interval '1 day') AS d
WHERE a.tipo = 'ALUNO' AND extract(dow from d) BETWEEN 1 AND 5
  AND (abs(hashtext(a.id || d::text || 'inf')) % 100) < 3
  AND (abs(hashtext(a.id || d::text || 'infexit')) % 100) < 85;

-- 4) CDI — ~10%/dia
INSERT INTO access_logs (user_id, point_id, action, timestamp, flag)
SELECT a.id, 'BIBLIO', 'ENTRADA',
    d + time '10:00' + (abs(hashtext(a.id || d::text || 'bh')) % 360) * interval '1 minute',
    NULL
FROM app_users a
CROSS JOIN generate_series(CURRENT_DATE - 180, CURRENT_DATE, interval '1 day') AS d
WHERE a.tipo = 'ALUNO' AND extract(dow from d) BETWEEN 1 AND 5
  AND (abs(hashtext(a.id || d::text || 'cdi')) % 100) < 10;

INSERT INTO access_logs (user_id, point_id, action, timestamp, flag)
SELECT a.id, 'BIBLIO', 'SAIDA',
    d + time '10:00' + (abs(hashtext(a.id || d::text || 'bh')) % 360) * interval '1 minute'
      + (15 + abs(hashtext(a.id || d::text || 'bd')) % 36) * interval '1 minute',
    NULL
FROM app_users a
CROSS JOIN generate_series(CURRENT_DATE - 180, CURRENT_DATE, interval '1 day') AS d
WHERE a.tipo = 'ALUNO' AND extract(dow from d) BETWEEN 1 AND 5
  AND (abs(hashtext(a.id || d::text || 'cdi')) % 100) < 10
  AND (abs(hashtext(a.id || d::text || 'cdiexit')) % 100) < 90;

COMMIT;
