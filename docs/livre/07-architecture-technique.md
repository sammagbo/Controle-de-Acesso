# Chapitre 7 — Architecture technique

Ce chapitre s'adresse à la personne qui reprend **le code**. Il décrit comment
le backend, le frontend, la base et les tests sont faits — et surtout **pourquoi
ils sont faits comme ça**, parce que plusieurs choix ont l'air étranges tant
qu'on ne connaît pas l'incident qui les a produits.

---

## 1. Le backend

**Spring Boot 3.2.5 / Java 17**, Maven. Deux profils : `dev` (H2) et `prod`
(PostgreSQL). Paquet racine `com.magbo.access`, découpé en
`controllers / services / repositories / models / dto / config / security /
bootstrap`.

**27 contrôleurs, 35 services, 35 modèles.** Lombok partout
(`@RequiredArgsConstructor`, `@Builder`), injection par constructeur.

### 1.1 Les services qui décident

| Service | Ce qu'il décide |
|---|---|
| **`AccessDecisionService`** | **l'orchestrateur** — la seule classe qui connaît l'ordre des règles |
| `HikvisionEventClassifier` | sous-type → méthode et résultat. Pur, sans état |
| `EventTimeResolver` | **quelle heure va dans la base** : celle de l'événement, ou celle de la réception |
| `CameraIdentityService` | quelle personne est ce visage (portail) |
| `PersonNameMatcher` | la comparaison des noms, avec ses trois pièges |
| `MealEntitlementService` | droit au repas + son historique, dans la même transaction |
| `MealSlotService` | à quel créneau appartient cette personne |
| `ExitPermissionService` | autorisation ponctuelle de sortie |
| `RegimeSortieService` | le droit annuel — cinq verdicts |
| `CdiExclusionService` / `CdiAlertService` | exclusions du CDI et leur registre |
| `SettingsService` / `SettingsCatalog` | la surcouche des réglages, et leur catalogue |
| `DeduplicationService`, `SamePassageService`, `WebhookIngestionDedupService` | **trois** couches distinctes (chapitre 3) |
| `PresenceAutoCloseService` | les fermetures de fin de journée |
| `PostoFixoService`, `PresencaAbertaService` | les deux marques de répétition |
| `PpmsService` | qui est dans l'école, par zone |
| `MultipartTolerante` | le parseur qui accepte ce que les appareils envoient vraiment |

⚠️ **`AccessDecisionService` est le seul endroit où l'ordre des règles est
écrit.** Le chercher ailleurs, c'est le dupliquer — et deux ordres finissent par
diverger.

### 1.2 ⚠️ Pourquoi `/error` est ouvert dans `SecurityConfig`

C'est la ligne qui surprend en relisant `security/SecurityConfig.java`, et le
commentaire du fichier l'explique :

> *Sans elle, un import qui échoue renvoyait une erreur qui mentait sur sa
> cause : l'opérateur réessayait, ça échouait encore, sans jamais voir quelle
> ligne du fichier était fausse. **Une erreur qui ment sur sa cause coûte plus
> cher que l'erreur.***

⚠️ **`/error` n'ouvre rien.** Il ne rend que l'erreur d'une requête **déjà
arrivée** ; aucune donnée protégée ne passe par lui. Ce qu'il publie, c'est le
motif de l'échec — exactement ce que l'opérateur doit lire.

Le reste de la configuration : **JWT sans session**, `permitAll` uniquement sur
la connexion, la santé, les webhooks et la console H2. L'autorisation par aire
passe par `@PreAuthorize("@areaSecurity.can('…')")`, l'écriture sensible par
`hasRole('ADMIN') or @areaSecurity.hasPermission('…')`.

⚠️ Les comparaisons de secret utilisent **`MessageDigest.isEqual`**, pas
`equals` — et avec un `trim`, parce qu'un retour chariot collé au jeton a déjà
fait perdre du temps.

### 1.3 Le webhook

