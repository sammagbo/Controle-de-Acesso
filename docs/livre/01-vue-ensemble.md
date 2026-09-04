# Chapitre 1 — Vue d'ensemble

Ce chapitre s'adresse à la personne qui reprend MAGBO sans avoir jamais vu le
système tourner et sans pouvoir poser de question à personne. Il répond à trois
questions, dans cet ordre : **ce que le système n'est pas**, **ce qu'il fait**,
et **par où passe un passage** — de la porte jusqu'à l'écran de l'opérateur.
Les chapitres suivants entrent dans le détail ; celui-ci donne la carte.

> Convention du livre : `[A VERIFIER]` marque une affirmation que je n'ai pas
> pu confirmer dans le dépôt, suivie de la commande ou de la requête qui la
> tranche. `[À COMPLÉTER PAR SAMMY]` marque ce que seul Sammy savait.

---

## 1. ⚠️ Avant tout : ce que MAGBO n'est PAS

**MAGBO n'ouvre aucune porte. MAGBO ne ferme aucune porte.**

Ce n'est pas une limite technique qu'on finira par lever : c'est une décision
d'architecture, écrite, prouvée avec du matériel, et sur laquelle repose la
moitié du code. Elle porte un nom : **ADR-003 — le webhook est post-événement**
(`docs/architecture/decisoes/ADR-003-webhook-pos-evento.md`).

La preuve tient en une séquence d'événements observée sur le terminal de banc
le 13/07/2026 : `21` (la porte s'ouvre) → `75`/`1` (l'authentification) → `22`
(la porte se ferme). **Quand la requête HTTP arrive chez nous, la porte a déjà
fonctionné.** Le test CANT-09 l'a confirmé dans l'autre sens : validité d'une
personne placée dans le passé, le terminal a refusé **à la voix** avant tout
HTTP, et l'événement `subEventType=8` est arrivé ensuite. L'appareil ignore
purement et simplement la réponse du backend — c'est pour cela que le webhook
renvoie `200` sur tous les chemins normaux, y compris quand il refuse
logiquement (`HikvisionWebhookController`, méthode `handleEvent`).

Donc, quand le code écrit `DENIED`, cela veut dire : *classification logique et
audit*. Jamais : *action physique*.

**Conséquences qu'il faut avoir comprises avant de lire le reste :**

- Un élève sans droit au repas, ou sans autorisation de sortie, **passe
  physiquement**. MAGBO enregistre la tentative et la montre à l'écran. La
  direction de l'école le sait ; c'est écrit dans les Conséquences de l'ADR-003.
