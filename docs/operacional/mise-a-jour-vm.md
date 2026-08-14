# Mettre à jour l'installation existante — et mettre en service le régime de sortie

**Pour qui :** une personne compétente (admin système / dev) qui **ne connaît pas ce
projet** et n'a personne à qui poser des questions. L'installation tourne déjà ; il
s'agit d'y amener une nouvelle version du code.

**Ce document est le pendant de [`reconstruire de zéro`](reconstruir-do-zero.md).**
Celui-là part d'une base vide. Celui-ci part d'une installation **qui tourne et qui
contient les vraies données** — l'erreur n'y coûte pas le même prix.

**Statut :** chaque commande marquée ✅ a été **réellement exécutée** le 14/08/2026,
en suivant ce texte à la lettre, contre une instance locale contenant les **439 993**
enregistrements réels. Ce qui n'a pas pu l'être est marqué ⚠️ NON EXÉCUTÉ, avec la
raison. Le § 11 dit **où ce texte n'a pas suffi** : cinq endroits, dont deux qui
auraient fait croire à une panne inexistante et un qui envoyait le lecteur sur un
écran qui n'existait pas.

---

## 0. Ce qu'il faut comprendre AVANT de taper une commande

Quatre faits. Aucun ne se devine en lisant `docker-compose.yml` trop vite.

**1. Le conteneur backend ne contient pas l'application.** L'image est un JRE nu
(`eclipse-temurin:17-jre-alpine`) et le `.jar` arrive par un volume :
`../backend/target:/app`. Mettre à jour = **reconstruire le jar sur l'hôte, puis
recréer le conteneur**. Il n'y a pas d'image à reconstruire ni à pousser.
Conséquence mesurée au § 6 : on peut remplacer le jar **sous** un processus en cours
d'exécution — le fichier change, le programme non.

**2. Hibernate ne fait pas tout.** `ddl-auto=update` **ajoute** colonnes et tables,
mais ne modifie **jamais** une contrainte CHECK existante et n'enlève rien. Les
migrations de `deploy/migrations/` existent pour ce qu'Hibernate ne fera pas. Les
oublier ne produit **aucune erreur au démarrage** : la panne s'arme et se déclenche
des semaines plus tard, dans la transaction qui enregistre un vrai passage.

**3. Le régime de sortie naît désactivé, et l'ordre d'activation n'est pas
négociable.** `magbo.regime.habilitado=false` est compilé dans le jar ; c'est
`MAGBO_REGIME_HABILITADO` dans `deploy/.env` qui le renverse. L'ordre — migrations,
puis permissions, puis données, puis interrupteur — est justifié au § 9.

**4. La VM ne sert que le backend.** Le tableau de bord est une application Electron
qui tourne sur les postes (loge, CDI, cantine) et se met à jour séparément :
[`release-portable.md`](release-portable.md). Un backend à jour avec un poste resté en
arrière n'est pas une panne visible — l'écran affiche l'ancienne version sans le dire.

---

## 1. Prérequis, et la vérification qui compte ✅

**Quand :** hors horaire scolaire. Entre le § 4 (`mvn clean` vide le répertoire monté)
et le § 6 (recréation du conteneur), le backend a des fenêtres d'indisponibilité de
quelques minutes — pendant lesquelles les terminaux **mettent les passages en file et
les renvoient** (comportement observé deux fois), donc rien n'est perdu, mais les
écrans sont aveugles. Un mercredi après-midi ou après 18h.

- Accès SSH à la VM et droit de lancer `docker`.
- `git`, `docker`, `docker compose`, **Maven + JDK 17** sur la VM (le jar se construit
  là où le volume est monté).
- `deploy/.env` **existe déjà** et contient les secrets de production. Il est dans le
  `.gitignore` : `git pull` ne l'écrase pas, et ne le recrée pas non plus.

```bash
cd /opt/magbo/Controle-de-Acesso      # ⚠️ adapter : chemin de VOTRE installation
docker compose -f deploy/docker-compose.yml ps
```

⚠️ **Un tableau vide ne veut pas dire que rien ne tourne.** `compose ps` ne voit que
les conteneurs **créés par compose**. Une installation démarrée à la main
(`docker run`) est invisible ici alors qu'elle sert l'école. Vérifiez plutôt :

