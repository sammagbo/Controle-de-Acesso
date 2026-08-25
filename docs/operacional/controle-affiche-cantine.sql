-- =====================================================================
-- CONTROLE DE L'AFFICHE CANTINE CONTRE LA BASE
-- =====================================================================
-- A relancer A CHAQUE RENTREE, avant le premier service : c'est le moment ou
-- les codes de classe changent, et le seul ou ces listes sont faciles a
-- corriger.
--
-- ⚠️ Aucune de ces requetes ne refuse quoi que ce soit a un eleve. Une classe
-- sans creneau passe quand meme (le systeme note « creneau non configure » et
-- laisse entrer). Ceci sert a POSER LES QUESTIONS, pas a justifier un blocage.
--
-- Lecture des resultats : docs/operacional/controle-affiche-cantine.md
--   docker exec -i magbo-postgres psql -U magbo -d magbodb \
--     < docs/operacional/controle-affiche-cantine.sql
-- =====================================================================

\echo ''
\echo '=== A. Classes de l affiche SANS aucun eleve ==========================='
\echo '(figurent au mur, chargees dans le planning, personne ne leur est'
\echo ' rattache. Ne changent le verdict de personne — mais signalent un code'
\echo ' qui a change, ou une classe qui n existe plus.)'
\echo ''

SELECT mc.turma AS classe_sans_eleve,
       string_agg(DISTINCT to_char(ms.hora, 'HH24:MI'), ', ' ORDER BY to_char(ms.hora, 'HH24:MI')) AS creneaux
  FROM meal_slot_classes mc
  JOIN meal_slots ms ON ms.id = mc.slot_id
 WHERE NOT EXISTS (SELECT 1 FROM app_users u
                    WHERE u.turma = mc.turma AND u.ativo AND u.tipo = 'ALUNO')
 GROUP BY mc.turma
 ORDER BY mc.turma;

\echo ''
\echo '=== B. Classes qui MANGENT sans figurer dans aucun creneau ============='
\echo '⚠️ C EST LA LISTE QUI COMPTE. Ces eleves badgent pour de vrai et le'
\echo ' systeme ne sait pas a quelle heure ils devraient manger. Chaque passage'
\echo ' produit un MEAL_SLOT_NOT_CONFIGURED en observation.'
\echo ' ⚠️ Cette liste DOIT RESTER VIDE (hors classes de test).'
\echo ''

SELECT u.turma                AS classe_sans_creneau,
       count(DISTINCT u.id)   AS eleves,
       count(l.id)            AS passages,
       max(l.timestamp)::date AS dernier_passage
  FROM app_users u
  JOIN access_logs l ON l.user_id = u.id
                    AND (l.point_id LIKE 'REFEI%' OR l.point_id LIKE 'CANTINA%')
 WHERE u.tipo = 'ALUNO' AND u.ativo AND u.turma <> ''
   AND NOT EXISTS (SELECT 1 FROM meal_slot_classes mc WHERE mc.turma = u.turma)
 GROUP BY u.turma
 ORDER BY count(l.id) DESC;

\echo ''
\echo '=== C. Badges transcrits AVEC UN DOUTE (masques par un aimant) ========='
\echo '(le doute vit dans la donnee, pas dans la tete de qui a transcrit)'
\echo ''

SELECT CASE ms.dia_semana WHEN 1 THEN 'lundi' WHEN 2 THEN 'mardi'
                          WHEN 3 THEN 'mercredi' WHEN 4 THEN 'jeudi'
                          WHEN 5 THEN 'vendredi' ELSE ms.dia_semana::text END AS jour,
       to_char(ms.hora, 'HH24:MI') AS heure,
       mc.turma                    AS classe_a_confirmer
  FROM meal_slot_classes mc
  JOIN meal_slots ms ON ms.id = mc.slot_id
 WHERE mc.a_confirmar
 ORDER BY ms.dia_semana, ms.hora;

\echo ''
\echo '=== D. Vue d ensemble : combien de classes par creneau ================='
\echo '(un creneau vide un jour d ecole est suspect ; le mercredi ne l est pas)'
\echo ''

SELECT CASE ms.dia_semana WHEN 1 THEN 'lundi' WHEN 2 THEN 'mardi'
                          WHEN 3 THEN 'mercredi' WHEN 4 THEN 'jeudi'
                          WHEN 5 THEN 'vendredi' ELSE ms.dia_semana::text END AS jour,
       to_char(ms.hora, 'HH24:MI') AS heure,
       ms.rotulo,
       count(mc.id) AS classes
  FROM meal_slots ms
  LEFT JOIN meal_slot_classes mc ON mc.slot_id = ms.id
 WHERE ms.ativo
 GROUP BY ms.dia_semana, ms.hora, ms.rotulo, ms.ordem
 ORDER BY ms.dia_semana, ms.ordem, ms.hora;
