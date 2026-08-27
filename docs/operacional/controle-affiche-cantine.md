# Contrôle de l'affiche cantine contre la base

**À montrer à la Vie Scolaire.** Trois questions, trois requêtes, et ce
qu'elles répondaient le 26/08/2026 sur la base locale (923 élèves réels).

Le planning vit maintenant dans `meal_slots` / `meal_slot_classes` (V021). Ces
requêtes disent où il **ne correspond pas** à la réalité des élèves — sans rien
corriger, parce que seule la Vie Scolaire peut trancher.

> ⚠️ Aucune de ces trois listes ne refuse quoi que ce soit à un élève. Une
> classe sans créneau passe quand même : le système note « créneau non
> configuré » et laisse entrer. Ce document sert à **poser les questions**, pas
> à justifier un blocage.

---

## A. Classes de l'affiche qui n'ont AUCUN élève

Elles figurent au mur, elles sont chargées dans le planning, et aucun élève ne
leur est rattaché. Elles ne changent le verdict de personne — mais elles
signalent soit un code de classe qui a changé, soit une classe qui n'existe
plus.

```sql
SELECT DISTINCT mc.turma
  FROM meal_slot_classes mc
 WHERE NOT EXISTS (SELECT 1 FROM app_users u
                    WHERE u.turma = mc.turma AND u.ativo AND u.tipo = 'ALUNO')
 ORDER BY 1;
```

**Résultat du 26/08/2026 :**

| Classe | Sur l'affiche | En base |
|---|---|---|
| `3E3` | jeudi 13H00 | 0 élève (la ligne existe dans `class_schedules`, mais vide) |
| `5E3` | mercredi 13H00, jeudi 13H00 | 0 élève, et **absente aussi de `class_schedules`** |

**Question à poser :** ces deux classes existent-elles encore ? Si oui, sous
quel code ? Si non, retirer les badges du mur — sinon quelqu'un cherchera
chaque année pourquoi elles n'apparaissent jamais.

---

## B. Classes qui MANGENT au réfectoire sans figurer dans aucun créneau

⚠️ **C'est la liste qui compte.** Ces élèves badgent pour de vrai, et le
système ne sait pas à quelle heure ils devraient manger. Chacun d'eux produit
un `MEAL_SLOT_NOT_CONFIGURED` en observation à chaque passage.

```sql
SELECT u.turma,
       count(DISTINCT u.id) AS alunos,
       count(l.id)          AS passagens
  FROM app_users u
  JOIN access_logs l ON l.user_id = u.id
                    AND (l.point_id LIKE 'REFEI%' OR l.point_id LIKE 'CANTINA%')
 WHERE u.tipo = 'ALUNO' AND u.ativo AND u.turma <> ''
   AND NOT EXISTS (SELECT 1 FROM meal_slot_classes mc WHERE mc.turma = u.turma)
 GROUP BY 1
 ORDER BY 3 DESC;
```

**Résultat du 26/08/2026 :**

| Classe | Élèves | Passages | Verdict |
|---|---|---|---|
| `TESTE_MESA` | 3 | 22 | classe de **test**, pas une vraie classe |

**Rien d'autre.** Toutes les classes réelles — maternelle et élémentaire
comprises — ont un créneau, parce que le seed a repris `class_schedules` pour
tout ce que l'affiche ne nomme pas.

⚠️ **Cette liste doit rester vide.** Le jour où une classe réelle y apparaît,
c'est qu'une rentrée a créé un code que le planning ne connaît pas — et ses
élèves mangeront sans horaire connu jusqu'à ce que quelqu'un l'ajoute.

---

## C. Le badge qui était caché par un aimant

Transcrit avec un doute assumé, et porté dans la donnée plutôt qu'arbitré en
silence.

```sql
SELECT ms.dia_semana, ms.hora, mc.turma
  FROM meal_slot_classes mc
  JOIN meal_slots ms ON ms.id = mc.slot_id
 WHERE mc.a_confirmar;
```

**Résultat du 26/08/2026 :** `mercredi · 13:00 · 4E2`

**✅ RÉSOLU le 27/08/2026 :** la photo du mur réimprimé confirme que le badge
caché par l'aimant était bien **4ème 2, mercredi 13H00**. La marque
`a_confirmar` a été retirée de la V023 (ligne 4E2/mercredi) et de la base ;
cette requête doit désormais rendre **zéro ligne**, et le badge s'imprime
plein trait, sans « ? ».

---

## D. Vue d'ensemble — et le contre-contrôle gratuit

La quatrième requête compte les classes par créneau. Elle sert à repérer un
créneau vide un jour d'école (le mercredi ne l'est pas), **et elle vérifie la
transcription** : ces nombres doivent être ceux de l'affiche.

**Résultat du 26/08/2026 — les dix comptes correspondent exactement au mur :**

| Jour | 12H30 prioritaire | 13H00 secondaire | 11:00 (repris) |
|---|---|---|---|
| lundi | **7** | **11** | 25 |
| mardi | **7** | **13** | 25 |
| mercredi | **4** | **8** | 2 |
| jeudi | **3** | **18** | 24 |
| vendredi | **4** | **14** | 25 |

Comptez les badges d'une case du mur : si le nombre diffère, la transcription a
sauté une classe. C'est le contrôle le moins cher qui existe, et le seul qui
attrape une erreur de recopie.

⚠️ Le mercredi à 11:00 n'a que **2** classes, contre 24-25 les autres jours :
la maternelle et l'élémentaire ont `N` (pas de repas) le mercredi dans
`class_schedules`. Ce n'est pas un trou, c'est le mercredi.

## Comment relancer les trois

```bash
docker exec magbo-postgres psql -U magbo -d magbodb -f - < docs/operacional/controle-affiche-cantine.sql
```

Le fichier `.sql` à côté de ce document contient les **quatre** requêtes, dans
cet ordre, avec un en-tête par section. Vérifié : il tourne tel quel, avec
`ON_ERROR_STOP=1`, et sort avec 0.

⚠️ **À relancer à chaque rentrée**, avant le premier service. C'est le moment
où les codes de classe changent, et le seul moment où ces trois listes sont
faciles à corriger.