```bash
docker ps --format '{{.Names}}\t{{.Status}}'
# → magbo-postgres et magbo-backend doivent apparaître "Up"
```

Si les conteneurs existent mais que `compose ps` est vide, ils ont été créés hors
compose : la suite fonctionne quand même, mais `compose restart` / `compose up` ne les
atteindra pas tant qu'ils n'ont pas été recréés une fois par compose.

**Vérifiez que le `.env` est bien lu avant tout le reste :**

```bash
docker compose -f deploy/docker-compose.yml config | grep -E 'MAGBO_JWT_SECRET|POSTGRES_PASSWORD'
```

⚠️ Un `.env` absent ou mal placé ne provoque **pas** d'erreur : compose émet un
`warning: variable is not set`, une ligne qui défile, puis démarre le backend avec un
**secret JWT vide**. La commande ci-dessus doit afficher de vraies valeurs. (Bonne
nouvelle vérifiée : compose lit `deploy/.env` que l'on invoque depuis la racine avec
`-f deploy/…` ou depuis `deploy/` — le répertoire de projet est celui du fichier
compose, pas le répertoire courant.)

---

## 2. AVANT TOUT — la sauvegarde ✅

Non négociable, et elle prend dix secondes. Les photos d'identité vivent **uniquement**
en base (`user_photos`) : ce `pg_dump` est le seul exemplaire de ces images.

```bash
docker exec magbo-postgres pg_dump -U magbo magbodb \
  | gzip > ~/magbo_avant_maj_$(date +%Y%m%d_%H%M).sql.gz
ls -lh ~/magbo_avant_maj_*.sql.gz
```

**Ordre de grandeur mesuré** (439 993 passages, 923 élèves, photos comprises) :
**3,4 Mo compressés**, 26 Mo décompressés. Ne vous fiez pas à la taille : quelques
centaines de Ko suffisent à ressembler à une sauvegarde. **Comparez le contenu du dump
à la base vivante** — c'est la seule vérification qui prouve quelque chose :

```bash
zcat ~/magbo_avant_maj_*.sql.gz \
  | awk '/^COPY public\.access_logs /{f=1;next} /^\\\.$/{f=0} f{n++} END{print n+0}'
docker exec magbo-postgres psql -U magbo -d magbodb -tAc "SELECT count(*) FROM access_logs;"
# → les deux nombres doivent être ÉGAUX
```

---

## 3. Récupérer le code ⚠️ NON EXÉCUTÉ

```bash
git status          # doit être propre : une modification locale non commitée sera perdue
git rev-parse HEAD > ~/magbo_version_precedente.txt   # le § 10.2 en a besoin
git pull origin main
git log --oneline -3
```

Le premier fichier garde **la version d'où vous partez** : c'est le commit vers lequel
le § 10.2 reviendra si la mise à jour tourne mal. Sans lui, le retour arrière commence
par une fouille dans `git log` sous pression.

⚠️ NON EXÉCUTÉ : le drill s'est déroulé sur un poste local, sans VM dans le périmètre.
Le reste du document a été exécuté.

---

## 4. Reconstruire le jar ✅

```bash
cd backend
mvn clean package -DskipTests
ls -l target/access-control-*.jar
cd ..
```

⚠️ **`mvn clean` efface le répertoire monté dans le conteneur.** Pendant la
construction — une à deux minutes — `/app` est vide côté conteneur. Le processus déjà
lancé continue (le JVM a le fichier ouvert), mais un redémarrage pendant cette fenêtre
ne trouverait aucun jar. Ne redémarrez rien avant que le `ls` ci-dessus ne réponde.

⚠️ **`-DskipTests` ici, et la suite lancée ailleurs.** La suite (`mvn test`, `npm test`)
se lance sur un poste de développement, avant de pousser. Sur la VM on construit un
code **déjà** validé.

⚠️ **Un seul jar dans `target/`.** La commande du conteneur est
`java -jar access-control-*.jar` : deux versions et le joker devient ambigu. C'est la
vraie fonction du `clean` ici.

---

## 5. Appliquer les migrations ✅

```bash
cat deploy/migrations/README.md     # la liste ordonnée, et pourquoi chacune existe
```

