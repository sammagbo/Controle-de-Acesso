# Reconstruire MAGBO de zéro — et restaurer une sauvegarde

**Pour qui :** une personne compétente (admin système / dev) qui **ne connaît pas ce projet**
et n'a personne à qui poser des questions. Vous avez : ce dépôt, éventuellement un fichier
de sauvegarde `magbo_*.sql.gz`, et rien d'autre.

**Statut de ce document :** chaque commande marquée ✅ a été **réellement exécutée** le
12/08/2026 (drill complet, base vide → application ouverte → sauvegarde → restauration →
application ouverte sur la base restaurée). Ce qui n'a **pas** été exécuté est marqué
⚠️ NON TESTÉ, avec la raison.

**Version de référence :** le drill a été exécuté sur `main` après le PR #41 (V015 incluse).
⚠️ **Au 03/09/2026 il y a 27 migrations (V001→V027)**, toutes appliquées en production :
V016→V027 sont **postérieures au drill** et n'ont donc jamais été rejouées à blanc. Si le schéma a évolué
depuis, la mécanique reste la même — c'est l'entité JPA qui fait foi, pas ce fichier.

---

## 0. Ce qu'il faut comprendre AVANT de taper une commande

Trois faits non évidents qui expliquent tout le reste :

1. **Le schéma naît du code Java, pas des fichiers SQL.** Le backend tourne avec
   `spring.jpa.hibernate.ddl-auto=update` : au démarrage, Hibernate crée toute table ou
   colonne manquante à partir des entités (`backend/src/main/java/com/magbo/access/models/`).
   Les fichiers `deploy/migrations/V0*.sql` ne sont **pas** une source autonome : ce sont des
   transcriptions contrôlées, pour audit et pour ce que Hibernate ne sait pas faire
   (index, CHECK manuels, suppressions).

2. **Les migrations seules NE construisent PAS la base.** Prouvé le 12/08/2026 sur un
   conteneur vierge : V005, V007, V008 et V010 échouent (`relation "system_users" /
   "app_users" does not exist`) et **six tables n'existent dans aucun fichier SQL**
   (`app_users`, `access_logs`, `door_mappings`, `class_schedules`, `responsaveis`,
   `system_users`). L'ordre supporté est donc :
   **backend d'abord (Hibernate crée le schéma), migrations ensuite.**

3. **Une base reconstruite de zéro est VIDE de personnes.** Le seed `data.sql` est en
   syntaxe H2 et échoue silencieusement sur PostgreSQL (vérifié : `app_users` = 0 lignes).
   Ce qui se crée tout seul au premier démarrage : l'utilisateur `admin` (bootstrap Java),
   14 `door_mappings`, 43 `class_schedules`. Les élèves et le personnel viennent d'un
   **import** (Pronote / HikCentral / Excel) ou d'une **restauration de sauvegarde**.

---

## 1. Prérequis