**Refus par défaut** : jeton absent de la configuration → le webhook rejette. Un
système qui accepte tout parce qu'il n'est pas configuré est pire qu'un système
arrêté.

Le parsing est **tolérant** (`parsePayload`, `MultipartTolerante`) parce que les
appareils n'envoient pas ce que la documentation promet. Ne pas régresser
là-dessus : c'est du code qui a été écrit contre du matériel réel.

---

## 2. Le frontend

**Electron + React 18 via Babel standalone. Aucun bundler.**

### 2.1 Ce que « pas de bundler » implique

Les fichiers de `js/` sont chargés par des `<script>` dans `index.html`, **et
l'ordre compte**. Un composant est une `function` globale ; un utilitaire est un
objet posé sur `window`.

⚠️ **Un module doit être chargé avant ceux qui l'utilisent au moment du rendu.**
Le test `tests/wiring.test.js` vérifie que les utilitaires chargent avant les
composants — il a attrapé une erreur d'ordre le 28/08.

✅ **Tout est embarqué dans `libs/`** : React, ReactDOM, Babel, Tailwind, lucide,
jsPDF, xlsx, **et les polices**. Le kiosque rend sans réseau.

⚠️ **Ne jamais réintroduire un CDN.** Un `<script src="https://…">` nouveau ne
produit **aucune erreur** : l'écran ne s'affiche simplement pas sur un poste
hors ligne. La vérification tient en une commande :
```bash
grep -cE 'src="https?://|cdn\.|unpkg|jsdelivr' index.html   # doit rendre 0
```

### 2.2 La structure de `js/`

| Dossier | Ce qu'il contient |
|---|---|
| `js/components/` | les écrans et les composants partagés |
| `js/cdi/` | l'écran du CDI, qui a sa propre couche de données (`CdiBackend`) |
| `js/utils/` | i18n, permissions, cache d'utilisateurs, cache de photos, helpers |
| `js/data/constants.js` | les points d'accès — **miroir conscient** de `AreaMapping` côté backend |

⚠️ **`js/data/constants.js` et `AreaMapping` changent ENSEMBLE.** Ce sont deux
copies de la même vérité, assumées comme telles.

⚠️ **Deux couches HTTP coexistent** : `js/api.js` (`window.api`) et
`js/utils/api.js` (les normaliseurs). C'est une dette connue. **Ne pas en créer
une troisième** ; consolider est un chantier à part.

### 2.3 L'i18n

`js/utils/i18n.js` porte deux dictionnaires, **FR d'abord, PT ensuite**.

⚠️ **`t()` rend la clé elle-même quand elle manque.** Une clé absente s'affiche
donc crue à l'écran (`cdi.excl.titulo`) — visible pour un humain, invisible pour
une suite qui ne rend aucun composant. Trois tests couvrent ce trou :
`i18n.test.js` (les deux dictionnaires ont les mêmes clés),
`i18nChavesUsadas.test.js` (toute clé utilisée existe) et `i18nGuard.test.js`
(pas de texte visible en dur dans les écrans migrés).

`tEnum(groupe, valeur)` est le **seul** chemin vers les libellés d'énumération —
ils vivaient jusqu'au 14/08 dans des tables statiques en français fixe, même
quand l'écran était en portugais.

### 2.4 Electron

`main.js` crée la fenêtre, `preload.js` expose la configuration
(`window.magboConfig` : `apiUrl`, `sector`, `source`, `doitConfigurer`,
`isProduction`, `cheminFichier`, `version` — issus de `MAGBO_API_URL` /
`MAGBO_SECTOR` ou du fichier `magbo-poste.json`). `NODE_ENV=production` active le
mode kiosque, à condition que le poste soit déjà réglé
(`posteConfig.verrouillable`).