Les réappliquer toutes est **sans effet** — elles sont idempotentes (`IF NOT EXISTS`,
`DO $$`). Vérifié : les 16 passent deux fois de suite sans rien casser. Dans le doute,
tout réappliquer coûte moins cher que de deviner ce qui manque.

```bash
for f in deploy/migrations/V0*.sql; do
  printf '%-56s' "$(basename "$f")"
  docker exec -i magbo-postgres psql -U magbo -d magbodb -v ON_ERROR_STOP=1 < "$f" \
    > /tmp/mig.log 2>&1 && echo OK || { echo "ÉCHEC"; tail -3 /tmp/mig.log; break; }
done
```

⚠️ **`-v ON_ERROR_STOP=1` n'est pas décoratif.** Sans lui, `psql` sort avec le code **0**
même quand toutes les instructions du fichier ont échoué (mesuré : 0 sans l'option, 3
avec). Une boucle qui teste le code de retour afficherait « OK » pour une migration qui
n'a rien fait. C'est l'erreur qui a été commise en écrivant ce document.

**Vérifier les deux objets que les migrations sont seules à produire :**

```bash
# 1. le CHECK que Hibernate ne mettra jamais à jour (V015)
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname LIKE '%denial_reason%';" \
  | tr ',' '\n' | grep -c REGIME_NOT_ALLOWED
# → 1   (0 = la V015 n'est pas passée : NE PAS activer le régime, voir § 9)

# 2. l'index de la V016, construit CONCURRENTLY donc interruptible
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT indisvalid FROM pg_index WHERE indexrelid = 'idx_access_logs_ponto_hora'::regclass;"
# → t   (f = index invalide : appliquer rollback/R016 puis refaire la V016)
```

✅ Le rollback R016 a été exécuté puis la V016 réappliquée : l'index disparaît et
revient valide. C'est le seul rollback de la liste qui serve à autre chose qu'un
retour de version.

---

## 6. Redémarrer, et vérifier que c'est bien la NOUVELLE version ✅

```bash
docker compose -f deploy/docker-compose.yml up -d --force-recreate backend
docker compose -f deploy/docker-compose.yml logs backend --tail 40
curl -s http://localhost:8080/api/health
# → {"status":"UP","database":"CONNECTED",...}
```

⚠️ **`/api/health` ne dit PAS quelle version tourne.** Son champ `"version":"1.0.0"`
est une chaîne écrite en dur dans `HealthController` ; elle est identique avant et
après n'importe quel déploiement. Elle prouve que le backend répond, rien de plus.

**La vérification qui distingue réellement l'ancien jar du nouveau** — le jar doit être
**plus vieux** que le démarrage du conteneur :

```bash
docker exec magbo-backend sh -c 'ls -l /app/access-control-*.jar'
docker inspect magbo-backend --format '{{.State.StartedAt}}'
```

⚠️ Le `sh -c` n'est pas décoratif : `docker exec` n'ouvre pas de shell, et sans lui le
`*` arrive littéral à `ls` — « No such file or directory » sur un jar présent. La
première version de ce document donnait la commande sans le shell, marquée ✅ parce que
le drill avait tapé le nom complet du jar ; la version écrite n'avait jamais tourné
(mesuré le 14/08 : sans `sh -c` → échec, avec → répond).

Un jar **plus récent** que le démarrage signifie : vous avez reconstruit et **pas**
redémarré — le processus sert encore l'ancien code. Démontré pendant le drill : le jar
a été remplacé sous le processus en cours, sa date est passée à 18:09 alors que le
conteneur avait démarré à 17:55, et le backend a continué à répondre normalement avec
l'ancien code. C'est l'erreur de déploiement la plus probable, et la seule chose qui la
révèle est cette comparaison de dates.

---

## 7. Accorder les permissions — **avant** le jour où elles servent ✅ (par le code et les tests)

Les nouveaux écrans sont derrière des permissions granulaires. Une permission absente
ne ressemble pas à une panne : le bouton n'est simplement pas là.

| Permission | Qui doit l'avoir | Ce qu'elle ouvre |
|---|---|---|
| `MEAL_ENTITLEMENT_WRITE` | opérateur cantine, Vie Scolaire | Droits repas — modifier |
| `EXIT_PERMISSION_WRITE` | Vie Scolaire, direction | Autorisations de sortie — modifier |
| `REGIME_WRITE` | Vie Scolaire, direction | Régimes de sortie — modifier |
| `PPMS_READ` | Vie Scolaire, direction, infirmière | Liste nominative PPMS |

