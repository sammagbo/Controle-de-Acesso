# Relecture à froid de V021 / V022 / V023

**26/08/2026.** Faite sur une base d'**essai** (`magbo_migtest`, créée depuis un
`pg_dump --schema-only` de `magbodb`, supprimée après). `magbodb` n'a jamais
servi de cobaye, et la VM n'a pas été touchée.

Huit vérifications. Sept passent. **La huitième a trouvé un vrai défaut, qui
est corrigé dans ce même commit.**

---

## Ce qui a été vérifié, et comment

| # | Question | Méthode | Résultat |
|---|---|---|---|
| 1 | Le trafic d'hier survit-il ? | 5 `access_attempts` plantées avec les anciens motifs, puis migration | **intactes** |
| 2 | Première application | les 3 fichiers, `ON_ERROR_STOP=1` | `exit=0` · 10 créneaux · 89 affectations |
| 3 | **Idempotence réelle** | les 3 fichiers **une seconde fois** | `exit=0` · **mêmes** 10 / 89 |
| 4 | Le nouveau motif s'écrit-il ? | INSERT `MEAL_SLOT_NOT_CONFIGURED` | accepté |
| 4b | L'ancien continue-t-il ? | INSERT `OUTSIDE_MEAL_TIME` | accepté |
| 4c | Le CHECK protège-t-il encore ? | INSERT d'un motif inventé | **refusé** |
| 5 | R022 avec une ligne du nouveau motif | rollback tel quel | **échoue, exit=3** — voulu |
| 6 | R022 après traitement de la ligne | rollback | `exit=0` |
| 7 | R021 | rollback | `exit=0`, tables parties, `access_logs` et `access_attempts` **intacts** |

### ⚠️ Sur le point 5 — l'échec est le bon comportement

`R022` rétrécit le CHECK. Postgres le valide contre les lignes existantes, donc
s'il reste une tentative enregistrée avec `MEAL_SLOT_NOT_CONFIGURED`, l'`ALTER`
refuse :

```
ERROR:  check constraint "access_attempts_denial_reason_check" is violated by some row
```

C'est exactement ce que l'en-tête de `R022` annonçait, et c'est **désirable** :
on n'efface pas la trace d'une tentative pour faire rentrer une contrainte.
Le rollback oblige à décider quoi faire de ces lignes d'abord.

### Sur le point 2 — un écart à comprendre, pas un défaut

La base d'essai donne **10 créneaux**, `magbodb` en donne **15**. La différence
n'est pas dans la migration : le `pg_dump --schema-only` copie la structure sans
les données, donc `class_schedules` était **vide** et la reprise n'avait rien à
reprendre. Les 5 créneaux manquants sont les « 11:00 repris ».

⚠️ **À retenir pour la VM :** le nombre de créneaux produits par V023 dépend du
contenu de `class_schedules` **au moment où on l'applique**. Sur une VM où cette
table est peuplée, attendre ~15. Sur une base vide, 10.

---

## ⚠️ LE DÉFAUT TROUVÉ — et pourquoi il est grave

**Question 8 : que se passe-t-il si la table existe déjà, créée par quelqu'un
d'autre ?**

C'est le scénario réel : quelqu'un monte le backend neuf avant d'appliquer la
migration, `ddl-auto=update` crée `meal_slots` à sa façon, puis on applique
V021.

**Mesuré :** table pré-créée avec 3 colonnes → V021 appliquée → **`exit=0`** →
la table garde ses **3 colonnes**, **sans la contrainte UNIQUE**.

`CREATE TABLE IF NOT EXISTS` ne vérifie pas la **forme** de la table. La
migration **annonce un succès sur un schéma qui n'est pas le sien**, et les deux
installations divergent en silence. C'est précisément la classe de panne que la
V017 a existé pour fermer — et je l'avais réintroduite en la documentant au lieu
de la détecter.

⚠️ Le README demandait bien de compter les colonnes après application. Mais une
vérification qui dépend de quelqu'un s'en souvienne n'est pas une garde : c'est
un espoir.

### Correction, dans ce commit

V021 commence désormais par une garde qui transforme le succès silencieux en
échec bruyant :

```
ERROR:  meal_slots existe deja avec une AUTRE forme (colonne tolerancia_antes_minutos absente).
HINT:   Le backend a probablement ete monte avant cette migration et Hibernate a cree la table.
        Verifier qu elle est VIDE, puis la supprimer avec rollback/R021 et rejouer V021
        AVANT de remonter le backend.
```

Vérifié dans les deux sens :

- table pré-créée avec la mauvaise forme → **`exit=3`** avec le message ci-dessus ;
- `magbodb`, déjà correctement migrée → **`exit=0`**, 15 créneaux, rien de cassé.

La garde ne répare rien. Elle refuse d'avancer et dit quoi faire.

---

## Ce qui m'inquiète encore

**1. `V023` n'est pas rejouable après une modification humaine.** Il est
idempotent (`ON CONFLICT DO NOTHING`), donc le rejouer ne casse rien — mais il
ne **restaure** rien non plus. Si la Vie Scolaire retire une classe d'un créneau
à l'écran et qu'on rejoue V023, la classe **revient**. Ce n'est pas un bug,
c'est la nature d'un seed ; mais quelqu'un qui rejoue les migrations « pour être
sûr » réintroduira des affectations supprimées exprès.
*Piste : ne rejouer V023 que sur une base neuve.*

**2. Rien ne vérifie que `V022` a été appliquée avant le backend.** Si on monte
le jar sans elle, le premier élève sans créneau fait échouer l'INSERT **dans la
transaction du passage**, et emporte l'`access_log` d'une passage réelle. La
garde du point 8 ne couvre que V021.
*Piste : un contrôle au démarrage, du même genre que `ProdSecurityStartupCheck`,
qui refuse de démarrer si le CHECK ne connaît pas tous les `DenialReason`.
Coût estimé : 2 h. Je ne l'ai pas fait cette nuit — c'est un changement de
comportement au démarrage, et ça se décide à froid.*

**3. Les rollbacks n'ont jamais été joués sur une base avec du VRAI volume.**
`magbo_migtest` avait un `access_logs` vide. `R021` fait un `DROP TABLE` sur des
tables petites, donc le risque est faible — mais « faible » n'est pas
« mesuré ».

**4. `class_schedules` reste lu par le régime.** Déjà noté comme dette n°1 dans
l'ADR-005. La relecture de cette nuit ne l'a pas changée.

---

## Comment refaire cette relecture

Le script est dans le scratchpad de la session, pas dans le dépôt (il crée et
détruit une base). Sa forme :

```bash
# 1. base d'essai depuis le schéma réel
docker exec magbo-postgres psql -U magbo -d postgres -c "CREATE DATABASE magbo_migtest;"
docker exec magbo-postgres sh -c "pg_dump -U magbo -d magbodb --schema-only | psql -U magbo -d magbo_migtest"
# 2. rembobiner avant V021, planter du trafic ancien, appliquer deux fois,
#    tester les rollbacks, puis pré-créer la table pour vérifier la garde
# 3. DROP DATABASE magbo_migtest
```

⚠️ **Toujours sur une base d'essai.** Une relecture de migrations qui se fait
sur la base de travail finit par apprendre quelque chose de très cher.