⚠️ **Le second pont, `window.magboIpc`, est mort — et `MAGBO_KIOSK_PIN` ne sert à
rien.** `preload.js:112-123` expose `verifyKioskPin`, `exitKiosk` et
`onRequestAdminPin` ; `main.js:383` enregistre `Ctrl+Shift+Alt+Q` et émet
`request-admin-pin` ; `main.js:32` lit le PIN. **Aucun fichier de `js/`,
d'`index.html` ni de `tests/` n'écoute** (mesuré le 03/09/2026 par recherche
exhaustive). Le raccourci est donc un no-op silencieux, le PIN n'est demandé par
aucun écran, et un poste verrouillé se ferme par `Ctrl+Alt+Suppr` → Gestionnaire
des tâches. C'est la famille de défaut du bug `f947373` : une moitié écrite,
l'autre jamais branchée, et l'échec est muet. ⚠️ Ne pas confondre avec
`ADMIN_PIN`, qui est le PIN du backend (`/api/admin/verify`,
`js/components/AdminPinModal.js`) et qui, lui, fonctionne.

⚠️ **L'exécutable ne garde aucune configuration.** Il lit des variables
d'environnement et retombe sur `http://localhost:8080`. Lancé nu, il ouvre une
application **vide, sans erreur** — d'où le lanceur `.bat`.

---

## 3. La base

**PostgreSQL 16.** `ddl-auto=update` sur tous les profils, y compris la VM.

### 3.1 Les tables principales

| Table | Ce qu'elle porte |
|---|---|
| `app_users` | les personnes. **Identifiant String** (Pronote, 7 chiffres avec zéros à gauche) |
| `access_logs` | les accès **effectifs** — jamais un refus (ADR-001) |
| `access_attempts` | tout ce qui a été **tenté et refusé** — quatre axes : méthode, résultat du terminal, décision du MAGBO, motif |
| `door_mappings` | IP + porte + lecteur → point d'accès |
| `meal_entitlements` + `_events` | droit au repas et son historique |
| `meal_slots` + `_classes` + `_students` | le planning de la cantine (V021) |
| `student_exit_permissions` | autorisations ponctuelles de sortie |
| `student_regimes` + `_events` | le droit annuel de sortir |
| `user_photos` | les photos d'identité, **en base** |
| `system_settings` | la surcouche des réglages (V024) |
| `cdi_exclusions`, `cdi_alert_events` | exclusions du CDI et leur registre |
| `cantine_removals` | les retraits d'écran du Moniteur |
| `system_users` | les comptes opérateurs |

⚠️ **Les dates sont des `LocalDateTime` locaux (BRT)**, dans des colonnes
`timestamp without time zone`. **Ne jamais poser `hibernate.jdbc.time_zone`.**

⚠️ **`user_photos` est une table à part, jamais une colonne de `app_users`** :
`userRepository.findAll()` tourne sur un chemin chaud, et une colonne `bytea`
là-dedans traînerait ~25 Mo par appel. Et c'est du **BYTEA sans `@Lob`** — avec
`@Lob`, Hibernate 6 génère un `oid`, que `pg_dump` traite autrement.

⚠️ **`user_photos` est la première table dont la donnée n'existe nulle part
ailleurs.** Pas de copie sur disque : c'est le point. Le container du backend
monte **un seul volume**, `../backend/target`, qui est la sortie de Maven —
`mvn clean` l'efface et chaque build la réécrit. Une photo sur disque ne
survivrait pas au déploiement.

### 3.2 Le tableau des migrations