**Administration → Utilisateurs → (modifier un opérateur) → « Permissions
particulières »**, une case par permission. Le rôle ADMIN les possède toutes : les
cases y sont grisées, pas cachées.

⚠️ **Ces écrans ne vivent PAS sur la VM.** Le § 1 à § 6 a mis à jour le backend ; le
tableau de bord est une application Electron installée sur les postes (loge, CDI,
cantine), et elle se met à jour par un **paquet séparé** :
[`release-portable.md`](release-portable.md). Si l'écran des opérateurs n'a pas de
champ « Permissions particulières », ce n'est pas que la VM est en retard — c'est que
**le poste** l'est. La mise à jour des postes est donc un PASSO de cette procédure,
pas une note de bas de page :

7-bis. **Mettre à jour les postes** en suivant `release-portable.md`, **avant** de
compter sur les écrans des § 7 et § 8. Ne contournez pas par `curl`.

**Vérifier ce qui est accordé** (marche même sans poste à jour — c'est la base qui
fait foi) :

```bash
docker exec magbo-postgres psql -U magbo -d magbodb -c \
  "SELECT username, role, permissoes FROM system_users WHERE ativo = true;"
# permissoes est un CSV : REGIME_WRITE doit apparaître pour la Vie Scolaire,
# PPMS_READ pour Vie Scolaire / direction / infirmière. NULL = aucune permission
# particulière — normal pour un opérateur de cantine.
```

