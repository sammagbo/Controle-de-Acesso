# Handoff — l'état réel du système

**Pour qui :** la personne qui reprend MAGBO Access Control après le départ de
Sam, ou Sam lui-même revenant après une longue absence.

**Date de coupe : 2026-08-29.** Dernier merge sur `main` : `7c4d54e`.
Suites : backend **943** tests (0 échec, exactement 2 `@Disabled`), npm **694**.

Ce document décrit le système **tel qu'il tourne**, pas tel qu'il a été pensé.
Là où l'intention et la réalité divergent, c'est la réalité qui compte.

> **Aucun mot de passe, jeton ou secret ici.** Les secrets vivent dans le `setx`
> du PC et dans `deploy/.env` sur la VM, et ils n'en sortent pas. Si vous
> trouvez un secret dans ce fichier ou dans n'importe quel `.md` du dépôt,
> c'est un incident : faites tourner la valeur et retirez-la.

> **Note de langue.** Ce document était en portugais jusqu'au 05/08. Il est
> passé au français le 29/08, pour être cohérent avec le manuel, le guide
> d'installation, les rapports de nuit et le livre du système — tout ce qui
> sera lu à côté de lui. La version portugaise reste dans l'historique git :
> `git show 3ea4213:docs/operacional/handoff.md`.

---

# ⚠️ À LIRE EN PREMIER — le défaut ouvert le plus grave

**Depuis le 25/08, le portail ne reconnaît plus que ~46 élèves distincts par
jour, contre ~500 jusqu'au 24/08.**

| Mesure | Jusqu'au 24/08 | Depuis le 25/08 |
|---|---|---|
| Élèves distincts reconnus / jour | ~500 | **~46** |
| Personnel reconnu / jour | ~40 | ~40 — **inchangé** |
| Personnes vues le 24/08 à 7h | 297 | — |
| Personnes vues le 25/08 à 7h | — | **35** |

La rupture est **nette entre le 24 et le 25** : ce n'est pas une dérive
progressive. **Le personnel n'est pas touché**, ce qui est le fait le plus
instructif du tableau — quoi qu'il se passe, ça ne frappe pas tout le monde.

Sur environ **1160 visages non identifiés par jour**, seuls **22** atteignent la
comparaison de nom, avec des similarités de **0,13 à 0,46** — très en dessous du
seuil. Les autres n'arrivent même pas jusque-là.

**Ce n'est pas un défaut logiciel.** Le backend reçoit et traite normalement.
Le diagnostic du 27/08 a écarté l'hypothèse la plus sérieuse (le changement de
parser multipart) avec preuve, et n'a trouvé aucun défaut de code — voir
[`diagnostic-portaria-2026-08-27.md`](diagnostic-portaria-2026-08-27.md), qui
contient les cinq requêtes SQL à lancer sur la VM et les `grep` de logs.

**Ce que l'on sait d'autre :** la chute **coïncide avec les imports de photos
des 25 et 26/08**.

**Piste à instruire :** la bibliothèque de visages et les paramètres des caméras
DeepinView, côté HikCentral. La procédure est dans
[`procedimento-hikcentral.md`](procedimento-hikcentral.md).

> ⚠️ **La cause n'est pas prouvée.** La coïncidence de dates est une piste, pas
> une conclusion. Ne réparez rien avant d'avoir mesuré : le diagnostic du 27/08
> existe précisément pour éviter qu'on « corrige » ce qui n'est pas cassé.

### Note historique, à connaître avant de lire les chiffres d'avant

La caméra **.166 (SORTIE) était en panne jusqu'au 24/08**. Le portail produisait
donc environ **950 ENTRÉES et ZÉRO SORTIE par jour**.

⚠️ **Ces 950 n'étaient pas 950 personnes.** C'était la même population recomptée
à chaque retour : sans lecture de sortie, chaque rentrée dans l'école
ré-enregistrait une entrée. Toute comparaison « avant / après » qui prend 950
pour un effectif est fausse. Le nombre à comparer est celui des **personnes
distinctes**, colonne de gauche du tableau ci-dessus.

---

## 1. À quoi sert le système, et qui s'en sert

MAGBO Access Control enregistre et donne à voir **qui est passé où, et quand**,
dans le Lycée Molière de Rio de Janeiro. Reconnaissance faciale sur des
terminaux Hikvision → webhook HTTP → Spring Boot → PostgreSQL → postes
Electron.

**Ce que le système fait :** il observe, il enregistre, il signale.