- Docker (pour PostgreSQL 16) — ✅ testé avec `postgres:16` officiel.
- JDK 17+ et Maven (le projet compile en 17, tourne en 21) — ✅ testé sous Windows.
- Node.js + npm (pour l'application Electron).
- Le dépôt : `git clone https://github.com/sammagbo/Controle-de-Acesso`.

Vérification : `docker --version`, `mvn --version`, `node --version` répondent tous.

---

## 2. PARTIE A — Reconstruire de zéro (base vide)

> Durées mesurées le 12/08/2026 : conteneur ~8 s · premier démarrage backend ~35 s ·
> les 12 migrations < 10 s.

### A.1 — Créer la base ✅

```bash
docker run -d --name magbo-postgres-new \
  -e POSTGRES_DB=magbodb -e POSTGRES_USER=magbo -e POSTGRES_PASSWORD=magbo_dev_pass_2026 \
  -p 5432:5432 postgres:16
```

⚠️ En production réelle : remplacez le mot de passe et reportez-le dans les variables
d'environnement de l'étape A.2. Sur le PC de dev, le port 5432 peut être occupé par un
ancien conteneur (`docker ps -a` ; l'historique du projet a un conteneur légual `magbo-db`
— ne pas le confondre).

Doit répondre :
```bash
docker exec magbo-postgres-new psql -U magbo -d magbodb -c "select 1;"
# → " 1"
```
Si « database does not exist » : le conteneur a déjà existé avec un autre volume —
`docker rm -f` puis recréez.

### A.2 — Démarrer le backend (c'est LUI qui crée le schéma) ✅

```bash
cd backend
MAGBO_DB_URL="jdbc:postgresql://localhost:5432/magbodb" \
MAGBO_DB_USERNAME=magbo \
MAGBO_DB_PASSWORD=magbo_dev_pass_2026 \
MAGBO_WEBHOOK_TOKEN=un-token-de-32-caracteres-minimum \
mvn spring-boot:run "-Dspring-boot.run.profiles=prod"
```

⚠️ **Les variables ne sont pas optionnelles.** Le fallback du profil `prod` pointe vers
`jdbc:postgresql://localhost:5432/magbo_access` — une base qui n'existe pas chez vous. Sans
les variables, le démarrage échoue ou, pire, touche une autre base.

Doit imprimer, parmi les logs :
```
⚠️  Admin inicial criado: admin (TROQUE A SENHA PADRÃO)
```
(au premier démarrage seulement) et deux WARN `SECURITY [prod]` si vous avez gardé les
mots de passe de dev — normal en local, interdit en production.

Vérification :
```bash
curl -s http://localhost:8080/api/health
# → {"status":"UP","database":"CONNECTED",...}
```
Si `CONNECTED` n'apparaît pas : mauvaise URL/mot de passe (regardez les premières lignes
d'erreur du log, pas les dernières).

### A.3 — Appliquer les migrations PAR-DESSUS ✅

```bash
for f in deploy/migrations/V0*.sql; do
  docker exec -i magbo-postgres-new psql -U magbo -d magbodb -v ON_ERROR_STOP=1 < "$f" \
    && echo "OK $f" || echo "ECHEC $f"
done
```

Doit imprimer `OK` autant de fois qu'il y a de migrations — **vingt-sept** au
03/09/2026 (V001…V027). ⚠️ Le drill du 12/08 n'en a vérifié que quinze : les
douze suivantes n'ont **jamais été rejouées sur une base vierge**.

> ⚠️ **V013 à V015 ajoutées après la vérification du 12/08.** V013 =
> `password_reset_requests` ; V014 = `student_regimes` + `student_regime_events`
> (régime de sortie) ; V015 = élargit le CHECK de `access_attempts.denial_reason`
> avec `REGIME_NOT_ALLOWED`, `REGIME_UNKNOWN` et `REGIME_TO_VERIFY`.
> **La V015 n'est pas optionnelle** : sans elle, l'INSERT d'une tentative de
> régime échoue *à l'intérieur de la transaction* et emporte l'`access_log`
> d'un passage réel — et seulement des semaines plus tard, quand la Vie
> Scolaire aura chargé les régimes. `npm test -- tests/migrations.test.js`
> échoue si une migration manque à la procédure.
>
> Pour **activer** le régime après les migrations :
> `MAGBO_REGIME_HABILITADO=true` dans `deploy/.env`, puis recréer le conteneur.
> Il naît à `false` : le jar ne s'édite pas sur la VM.

L'ancienne vérification (12/08/2026, 12/12 OK) reste valable pour V001…V012. Exécuté le 12/08/2026 : 12/12 OK sur un
schéma né d'Hibernate. Ce qu'elles ajoutent réellement à ce stade : les index `idx_*`
(V006), le CHECK manuel `meal_entitlement_events_source_check` (V003), et la V012 fait des
no-ops (le schéma Hibernate actuel naît déjà avec les deux colonnes d'autorité, sans
`reason`).

⚠️ Si une V échoue ici, **n'improvisez pas** : lisez l'en-tête du fichier V concerné —
chacun documente ses préconditions et son pourquoi.

### A.4 — Se connecter ✅

```bash
curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin1234"}'
# → {"token":"eyJ..."}
```

**Changez ce mot de passe immédiatement** (écran Gestion des utilisateurs, ou variables
`magbo.admin.*`). Le `ProdSecurityStartupCheck` vous le rappellera à chaque démarrage.

### A.5 — Ouvrir l'application ✅

```bash
npm install        # première fois
npm start          # MAGBO_API_URL=http://localhost:8080 par défaut
```

Login `admin`/`admin1234` → le Dashboard s'affiche, « Cadastrados : 0 », 13 points
d'accès. ✅ Vérifié le 12/08/2026 via le driver Playwright du projet, capture d'écran à
l'appui, zéro requête externe (le kiosque marche sans internet).

### A.6 — État final et ce qui MANQUE encore

Vous avez un système qui tourne, **vide de personnes**. Pour le remplir :
- élèves : import Pronote (écran Réglages → Import) ;
- personnel : écran Servidores ou import HikCentral ;
- droits repas / autorisations de sortie : leurs écrans respectifs ;
- **ou** restaurez une sauvegarde — Partie B, qui remplace tout ce qui précède sauf A.1.

⚠️ NON TESTÉ dans ce drill : le chemin VM canonique (`deploy/docker-compose.yml`, jar
monté depuis `backend/target` dans un JRE 17 sur Ubuntu). La mécanique base/migrations/
bootstrap est identique — c'est le même jar — mais le compose lui-même n'a pas été
exécuté cette nuit. Suivez `docs/operacional/handoff.md` pour cette partie.

---

## 3. PARTIE B — Restaurer une sauvegarde

> Le format : `pg_dump` **texte** compressé gzip (c'est ce que produit le script de
> sauvegarde — un dump SQL complet, schéma + données). Durées mesurées sur une petite
> base : dump 1 s, restauration 1 s. Sur la base réelle (~440 000 passages + photos),
> comptez des **minutes** — c'est linéaire, pas structurel.

### ✅ Où sont réellement les sauvegardes — vérifié le 31/08/2026

**`/home/magbo/backups/`**, et **pas** `/var/backups/magbo/` comme cette page
l'indiquait. Cherchées au mauvais endroit pendant un incident, elles paraissent
absentes alors qu'elles sont là.

> ⚠️ **Ce que la sauvegarde NE contient PAS** (vérifié le 03/09/2026) : le
> **fichier de licence**. `deploy/backup.sh` n'exécute qu'un `pg_dump`, et la
> licence vit dans un volume à part. Les **photos**, elles, y sont — elles sont en
> base depuis V011, et c'était précisément la raison de les y mettre. Voir **B.4-bis**.

```bash
ssh magbo@192.168.1.253
ls -lht ~/backups/ | head -5      # le plus récent doit dater d'hier 19:00
```

| | |
|---|---|
| **Script réel** | `/home/magbo/backup-magbo.sh` — **non versionné**, il n'existe que sur la VM |
| **Dossier** | `/home/magbo/backups/` |
| **Cadence** | tous les jours à **19:00**, ~109 Mo par dump |
| **Rétention** | **14 jours** |
| **Format** | `pg_dump` texte + gzip, PostgreSQL 16.14 |

⚠️ **`deploy/backup.sh` du dépôt n'est PAS ce fichier** (rétention 30 jours ; son
défaut `DB_NAME` était même faux jusqu'au 12/08/2026) et il appelle `pg_dump`
**sur l'hôte** alors que PostgreSQL tourne **en conteneur** — lancé tel quel, il
échoue. Ne remplacez pas celui de la VM par celui du dépôt.

🔴 **Aucune copie hors machine.** Les sauvegardes sont sur la VM qu'elles
sauvegardent : un disque perdu emporte la base **et** ses quatorze jours de
dumps. Les photos d'identification n'existent nulle part ailleurs — elles vivent
uniquement dans `user_photos`, donc dans ces dumps.

### B.1 — Base cible VIDE ✅

La restauration se fait dans une base **vierge** — jamais par-dessus une base vivante.

```bash
docker run -d --name magbo-restore \
  -e POSTGRES_DB=magbodb -e POSTGRES_USER=magbo -e POSTGRES_PASSWORD=magbo_dev_pass_2026 \
  -p 5432:5432 postgres:16
```

**Ne démarrez PAS le backend avant la restauration** : il créerait le schéma et
l'utilisateur admin, et le dump — qui contient déjà tout — se heurterait à l'existant.
Ordre strict : base vide → restauration → backend.

### B.2 — Restaurer ✅

```bash
docker cp magbo_20260812_030000.sql.gz magbo-restore:/tmp/
docker exec magbo-restore bash -c \
  "gunzip -c /tmp/magbo_20260812_030000.sql.gz | psql -U magbo -d magbodb -v ON_ERROR_STOP=1"
```

Doit se terminer **sans aucune ligne ERROR** (le drill du 12/08/2026 : 0 erreur).
`ON_ERROR_STOP=1` arrête à la première — c'est voulu : une restauration partielle qui
continue en silence est pire qu'un échec franc.

### B.3 — Vérifier ce qui a survécu ✅

```bash
docker exec magbo-restore psql -U magbo -d magbodb -c "
  SELECT 'app_users' t, count(*) FROM app_users
  UNION ALL SELECT 'access_logs', count(*) FROM access_logs
  UNION ALL SELECT 'system_users', count(*) FROM system_users
  UNION ALL SELECT 'exit_permissions', count(*) FROM student_exit_permissions
  UNION ALL SELECT 'meal_entitlements', count(*) FROM meal_entitlements
  UNION ALL SELECT 'door_mappings', count(*) FROM door_mappings
  UNION ALL SELECT 'user_photos', count(*) FROM user_photos;"
```

Comparez avec ce que vous attendez de la veille. **Les photos** (raison du choix
PostgreSQL plutôt que disque) : vérifiez l'intégrité bit à bit —

```bash
docker exec magbo-restore psql -U magbo -d magbodb -c \
  "SELECT count(*) AS photos, count(*) FILTER (WHERE sha256 = encode(sha256(bytes),'hex')) AS integres FROM user_photos;"
# → les deux nombres doivent être ÉGAUX
```

✅ Prouvé le 12/08/2026 : photo restaurée octet pour octet (sha256 identique), et servie
ensuite par `GET /api/users/{id}/photo` avec le même hachage.

### B.4 — Démarrer le backend sur la base restaurée ✅

Même commande que A.2. Doit imprimer :
```
Admin 'admin' já existe, pulando bootstrap.
```
— c'est **l'admin de la sauvegarde** qui vaut, avec **son** mot de passe (pas
`admin1234`, sauf si personne ne l'avait changé). Si plus personne ne connaît le mot de
passe restauré : `magbo.admin.username=admin2` en variable pour créer un second admin au
démarrage, puis réglez le problème depuis l'écran de gestion.

Puis : `curl /api/health` → `CONNECTED`, login, et l'application (A.5) montre les
personnes restaurées. ✅ Vérifié : 2 personnes de test, autorisation de sortie avec ses
deux autorités, droit repas + historique, 14 door_mappings — tout présent après le cycle
complet dump → restauration → API.

### B.4-bis — ⚠️ REDÉPOSER LE FICHIER DE LICENCE (il n'est PAS dans la sauvegarde)

> **Constaté le 03/09/2026 : le mot « licence » n'apparaissait nulle part dans
> cette page.** Une restauration menée à la lettre rendait donc un système dont
> **tous les écrans de gestion sont fermés**, et rien ici ne disait pourquoi.

La sauvegarde est un `pg_dump` — **la base, et rien d'autre** (`deploy/backup.sh`
n'exécute que `pg_dump | gzip`). Or la licence est un **fichier**, monté depuis un
volume séparé en lecture seule (`./licence:/licence:ro`, `deploy/docker-compose.yml`),
et le répertoire hôte est ignoré par git. Elle ne peut donc **pas** être dans le dump,
par construction.

Sans elle, le backend démarre normalement, les **passages continuent d'être
enregistrés** et le **PPMS reste nominatif** (c'est le principe de l'ADR-006 : une
licence absente **avertit**, elle ne met personne en danger) — mais l'état vaut
`ABSENTE`, traité comme **EXPIREE sans courtoisie**, et la **gestion est fermée**.

```bash
# 1. Reposer le fichier à l'endroit exact que le compose monte
ls -l ~/Controle-de-Acesso/deploy/licence/licence.magbo

# 2. Redémarrer le backend, puis vérifier — c'est la seule ligne qui compte
curl -s http://localhost:8080/api/health | grep -o '"licence".*'
```

Attendu : `"etat":"VALIDE"`. ⚠️ `"motif":"ABSENTE"` **n'est pas une expiration** :
c'est un déploiement raté — fichier manquant ou volume mal monté. Émission et
dépannage : `docs/operacional/procedimento-licence.md`.

> ⚠️ **Le témoin d'horloge, lui, EST dans le dump** (`licence_clock`, V027) : il vit
> en base. Restaurer un dump ancien y remet une date d'observation ancienne — sans
> effet, la borne ne fait qu'avancer. Mais restaurer un dump **pris après un
> dérèglement d'horloge** rapporte la borne dans le futur, et la gestion reste
> fermée jusqu'à un `UPDATE` manuel (procédure dans `procedimento-licence.md`).

---

### B.5 — Pièges connus de la restauration

| Symptôme | Cause → remède |
|---|---|
| `database "magbodb" does not exist` | Conteneur créé sans `POSTGRES_DB` → recréez, ou `createdb` |
| `role "magbo" does not exist` | Dump d'un autre utilisateur → créez le rôle avant, ou `-U` correct |
| Erreurs `already exists` en cascade | La base n'était pas vierge (backend démarré trop tôt) → recommencez B.1 |
| Login refusé après restauration | Le mot de passe est celui de la sauvegarde, pas le défaut |
| Photos absentes mais tables pleines | Vous avez restauré un dump antérieur à V011 — les photos n'existaient pas encore |
| **Écrans de gestion fermés / 402** après une restauration réussie | La **licence** n'est pas dans le dump — voir **B.4-bis**. `curl /api/health` dira `"motif":"ABSENTE"` |

---

## 4. La question qui compte

**Un inconnu compétent peut-il reconstruire ce système demain avec ce dépôt ?**

Oui pour le logiciel — c'est le chemin de la Partie A, exécuté de bout en bout le
12/08/2026. Ce qui ne se reconstruit **pas** depuis le dépôt : les **données** (923
élèves, l'historique des passages, les photos) — elles ne vivent que dans PostgreSQL et
ses sauvegardes, d'où la Partie B ; et la **configuration physique** (IP des terminaux,
Écoute HTTP, bibliothèques faciales du HikCentral) — documentée dans
`docs/operacional/procedimento-hikcentral.md` mais dépendante du matériel de l'école.

La sauvegarde n'est une garantie que si quelqu'un refait ce drill de temps en temps.
Il a coûté une heure la première fois ; il en coûtera dix minutes la prochaine.