⚠️ `PPMS_READ` **restreint** une liste qui était ouverte à tous : après cette mise à
jour, un opérateur qui voyait la liste PPMS ne la verra plus. C'est la décision
(l'opérateur de cantine n'a pas à savoir quel enfant est à l'infirmerie), pas un effet
de bord — mais **prévenez les personnes concernées le jour même**, sinon la première à
s'en apercevoir le fera pendant un exercice d'évacuation.

⚠️ NON EXÉCUTÉ en cliquant : le drill n'a pas ouvert Electron. Ce qui a été vérifié,
c'est le code et cinq tests (`tests/permissions.test.js`), chacun prouvé mordant : un
libellé manquant dans l'une des deux langues, un nom retiré de `Permissions.TODAS`, une
quatrième copie de la liste dans l'écran, et le formulaire cessant d'envoyer le champ.

---

## 8. Charger les régimes ✅ (la vérification ; l'écran non)

Écran **Régimes de sortie → Import**. Le tableur, puis la simulation, puis la
confirmation : rien n'est écrit tant que le plan n'a pas été affiché et confirmé, et le
`apply` **refait** le plan contre la base du moment.

**La planilha :** en-têtes à la première ligne, une ligne par élève, colonne
Matricule **formatée TEXTE** (les zéros de tête comptent : 0001764 et 1764 sont deux
élèves). Noms de colonnes acceptés (français, portugais, ou le nom système — la liste
vit dans `js/utils/regimeSheet.js` et l'écran d'import l'affiche) :

| Colonne | Obligatoire | Exemples acceptés |
|---|---|---|
| Matricule | oui | `Matrícula`, `Matricule`, `ID` |
| Régime général | oui | `Régime général`, `Regime geral` — EXTERNE / DP / INTERNE |
| Régime de sortie | oui | `Régime de sortie`, `Sortie` — 1, R1, «régime 1», REGIME_1 |
| Valable du | oui | `Valable du`, `Válido de` — 2026-09-01 ou 01/09/2026 |
| Autorisé par | oui | `Autorisé par`, `Autorizado por` |
| Valable au / Document / Signé le / Note | non | `Valable au`, `Carnet`, `Signé le`, `Note` |

**Vérifier combien de régimes sont EN VIGUEUR aujourd'hui :**

```bash
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT count(*) FROM student_regimes
    WHERE encerrado_em IS NULL
      AND valid_from <= current_date
      AND (valid_until IS NULL OR valid_until >= current_date);"
```

⚠️ **Ne comptez PAS `valid_until IS NULL`** — c'est « sans date de fin », pas « en
vigueur ». La première version de ce document donnait cette requête-là : une planilha
avec la colonne « Valable au » remplie aurait répondu **0**, le texte enseignait à lire
0 comme « rien de chargé », et la conclusion aurait été de réimporter 923 lignes dans
une table qui est une **preuve** (chaque remplacement reste dans l'historique). La
réimportation de la même planilha est d'ailleurs sans effet — l'import répond
« identique » ligne à ligne — mais une vérification qui pousse vers un geste inutile
sur une table de preuve est une vérification mal écrite.

⚠️ Zéro régime chargé ne casse rien : **tout élève répond INCONNU** (gris) au portail,
ce qui est exactement le comportement prévu pour le jour 1. Mais un portail entièrement
gris n'aide personne — c'est la raison d'être de l'import en lot.

---

## 9. SEULEMENT MAINTENANT — activer le régime ✅

```bash
nano deploy/.env
# MAGBO_REGIME_HABILITADO=true

docker compose -f deploy/docker-compose.yml up -d --force-recreate backend
docker exec magbo-backend printenv MAGBO_REGIME_HABILITADO      # → true
```

⚠️ **`restart` ne suffit PAS, `up -d --force-recreate` est obligatoire.** Une variable
d'environnement est fixée à la **création** du conteneur ; `restart` relance le
processus dans le conteneur existant, avec l'ancienne valeur. **Mesuré pendant le
drill** : `.env` passé à `true`, puis `compose restart backend`, puis `printenv` →
**`false`**. Aucune erreur, aucun avertissement, fonctionnalité éteinte. Après
`up -d --force-recreate` → `true`.

**Pourquoi cet ordre :** activer avant le § 5 arme une panne **différée** — le CHECK de
`denial_reason` ignore encore `REGIME_NOT_ALLOWED`, l'INSERT de la tentative échoue
dans la transaction, et il emporte avec lui l'enregistrement d'un passage réel.
Activer avant les § 7 et § 8 ne casse rien : la Vie Scolaire ne peut simplement pas
saisir, et tout est gris.

---

## 10. Si ça tourne mal

L'ordre du retour arrière est l'inverse de celui de l'aller.

1. **Éteindre l'interrupteur** (`MAGBO_REGIME_HABILITADO=false` +
   `up -d --force-recreate backend`). Suffit pour tout ce que le régime touche : la
   règle ne s'évalue plus, le portail redevient ce qu'il était. ✅ (le mécanisme a été
   exercé dans les deux sens)
2. **Revenir au jar précédent** : le commit est dans le fichier noté au § 3 —
   `git checkout $(cat ~/magbo_version_precedente.txt)`, puis
   `mvn clean package -DskipTests`, puis `up -d --force-recreate backend`.
   ⚠️ NON EXÉCUTÉ.
3. **Ne PAS dérouler les migrations** par réflexe. Elles sont additives : une colonne
   de plus qu'un ancien jar ignore ne gêne pas. Les `rollback/R0*.sql` servent à un
   objet **cassé** (index invalide de la V016), pas à un retour de version.
4. **Restaurer la base** est le dernier recours, et il coûte tout ce qui a été
   enregistré depuis la sauvegarde : [`reconstruire de zéro`](reconstruir-do-zero.md),
   partie B (exécutée le 12/08/2026).

---

## 11. Où ce texte n'a pas suffi

Le document a été écrit d'abord, puis **parcouru à la lettre**. Cinq endroits n'ont pas
tenu. Ils sont corrigés ci-dessus ; l'aveu reste écrit, parce qu'une procédure que
personne n'a marchée est un brouillon, et parce que ces cinq-là se ressemblent : dans
quatre cas sur cinq, **la vérification que j'avais écrite passait alors que la chose
vérifiée était fausse**.

1. **§ 2 — le seuil de taille était inventé.** J'avais écrit « attendez-vous à des
   dizaines de Mo ; quelques kilo-octets ne sont pas une sauvegarde ». La vraie
   sauvegarde des 439 993 enregistrements fait **3,4 Mo**. Un lecteur suivant mon texte
   aurait conclu à un échec devant une sauvegarde parfaitement valide — juste avant de
   mettre à jour une base de production. Remplacé par une comparaison dump/base vivante.

2. **§ 2 — la vérification comptait la mauvaise chose.** `grep -c "^INSERT\|^COPY"`
   renvoie **10**, qui est le nombre de **tables**, pas de lignes. Mon texte disait
   « vérifiez » sans dire quoi attendre : 10 se lit aussi bien comme « 10 lignes
   sauvegardées », c'est-à-dire un désastre.

3. **§ 5 — la boucle de migrations affichait « OK » sur un échec total.** Sans
   `-v ON_ERROR_STOP=1`, `psql` sort avec 0 quand tout le fichier a échoué (mesuré : 0
   sans, 3 avec). Le plus gênant : `reconstruir-do-zero.md`, que j'avais déjà écrit et
   parcouru, **utilise l'option correctement à sa ligne 114**. Je n'ai pas reporté ma
   propre leçon d'un document à l'autre.

4. **§ 6 — la vérification de version ne vérifiait pas la version.** Je proposais
   `curl /api/health` pour « vérifier que la nouvelle version tourne ». Le champ
   `version` est la chaîne littérale `"1.0.0"` écrite dans `HealthController` : elle ne
   change jamais. Remplacé par la comparaison date-du-jar / démarrage-du-conteneur,
   démontrée en remplaçant le jar sous un processus en cours.

5. **§ 7 — j'envoyais le lecteur sur un écran qui n'existait pas.** Le texte disait
   d'accorder la permission dans « Administration → Utilisateurs, colonne Permissions ».
   Il n'y avait pas de colonne Permissions, ni de champ, ni nulle part ailleurs dans
   l'application : le backend acceptait `permissoes` depuis la Phase H et le formulaire
   ne l'a jamais envoyé. Toutes les permissions granulaires — y compris
   `MEAL_ENTITLEMENT_WRITE`, en production depuis juillet — n'étaient accordables que
   par API. C'était exactement le reproche qui a motivé ce drill : une opération que
   seul l'auteur savait faire. L'écran existe depuis le 14/08/2026 (branche
   `fix/permissions-ui`).

Un panel de relecture indépendant (14/08, après le premier passage) a trouvé **trois
défauts de plus dans ce document même** — de la même famille : des vérifications qui
passaient, ou des ✅, sans que la chose vérifiée soit vraie. Corrigés ci-dessus :

6. **§ 6 encore — la commande corrigée n'avait pas tourné.** La comparaison
   jar/StartedAt a remplacé l'aveu nº 4, mais la commande écrite utilisait un joker
   sans shell (`docker exec … ls …*.jar`) : `docker exec` n'ouvre pas de shell, le `*`
   arrive littéral, et la commande échoue sur un jar présent. Le drill avait tapé le
   nom complet du jar ; le document avait le joker ; le ✅ couvrait une commande jamais
   exécutée. Mesuré, corrigé (`sh -c`), re-mesuré.

7. **§ 7 — le champ que la procédure montrait n'existe pas sur les postes de la VM.**
   Le texte envoyait vers un écran Electron en supposant les postes à jour, et son
   propre conseil en cas d'absence du champ (« mettez le code à jour ») renvoyait le
   lecteur au geste qu'il venait de faire. La mise à jour des POSTES est un autre
   paquet (`release-portable.md`) et elle est maintenant le § 7-bis, un passo nommé.

8. **§ 8 — la vérification mesurait « sans date de fin », pas « en vigueur ».**
   `valid_until IS NULL` répond 0 sur une planilha correctement remplie avec « Valable
   au », et le texte enseignait à lire 0 comme un échec de chargement — poussant vers
   une réimportation de 923 lignes sur une table de preuve. Remplacée par la requête de
   vigence (bornes de dates + `encerrado_em IS NULL`), exécutée.

**Ce qui a tenu :** l'ordre d'activation, l'avertissement `restart` vs
`--force-recreate` (mesuré, et exact), l'idempotence des seize migrations, le CHECK de
la V015, la validité de l'index de la V016 et son rollback, et le fait que compose lit
bien `deploy/.env` depuis la racine.

**Note d'environnement :** le drill s'est déroulé sous Git Bash (Windows). Les chemins
absolus passés à `docker exec` y sont réécrits par MSYS (`/app/…` devient
`C:/Program Files/Git/app/…`) et demandent `MSYS_NO_PATHCONV=1`. Sur la VM (Linux) le
problème n'existe pas ; les commandes de ce document sont écrites pour la VM.
