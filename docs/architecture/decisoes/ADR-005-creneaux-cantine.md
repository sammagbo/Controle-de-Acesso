# ADR-005 — Le planning de cantine devient une configuration

**Date :** 26/08/2026 · **Statut :** accepté · **Migrations :** V021, V022, V023

## Le problème, mesuré

Le 25/08/2026, la cantine tournait (164 entrées) avec **63 `OUTSIDE_MEAL_TIME`
répartis sur 22 turmas**. Aucune de ces turmas n'était en faute : les fenêtres
de `class_schedules` dataient de 2025, et l'affiche que la Vie Scolaire tient au
mur avait changé.

La cause n'est pas une erreur de saisie. C'est que **le planning n'avait pas
d'écran** : en changer demandait du SQL à la main sur la VM. Ce qui devait
arriver est arrivé — personne ne l'a fait, et le système a passé un an à
accuser des enfants d'arriver à une heure que lui seul croyait fausse.

## La décision

Trois tables neuves — `meal_slots`, `meal_slot_classes`, `meal_slot_students` —
deviennent **la seule source de vérité de la fenêtre d'accès au réfectoire**, et
un écran d'administration permet de les modifier par clics.

### ⚠️ Par-dessus `class_schedules`, pas à côté

`validateEntryWindow` **ne lit plus `class_schedules`**. La méthode reste dans
le code, marquée `@Deprecated`, uniquement parce que `EntryWindowRegressionTest`
gèle le comportement historique — et effacer cette cuirasse effacerait la seule
description exécutable de ce qui a changé.

`class_schedules` **survit**, mais pour une autre question, posée par
`RegimeSortieService` : « à quelle heure finit la matinée de cette turma, et
mange-t-elle ici aujourd'hui ? ». C'est ce qui décide la fenêtre de **sortie**
du midi, pas l'accès au réfectoire. Deux questions différentes, deux tables, et
jamais deux vérités pour la même fenêtre.

**⚠️ Prix accepté, écrit ici pour être trouvé :** les deux peuvent diverger. Si
la Vie Scolaire déplace une turma de 12h30 à 13h00 dans les créneaux, le régime
continuera de lire l'ancienne heure de fin de matinée. Ça n'ouvre ni ne ferme
aucune porte (le régime n'interdit rien, il observe), mais ça peut afficher
« fin de journée » au mauvais moment. **Porté à l'inventaire de configurabilité
comme dette ouverte n°1.**

### Le modèle, et le fait qui l'a dicté

Une turma **peut être dans plusieurs créneaux le même jour**. Ce n'est pas une
hypothèse : le mardi, sur l'affiche 2026, la 1ère 2 et la 1ère 3 figurent dans
les **deux** passages — une partie du groupe mange à 12h30, l'autre à 13h00.

Une contrainte « une turma, un créneau » aurait rendu l'affiche
**irreprésentable** et forcé quelqu'un à choisir quelle moitié du groupe le
système allait accuser. D'où : pas d'unique sur `(turma, jour)`, et une
résolution où **il suffit qu'un créneau corresponde**.

### L'ordre de résolution

1. **Exception élève** pour ce jour → elle vaut, **et elle seule**
2. sinon, **créneau(x) de la turma**
3. sinon → **non configuré**

⚠️ L'exception **remplace** la turma, elle ne s'y ajoute pas. C'est tout son
objet : l'élève de Terminale déplacé au second service **a cessé** d'appartenir
au premier. Additionner les deux donnerait une fenêtre plus large que ce que
n'importe quel humain a écrit, et l'exception ne restreindrait plus rien.

### ⚠️ « Non configuré » n'est jamais un refus

La maternelle et l'élémentaire ne figurent pas sur l'affiche. Elles ne peuvent
pas être punies pour une case vide. `MEAL_SLOT_NOT_CONFIGURED` est une
**question adressée à l'adulte** qui tient le planning, pas un reproche à un
enfant : politique `OBSERVATION`, jamais `DENY`.

**Et la distinction avec `NON_APPLICABLE` est ce qui empêche la trace de noyer
qui la lit.** Un professeur n'a jamais été dans une grille de turmas : ~200
agents × 2 repas = **400 lignes/jour** disant qu'il manque de configurer une
chose qui n'existe pas. C'est la leçon de l'`INCONNU` du régime, qui a
délibérément cessé de laisser une trace pour la même raison. Trouvé en lançant
la suite : quatre ITs de chemin heureux sont passés au rouge avec « accès propre
ne génère pas de tentative », et ils avaient raison.

### ⚠️ Le seed vient de DEUX sources

L'affiche ne couvre que le collège et le lycée. Mais la maternelle et
l'élémentaire **passent au réfectoire, et beaucoup** — mesuré : CM2A 5226
passages, TPS/PS A 4923, MSB 4671, CPB 4372. Semer uniquement l'affiche les
aurait toutes basculées en « non configuré » du jour au lendemain : une
régression franche depuis un état qui marche.

Donc l'affiche fait autorité pour les turmas qu'elle nomme (elle **remplace**
la base), et les autres sont **reprises** depuis `class_schedules`. La table
naît complète, et « non configuré » redevient ce qu'il doit être : rare.

### ⚠️ La fenêtre est jugée à l'heure de l'ÉVÉNEMENT

Troisième défaut d'horloge du projet, écrit ici avant d'exister. Jugée à
`now`, une file offline de 33 événements vidée à 18h marquerait **toutes** les
passages du midi hors horaire — des dizaines d'alertes inventées sur des enfants
arrivés à l'heure. C'est l'incident du 03/08/2026, cette fois pour accuser au
lieu de mesurer.

Cela **change** une frontière que `AccessDecisionServiceTest` gelait
explicitement (« mudar isto altera DENY/ALLOW em producao: e decisao do Sam »).
La décision est venue avec ce chantier. La frontière existe toujours, elle a
changé de place : dedup de repas, permission de sortie et utilisateur inactif
restent jugés à l'horloge de la décision. **Seule la fenêtre** est passée à
l'heure du passage.

## Ce qui a été vérifié, pas supposé

| | |
|---|---|
| Codes de turma de l'affiche → base | **`5E3` et `3E3` n'existent pas** (0 élève, actif ou non). Semés quand même — la table transcrit l'affiche — et signalés à l'écran. Ils ne changent le verdict de personne. |
| Une turma dans 2 créneaux le même jour | Vérifié en base après seed : `1E2` et `1E3`, mardi, 2 créneaux chacune. |
| Turmas d'élèves sans créneau | `TESTE_MESA` seulement (turma de test). |
| Le badge masqué par un aimant | Chargé marqué `a_confirmar = true` (mercredi 13h00, `4E2`). Le doute vit dans la donnée. |

## Alternatives écartées

**Étendre `class_schedules`** (ajouter des colonnes pour un second passage) —
écarté : la table est lue par le régime pour une autre question, et
`midiDoDia()` renvoie *une* heure. Il aurait fallu changer la signification
d'une structure que deux règles se partagent.

**Garder les deux et faire lire les deux à la cantine** — écarté sans hésiter :
c'est la définition de deux sources de vérité pour la même fenêtre, et donc du
défaut qu'on répare.