- Cet écart a un nom et un chiffre : le KPI **`divergenciaHoje`**
  (`auth_result=SUCCESS` **ET** `authorization_result=DENIED` — « la porte s'est
  ouverte, mais MAGBO ne l'a pas comptée comme un accès valide »).
- **Effet de bord voulu :** si la VM ou le réseau tombe, le déjeuner et le
  portail **continuent de fonctionner**. Le terminal authentifie localement avec
  les identités déjà distribuées, met les événements en file, et les renvoie
  quand le serveur revient. L'observationnalité est une **propriété désirée**,
  pas un trou.

### La seule exception documentée : la cantine

Elle ne contredit rien : elle nomme *qui* applique la règle. **ADR-004 — blocage
opérationnel assisté**
(`docs/architecture/decisoes/ADR-004-bloqueio-operacional-assistido.md`) :

| Qui | Valide quoi |
|---|---|
| Le terminal | l'**identité** (visage / carte) |
| MAGBO | la **règle** (droit au repas, créneau, doublon) |
| **L'opérateur, à la main** | l'**exception** |

Il n'y a **pas** de blocage physique de cantine via HikCentral — ni aujourd'hui,
ni dans la feuille de route. Les alternatives ont été examinées et rejetées par
écrit : synchroniser les droits en *access levels* HikCentral (propagation lente,
échecs partiels par personne, rollback coûteux — incompatible avec une file
d'attente de midi), et piloter le relais depuis le backend (impossible, ADR-003).

Ce qui en découle directement : **le flux des tentatives refusées est une pièce
critique, pas un gadget.** C'est par lui que l'opérateur voit, en temps réel, qui
a été refusé et pourquoi (`js/components/DeniedAttemptsFeed.js`, embarqué dans
`js/components/CantineMonitor.js`). Sans opérateur devant l'écran, la règle de
cantine n'existe pas. Le manuel le dit à l'utilisateur en une phrase :
« MAGBO ne verrouille aucune porte. Celui qui empêche physiquement un élève de
passer, c'est **vous** » (`docs/manual-utilisateur.md` §0.1).

---

## 2. Ce que MAGBO fait

Quatre verbes, et rien d'autre :

1. **Identifie** — relie un événement d'appareil à une personne du fichier
   (`app_users.id` = matricule Pronote, chaîne de caractères, zéros de tête
   conservés).
2. **Classe** — applique les règles de l'endroit (cantine, portail, CDI,
   infirmerie) et tranche : accès effectif, observation, ou refus.
3. **Enregistre** — dans deux tables distinctes qui ne se mélangent jamais (§4).
4. **Signale** — affiche à l'opérateur, compte pour la direction, et laisse une
   trace consultable après coup.

---

## 3. L'architecture en une page

```text
  APPAREILS                      RESEAU DE L'ECOLE           SERVEUR (VM Ubuntu)

  [ Terminal MinMoe DS-K1T344MX ]
    visage -> subEventType 75
    carte  -> subEventType 1
    IL OUVRE LA PORTE LUI-MEME
              |
              |  multipart/form-data, part "AccessControllerEvent" (JSON)
              |
  [ Camera DeepinView iDS-2CD7A46G2 ]
    COMPARE un visage a sa bibliotheque faciale ; n'ouvre rien
              |
              |  multipart/form-data, part "alarmResult" (JSON)
              v
   +--------------------------------------------------------+
   |  " Ecoute HTTP "  --  configuree DANS L'APPAREIL :      |
   |  IP du serveur, port 8080, URL avec le token, HTTP      |
   +--------------------------------------------------------+
              |
              |  POST /api/hikvision/webhook            (token en en-tete ou ?token=)
              |  POST /api/hikvision/webhook/t/{token}  (token dans le CHEMIN -- cameras)
              v
   +---------------------------------------------------------------------+
   | HikvisionWebhookController                                          |
   |  1. token, MessageDigest.isEqual  (503 si non configure, 401 sinon) |
   |  2. parsePayload : multipart tolerant, ou JSON pur                  |
   |  3. dedup d'INGESTION (le meme paquet renvoye) -> 200, rien en base |
   |  4. heartbeat / evenement sans personne          -> 200, fin        |
   +---------------------------------------------------------------------+
              |
              v
   +---------------------------------------------------------------------+
   | EventTimeResolver  --  QUELLE HEURE part en base                    |
   |  dateTime du payload -> instant -> America/Sao_Paulo                |
   |  3 garde-fous -> repli sur l'heure de reception, + 1 ligne INFO     |
   +---------------------------------------------------------------------+
              |
              v
   +---------------------------------------------------------------------+
   | AccessDecisionService  (@Transactional -- LE chef d'orchestre)      |
   |   classification du sous-type -> door_mappings -> personne -> actif |
   |   cantine : dedup repas -> droit au repas -> creneau                |
   |   portail : permission de sortie -> regime de sortie (observation)  |
   |   commun  : meme passage (30 s) -> poste fixe -> presence ouverte   |
   +---------------------------------------------------------------------+
              |                                          |
     AUTORISE |                              REFUSE      |
              v                                          v
      +------------------+                     +---------------------+
      |   access_logs    |                     |  access_attempts    |
      | ce qui EST un    |                     | ce qui a ete TENTE  |
      | passage effectif |                     | et n'est pas passe  |
      +------------------+                     +---------------------+
               \                                        /
                \        PostgreSQL 16  --  magbodb    /
                 +------------------------------------+
                                  |
                                  v   API REST, JWT 8 h, roles + secteurs
                 +------------------------------------+
                 |  27 controleurs sous /api/...      |
                 +------------------------------------+
                                  |
                                  v   HTTP depuis chaque poste
   [ Portail ]  [ Cantine ]  [ CDI ]  [ Infirmerie ]  [ Direction ]
     Electron + React (sans bundler) ; le raccourci fixe MAGBO_API_URL
     et MAGBO_SECTOR  --  ouvrir le .exe seul donne une application VIDE
```

### Maillon par maillon

**1. Les appareils.** Deux familles, deux formats, un seul webhook. Les
terminaux **MinMoe** (`DS-K1T344MX`, firmware V4.13.0) authentifient localement
et envoient un `multipart/form-data` dont la part utile s'appelle
`AccessControllerEvent`. Les **caméras DeepinView** de la portaria envoient un
format à elles, part `alarmResult`, qui contient le résultat d'une *comparaison*
faciale — pas d'une authentification. Tout ce qui a été mesuré sur ces payloads
(la table des sous-types, le `score` emballé dans `{"value": 52}`, la
translittération des accents, la troncature du nom à 32 caractères) est dans
`.claude/rules/hikvision.md` : c'est le document à lire avant de toucher au
parseur.

**2. L'« Écoute HTTP ».** Ce n'est pas du code : c'est un réglage **dans
l'appareil** (`Configuration → Réseau → Service réseau → Écoute HTTP`) qui
contient l'IP du serveur, le port et le token. ⚠️ **C'est le maillon le plus
fragile de la chaîne, et il casse en silence** : une IP qui change par DHCP
n'émet aucune erreur, les événements cessent simplement d'arriver. Vérifier ce
réglage fait partie de toute session matériel (`.claude/rules/hikvision.md`).
Les caméras DeepinView ont exigé une route à part, `/webhook/t/{token}` : elles
jettent la *query string* et ne savent pas envoyer d'en-tête personnalisé —
prouvé au tcpdump le 28/07/2026, l'appareil renvoyant en boucle ~1 req/s de 401.

**3. Le webhook.**
`backend/src/main/java/com/magbo/access/controllers/HikvisionWebhookController.java`
(652 lignes). Il fait quatre choses avant toute décision : valider le token
(`MessageDigest.isEqual`, **deny-by-default** — token absent de la configuration
= 503), extraire le JSON de la bonne part, écarter les paquets déjà vus (dedup
d'ingestion, 60 s, clé IP + `serialNo`), et écarter les événements sans personne
(heartbeat toutes les ~30 s, ouverture/fermeture de porte). ⚠️ **Tout rejet
laisse une ligne INFO** avec l'IP et le `serialNo` : le niveau du paquet est INFO
en production, donc un `log.debug` disparaîtrait du fichier, et « un passage qui
disparaît sans trace » est la pire panne possible ici — le commentaire du code
l'explique en dix lignes, elles valent la lecture.

**4. `EventTimeResolver`.**
`backend/src/main/java/com/magbo/access/services/EventTimeResolver.java`
(117 lignes). Il répond à une seule question : **quelle heure va dans la base.**
Réponse : l'heure de l'**événement** (`dateTime` du payload, ISO 8601 avec
décalage — converti en *instant*, puis en `America/Sao_Paulo`), jamais l'heure de
réception. Il existe à cause d'un incident daté : le 03/08/2026, un terminal a
vidé sa file hors-ligne — 33 événements en deux minutes, à 14 h 51, de passages
survenus des heures plus tôt — et les 33 sont entrés comme s'ils avaient eu lieu
à 14 h 51. Les rapports ont affiché des **durées moyennes négatives**. Trois
garde-fous font retomber sur l'heure de réception, chacun avec une ligne INFO :
`dateTime` absent ou illisible, horloge de l'appareil en avance de plus de
**5 min**, événement plus vieux que **30 jours**.

⚠️ **Le piège à retenir de ce fichier :** l'heure du *registre* et l'heure des
*règles* sont deux horloges différentes. `eventTime` va dans la colonne
`timestamp` ; les règles (créneau de cantine, dedup de repas, permission de
sortie) sont évaluées contre `now`, l'heure de la décision — pour qu'une file
hors-ligne ne change pas rétroactivement un ALLOW en DENY. Deux règles font
exception **volontairement**, parce qu'elles *décrivent* au lieu de *refuser* :
le créneau de cantine (`MealSlotService`) et le **régime de sortie**
(`RegimeSortieService`). Le javadoc de `AccessDecisionService.process` et les
commentaires `⚠️⚠️` dans le corps de la méthode expliquent chacune, avec le nom
du test qui les verrouille.

**5. `AccessDecisionService`.**
`backend/src/main/java/com/magbo/access/services/AccessDecisionService.java`
(868 lignes). **C'est la seule classe qui connaît l'ordre des règles** — et c'est
sa raison d'être. Elle est `@Transactional`, elle s'appuie sur une dizaine de
services spécialisés (`HikvisionEventClassifier`, `DeduplicationService`,
`MealEntitlementService`, `MealSlotService`, `ExitPermissionService`,
`RegimeSortieService`, `SamePassageService`, `PostoFixoService`,
`PresencaAbertaService`, `AccessAttemptService`), et les deux branches d'entrée —
terminaux et caméras — convergent vers la **même** méthode finale
(`registrarPassagem`, via le record `Passagem`) précisément pour que l'ordre des
règles n'existe pas en double. L'ordre exact, secteur par secteur, est dans
`docs/architecture/fluxos.md` §4 à §6.

**6. PostgreSQL 16.** Base `magbodb`, utilisateur `magbo`, conteneur
`magbo-postgres`. Le schéma est créé par Hibernate (`ddl-auto=update`) **plus**
26 migrations SQL versionnées appliquées par-dessus (`deploy/migrations/`).
⚠️ `ddl-auto=update` **ajoute** mais ne retire ni ne relâche jamais rien : c'est
la raison pour laquelle certaines contraintes `CHECK` doivent être élargies à la
main par une migration, et pourquoi elles échouent **uniquement sur la VM** quand
on l'oublie (voir `.claude/rules/database.md`, la note sur `denial_reason`).

**7. L'API REST.** 27 contrôleurs sous `/api/…`, JWT valable 8 h, rôles
`ADMIN`/`OPERATOR`, plus une autorisation par **secteur**
(`@areaSecurity.can('cantine')`) et dix permissions granulaires
(`backend/src/main/java/com/magbo/access/security/Permissions.java`, liste
`TODAS`). Seules six routes sont publiques : `/api/auth/login`,
`/api/auth/password-reset-request`, `/api/health`, les deux webhooks Hikvision,
`/h2-console/**` et `/error` (`security/SecurityConfig.java`, lignes 39-74 — le
commentaire sur `/error` vaut la lecture : son absence faisait mentir toutes les
erreurs serveur au front, une importation ratée disait « Session expirée »).
Le catalogue des routes est dans `docs/architecture/endpoints.md`.

**8. Les postes Electron.** Une application Electron (`main.js`, `preload.js`,
`index.html`) qui charge React 18 + Babel + Tailwind **en local**, sans bundler ;
tout est vendorisé dans `libs/`. ⚠️ **Aucun CDN** : un `<script src="https://…">`
ajouté ne produit pas d'erreur — l'écran ne s'affiche simplement pas en mode
kiosque hors ligne. Se vérifie en une commande :
`grep -cE 'src="https?://|cdn\.|unpkg|jsdelivr' index.html` → **0**. Chaque poste
est configuré par des variables passées par le raccourci : `MAGBO_API_URL` et
`MAGBO_SECTOR` (lues par `js/utils/posteConfig.js`, exposées au front par
`preload.js` sous `window.magboConfig`, qui publie `apiUrl`, `sector`, `source`,
`doitConfigurer`, `isProduction`, `cheminFichier`, `version`), plus
`NODE_ENV=production` (`main.js:33`) qui arme le mode kiosque — à condition que le
poste soit déjà réglé (`posteConfig.verrouillable`).

⚠️ **`MAGBO_KIOSK_PIN` n'est PAS exposée au front, et il n'existe aucune sortie du
kiosque par code.** La variable est bien lue (`main.js:32`) et `preload.js:112-123`
publie un second pont, `window.magboIpc`, avec `verifyKioskPin`, `exitKiosk` et
`onRequestAdminPin` ; `main.js:383` enregistre `Ctrl+Shift+Alt+Q` et émet
`request-admin-pin`. Mais **aucun fichier de `js/`, d'`index.html` ni de `tests/` ne
consomme ce pont** (mesuré le 03/09/2026 : `grep -rn 'magboIpc\|MAGBO_KIOSK_PIN' js/
index.html tests/` ne rend rien). Un `webContents.send` vers un canal sans écouteur
ne lève rien et ne journalise rien : le raccourci est un **no-op silencieux**, et
celui qui le tape ne peut pas distinguer « l'application est plantée » de « ce geste
n'a jamais rien fait ». On ferme un poste verrouillé par `Ctrl+Alt+Suppr` →
Gestionnaire des tâches. ⚠️ Ne pas confondre avec `ADMIN_PIN`, qui est le PIN du
**backend** (`/api/admin/verify`, `js/components/AdminPinModal.js`) : celui-là
fonctionne et reste obligatoire. Voir ADR-007. Ouvrir le `.exe` directement donne une
application **vide, sans message** — c'est la panne la plus fréquente signalée
dans le manuel, et ce n'en est pas une.

---

## 4. Les deux tables, et pourquoi elles sont deux

C'est l'invariant structurel du système. **ADR-001**
(`docs/architecture/decisoes/ADR-001-attempts-vs-logs.md`) :

| Table | Contient | Conséquence |
|---|---|---|
| `access_logs` | uniquement l'accès **effectif et autorisé** | être dans cette table signifie déjà « réussi » — il n'y a pas de colonne `granted` |
| `access_attempts` | tout ce qui a été **tenté et n'est pas passé** | 4 axes : méthode / résultat de l'appareil / décision MAGBO / motif |

L'alternative — un drapeau `granted` dans `access_logs` et un filtre dans chaque
requête — a été rejetée pour une raison à garder en tête à chaque requête
nouvelle : plus de quinze requêtes dérivent de `access_logs` (présence, repas,
occupation, KPIs), et **un seul oubli de filtre** aurait compté un refus comme
une présence, **en silence**. La contrainte est devenue une propriété du schéma
au lieu d'une discipline de rédaction.

Un cas grave écarté par cette séparation : avant la Phase B, un `subEventType=8`
(refus du terminal) devenait un `access_log` valide — donc un **repas fictif**.

Cas particulier voulu : le mode `OBSERVATION` écrit **dans les deux tables** (le
passage réel + une trace d'audit). C'est ainsi qu'on mesure une règle sans
l'appliquer.

---

## 5. Les points en service aujourd'hui

Le mapping point → aire vit **en deux endroits qu'il faut modifier ensemble** :
`backend/src/main/java/com/magbo/access/config/AreaMapping.java` et
`js/data/constants.js` (`ACCESS_POINTS`).

| Point | Aire | Lieu |
|---|---|---|
| `PORT1`, `PORT2`, `PORT3` | `portail` | portail principal, portail terrain, garage |
| `BIBLIO` | `cdi` | CDI / bibliothèque |
| `ENFERM` | `infirmerie` | infirmerie |
| `REFEI1`, `REFEI2` | `cantine` | réfectoires 1 et 2 |

S'y ajoutent des **points virtuels** qui ne sont pas des portes mais des écrans :
`CANTINA_MONITOR`, `CANTINA_REPORT`, `INFIRMARY_REPORT`, `GENERAL_REPORT`,
`PPMS`, et les écrans de gestion (`MEAL_ENTITLEMENT_MANAGEMENT`,
`EXIT_PERMISSION_MANAGEMENT`, `REGIME_MANAGEMENT`, `MEAL_SLOT_MANAGEMENT`,
`CDI_EXCLUSION_MANAGEMENT`).

⚠️ Une distinction que le code fait et qu'il faut connaître :
`AreaMapping.temPresencaConfiavel()` répond `false` pour le **portail** et `true`
partout ailleurs. Au portail, « la personne est encore dedans » n'est pas une
affirmation fiable : on sort par ailleurs, hors du champ de la caméra, ou collé à
quelqu'un d'autre. Deux règles en dépendent, et le javadoc de cette méthode
explique pourquoi mieux que n'importe quel résumé.

### Les appareils physiques

**Source : Sammy, le 28/08/2026. Non vérifiable dans le dépôt** — la table
`door_mappings` vit dans la base de production, pas dans le code.

| Appareil | Rôle annoncé |
|---|---|
| `.167` | portail — **ENTRÉE** (caméra DeepinView) |
| `.166` | portail — **SORTIE** (caméra DeepinView) |
| `.15`, `.16` | CDI |
| `.10`, `.12`, `.13`, `.14` | cantine |

⚠️ **Trois réserves, toutes importantes :**

1. Sammy annonce « six terminaux » et énumère **huit** adresses. La lecture la plus
   probable est six terminaux MinMoe (CDI + cantine) **plus** deux caméras au
   portail, mais je ne l'ai pas vérifiée.
2. Les adresses sont données en dernier octet seul, et le préfixe n'est établi
   que pour deux d'entre elles. Les caméras du portail portent leur adresse
   complète dans le code — `192.168.1.167` et `192.168.1.166`
   (`DoorMappingBootstrap:44-46`). Pour les six autres, rien : le serveur est en
   `192.168.1.253` (`docs/operacional/guide-installation-postes.md`, §Avant de
   commencer) et l'ancien banc d'essai était en `172.20.40.x`, mais **le préfixe
   réel des terminaux MinMoe n'est écrit nulle part dans le dépôt.**
3. La caméra `.166` (SORTIE) **fonctionne** — réparée ou remplacée, confirmé par
   Sammy le 04/09/2026. Elle a bien été en panne physique, et c'est écrit noir
   sur blanc dans `docs/operacional/diagnostic-portaria-2026-08-27.md`, §1 et §3.
   ⚠️ La mise en garde reste donc entière **pour les chiffres antérieurs** :
   toute lecture du portail qui traverse cette période doit **isoler ce point**,
   sinon la panne masque tout le reste — une chute qui ne touche que les `SAIDA`,
   c'est elle, et rien d'autre à chercher.
   ⚠️ **La date de la remise en service n'est consignée nulle part.** La dernière
   trace écrite de la panne est le diagnostic du 27/08.

`[A VERIFIER]` L'inventaire réel des points actifs, avec le sens de chaque
appareil, se lit en une requête sur la VM :

```bash
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT terminal_ip, door_no, reader_no, point_id, action, label, ativo
     FROM door_mappings ORDER BY terminal_ip, door_no, reader_no;"
```

`[A VERIFIER]` Quels points reçoivent réellement du trafic, sur 21 jours :

```bash
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT point_id, action, count(*) FROM access_logs
    WHERE timestamp >= current_date - 21 GROUP BY 1,2 ORDER BY 1,2;"
```

⚠️ **Avant toute session matériel :** une IP qui change par DHCP casse à la fois
l'« Écoute HTTP » de l'appareil et son `door_mappings`, **sans aucune erreur**.
C'est arrivé le 16/07/2026 (terminal `.12` → `.10`,
`docs/operacional/procedimento-hikcentral.md`). La checklist complète est dans
`.claude/rules/hikvision.md`.

**Le préfixe est établi pour une partie des appareils seulement**, et la
distinction est celle qui compte :

| Appareil | Adresse | D'où elle vient |
|---|---|---|
| Caméras du portail (DeepinView) | `192.168.1.167` et `192.168.1.166` — **complètes** | `DoorMappingBootstrap:44-46`, correspondances réelles dans le code |
| VM du serveur | `192.168.1.253` — **réservée** | modèle du lanceur, défaut du poste, `ssh` des sauvegardes |
| HikCentral | `192.168.1.90` | `docs/operacional/procedimento-hikcentral.md` |
| Terminaux MinMoe | ⚠️ **préfixe inconnu** | voir la réserve 2 ci-dessus |

⚠️ **`172.20.40.x` n'est PAS une réponse.** C'est ce que portait le banc d'essai
— la charge utile réelle de `ESPECIFICACAO-TECNICA-v1.md:687` et le smoke test
du 16/07/2026 — et rien n'établit que les terminaux de production y soient. Les
prendre pour le préfixe de production serait exactement l'erreur que la réserve 2
signale.

**L'adresse du serveur, elle, est FIXE** : réservation confirmée auprès du service
informatique (Sammy, 04/09/2026).

`[À COMPLÉTER PAR SAMMY]` **Et les TERMINAUX, sont-ils réservés eux aussi ?** La
réponse ci-dessus ne porte que sur la VM. Tant que les terminaux sont en DHCP, un
redémarrage suffit pour qu'ils cessent d'émettre : ni erreur, ni alerte, les
événements s'arrêtent simplement d'arriver (c'est arrivé le 16/07, `.12` → `.10`).

`[À COMPLÉTER PAR SAMMY]` La caméra `.166` : la panne a-t-elle été signalée, à qui,
et qui est censé la réparer ?

[CAPTURE: 01-ecoute-http-terminal.png — la page « Écoute HTTP » d'un terminal, montrant l'IP du serveur, le port 8080 et l'URL avec le token — c'est l'écran à comparer quand les événements cessent d'arriver]

---

## 6. Qui utilise le système

Six métiers, six usages. Le manuel est organisé exactement ainsi : il contient
une section « Par où commencer selon votre rôle » — c'est la porte d'entrée à
donner à un utilisateur (`docs/manual-utilisateur.md`, lignes 100-155).

| Rôle | Ce qu'il fait avec MAGBO | Écran principal |
|---|---|---|
| **Vie Scolaire** (portail) | suit les mouvements du jour, enregistre un passage à la main, autorise une sortie ponctuelle, cherche où est un élève | poste `PORT1`, écrans **Sorties** et **Rapport Général** |
| **Cantine** | garde l'écran ouvert pendant le service, voit les refus en direct, gère les droits au repas et le planning | **Monitor Cantine**, **Droits Repas**, **Planning Cantine** |
| **CDI** | fait pointer les élèves, sort les statistiques, fait l'appel en cas d'urgence | module CDI (`js/cdi/`), point `BIBLIO` |
| **Infirmerie** | enregistre arrivée et départ, édite le relevé des visites et des séjours longs | poste `ENFERM`, **Rapport Infirmerie** |
| **Direction** | trois chiffres et un rapport ; crée et désactive les comptes opérateurs | **Rapport Général**, **Panneau administrateur** |
| **Portaria** | le passage physique au portail | (pas d'écran propre — voir ci-dessous) |

Deux remarques qui évitent des malentendus :

- **La « portaria » n'a pas d'écran à elle.** C'est le lieu, servi par les deux
  caméras et par le poste de la Vie Scolaire. Le mot survit dans le code comme
  *catégorie* d'affichage (`category: 'portaria'` dans `js/data/constants.js`) et
  comme *département* d'une personne — le département **suggère** un poste fixe
  dans l'écran Personnels, il ne le décide jamais (`.claude/rules/frontend.md`).
- **Le PPMS** (`js/components/PpmsView.js`, l'écran « Qui est à l'intérieur »)
  traverse tous les rôles : il est délibérément **non caché** dans la liste des
  points, parce que chercher son chemin au milieu d'une évacuation équivaut à ne
  pas avoir l'écran. Il est en revanche restreint par la permission `PPMS_READ` :
  la liste est **nominative**, et Sammy a tranché le 14/08 « restreindre, pas
  fermer » (javadoc de `Permissions.PPMS_READ`). ⚠️ **Cet écran ne remplace pas
  l'appel** — il le dit lui-même, au-dessus du nombre.

---

## 7. Ce qui tourne, et ce qui dort

Toutes les règles de décision sont des **propriétés**, modifiables sans
recompiler. Valeurs par défaut dans
`backend/src/main/java/com/magbo/access/config/PolicyProperties.java` ; ce que la
**production** applique réellement est dans
`backend/src/main/resources/application-prod.properties`.

| Politique | Défaut Java | Production |
|---|---|---|
| `meal-not-entitled` | `DENY` | `DENY` (l. 71) |
| `meal-pending` | `OBSERVATION` | ⚠️ **`DENY`** (l. 72) |
| `outside-meal-time` | `OBSERVATION` | `OBSERVATION` (l. 73) |
| `meal-slot-not-configured` | `OBSERVATION` | — (défaut) |
| `duplicate-meal` | `OBSERVATION` | `OBSERVATION` (l. 74) |
| `exit-not-authorized` | `DENY` | `DENY` (l. 75) |
| `user-inactive` | `DENY` | `DENY` (l. 76) |
| `missing-door-mapping` | `FALLBACK` | `FALLBACK` (l. 79) |

⚠️ **La ligne qui compte : `meal-pending=DENY` en production.** « En attente »
n'est pas une décision, c'est **une case vide** — un élève dont personne n'a
renseigné le droit. En production, cette case vide **refuse**. Le prérequis
opérationnel est donc absolu : *la liste des autorisés doit être importée avant
le jour 1 du service* (décision D5, ADR-004 ; répété dans
`docs/manual-utilisateur.md` §A.1). Le mode `dev` garde `OBSERVATION`, ce qui
signifie qu'un comportement observé en développement **ne prouve rien** sur ce
que fera la production.

**Ce qui dort, et c'est voulu :**

- **Le régime de sortie** — le droit annuel déclaré par écrit par les
  responsables légaux (circulaire n° 96-248) — est **désactivé** :
  `magbo.regime.habilitado=false` (`application.properties` l. 248, et le champ
  Java `RegimeProperties.habilitado` l. 90 : le défaut est `false` **dans les
  deux endroits**, délibérément — deux sources pour un même défaut, et c'est
  celle de la documentation qui ne valait pas). Tant qu'il est éteint,
  `RegimeSortieService` répond `NON_APPLICABLE` pour tout le monde (l. 129).
  Quand il sera allumé : `magbo.regime.desconhecido=OBSERVATION`, parce qu'au
  jour 1 **aucun des 923 élèves n'a de régime saisi** et qu'un `DENY` peindrait
  l'école entière en rouge — exactement l'erreur déjà documentée pour
  `meal-pending`.
- ⚠️ **Avant d'allumer `magbo.regime.habilitado` sur la VM, appliquer V015** :
  elle élargit le `CHECK` de `access_attempts.denial_reason`
  (`REGIME_NOT_ALLOWED`, `REGIME_UNKNOWN`). Sans elle, l'`INSERT` échoue
  **uniquement en production** — le PC et les tests ne reproduisent pas la panne.
- **La règle de permission de sortie ne tourne PAS sur les caméras du portail.**
  Le champ `Passagem.aplicarPermissaoDeSaida` vaut `true` sur les terminaux et
  `false` sur les caméras, avec une justification de quinze lignes dans
  `AccessDecisionService` : `ExitPermissionService.evaluate()` refuse toute
  personne sans permission active et ne regarde pas le type d'utilisateur ;
  l'allumer ferait de **chaque sortie de personnel** un `EXIT_NOT_AUTHORIZED`,
  des centaines par jour, sans que personne ne l'ait décidé. C'est une décision
  de politique laissée en suspens — et elle exige probablement de restreindre
  d'abord la règle aux élèves, puisque l'entité s'appelle
  `StudentExitPermission`.

**Répondu par Sammy le 04/09/2026 : les régimes n'existent que sur PAPIER**, dans
les carnets que tient la Vie Scolaire, classe par classe. Ce que cela implique
n'est pas une formalité :

- ⚠️ **Pronote ne les porte pas, et le chemin court a été cherché.** Le CSV du
  `PronoteSyncService` a huit colonnes obligatoires — matricule, nom, type,
  classe, responsable et son contact — et **aucune** de régime général ni de
  régime de sortie ; l'import Excel des élèves non plus. C'est écrit et vérifié
  dans `js/utils/regimeSheet.js:8-14`. Il n'y a pas d'export à brancher.
- **L'outil de chargement, lui, existe déjà** et attend une feuille de calcul :
  Matricule · Régime général · Régime de sortie · Valable du · Valable au ·
  Autorisé par · Document · Signé le (`js/utils/regimeSheet.js:31-41`).
- **Ce qui manque est donc une saisie**, ligne par ligne, pour les 923 élèves :
  le carnet d'un côté, la feuille de l'autre. Ce n'est pas un développement,
  c'est du temps de Vie Scolaire.

🔴 **Personne n'est nommé pour la faire, et aucune date ne l'est non plus.** Tant
qu'elle n'a pas eu lieu, `magbo.regime.desconhecido` doit rester `OBSERVATION`
(voir § 3.9) : au premier jour, 923 élèves sont sans régime, et passer à `DENY`
peindrait l'école entière en rouge.

`[À COMPLÉTER PAR SAMMY / Vie Scolaire]` Qui saisit les carnets, et pour quelle
date ? C'est la seule chose qui sépare le régime de sortie d'une règle écrite,
testée, déployée — et éteinte.

---

## 8. Repères chiffrés du dépôt

Mesurés le **03/09/2026**, sur `main` augmentée des trois chantiers de cette
date (`fix/adresse-du-login`, `feat/livre-imprimable`, `docs/verifications-finales`).
Comment : les comptes de fichiers par `find`, les suites **à froid**
(`cd backend && rm -rf target && mvn -o test`, puis `npm test`). ⚠️ **L'ancre est
une date, pas un SHA** — ces chantiers seront fusionnés par Sammy et les SHA
changeront ; l'état d'**avant** eux était `fc4359c`.

| Quoi | Combien |
|---|---|
| Contrôleurs / services / modèles / repositories / DTO | 28 / 47 / 36 / 22 / 37 |
| Fichiers de test Java / JS | 93 / 42 |
| Suites | `mvn test` **1055**, `npm test` **889** |
| Migrations SQL | **V001 → V027** (`deploy/migrations/`) |
| Permissions granulaires | **10** (`security/Permissions.java`, liste `TODAS`) |

⚠️ **Le critère de la suite n'est pas un total, c'est : 0 échec et exactement
2 `@Disabled`.** Le total monte à chaque livraison ; un total **inférieur** à la
référence signifie que quelqu'un a supprimé un test, et `Skipped ≠ 2` signifie
que quelqu'un a désactivé une des deux requêtes natives PostgreSQL. Ces deux-là
sont désactivées parce que H2 ne les exécute pas — elles exigent une
**vérification manuelle**, section **6-bis** de
`docs/frontend-smoke-checklist.md`. ⚠️ Mesurer **à froid**
(`cd backend && rm -rf target && mvn -o test`) : la compilation incrémentale a
déjà produit un `BUILD SUCCESS` mensonger.

**Rollbacks :** chaque migration a le sien dans `deploy/migrations/rollback/`,
**sauf V006, V008, V009 et V023** — V023 est une *seed*, ses lignes partent avec
`R021`. C'est documenté dans `deploy/migrations/README.md`.

**État de production au 03/09/2026.** Ce qui concerne la VM n'est pas vérifiable
depuis le dépôt : **V001 à V027** y sont toutes appliquées — V027 est
`licence_clock`, posée au déploiement de la licence le 01/09, et la licence est
valide jusqu'au **2027-03-31**. Le portable (le paquet Electron distribué aux
postes) est complet : **96/96** fichiers obligatoires, mesuré le 03/09/2026 par
`node scripts/verify-package.js`. ⚠️ **Ce 96 n'est pas une constante** : la liste
des fichiers obligatoires est **dérivée d'`index.html`**
(`scripts/indexAssets.js`), donc elle monte à chaque écran nouveau. Ce qui doit
rester vrai, c'est l'égalité des deux nombres, pas leur valeur.

`[A VERIFIER]` Confirmer les migrations réellement appliquées sur la VM avant
d'en appliquer une nouvelle — la procédure et la vérification propre à chaque
migration sont dans `deploy/migrations/README.md` et dans
`docs/operacional/nuit-27-28-08-rapport.md` §5.

---

## 9. Où aller ensuite

Le livre organise ; il ne recopie pas. Voici les documents qui font autorité.

| Pour… | Lire |
|---|---|
| Se servir du système, écran par écran | `docs/manual-utilisateur.md` (964 lignes, en français) |
| L'état opérationnel réel (⚠️ arrêté au 05/08) | `docs/operacional/handoff.md` |
| Reconstruire de zéro / restaurer une sauvegarde | `docs/operacional/reconstruir-do-zero.md` |
| Installer un poste | `docs/operacional/guide-installation-postes.md` |
| Fabriquer le portable | `docs/operacional/release-portable.md` |
| Mettre la VM à jour | `docs/operacional/mise-a-jour-vm.md`, `deploy/README.md` |
| Le détail d'un flux de bout en bout | `docs/architecture/fluxos.md` |
| Le catalogue des routes | `docs/architecture/endpoints.md` |
| Le schéma de la base | `docs/architecture/banco-de-dados.md`, `.claude/rules/database.md` |
| Le matériel Hikvision (payloads, pièges mesurés) | `.claude/rules/hikvision.md` |
| Ce qui est configurable sans toucher au code | `docs/operacional/inventaire-configurabilite.md` |
| Le rôle de HikCentral | `docs/operacional/procedimento-hikcentral.md` |
| Les deux dernières nuits de travail | `docs/operacional/nuit-26-27-08-rapport.md`, `nuit-27-28-08-rapport.md` |

Les décisions d'architecture sont dans `docs/architecture/decisoes/` : **ADR-001**
(deux tables), **ADR-002** (le numéro de carte n'est pas stocké — le terminal ne
l'envoie jamais), **ADR-003** (observationnel), **ADR-004** (cantine assistée),
**ADR-005** (voir le piège ci-dessous).

---

## 10. Trois pièges du dépôt lui-même

1. ⚠️ **Il y a DEUX fichiers ADR-005**, et ils ne parlent pas de la même chose :
   `ADR-005-creneaux-cantine.md` (26/08 — le planning de cantine devient une
   configuration, migrations V021-V023) et
   `ADR-005-totvs-rastreabilidade-no-dono-do-dado.md` (14/08 — TOTVS). **Le
   numéro a été attribué deux fois.** Je le signale sans le corriger :
   renuméroter casserait les renvois existants ; c'est une décision, pas une
   retouche. `[À COMPLÉTER PAR SAMMY]` Lequel des deux garde le numéro 005 ?
2. ⚠️ **`docs/operacional/handoff.md` ne s'arrête plus au 05/08/2026.** Il a été
   repris le 29/08 et porte en tête « Date de coupe : 2026-09-01 », dernier merge
   couvert `5632d0a` (PR #87 — la licence) : vérifié le 03/09/2026 à
   `handoff.md:6`. Ce qui lui manque désormais, ce sont les deux PR postérieures,
   **#89** (premier lancement) et **#90** (poste administratif, ADR-007). Là où
   il diverge du code, **le code gagne**.
3. ⚠️ **Sept endpoints ne sont pas gardés** (`/api/users`,
   `/api/access/logs/*`, `registerAccess`). C'est une dette **documentée et
   assertée en test** — `ControllerAuthorizationGuardTest.DIVIDA_CONHECIDA`,
   7 entrées, taille vérifiée par le test lui-même. Les fermer cassera des
   écrans : c'est un chantier avec ses propres preuves, pas une correction
   rapide.