| # | Ce qu'elle fait | Rollback |
|---|---|---|
| V001 | `access_attempts` | ✅ |
| V002 | `meal_entitlements` | ✅ |
| V003 | `meal_entitlement_events` (⚠️ `source` est un CHECK **manuel**) | ✅ |
| V004 | `student_exit_permissions` | ✅ |
| V005 | `system_users.permissoes` (CSV, nullable) | ✅ |
| V006 | index | — (un index se supprime seul) |
| V007 | `app_users.departamento` | ✅ |
| V008 | `app_users.camera_person_id` (UNIQUE) | — |
| V009 | élargit le CHECK de `denial_reason` (caméra) | — |
| V010 | `app_users.posto_fixo_point_id` | ✅ |
| V011 | `user_photos` ⚠️ **donnée irremplaçable** | ✅ |
| V012 | deux autorités sur les permissions de sortie | ✅ |
| V013 | `password_reset_requests` | ✅ |
| V014 | `student_regimes` + `_events` | ✅ |
| V015 | élargit `denial_reason` (régime) | ✅ |
| V016 | index `access_logs` (point, heure) | ✅ |
| V017 | CHECK des énumérations de régime | ✅ |
| V018 | index `access_logs` (heure) | ✅ |
| V019 | index `access_logs` (user_id) | ✅ |
| V020 | `cantine_removals` | ✅ |
| V021 | `meal_slots` + `_classes` + `_students` | ✅ |
| V022 | élargit `denial_reason` (`MEAL_SLOT_NOT_CONFIGURED`) | ✅ |
| V023 | **seed** : l'affiche du mur + la reprise de `class_schedules` | — *(les lignes partent avec R021)* |
| V024 | `system_settings` — naît vide | ✅ |
| V025 | `cdi_exclusions` ⚠️ **donnée sensible sur mineur** | ✅ |
| V026 | `cdi_alert_events` ⚠️ **idem** | ✅ |
| V027 | `licence_clock` — le témoin d'horloge de la licence (ADR-006) ⚠️ **à poser à la main AVANT de démarrer le backend** : `ddl-auto` saurait créer la table, et c'est le problème — elle naîtrait **sans** son `CHECK (id = 1)`, qu'il ne corrigerait jamais | ✅ |

⚠️ **Chaque absence de rollback est justifiée dans
`deploy/migrations/README.md`**, et `tests/migrations.test.js` échoue si une
migration nouvelle arrive sans plan de retour, ou sans être nommée dans le
README.

### 3.3 Les pièges de base à connaître avant de toucher au schéma

1. ⚠️ **`ddl-auto=update` CRÉE mais n'ALTÈRE jamais un CHECK.** Une valeur
   nouvelle dans un enum passe les tests (H2 recrée tout) et échoue **seulement
   sur la VM**. Ce piège a mordu trois fois : V009, V015, V022.
2. ⚠️ **Les CHECK sur `access_attempts.denial_reason` et sur
   `meal_entitlement_events.source` sont MANUELS.** Ajouter une valeur à l'enum
   Java **sans** élargir le CHECK produit un `INSERT` qui échoue en production.
3. ⚠️ **Les requêtes sur `access_logs` excluent les flags de répétition** avec
   `flag IS NULL OR flag <> 'POSTO_FIXO'`. Le `IS NULL` n'est **pas** un
   ornement : sans lui, `<>` vaut UNKNOWN pour NULL et **écarte toute la base en
   silence**.
4. ⚠️ **L'exclusion est ASYMÉTRIQUE** là où la requête regarde la paire
   entrée/sortie : on retire l'**entrée** marquée, **jamais la sortie**. Appris
   cher le 10/08 : avec une exclusion symétrique, une personne à poste fixe
   restait « dedans » jusqu'à minuit — sa sortie réelle, marquée, disparaissait
   avec le reste.

---

## 4. Les tests

Mesuré le **03/09/2026** (à froid : `cd backend && rm -rf target && mvn -o test`,
puis `npm test`), sur `main` augmentée des trois chantiers de cette date :
**backend 1055** (0 échec, exactement 2 `@Disabled`) sur **93** fichiers,
**npm 889** sur **42** fichiers.

⚠️ **Le critère n'est pas un total.** Le total monte à chaque livraison ; un
nombre écrit dans un document vieillit en quelques jours. Le critère est
**0 échec et exactement 2 `@Disabled`**. Un total inférieur à la dernière mesure
veut dire qu'un test a été supprimé ; `Skipped ≠ 2` veut dire qu'une requête
native a été désactivée.