⚠️ **Ce que le système NE FAIT PAS : il n'ouvre et ne ferme aucune porte.** Le
webhook est **post-événement** — quand le MAGBO apprend qu'une personne est
passée, elle est déjà passée. C'est une décision d'architecture, pas une
limitation à corriger : [`ADR-003`](../architecture/decisoes/ADR-003-webhook-pos-evento.md).
Le blocage physique, quand il existe, appartient à HikCentral.

La seule exception est la cantine, et elle reste **un geste humain** : le
terminal valide l'identité, le MAGBO valide la règle, et **l'opérateur applique
l'exception** — [`ADR-004`](../architecture/decisoes/ADR-004-bloqueio-operacional-assistido.md).
Quand la documentation dit `DENY`, elle parle d'une décision **logique** écrite
dans `access_attempts`. Aucune porte ne se ferme.

**Qui s'en sert :**

| Profil | Ce qu'il fait avec |
|---|---|
| **Portaria** | voit les passages du portail en direct, enregistre un passage à la main quand la reconnaissance échoue |
| **Cantine** | Moniteur en direct : qui est dans le réfectoire, qui doit sortir, qui est sorti ; gère les droits repas |
| **CDI** | présence de la bibliothèque, pointage, mode urgence, capacité et exclusions |
| **Infirmerie** | visites, durées, sorties non enregistrées |
| **Vie Scolaire** | recherche d'une personne, parcours du jour, autorisations de sortie, régimes, rapports |
| **Direction** | rapports, KPI, PPMS |

---

## 2. Ce qui tourne aujourd'hui

### 2.1 Les terminaux

> ⚠️ Ces IP viennent de Sam (28/08) et **ne sont pas dans le dépôt**. La source
> de vérité en production est la table `door_mappings`.
> **[À VÉRIFIER]** Confirmer sur la VM :
> ```bash
> docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
>   "SELECT terminal_ip, point_id, action, label, ativo FROM door_mappings ORDER BY terminal_ip;"
> ```

| Point | IP | Rôle |
|---|---|---|
| Portail | `.167` | ENTRÉE (caméra DeepinView) |
| Portail | `.166` | SORTIE (caméra DeepinView) — en panne jusqu'au 24/08 |
| CDI | `.15`, `.16` | terminaux MinMoe |
| Cantine | `.10`, `.12`, `.13`, `.14` | terminaux MinMoe |

⚠️ **Sur le `.15`, le champ « Nom de la porte » affiche `CDI-SAIDA`.** Il ment.
**Fiez-vous à l'IP, jamais au nom affiché par l'appareil.**

⚠️ **Le chemin du webhook sur les terminaux :**
`Système et maintenance → Réseau → Service réseau → HTTP(S) → Écoute HTTP`.
**Ce n'est pas le menu « Événement »**, où l'on cherche naturellement.

⚠️ **Les IP dansent (DHCP), et ça casse en silence.** Ni erreur, ni alerte : les
événements cessent simplement d'arriver. Avant toute session sur le matériel :
vérifier l'IP du serveur, l'IP au dos de chaque terminal, l'URL de l'*Écoute
HTTP*, et la colonne `terminal_ip` de `door_mappings`.

⚠️ **Les caméras du portail n'authentifient pas : elles COMPARENT.** L'identité
est résolue côté MAGBO par `CameraIdentityService`, avec trois pièges mesurés en
production, tous documentés dans [`.claude/rules/hikvision.md`](../../.claude/rules/hikvision.md) :
les accents arrivent translittérés (`LABB'E` pour LABBÉ), le nom est tronqué à
32 caractères, et les échelles de similarité sont mélangées (fraction d'un côté,
pourcentage de l'autre).

### 2.2 Les migrations

**V001 → V026, toutes appliquées sur la VM de production** (état déclaré par
Sam le 28/08). Le détail de chacune est dans
[`deploy/migrations/README.md`](../../deploy/migrations/README.md).

**[À VÉRIFIER]** Confirmer que les tables des dernières migrations existent :
```bash
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename IN ('meal_slots','system_settings','cdi_exclusions','cdi_alert_events','cantine_removals')
   ORDER BY 1;"
# → les cinq doivent répondre
```

### 2.3 Ce qui a changé depuis le 05/08

L'ancienne version de ce document s'arrêtait au 05/08. Voici, en une ligne
chacun, les chantiers postérieurs. Le détail vit dans les rapports de nuit.

| Quoi | Migrations | Où c'est raconté |
|---|---|---|
| **Créneaux cantine** — le planning devient une configuration ; `class_schedules` n'est plus lu par la cantine | V021–V023 | [`ADR-005-creneaux-cantine`](../architecture/decisoes/ADR-005-creneaux-cantine.md), [`revue-migrations-v021-v023.md`](revue-migrations-v021-v023.md) |
| **Régime de sortie** — le droit ANNUEL de sortir, cinq verdicts | V014, V015 | [`nuit-26-27-08-rapport.md`](nuit-26-27-08-rapport.md) |
| **PPMS** — qui est dans l'école, par zone, maintenant | — | idem |
| **Photos d'identité** — dans la base, jamais sur disque | V011 | [`.claude/rules/backend.md`](../../.claude/rules/backend.md) |
| **Capacité et exclusions du CDI** | V025 | [`nuit-26-27-08-rapport.md`](nuit-26-27-08-rapport.md) |
| **Registre des alertes du CDI** — chaque alerte laisse une trace, avec son auteur | V026 | [`nuit-27-28-08-rapport.md`](nuit-27-28-08-rapport.md) |
| **Retraits manuels du Moniteur** — un geste d'écran, jamais une suppression | V020 | idem |
| **Écran de configuration** — les réglages modifiables à l'écran | V024 | [`inventaire-configurabilite.md`](inventaire-configurabilite.md) |
| **Recherche centrale** sur l'écran d'accueil, avec autocomplétion | — | [`nuit-27-28-08-rapport.md`](nuit-27-28-08-rapport.md) |
| **L'affiche cantine** imprimable en couleur, fidèle au mur | — | [`controle-affiche-cantine.md`](controle-affiche-cantine.md) |

⚠️ **L'écran de configuration a déménagé le 28/08 :** il n'est plus dans le
Panneau Administratif, il est dans **l'engrenage du header**, visible avec
`ADMIN` ou la permission `CONFIG_WRITE`.

### 2.4 Les sept comportements à connaître avant de lire un chiffre

Ces règles décident **comment la donnée doit être lue**. Qui ne les connaît pas
interprétera les nombres à l'envers. Elles sont détaillées au chapitre 3 du
livre ([`docs/livre/03-regles-metier.md`](../livre/03-regles-metier.md)) ; voici
le strict nécessaire.

1. **Le timestamp est l'heure de l'ÉVÉNEMENT, pas celle de la réception.**
   Depuis le 03/08, `EventTimeResolver` lit le `dateTime` du payload. Trois
   gardes seulement font retomber sur l'heure de réception : `dateTime` absent
   ou illisible, horloge de l'appareil en avance de plus de **5 min**, ou date
   de plus de **30 jours** dans le passé. Chaque repli laisse une ligne INFO
   avec l'IP et le motif.
   ⚠️ **Les RÈGLES, elles, restent jugées à l'heure de la décision** — dette
   ouverte, §6.1.

2. **Trois couches de déduplication, et ce ne sont pas la même chose.**

   | Couche | Fenêtre | Ce qu'elle empêche | Clé |
   |---|---|---|---|
   | Ingestion | 60 s | l'appareil a **renvoyé le même paquet** | IP + `serialNo` |
   | Même passage | 30 s | le terminal a **reconnu deux fois la même personne** | personne + point + action |
   | Repas dupliqué | 90 s | **règle métier** : deuxième repas dans la journée | personne + point |

3. **Fermeture automatique de présence.** `PresenceAutoCloseService` tourne
   toutes les 5 minutes et ferme les points dont l'heure de fermeture est
   passée. La sortie synthétique est déclarée, jamais déguisée :
   `flag=FECHAMENTO_AUTO`, `created_by_user=system`, et elle porte **l'heure de
   fermeture**, pas celle où le job a tourné.

   ⚠️ **Deux points sont configurés en production, pas un :** `BIBLIO` à 17:00
   **et `REFEI1` à 15:00** (`application-prod.properties`). Le commentaire du
   fichier dit que REFEI1 était « inerte jusqu'au pilote — aucun mouvement,
   rien à fermer », et il porte l'avertissement suivant, jamais levé :
   *« CONFÉRER L'HEURE AVEC LA CANTINE avant le jour 1 — qui est encore dedans
   à 15:00 reçoit une SORTIE synthétique et disparaît du panneau de
   l'opérateur. »* **La cantine est en service depuis, et l'heure n'a
   toujours pas été confirmée.** Voir la question 15 au §11.

4. **Les rapports comptent les ÉLÈVES par défaut.** 152 fonctionnaires et 49
   professeurs polluaient les chiffres du CDI. C'est un filtre **d'affichage** :
   rien n'est effacé, le Journal montre tout.

5. **Un passage de moins de 60 s ne compte pas comme une visite.**
   `magbo.report.min-visit-seconds`, et l'appariement entrée/sortie se fait
   **par pile** (le positionnel produisait des durées négatives).

6. **Le plancher de visite a une source unique :**
   `GET /api/access/report-config`. Le JS avait une constante en miroir, et le
   même écran affichait deux nombres pour le même jour.

7. **Deux flags de RÉPÉTITION sortent des écrans standard :** `POSTO_FIXO` (qui
   travaille au point) et `JA_PRESENTE` (qui entre en étant déjà dedans). La
   liste vit **une seule fois**, dans `AccessLogRepository.REPETICOES`. Rien
   n'est effacé : le Journal les montre, avec une lentille pour les filtrer.

### 2.5 Signatures de lecture — d'où vient un enregistrement ?

Dans six mois, quelqu'un demandera « cet accès vient du visage ou du clavier ? ».

| Origine | `created_by_user` | Microsecondes du `timestamp` | `flag` |
|---|---|---|---|
| **Terminal** (visage/carte) | `NULL` | **zéro** (le `dateTime` du payload est à la seconde) | `NULL`, `FORA_HORARIO`, `EXCEDEU_TEMPO`… |
| **Saisie manuelle** | login de l'opérateur | **≠ zéro** (`LocalDateTime.now()`) | idem |
| **Fermeture automatique** | `system` | zéro (cachet `17:00:00`) | `FECHAMENTO_AUTO` |

**Microsecondes ≠ 0 ET `created_by_user` rempli = saisie manuelle.** Les deux
marques ensemble, parce qu'aucune seule n'est une preuve.

> **`access_logs` = accès effectif · `access_attempts` = tout ce qui a été tenté
> et refusé.** Séparation structurelle ([`ADR-001`](../architecture/decisoes/ADR-001-attempts-vs-logs.md)) :
> `access_logs` ne reçoit **jamais** un événement refusé. Si vous avez besoin
> des deux, faites un `UNION` **dans la requête** — jamais dans l'écriture.

---

## 3. Déployer — le rite complet

Le déploiement **initial** (conteneurs, base, migrations) est dans
[`deploy/README.md`](../../deploy/README.md) et
[`reconstruir-do-zero.md`](reconstruir-do-zero.md). Ce qui suit est la **mise à
jour** d'un système déjà en service.

> ⚠️ **[À COMPLÉTER PAR SAM]** L'hôte de la VM, le chemin du dépôt sur la VM et
> l'utilisateur de déploiement **ne sont versionnés nulle part**. Les commandes
> ci-dessous utilisent `/opt/magbo` par convention. **Question précise : quel
> est le nom d'hôte ou l'IP de la VM, sous quel utilisateur se connecte-t-on, et
> quel est le chemin réel du dépôt ?**

```bash
# ── 1. Sur le PC : construire ────────────────────────────────────────
mvn -f backend/pom.xml clean package
# → backend/target/access-control-1.0.0.jar

# ── 2. Les deux suites, AVANT de copier quoi que ce soit ─────────────
cd backend && rm -rf target/test-classes && mvn -o test    # 943, 0 échec, 2 @Disabled
cd .. && npx vitest run                                     # 684, 0 échec
```

⚠️ **Mesurer depuis zéro.** `mvn test` incrémental a déjà donné un
`BUILD SUCCESS` faux : quand seule la signature d'un constructeur change,
Lombok + un `target/test-classes` périmé laissent passer trois tests cassés.

⚠️ **Le `pom.xml` doit contenir `<include>**/*IT.java`** dans le Surefire. Sans
lui, les tests d'intégration sont **sautés en silence** et le total baisse sans
que rien n'échoue. Le critère n'est pas un total fixe : c'est **0 échec et
exactement 2 `@Disabled`**.

```bash
# ── 3. Copier le jar sur la VM ───────────────────────────────────────
scp backend/target/access-control-1.0.0.jar <user>@<vm>:/opt/magbo/backend/target/

# ── 4. Les migrations À LA MAIN, AVANT de remonter le backend ────────
#     (voir §5 — ddl-auto ne les fera pas)

# ── 5. Redémarrer ────────────────────────────────────────────────────
cd /opt/magbo/deploy && docker compose restart backend
# `sudo` n'est plus nécessaire : l'utilisateur de déploiement est dans le
# groupe `docker`. S'il demande un mot de passe, la permission a régressé.

# ── 6. Vérifier la santé, TOUJOURS, avant de partir ──────────────────
curl -s http://localhost:8080/api/health
# → doit contenir "database":"CONNECTED"
```

**7. Smoke avec des CLICS, pas seulement des `curl`.** C'est la leçon la plus
chère du projet : le 17/07, **trois espèces différentes** de bug de câblage
d'interface ont passé toute la batterie de `curl` et ne sont apparues que
lorsque quelqu'un a parcouru les écrans. Le parcours est dans
[`docs/frontend-smoke-checklist.md`](../frontend-smoke-checklist.md).

---

## 4. Distribuer le portable

Procédure complète, poste par poste :
[`guide-installation-postes.md`](guide-installation-postes.md).
Construction du paquet : [`release-portable.md`](release-portable.md).

Les trois choses qui comptent :

1. **Avant de construire, vérifier qu'aucun CDN n'est revenu :**
   ```bash
   grep -cE 'src="https?://|cdn\.|unpkg|jsdelivr' index.html   # doit rendre 0
   ```
   Un `<script src="https://…">` nouveau **ne produit aucune erreur** : l'écran
   ne s'affiche simplement pas sur un poste hors ligne.

2. **Vérifier le paquet** avec `node scripts/verify-package.js`. Le script
   **dérive** la liste des fichiers obligatoires depuis `index.html` — il ne
   maintient pas une liste en double qui vieillirait toute seule.
   État déclaré par Sam le 28/08 : **92/92 fichiers obligatoires**.

3. **Distribuer = remplacer le `.exe` seulement.** Et **ouvrir par le `.bat`**,
   jamais le `.exe` directement : l'exécutable ne garde aucune configuration, il
   lit des variables d'environnement, et lancé nu il ouvre une application
   **vide, sans erreur**. Le lanceur est
   [`deploy/portable/Abrir-MAGBO.bat`](../../deploy/portable/Abrir-MAGBO.bat).

⚠️ **`build:portable` peut être bloqué par un handle sur `app.asar`** alors
qu'aucun processus n'est visible. Seul un redémarrage du poste le libère.
*(Rapporté par Sam ; non reproductible depuis le dépôt.)*

---

## 5. Les migrations et leur ordre

⚠️ **`ddl-auto=update` ne les fera pas.** Il ajoute des colonnes ; il ne crée
jamais une contrainte `CHECK` sur une table existante et **n'altère jamais** un
`CHECK` déjà posé. Une valeur nouvelle dans un enum Java passe les tests (H2
recrée tout) et échoue **uniquement sur la VM**. Ce piège a mordu trois fois :
V009, V015, V022.

⚠️ **Appliquer À LA MAIN, AVANT de monter le backend.** Celui qui crée la table
en écrit le schéma : si le backend démarre d'abord, Hibernate crée la table
*sans* les `CHECK`, et la migration ne les posera plus.

```bash
cd /opt/magbo

for f in V001__access_attempts V002__meal_entitlements V003__meal_entitlement_events \
         V004__student_exit_permissions V005__system_users_permissoes V006__indexes \
         V007__app_users_departamento V008__app_users_camera_person_id \
         V009__denial_reason_camera V010__app_users_posto_fixo V011__user_photos \
         V012__exit_permission_two_authorities V013__password_reset_requests \
         V014__student_regimes V015__denial_reason_regime \
         V016__access_logs_indice_ponto_hora V017__student_regimes_enum_checks \
         V018__access_logs_indice_hora V019__access_logs_indice_user_id \
         V020__cantine_removals V021__meal_slots V022__denial_reason_meal_slot \
         V023__meal_slots_seed V024__system_settings V025__cdi_exclusions \
         V026__cdi_alert_events; do
  echo "== $f"
  docker exec -i magbo-postgres psql -v ON_ERROR_STOP=1 -U magbo -d magbodb \
    < deploy/migrations/$f.sql || { echo "ÉCHEC sur $f — NE PAS monter le backend"; break; }
done
```

⚠️⚠️ **`ON_ERROR_STOP=1` n'est pas décoratif.** Sans lui, `psql` continue après
l'erreur **et sort avec le code 0** : le script annonce le succès, le backend
démarre, et le défaut se découvre en production des semaines plus tard.

Toutes les migrations sont idempotentes (`IF NOT EXISTS`, blocs `DO $$`) : les
rejouer sur une base à jour ne fait rien.

⚠️ **Mais `CREATE TABLE IF NOT EXISTS` ignore la FORME de la table existante.**
Si une table préexiste avec un schéma différent, l'instruction ne fait rien
**et ne dit rien**. C'est pourquoi V021, V025 et V026 portent une clause de
garde qui lève une exception explicite dans ce cas.

**Rollbacks :** `deploy/migrations/rollback/`, un par migration sauf V006, V008,
V009 et V023 (V023 est un *seed* : ses lignes partent avec `R021`). Chaque
absence est justifiée dans le README des migrations, et
`tests/migrations.test.js` échoue si une migration nouvelle arrive sans plan de
retour.

⚠️ **`R011`, `R025` et `R026` effacent des données irremplaçables** : les photos
d'identité, les exclusions du CDI, le registre des signalements. Un `pg_dump`
**avant**, toujours.

---

## 6. Sauvegarde et restauration

**Restauration :** procédure complète, avec les pièges, dans
[`reconstruir-do-zero.md`](reconstruir-do-zero.md).

**Sauvegarde manuelle** (celle en laquelle on peut avoir confiance) :

```bash
docker exec magbo-postgres pg_dump -U magbo -d magbodb -F c -f /tmp/magbo.dump
docker cp magbo-postgres:/tmp/magbo.dump ./backups/magbo-$(date +%Y%m%d-%H%M).dump
```

Les dumps vont dans `backups/`, **ignoré par git**. Ne jamais committer un dump :
il contient 923 élèves réels, et depuis la V011 **leurs photos**.

### 🔴 Le script automatique n'est probablement pas fonctionnel

[`deploy/backup.sh`](../../deploy/backup.sh) existe : dump quotidien
compressé, rétention 30 jours, `rsync` optionnel, cron suggéré `0 3 * * *`.

Le défaut de nom de base a été corrigé (`DB_NAME` vaut bien `magbodb`,
ligne 23). **Mais le script appelle `pg_dump` directement sur l'hôte**
(ligne 40), alors que PostgreSQL tourne **dans un conteneur** — l'hôte peut
très bien ne pas avoir le client installé. Le script a `set -euo pipefail` : il
sort en erreur, et l'erreur part dans `backup.log`, que personne ne lit.

**[À VÉRIFIER] — une minute sur la VM, et c'est la vérification la plus rentable
de ce document :**
```bash
crontab -l | grep -i backup          # le cron est-il seulement actif ?
ls -lh /var/backups/magbo/           # y a-t-il un fichier, et de quand ?
tail -30 /var/backups/magbo/backup.log
```
Si le dossier est vide : **faire un dump manuel aujourd'hui**, et seulement
ensuite réparer le script (envelopper l'appel dans `docker exec magbo-postgres …`).

**Avant toute batterie de tests ou toute migration : sauvegarder d'abord.**
Sans exception.

---

## 7. Les cinq gestes d'urgence

Le tableau qu'on lit à 7h du matin quand rien ne marche.

### 7.1 Les événements ne rentrent plus (aucune erreur)

**Cause la plus probable :** une IP a changé par DHCP. Ni erreur, ni alerte.

**Geste :**
```bash
# le mapping que le backend utilise
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT terminal_ip, point_id, ativo FROM door_mappings ORDER BY terminal_ip;"
# le dernier passage reçu, par point
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT point_id, max(timestamp) FROM access_logs GROUP BY 1 ORDER BY 2 DESC;"
```
Puis, sur chaque terminal : relever l'IP au dos de l'appareil, et vérifier que
l'URL de l'*Écoute HTTP* (`Système et maintenance → Réseau → Service réseau →
HTTP(S)`) pointe bien vers l'IP actuelle du serveur. Corriger `door_mappings` si
l'IP du terminal a bougé.

### 7.2 Le backend ne démarre pas, ou se connecte à une base vide

**Sur la VM :** une variable manque dans `deploy/.env`. Les repères du profil
`prod` pointent ailleurs — le backend démarre et se connecte au mauvais endroit.
```bash
cd /opt/magbo/deploy && docker compose logs --tail=50 backend
```
`POSTGRES_PASSWORD`, `MAGBO_JWT_SECRET`, `MAGBO_WEBHOOK_TOKEN`, `ADMIN_PIN` et
`MAGBO_ADMIN_PASSWORD` doivent être remplis. Le modèle est
[`deploy/.env.example`](../../deploy/.env.example).

**Sur le PC :** le conteneur hérité `magbo-db` a démarré et occupe le port 5432.
```powershell
docker ps
docker stop magbo-db; docker start magbo-postgres
```

### 7.3 Les horaires sont décalés de trois heures

**Cause :** `TZ` manque sur un des conteneurs. L'image `eclipse-temurin` démarre
en **UTC** ; la JVM adopte le fuseau du conteneur, et tout `LocalDateTime.now()`
rend de l'heure UTC — le système horodate **trois heures dans le futur**.

**Geste :** `TZ: America/Sao_Paulo` doit être présent sur **les deux** services
de `deploy/docker-compose.yml` (le commentaire du fichier explique pourquoi les
deux). Puis `docker compose up -d` et vérifier :
```bash
docker exec magbo-backend date
docker exec magbo-postgres date
```

### 7.4 L'application s'ouvre vide, sans erreur

**Deux causes, dans cet ordre de probabilité :**

1. L'application a été ouverte **par le `.exe`** au lieu du `.bat`. Sans les
   variables d'environnement, elle pointe sur `http://localhost:8080` — qui
   n'existe pas sur un poste. **Ouvrir par `Abrir-MAGBO.bat`.**
2. Un `<script src="https://…">` est revenu dans `index.html`. Sur un poste hors
   ligne, la page ne rend rien et **n'affiche aucune erreur**.
   `grep -cE 'src="https?://' index.html` → doit rendre `0`.

### 7.5 Un écran affiche une clé i18n crue (`cdi.excl.titulo`)

**Cause :** une clé utilisée dans le code n'existe pas dans le dictionnaire.
`t()` rend la clé elle-même quand elle manque — c'est visible à l'écran et
invisible pour les tests qui ne rendent aucun composant.

**Geste :** `npx vitest run tests/i18nChavesUsadas.test.js` nomme la clé
manquante. L'ajouter dans `js/utils/i18n.js`, **bloc FR d'abord, bloc PT
ensuite** — les deux dictionnaires doivent avoir exactement les mêmes clés, et
un test l'exige.

---

## 8. Ce qui est cassé aujourd'hui, et ce qui reste

### 8.1 Cassé

1. **Le portail** — voir la section en tête. Priorité absolue.
2. **La sauvegarde automatique** est probablement inopérante — §6.
3. **Le terminal `.10` n'est pas enregistré au HikCentral** : erreur `SYS[904]`,
   numéro de série en conflit. *[À VÉRIFIER : reproduire l'erreur et relever le
   message exact dans HikCentral.]*
4. **Le terminal `.14` est en Wi-Fi**, ce qui le rend le plus susceptible de
   perdre des paquets et de vider une file d'un coup.

### 8.2 Dettes ouvertes — à NE PAS corriger sans décision

Elles sont gelées par des tests : les « corriger » ferait échouer une suite qui
protège une décision.

| # | Dette | Pourquoi elle est gelée |
|---|---|---|
| 8.2.1 | **Les règles sont évaluées à l'heure de la DÉCISION**, pas à celle de l'événement | Une file hors ligne ne doit pas pouvoir changer un `DENY` en `ALLOW` rétroactivement. Le régime de sortie est **l'exception assumée** : il ne refuse jamais, il décrit — et il juge à l'heure de la passage |
| 8.2.2 | **La fermeture automatique de la cantine est configurée à 15:00 sans avoir été confirmée** | Écrite quand REFEI1 était inerte ; la cantine est en service depuis. Le fichier de configuration porte l'avertissement. Quiconque est encore dans le réfectoire à 15:00 reçoit une sortie synthétique |
| 8.2.3 | **`DEVICE_DENIED` est utilisé pour les sous-types inconnus** | Il manque `UNKNOWN_EVENT` dans l'enum. Ça gonfle `divergenciaHoje` |
| 8.2.4 | **Les endpoints protégés rendent 403, pas 401** | Seul le webhook rend 401 |
| 8.2.5 | **Deux couches HTTP dans le frontend** (`js/api.js` et `js/utils/api.js`) | Ne pas en créer une troisième ; consolider est un chantier à part |
| 8.2.6 | **`magbo.policy.meal-pending=DENY` en production** | Prérequis opérationnel : le bulk des autorisés **avant** le jour 1, sinon tout `PENDING` est refusé |
| 8.2.7 | **7 endpoints sans garde d'autorisation** | Nommés dans `ControllerAuthorizationGuardTest.DIVIDA_CONHECIDA`. ⚠️ L'un d'eux, `registerAccess`, est une **écriture**. Les garder casserait des écrans : c'est un chantier avec ses propres preuves |

### 8.3 Ce qui reste à faire

La liste datée et priorisée est au **chapitre 9 du livre** :
[`docs/livre/09-ce-qui-reste.md`](../livre/09-ce-qui-reste.md).

---

## 9. Où chercher le reste

| Question | Document |
|---|---|
| Le système en entier, pour quelqu'un qui arrive | [`docs/livre/`](../livre/) — neuf chapitres |
| Comment on se sert de chaque écran | [`docs/manual-utilisateur.md`](../manual-utilisateur.md) |
| Reconstruire de zéro / restaurer | [`reconstruir-do-zero.md`](reconstruir-do-zero.md) |
| Installer un poste | [`guide-installation-postes.md`](guide-installation-postes.md) |
| Les migrations, une par une | [`deploy/migrations/README.md`](../../deploy/migrations/README.md) |
| Pourquoi le système est comme il est | [`docs/architecture/decisoes/`](../architecture/decisoes/) (les ADR) |
| Les pièges par domaine | [`.claude/rules/`](../../.claude/rules/) |
| Ce qui s'est passé les dernières nuits | [`nuit-26-27-08-rapport.md`](nuit-26-27-08-rapport.md), [`nuit-27-28-08-rapport.md`](nuit-27-28-08-rapport.md) |
| Les réglages modifiables et ceux qui ne le sont pas | [`inventaire-configurabilite.md`](inventaire-configurabilite.md) |

---

## 10. Règles de travail héritées

Elles ont été écrites après avoir été payées. Elles sont dans
[`CLAUDE.md`](../../CLAUDE.md), et les trois qui coûtent le plus cher quand on
les oublie :

1. **Un pas → valider → committer → le suivant.** Une décision à la fois.
2. **Rien de simulé hors des tests.** Pas de données factices dans un écran :
   quelqu'un finira par les prendre pour vraies.
3. **Les changements de base sont additifs.** `ddl-auto=update` ajoute et ne
   retire jamais ; une colonne supprimée ne revient pas.

---

# 11. ⚠️ Les questions pour Sam — quinze minutes

Tout ce que le dépôt ne peut pas dire, rassemblé ici pour qu'on puisse y
répondre d'un seul coup. Chaque ligne est aussi marquée à sa place dans le
document.

### Accès et infrastructure
1. **Quel est le nom d'hôte ou l'IP de la VM**, sous quel utilisateur se
   connecte-t-on, et quel est le chemin réel du dépôt sur la VM ? (§3)
2. **Qui détient quels mots de passe ?** Pour chacun : `POSTGRES_PASSWORD`,
   `MAGBO_JWT_SECRET`, `MAGBO_WEBHOOK_TOKEN`, `ADMIN_PIN`,
   `MAGBO_ADMIN_PASSWORD`, le compte `admin` de l'application, l'accès web des
   terminaux Hikvision, HikCentral, la VM. **Où sont-ils rangés aujourd'hui, et
   qui d'autre y a accès ?**
3. **Le cron de sauvegarde est-il actif sur la VM**, et existe-t-il un seul
   fichier dans `/var/backups/magbo/` ? (§6)

### Contacts
4. **Fabiano (informatique)** : nom complet, e-mail, téléphone. Quelles
   demandes lui sont encore ouvertes ? (Les réservations DHCP des terminaux et
   de la VM ont été demandées — où en sont-elles ?)
5. **La direction** : qui décide, pour ce système, quand il faut trancher ?
6. **La Vie Scolaire** : qui est l'interlocuteur au quotidien ?

### Engagements et décisions
7. **Qu'est-ce qui a été promis verbalement, à qui, et pour quand ?**
   Rien de tel n'est écrit dans le dépôt.
8. **La liste DAF** attendue : qui la produit, sous quelle forme, pour quoi
   faire ?
9. **Les décisions en suspens avec la Vie Scolaire** : les horaires réels de la
   maternelle et de l'élémentaire (mesurés 11h54–12h37 le 26/08, ce qui
   contredit les horaires supposés), les six classes de collège du mercredi 13h
   à confirmer (1E1, 1E2, 2E1, 2E2, 3E1, 3E2), et les classes `5E3` et `3E3` qui
   figurent sur l'affiche sans avoir un seul élève en base.
10. **La dispense de badge par classe** est préparée mais désactivée. Qui décide
    de l'activer, et sait-on que les classes dispensées disparaissent aussi du
    décompte PPMS ?
11. **L'e-mail à Fabiano et le PDF du guide d'installation** : envoyés ou non ?

### Matériel
12. **Le terminal `.10`** (erreur `SYS[904]`, série en conflit) : y a-t-il un
    ticket ouvert, ou un échange avec Hikvision / le fournisseur ?
13. **Le terminal `.14` en Wi-Fi** : est-ce définitif, ou un câble est-il prévu ?
15. **La fermeture automatique de la cantine est réglée à 15:00** et le
    commentaire du fichier dit que l'heure n'a jamais été confirmée avec la
    cantine. **Est-ce la bonne heure ?** À 15:00, toute personne encore dans le
    réfectoire reçoit une sortie qu'elle n'a pas faite. (§2.4)

### Matériel *(suite)*
14. **Les imports de photos des 25 et 26/08** : quels fichiers, combien de
    personnes, et par quel chemin (l'écran du MAGBO, ou HikCentral) ? C'est la
    seule coïncidence connue avec la chute du portail.