⚠️ **Mesurer depuis zéro** : `cd backend && rm -rf target && mvn -o test`.
L'incrémental a déjà donné un `BUILD SUCCESS` faux.

⚠️ **Le `pom.xml` doit contenir `<include>**/*IT.java`.** Sans lui, les tests
d'intégration sont sautés **en silence**.

### La philosophie — trois idées qui reviennent

**a) Vérifier par mutation.** Un test qui passe ne prouve rien tant qu'on n'a pas
vu **échouer** la version cassée. Plusieurs gardes de ce dépôt ont été validés
en remettant le défaut : `SettingsCatalogGuardTest` (en retirant une entrée du
catalogue), `cdiCapaciteContract.test.js` (en remettant la double capacité),
`aujourdhuiHeureLocale.test.js` (en remettant la forme UTC).

**b) Vérifier les contrats par AST, pas par convention.** Le frontend n'a pas de
types. Quand un écran lit un champ que le DTO n'envoie jamais, JavaScript rend
`undefined` sans erreur — et **toute autorisation ponctuelle s'affichait
« Toujours »** au portail. `tests/exitPermissionContract.test.js` compare le DTO
et l'écran par analyse syntaxique.

**c) ⚠️ Un garde doit DÉCLARER ses limites.** C'est l'idée la plus importante du
chapitre, et elle vient d'un incident.

- `AccessLogRepositoryQueryGuardTest` tient par **chaîne de caractères** des
  requêtes que H2 n'exécute pas — il ne prouve pas qu'elles tournent, et il le
  dit.
- `ControllerAuthorizationGuardTest` porte trois listes **nommées** :
  `PUBLICO_POR_DESENHO`, `AUTENTICADO_POR_DECISAO`, `DIVIDA_CONHECIDA`. Cette
  dernière a **7 entrées et sa taille est assertée** : on ne peut pas y ajouter
  une dette en silence.
- `tests/aujourdhuiHeureLocale.test.js` porte une liste d'exceptions **nommées**
  (deux noms de fichiers téléchargés). En retirer une, c'est écrire la
  correction — jamais relâcher le test.

⚠️ **Et le corollaire, payé le 27/08 :** le garde d'autorisation lisait
l'**identifiant** d'une constante au lieu de sa **valeur**, et déclarait non
gardés 8 endpoints qui l'étaient. **Un garde qui accuse l'innocent apprend à
être ignoré** — ce qui est pire qu'un garde absent.

### Ce que les suites ne prouvent pas

⚠️ **Aucune suite ne rend un composant React.** Les tests JS lisent le code
source. Un écran qui ne s'affiche pas, une clé i18n crue, un débordement, un
libellé tronqué : rien de tout ça n'est attrapé.

**La preuve, pour une interface, c'est d'ouvrir l'écran.** Le pilote E2E est
dans `.claude/skills/run-magbo-app/driver.js` (Electron réel, connexion réelle,
base réelle avec nettoyage). Le parcours manuel est dans
`docs/frontend-smoke-checklist.md`.

**Et deux requêtes natives PostgreSQL restent `@Disabled`** (H2 ne les exécute
pas) : leur vérification est **manuelle**, section 6-bis du même document.

---

## 5. Où regarder ensuite

| Question | Document |
|---|---|
| Le schéma en détail | `docs/architecture/banco-de-dados.md` |
| Les endpoints | `docs/architecture/endpoints.md` |
| Les flux | `docs/architecture/fluxos.md` |
| Chaque migration, une par une | `deploy/migrations/README.md` |
| Les règles de code par domaine | `.claude/rules/backend.md`, `database.md`, `frontend.md`, `hikvision.md` |
| Pourquoi une décision est ce qu'elle est | `docs/architecture/decisoes/` |
| Les incidents qui ont produit ces règles | chapitre 8 |
