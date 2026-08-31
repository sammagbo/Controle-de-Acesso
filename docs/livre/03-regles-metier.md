# Chapitre 3 — Les règles métier

Ce chapitre s'adresse à qui doit **modifier, expliquer ou défendre** une décision du
MAGBO : pourquoi tel élève est apparu en rouge au portail, pourquoi telle ligne
porte un drapeau, pourquoi un refus n'a fermé aucune porte. Il répond à trois
questions pour chaque règle : *où vit-elle* (fichier, migration), *à quelle heure
est-elle jugée*, et *que se passe-t-il quand elle dit non*.

---

## 3.0 La règle des règles : `DENY` est **logique**, jamais physique

Le MAGBO **n'a jamais fermé une porte**, et il n'y a aucun code pour le faire.

- Le webhook est **post-événement** : quand la requête HTTP arrive, le terminal a
  déjà décidé et la porte a déjà bougé. Séquence mesurée avec le matériel le
  13/07/2026 : `21` (porte ouvre) → `75`/`1` (authentification) → `22` (porte
  ferme), le HTTP après. L'appareil **ignore** la réponse du MAGBO.
  → `docs/architecture/decisoes/ADR-003-webhook-pos-evento.md`
- Pour la cantine, c'est une décision explicite et **définitive** : *blocage
  opérationnel assisté*. Le terminal valide l'**identité**, le MAGBO valide la
  **règle**, l'**opérateur** applique l'exception. Pas de blocage physique via
  HikCentral pour le repas, **ni maintenant ni dans la feuille de route**.
  → `docs/architecture/decisoes/ADR-004-bloqueio-operacional-assistido.md`

Ce que `DENY` veut donc dire, très exactement, dans
`backend/src/main/java/com/magbo/access/services/AccessDecisionService.java` :

| Mode | Effet réel |
|---|---|
| `OBSERVATION` | la passage est enregistrée dans `access_logs` **et** une ligne est écrite dans `access_attempts` pour l'audit |
| `DENY` | **rien** dans `access_logs` ; seule la ligne `access_attempts` est écrite |

Dans les deux cas la personne est **physiquement passée**. `DENY` signifie « le
MAGBO ne compte pas ceci comme un accès valide » — un fait comptable, pas une
serrure. C'est même une propriété *souhaitée* : si la VM ou le réseau tombent, le
déjeuner et le portail continuent de fonctionner (ADR-003).

La séparation des deux tables est structurelle : `access_logs` = accès effectif,
`access_attempts` = tout ce qui a été tenté et refusé
(`ADR-001-attempts-vs-logs.md`). L'écart entre les deux est **mesuré** par le KPI
`divergenciaHoje` (`auth_result=SUCCESS` **et** `authorization_result=DENIED`).
Pour la cantine, cet écart n'est pas un défaut à combler : c'est la charge de
travail de l'opérateur.

---

## 3.1 ⚠️ L'horloge : quelle heure juge quoi — **le piège n°1 du projet**

Deux horloges circulent dans `AccessDecisionService.process(...)` :

- **`eventTime`** — l'heure où la passage a *eu lieu* (le `dateTime` du payload,
  converti en `America/Sao_Paulo` par `services/EventTimeResolver.java`) ;
- **`now`** — l'heure où le MAGBO *décide* (`LocalDateTime.now()`, ligne ~170).

La règle générale du projet est : **le registre utilise `eventTime`, les règles
utilisent `now`**, pour qu'une file hors-ligne vidée d'un coup ne change pas
rétroactivement un `DENY`/`ALLOW`. Mais il y a des **exceptions assumées**, et
chacune a été payée par un incident. Le 03/08/2026, 33 événements en file sont
tous entrés à 14h51 et ont produit des **durées négatives**.

| Règle | Horloge jugée | Où |
|---|---|---|
| Horodatage écrit dans `access_logs` / `access_attempts` | **événement** | `EventTimeResolver` |
| Utilisateur inactif | `now` | `AccessDecisionService` |
| Dédup repas (90 s) | `now` | `DeduplicationService` |
| Droit au repas (entitlement) | `now.toLocalDate()` | `MealEntitlementService` |
| **Créneau de cantine** (AVANT/APRES) | **événement** | `MealSlotService.resolver` |
| **Durée en cantine** (`EXCEDEU_TEMPO`) | **événement** | `AccessDecisionService.validateExitTime` |
| Autorisation de sortie ponctuelle | `now` | `ExitPermissionService.evaluate` |
| **Régime de sortie** | **événement** | `RegimeSortieService.avaliar` |
| **Exclusion CDI** | **événement** | `CdiExclusionService.avaliar` |
| **Registre d'alerte CDI** (`event_time`) | **événement** (heure du badge) | `CdiAlertService.registrar` |
| Même passage (30 s) | fenêtre **autour** de l'événement | `SamePassageService` |
| Dédup d'ingestion (60 s) | horloge du processus (`nanoTime`) | `WebhookIngestionDedupService` |
| Retrait manuel du Moniteur | horloge **de l'école** (`Clock.system(America/Sao_Paulo)`) | `CantineRemovalService` |
| Fermeture automatique | l'heure de **fermeture** (17:00), pas celle du job | `PresenceAutoCloseService` |

Le critère qui départage : **une règle qui NE REFUSE JAMAIS est jugée à l'heure de
l'événement** ; une règle qui peut refuser est jugée à l'heure de la décision. La
raison est écrite en toutes lettres dans le code : jugée par `now`, une sortie de
10h traitée à 18h deviendrait « fin de journée — sortie normale », et l'alerte que
la Vie Scolaire devait voir n'aurait jamais existé.

⚠️ Deux tests figent ce choix parce qu'il est fragile :
`RegimeGateWiringTest#regimeUsaAHoraDaPassagem` capture **l'argument** passé (et
non le verdict — la première version passait au vert toute la journée et ne
cassait qu'après 17h), et `MealSlotWiringTest` fait la même chose pour la fenêtre
de cantine.

---

## 3.2 Droits repas — `meal_entitlements` (V002) et son historique (V003)

Fichier : `backend/src/main/java/com/magbo/access/services/MealEntitlementService.java`

Trois états dans `EntitlementStatus` : `AUTHORIZED`, `NOT_AUTHORIZED`, `PENDING`.

⚠️ **Pas de ligne en base = `PENDING`**, et `PENDING` n'est **pas** un refus :
c'est « personne n'a rempli cette case ». Le webhook ne crée **jamais** de ligne
tout seul. `evaluate()` vérifie aussi `valid_from`/`valid_until` : un droit
`AUTHORIZED` hors de sa fenêtre de dates redevient non-attribué.

Toute modification écrit une ligne dans `meal_entitlement_events` **dans la même
transaction** (qui, quand, de → vers, `source` = `UI` | `BULK` | `API`).
⚠️ Le CHECK sur `source` est **manuel** (V003) : il n'existe que sur la VM, pas
sur le PC ni dans les tests. Une valeur nouvelle casse **uniquement en
production**.

### Les politiques (`config/PolicyProperties.java`)

| Politique | Défaut du code | `application-prod.properties` |
|---|---|---|
| `meal-not-entitled` | `DENY` | `DENY` |
| `meal-pending` | `OBSERVATION` | ⚠️ **`DENY`** (ligne 72) |
| `outside-meal-time` | `OBSERVATION` | `OBSERVATION` |
| `meal-slot-not-configured` | `OBSERVATION` | *absent des properties* → le défaut Java s'applique |
| `duplicate-meal` | `OBSERVATION` | `OBSERVATION` |
| `exit-not-authorized` | `DENY` | `DENY` |
| `user-inactive` | `DENY` | `DENY` |
| `missing-door-mapping` | `FALLBACK` | `FALLBACK` |

⚠️ **`meal-pending=DENY` en production a un prérequis opérationnel** (décision D5
de Sam, 16/07/2026, ADR-004) : la liste des élèves autorisés doit être importée
**en masse avant le jour 1**. Sans cet import, tout élève est `PENDING`, donc
refusé, et **aucun repas n'est enregistré**. C'est écrit dans le fichier de
properties lui-même (lignes 60-63).

L'ordre des règles du réfectoire est **obligatoire** et la première qui dit `DENY`
arrête tout : **dédup → droit (entitlement) → créneau horaire**. Seule
`action=ENTRADA` sur `REFEI*`/`CANTINA*` y passe ; la `SAIDA` suit la logique de
durée (§3.5).

Écrans : *Droits repas* (`js/components/MealEntitlementManagement.js`), permission
`MEAL_ENTITLEMENT_WRITE`. ⚠️ À l'import xlsx, les matricules Pronote ont des
**zéros en tête** : traiter la colonne comme **texte**, jamais comme nombre.

---

## 3.3 Créneaux de cantine — V021, V022, V023 (ADR-005)

Fichier : `services/MealSlotService.java` · ADR :
`docs/architecture/decisoes/ADR-005-creneaux-cantine.md`

**Le fait qui a déclenché tout ça** : le 25/08/2026, 164 entrées à la cantine, dont
**63 `OUTSIDE_MEAL_TIME` répartis sur 22 turmas**. Aucune n'était en faute : les
fenêtres de `class_schedules` dataient de 2025, et l'affiche que la Vie Scolaire
tient au mur avait changé. La cause n'était pas une faute de saisie — **le planning
n'avait pas d'écran**, donc personne ne l'a jamais changé.

### L'ordre de résolution (obligatoire)

1. **Exception de l'élève** pour ce jour → elle vaut, **et elle seule** ;
2. sinon, le ou les **créneaux de la turma** → il suffit **qu'un seul** corresponde ;
3. sinon → **`NAO_CONFIGURADO`**.

⚠️ L'exception **remplace** la turma, elle ne s'y ajoute pas : l'élève de Terminale
déplacé au second service **a cessé** d'appartenir au premier. `excecaoAluno()`
supprime les exceptions du même jour avant d'insérer la nouvelle.

⚠️ **Il suffit qu'un créneau corresponde** parce qu'une turma peut être dans deux
créneaux le même jour — fait réel de l'affiche 2026 : le mardi, 1E2 et 1E3 sont
dans les **deux** passages. Exiger que tous correspondent aurait refusé les deux
moitiés du groupe à la fois.

### Les quatre verdicts, et pourquoi deux d'entre eux ne sont pas la même chose

| Verdict | Sens | Trace |
|---|---|---|
| `DENTRO` | la passage tombe dans un créneau | aucune |
| `FORA` | il y a un créneau, la passage est en dehors | drapeau `AVANT_CRENEAU` / `APRES_CRENEAU` |
| `NAO_CONFIGURADO` | personne n'a dit à quelle heure cette personne mange | `access_attempts` en `OBSERVATION`, motif `MEAL_SLOT_NOT_CONFIGURED` — **aucun drapeau** sur la passage |
| `NAO_APLICAVEL` | la règle n'est pas pour cette personne (non-élève, élève sans turma, turma dispensée) | **rien du tout** |

⚠️ **`NAO_CONFIGURADO` n'est jamais un refus.** La maternelle et l'élémentaire ne
figurent pas sur l'affiche et ne peuvent pas être punies pour une case vide. C'est
une **question adressée à l'adulte** qui tient le planning. Politique
`OBSERVATION`, jamais `DENY`.

⚠️ **La distinction avec `NAO_APLICAVEL` est ce qui empêche la trace de noyer qui
la lit** : ~200 agents × 2 repas = **400 lignes/jour** disant qu'il manque de
configurer une chose qui n'existe pas. C'est la leçon de l'`INCONNU` du régime
(§3.9), appliquée avant de la repayer.

### Le seed (V023) vient de **deux** sources — et c'est délibéré

L'affiche ne couvre que le collège et le lycée. Mais la maternelle et l'élémentaire
**passent au réfectoire**, beaucoup : mesuré sur la base locale — CM2A 5226
passages, TPS/PS A 4923, MSB 4671, CPB 4372. Semer seulement l'affiche les aurait
toutes basculées en « non configuré » du jour au lendemain.

Donc : **l'affiche fait autorité pour les turmas qu'elle nomme**, et **les autres
sont reprises depuis `class_schedules`**. Tolérances semées : **15 min avant**
(on arrive en rang) et **45 min après** (le service s'étale), réglables par créneau
à l'écran.

⚠️ Deux turmas de l'affiche (**5E3**, **3E3**) n'ont **aucun élève** en base —
vérifié, pas deviné. Elles sont semées **quand même** : la table est la
transcription de l'affiche, et laisser l'écran signaler « turma sans élève » met le
désaccord sous les yeux de la Vie Scolaire. Les taire aurait fait disparaître la
question.

⚠️ **V023 n'a pas de rollback propre** : ses lignes vivent dans les tables de la
V021 et partent avec `R021`. C'est documenté dans
`deploy/migrations/README.md` (§ V021/V022/V023).

### ⚠️ La dette ouverte n°1 : deux tables, deux vérités possibles

`class_schedules` **n'est plus lu par la cantine**. Il survit pour une **autre**
question, posée par `RegimeSortieService` : « à quelle heure finit la matinée de
cette turma, et mange-t-elle ici aujourd'hui ? » — ce qui décide la fenêtre de
**sortie** du midi.

Si la Vie Scolaire déplace une turma de 12h30 à 13h00 dans les créneaux, le régime
continuera de lire l'ancienne heure de fin de matinée. **Ça n'ouvre ni ne ferme
aucune porte** (le régime observe), mais ça peut afficher « fin de journée » au
mauvais moment. Porté dans `docs/operacional/inventaire-configurabilite.md`.

`AccessDecisionService.validateEntryWindow` est marquée `@Deprecated` et **ne doit
pas être rebranchée** : elle n'existe plus que pour que
`EntryWindowRegressionTest` fige le comportement historique.

### Turmas dispensées de badge

Clé de réglage `magbo.cantine.turmas-dispensees` (CSV, **vide par défaut**, donc
personne n'est dispensé). Une turma dispensée ne produit **ni drapeau ni refus** de
cantine — mais **la passage reste enregistrée**. ⚠️ La conséquence PPMS est écrite
à l'écran, à côté du réglage (`js/components/MealSlotManagement.js`).

### 🔴 N'activez PAS la dispense en l'état — la raison est le PPMS

*(Question posée à Sam le 31/08/2026. Réponse : **la conséquence PPMS n'avait pas
été mesurée.**)*

Le code permet la dispense ; la décision n'a jamais été prise, et **elle n'était
pas comprise comme une décision de sécurité**. Elle en est une :

⚠️ **Une classe dispensée de badge ne badge plus — donc elle n'apparaît plus dans
le décompte d'évacuation du PPMS**, et l'écran PPMS **ne le signale pas**. Le
jour d'une évacuation réelle, l'équipe de crise compterait des enfants en moins
sans qu'aucun écran ne dise pourquoi. C'est exactement le défaut que le chapitre
sur les leçons appelle « je n'ai pas vu » lu comme « il n'était pas là », avec
des enfants dans un bâtiment.

**Condition bloquante :** ne pas activer tant que **le PPMS ne nomme pas
explicitement les classes dispensées** et ne dit pas comment elles sont comptées
autrement (appel papier de l'enseignant, par exemple).

**Et ce n'est pas à la personne qui reprend le code de trancher** — c'est une
décision de **direction**, parce qu'elle arbitre entre le confort d'un service et
un décompte d'évacuation. Détail et condition au § 8.2.9 du handoff.

*(Clé de réglage : `magbo.cantine.turmas-dispensees`, CSV, **vide par défaut** —
l'état actuel est donc le bon.)*

---

## 3.4 Les quatre familles de drapeaux

Le champ est `access_logs.flag`, **une String de 32 caractères, sans CHECK en
base** (vérifié sur PostgreSQL réel le 10/08/2026). Ajouter une valeur ne demande
donc **pas** de migration.

⚠️ **Le champ est UNIQUE — il n'empile pas.** L'ordre de priorité dans
`registrarPassagem` est : **drapeau métier** → `POSTO_FIXO` → `JA_PRESENTE`. Le
drapeau métier gagne toujours, parce qu'il nomme un problème que quelqu'un doit
voir, alors que `POSTO_FIXO` dit seulement « ceci est la routine ».

| Famille | Valeur | Écrit par | Horloge | Où ça s'affiche |
|---|---|---|---|---|
| Arrivé **avant** son service | `AVANT_CRENEAU` | backend, à l'`ENTRADA` | événement | Moniteur Cantine, Rapport réfectoire, Journal |
| Arrivé **après** son service | `APRES_CRENEAU` | backend, à l'`ENTRADA` | événement | idem |
| *(historique)* | `FORA_HORARIO` | lignes **antérieures au 27/08/2026** | — | compté avec les deux ci-dessus |
| **Séjour trop long** | `EXCEDEU_TEMPO` | backend, à la `SAIDA` | événement | Journal, Rapport ; en direct : colonne **DOIT SORTIR** |
| **Passage trop court** | *(aucun drapeau)* | **calculé à l'écran** sur la paire entrée/sortie | — | colonne **SORTIS**, marque discrète |

Deux nuances qui comptent :

1. **Le passage trop court n'est pas un drapeau.** Il est calculé côté client
   (`js/utils/cantine.js`, fonction `faixaDe`) à partir de la **paire** entrée +
   sortie. ⚠️ Sans entrée appariée, `faixa` vaut `null` et **la ligne ne reçoit
   aucune marque** : inventer une durée depuis le début du service aurait accusé
   de « n'a pas mangé » ceux que le lecteur d'entrée n'a pas vus — le défaut réel
   de la cantine en production (95 entrées perdues en un jour).
2. **Le séjour trop long existe deux fois** : comme drapeau `EXCEDEU_TEMPO` écrit
   à la sortie (le fait est consommé), et comme **colonne DOIT SORTIR** calculée en
   direct pendant que la personne est encore dedans (l'alerte est utile *avant* la
   sortie).

⚠️ **Lire la FAMILLE, jamais la valeur ancienne.** La liste canonique vit dans
`backend/.../models/AccessLog.java` :
`FLAGS_FORA_DO_CRENEAU = {"FORA_HORARIO","AVANT_CRENEAU","APRES_CRENEAU"}`,
miroir dans `js/utils/cantine.js` (`FLAGS_FORA_CRENEAU`) — **les changer
ensemble**. Le 27/08, un `if` testant `"FORA_HORARIO".equals(flag)` est devenu
**code mort en silence** au moment où les drapeaux sont devenus directionnels :
plus aucune ligne `OUTSIDE_MEAL_TIME` n'était écrite, et la politique
correspondante ne faisait plus rien du tout.

Les **deux drapeaux de répétition** — `POSTO_FIXO` (la personne travaille à ce
point) et `JA_PRESENTE` (elle entre alors qu'elle est déjà dedans) — vivent dans
`AccessLogRepository.REPETICOES` et sont traités au chapitre des passages, pas ici :
ils ne signalent pas une anomalie, ils expliquent une répétition.

---

## 3.5 Les durées : 15 et 30 minutes — **réglables à l'écran depuis la V024**

`backend/src/main/java/com/magbo/access/config/CantineProperties.java`

| Réglage | Défaut | Sens |
|---|---|---|
| `magbo.cantine.duracao-curta-minutos` | **15** | en dessous, la personne est entrée mais **n'a probablement pas mangé** |
| `magbo.cantine.duracao-maxima-minutos` | **30** | au-dessus, le séjour est **excessif** → `EXCEDEU_TEMPO` + colonne DOIT SORTIR |
| `magbo.cantine.decantacao-minutos` | 15 | combien de temps une ligne reste **visible** dans DOIT SORTIR |
| `magbo.cantine.sortis-visiveis-minutos` | 40 | combien de temps un sortant reste visible dans SORTIS |
| `magbo.cantine.lycee-inicio` / `lycee-fim` | 11:00 / 15:00 | référence de l'alerte « la cantine a ouvert plus tôt » |

Le 15 min **n'est ni un refus ni une accusation** : c'est un signal. Un élève qui
traverse le réfectoire en six minutes est allé chercher quelqu'un, a renoncé à la
file, ou le lecteur de sortie l'a attrapé en passant.

Le 30 min était **une heure** jusqu'au 24/08/2026 (constante `MAX_CANTINA_TIME`
dans le code Java) : une heure dépasse le service entier d'une turma, donc l'alerte
ne partait pour ainsi dire jamais.

⚠️ **La décantation n'est pas une suppression** : passé le délai, la ligne quitte la
colonne et va dans la pastille de l'en-tête, qui continue de la compter et ouvre la
liste complète en un clic. Rien n'est effacé. La colonne est un **instrument
d'action** : un opérateur qui voit trente anomalies n'agit sur aucune.

**Comment la valeur effective est calculée** — c'est le motif de toute la V024 :

```java
// AccessDecisionService.validateExitTime
Duration teto = Duration.ofMinutes(settingsService.efetivoInt(
        "magbo.cantine.duracao-maxima-minutos",
        cantineProperties.getDuracaoMaximaMinutos()));
```

et l'écran reçoit **les mêmes valeurs effectives** par `GET
/api/access/report-config` (`AccessController`, bloc `cantine`). ⚠️ Ce point
d'entrée existe précisément pour qu'il n'y ait **jamais** deux nombres pour le même
jour sur le même écran : tant que la constante était recopiée dans le JS, changer
la property côté serveur laissait l'écran dire autre chose, **sans erreur**.

---

## 3.6 Retraits manuels du Moniteur Cantine — V020

`deploy/migrations/V020__cantine_removals.sql` · `services/CantineRemovalService.java`

L'opérateur au comptoir voit dans « Dans la cantine » ou « Doit sortir » une ligne
qu'il **sait** fausse : la personne est sortie, le lecteur ne l'a pas vue.

⚠️ **C'est un geste d'ÉCRAN, et rien d'autre.** Le retrait ne touche pas
`access_logs`, n'écrit **aucune** sortie synthétique, **ne ferme pas** la présence
du PPMS et ne change aucun rapport de visite.

L'alternative refusée est écrite dans la migration, et il faut la connaître :
réutiliser le mécanisme de `FECHAMENTO_AUTO` (une `SAIDA` synthétique avec un
drapeau nouveau) coûtait **zéro migration**. Mais une sortie synthétique **ferme
aussi la présence PPMS** : l'écran d'évacuation aurait affirmé qu'un enfant a
quitté l'école parce que quelqu'un a nettoyé une colonne. Cet écran s'ouvre dans une
cour, et il répond à une seule question.

- Clé : **(user_id, point_id, dia)**. `point_id` parce que le moniteur affiche
  REFEI1, REFEI2 et CANTINA1 sur le même écran ; `dia` parce que le moniteur
  repart à minuit.
- ⚠️ **`removido_em` n'est pas de l'audit, c'est LA RÈGLE** : seules les passages
  **antérieures** à cet instant sont cachées. Si la personne rentre à 13h après un
  retrait à 12h30, l'entrée nouvelle **réapparaît** — celui qui a cliqué à 12h30 ne
  savait rien de 13h.
- Annuler est **soft** (`desfeito_em`/`desfeito_por`) ; un nouveau retrait
  **réutilise** la ligne (l'UNIQUE en garantit une seule).
- ⚠️ Piège de fuseau, mesuré : le conteneur backend démarre **sans `TZ`**, donc en
  UTC. Avec `Clock.systemDefaultZone()`, un retrait fait à 14h26 était enregistré
  à 17h26 — **trois heures dans le futur** — et le × cessait de cacher une ligne
  pour **faire taire la personne pendant trois heures**. D'où
  `Clock.system(EventTimeResolver.ZONA_ESCOLA)`.
- Autorisation : permission **`CANTINE_REMOVAL_WRITE`** **plus**
  `@areaSecurity.can(#pointId)` — la permission est globale, le point ne l'est pas.

---

## 3.7 `system_settings` — la surcouche (V024)

`deploy/migrations/V024__system_settings.sql` · `services/SettingsService.java` ·
`services/SettingsCatalog.java`

**Le contrat, en une phrase : « défaut = comportement actuel ».** Une base sans
**aucune** ligne dans `system_settings` se comporte **exactement** comme avant la
V024. Une ligne n'existe que quand quelqu'un a **modifié** un réglage à l'écran, et
elle porte **qui** et **quand**.

- Valeur en **texte**, pas de colonne typée ni d'enum (leçon V014/V017 : pas de
  CHECK qui diverge entre installations). Le typage vit dans `SettingsService`, à
  côté du défaut.
- ⚠️ **Valeur illisible = défaut + WARN**, jamais d'exception : un « abc » dans une
  clé numérique ne peut pas faire tomber la décision d'une passage.
- Cache **15 s** + invalidation à l'écriture — parce que `efetivo*` est lu sur le
  chemin le plus critique du système (chaque passage).
- Valeur **vide = suppression de la ligne** : « revenir au défaut » est une action
  de première classe.
- ⚠️ **Jamais de secret ici.** Tokens, mots de passe, PIN et clé JWT vivent dans
  l'environnement (`.env` de la VM, `setx` du PC).
- `SettingsCatalog.entradas()` est **la seule déclaration** de ce qui est réglable ;
  une clé lue par le code mais absente du catalogue serait invisible et
  irréparable. `SettingsCatalogGuardTest` échoue dans ce cas.
- ⚠️ Le défaut affiché **n'est jamais recopié** dans le catalogue : chaque entrée va
  le chercher à la source réelle (le bean de properties, la constante du
  contrôleur). Un « défaut : 50 » recopié aurait menti le jour où la property
  change.
- Les clés **orphelines** (présentes en base, absentes du catalogue) sont quand même
  affichées, groupe `orphelins` — sinon aucun écran ne pourrait les effacer.

Clés déclarées aujourd'hui : cinq pour la cantine (§3.5 + `turmas-dispensees`) et
cinq pour le CDI (`magbo.cdi.capacidade`, `.estado`, `.estado-inicio`,
`.estado-fim`, `.estado-nota`).

---

## 3.8 CDI — capacité, exclusions (V025), registre des alertes (V026)

### Capacité et état

`CdiController` : `magbo.cdi.capacidade` (**défaut 50**, qui vivait en dur dans
`js/cdi/cdiData.js`), et `magbo.cdi.estado` ∈ **`OUVERT` | `RESERVE` | `FERME`**
(défaut `OUVERT`), avec heure de début, de fin et une note. Écran : *Configuration*,
permission `CONFIG_WRITE` ; ou l'écran CDI lui-même (`PUT /api/admin/cdi/etat`).
⚠️ `SettingsCatalog.validar` refuse une capacité `< 1` : sans elle, un `PUT` sur la
clé brute passait à « 0 » et le CDI se déclarait **plein pour toujours**.

### Exclusions (V025)

`services/CdiExclusionService.java`

- Portée : **un élève OU une turma**, jamais les deux (CHECK
  `ck_cdi_exclusions_alvo`).
- ⚠️ **Ça n'empêche personne d'entrer.** Le terminal ouvre de toute façon
  (ADR-003). Ce que ça fait : **prévenir l'adulte présent**, fort et clair, au
  moment du badge.
- L'exclusion **individuelle** l'emporte sur celle de la turma — pas pour le
  verdict (les deux disent « exclu ») mais pour le **message** : la conversation
  n'est pas la même.
- `ate` **nul est légitime et fréquent** (« jusqu'à nouvel ordre »). Une date de fin
  déjà passée est **refusée** à la création : elle n'aurait jamais prévenu personne.
- ⚠️ Pas de colonne de début : **`criado_em` EST la date de début**, et `ativaEm`
  refuse les jours antérieurs — sans cette borne, une mesure posée aujourd'hui
  marquerait les passages de la semaine dernière, puisque le verdict est jugé à
  l'heure de l'**événement**.
- ⚠️ `turma` **n'est pas une photographie** : la comparaison se fait avec la turma
  **actuelle** de l'élève. Qui entre dans la classe hérite de l'exclusion, qui en
  sort la perd. C'est assumé dans cette version et écrit sur l'écran de création.
- Levée = **soft** (`revogado_por`/`revogado_em`), la ligne reste. Même doctrine que
  `student_exit_permissions` et `student_regimes` : une mesure prise sur un enfant
  est une preuve.
- ⚠️ Lecture **et** écriture derrière la permission **`CDI_EXCLUSION_WRITE`**, pas
  derrière l'aire `cdi` : une exclusion nomme un enfant et raconte une sanction.
  L'écran du CDI, lui, ne reçoit que de quoi **reconnaître** la personne au badge —
  sans motif ni auteur.

### Registre des alertes (V026)

`services/CdiAlertService.java` · trois types, CHECK manuel :
**`EXCLUSION`** (une personne ou une classe exclue a badgé), **`CAPACITE`** (le
badge a franchi la capacité), **`FERME`** (badge pendant un état fermé/réservé).

- `event_time` = l'heure du **badge**, jamais celle du traitement.
- ⚠️ **`criado_por` est estampillé par le SERVEUR** (le principal authentifié),
  jamais par le corps du POST. Ajouté **avant tout déploiement** par le panel du
  28/08 : après la première ligne écrite, ce serait irréparable.
- L'alerte `CAPACITE` est enregistrée **sans nom** : le premier d'un tick de
  polling n'est pas « qui a rempli la salle », c'est l'ordre d'un tableau.
- Écriture en `REQUIRES_NEW` + `catch` chez l'appelant : un registre qui tombe ne
  doit **jamais** emporter ce qui se passait autour.
- Lecture derrière `CDI_EXCLUSION_WRITE`, pas derrière l'aire.

### ⚠️ LA LIMITE STRUCTURELLE DU REGISTRE — à dire à quiconque s'en sert comme preuve

Le seul écrivain est **l'écran du CDI** : `js/cdi/BibliotecaView.js`, fonction
`registrarAlerta`, appelée dans `avisar(...)`, en **fire-and-forget** (le son et la
modale partent **avant** le POST, jamais en fonction de lui — un échec réseau ne
laisse qu'une ligne de console).

Conséquences, toutes vraies en même temps :

1. Si **l'écran du CDI n'est pas ouvert**, un élève exclu peut badger et **aucune
   ligne n'est écrite**. Le webhook, lui, enregistre bien la passage dans
   `access_logs` — mais il n'évalue **pas** l'exclusion.
2. Si le POST échoue (réseau, backend redémarré), l'alerte a été **vue et entendue**
   au comptoir sans laisser de trace.

⚠️ Donc : **l'absence de ligne ne prouve pas l'absence de badge.** Le registre
répond à « l'écran a-t-il signalé cette personne, quand, combien de fois » — et à
rien d'autre. Pour « cette personne est-elle passée au CDI ce jour-là », la source
est `access_logs`, pas `cdi_alert_events`.

---

## 3.9 Régimes de sortie — V014, V015, V017

`services/RegimeSortieService.java` · `models/RegimeVerdict.java`

Le **régime de sortie** est le droit **annuel** de sortir, déclaré par écrit par les
responsables légaux (circulaire n° 96-248). Il **ne remplace pas**
`student_exit_permissions` : le régime est la règle de l'année, la permission est
l'exception du jour, et **l'exception l'emporte**.

Le service cite le devoir quotidien du CPE comme spécification : « contrôle du
carnet, des signatures, des régimes et des emplois du temps ». **Quatre**
vérifications ; le MAGBO en assume **deux** (régime, signatures — elles sont en
base), et il est **explicite** sur la troisième : l'emploi du temps vit dans
Pronote et **n'arrive jamais ici**.

### L'ordre des règles (obligatoire)

1. Pas **élève** → `NON_APPLICABLE` ;
2. **Permission ponctuelle** valide maintenant → `AUTORISE` (l'exception gagne, et
   c'est à ça qu'elle sert) ;
   2-bis. **la permission que cette sortie vient de consommer** (`USED` dans une
   fenêtre de ±2 min) → `AUTORISE`. Sans ce degré, un élève sorti **avec**
   autorisation signée réapparaissait en **rouge** trois secondes plus tard, une fois
   la permission `SINGLE` consommée (relevé par le chef d'établissement, 14/08) ;
3. **Fin de journée** → `AUTORISE`. Sans ce degré, des centaines de rouges à 17h et
   l'alerte qui compte meurt noyée ;
4. Le **régime** ;
5. **Pas de régime** → `INCONNU`.

### Les cinq verdicts, et **pourquoi** ils sont cinq

Un verdict binaire (peut / ne peut pas) obligerait le système à **mentir trois
fois** : inventer « peut » pour qui dépend de l'emploi du temps, « ne peut pas »
pour qui n'a simplement pas de régime saisi, et quelque chose pour le professeur qui
n'est pas élève.

| Verdict | Couleur | Sens | Trace dans `access_attempts` |
|---|---|---|---|
| `AUTORISE` | vert | permission ponctuelle valide, **ou** le régime annuel autorise la sortie autonome | aucune |
| `NON_AUTORISE` | rouge | régime 1 (surveillé) sans permission ponctuelle | `REGIME_NOT_ALLOWED` |
| `A_VERIFIER` | ambre | régime 2 (semi-libre) : dépend d'une absence de professeur, que le MAGBO **ne sait pas** | `REGIME_TO_VERIFY` |
| `INCONNU` | ardoise | aucun régime saisi pour cet élève | ⚠️ **aucune, volontairement** |
| `NON_APPLICABLE` | sans couleur | la personne n'est pas élève | aucune |

⚠️ **Ce que le vert signifie exactement** : « le régime annuel de cet élève autorise
la sortie autonome ». **Pas** « j'ai vérifié l'emploi du temps et il est libre
maintenant ». L'écran doit le dire **avec les mêmes mots** (clés `regime.motivo.*`).

⚠️ **`A_VERIFIER` est le verdict le plus important de l'enum**, et ce n'est **pas
une objection** : le MAGBO ne conteste pas la sortie, il ne sait pas. Il laisse une
trace en `OBSERVATION` avec un motif propre, parce qu'un verdict que personne ne
peut compter après coup ne peut pas être amélioré — et c'était la moitié des cas
douteux.

⚠️ **`INCONNU` ne laisse pas de trace, exprès** : au jour 1, **923 élèves** n'ont pas
de régime, et 923 lignes/jour noieraient les deux familles qui comptent. Même
discipline que `PENDING` pour le repas : **une donnée non remplie n'est pas une
donnée négative.**

### Fin de journée : l'heure de la **turma**, pas celle de l'école

`RegimeProperties` : `fim-manha=12:00`, `retomada-tarde=14:00`, `fim-dia=17:00`,
`tolerancia-minutos=15`.

- Pour l'**externe**, la fin de la matinée termine la demi-journée ; pour le
  demi-pensionnaire et l'interne, seule la fin du jour — sauf le jour où la grille
  dit `'N'` (la turma ne mange pas ici : le mercredi typique, 30 turmas sur 43),
  où le demi-pensionnaire obtient **la même fenêtre de midi** que l'externe, **pas
  la journée entière**.
- ⚠️ L'heure de fin de matinée est lue **par turma** dans `class_schedules`
  (11H00, 12H30, 13H00 selon la turma). Avec un 12:00 unique, un élève d'une turma
  finissant à 13h00 recevait un **vert « sortie normale » une heure trop tôt**.
- ⚠️ La fenêtre de midi **se referme** à `retomada-tarde`. La première version ne
  demandait que « est-ce après la fin de la matinée ? » et répondait donc « fin de
  journée » à 14h30, à 16h et jusqu'à minuit : l'élève de régime 1 qui filait après
  le déjeuner recevait un vert.

### Ce que le régime fait, et ne fait pas

⚠️ **Il observe, point.** Il ne retourne jamais, n'empêche jamais l'enregistrement,
ne refuse jamais (ADR-003). Il tourne **au portail, à la SORTIE**, pour les deux
branches (terminal et caméra). L'écriture de l'observation est **isolée**
(`REQUIRES_NEW` + `catch` chez l'appelant) : sans ce `catch`, un échec du registre
faisait sauter la transaction de la passage et **effaçait l'`access_log`** — le
défaut même que le mécanisme existe pour empêcher.

### État d'activation

⚠️ `magbo.regime.habilitado` = **`false`**, dans `application.properties` (ligne 248)
**et** dans le champ Java, et `MAGBO_REGIME_HABILITADO=false` dans
`deploy/.env.example`. Régime désactivé → `NON_APPLICABLE` pour tout le monde.

⚠️ **Appliquer V015 (et V017) AVANT de l'activer** : sans elles, le CHECK de
`access_attempts.denial_reason` ne connaît pas `REGIME_NOT_ALLOWED` et l'INSERT
échoue **uniquement sur la VM**, à l'intérieur de la transaction de la passage.

⚠️ `magbo.regime.desconhecido` doit **rester `OBSERVATION`** jusqu'à ce que les
régimes soient chargés. Le passer à `DENY` avant transformerait l'école entière en
rouge — l'erreur déjà documentée pour `meal-pending` (D5/ADR-004).

**[À COMPLÉTER PAR SAM]** À quelle condition précise le régime doit-il être activé
en production (nombre d'élèves saisis ? date ? accord de la Vie Scolaire ?), et qui
décide de passer `desconhecido` à `DENY` ?

---

## 3.10 Autorisations de sortie ponctuelles — `student_exit_permissions` (V004, V012)

`services/ExitPermissionService.java`

Quatre types (`ExitPermissionType`) : `PERMANENT`, `DATE_RANGE`, `RECURRING`
(jours ISO en CSV), `SINGLE`. Chacun peut porter une **fenêtre horaire**
(`start_time`/`end_time`) qui est vérifiée **avant** le type.

- Évaluée à **`now`** (horloge de la décision), sur `PORT*` + `SAIDA` seulement.
- `SINGLE` est **consommée** uniquement à la sortie effective
  (`consumeIfSingle`, après l'enregistrement) — et **après** la règle de même
  passage, pour qu'une lecture répétée ne consomme pas deux fois la même
  autorisation.
- La révocation est **soft** — jamais de `DELETE`.
- Politique `exit-not-authorized=DENY` : sans permission active, `evaluate()` rend
  `EXIT_NOT_AUTHORIZED` ; hors fenêtre, `OUTSIDE_EXIT_WINDOW`.
- Écran : *Sorties*, permission `EXIT_PERMISSION_WRITE`. « Autorisé par » vient du
  **cadastre** (`responsavel_id`), pas d'un champ libre : le champ est une preuve.

⚠️ **La règle de sortie est DÉSACTIVÉE sur les caméras du portail**, et c'est
délibéré. Le champ `Passagem#aplicarPermissaoDeSaida` vaut `true` pour les terminaux
et **`false`** pour les caméras : `evaluate()` refuse **toute** personne sans
permission active et ne regarde pas le type d'utilisateur, donc l'activer ferait de
**chaque sortie d'agent à 17h** un `EXIT_NOT_AUTHORIZED` — des centaines par jour,
sans que personne l'ait décidé.

**[À COMPLÉTER PAR SAM]** Faut-il brancher l'évaluation de sortie sur les caméras du
portail, et faut-il d'abord restreindre la règle aux `ALUNO` (l'entité s'appelle
`StudentExitPermission`) ? Le javadoc renvoie explicitement la décision à Sam.

---

## 3.11 PPMS — qui est encore à l'intérieur

`services/PpmsService.java` · `GET /api/ppms/inside` · permission **`PPMS_READ`**

Résumé (le détail est dans le chapitre des écrans et dans
`docs/manual-utilisateur.md`) :

- Calculé **en Java**, pas par la requête `currentOccupancyByPoint` — celle-ci est
  PostgreSQL-only et `@Disabled` dans la suite. Le nombre qui dit s'il reste un
  enfant à l'intérieur **ne peut pas venir d'une requête qu'aucun test n'exécute**.
- ⚠️ Exclusion **asymétrique** : on écarte l'**ENTRÉE** marquée en répétition,
  **jamais la SORTIE**. Exclusion symétrique = qui a un poste fixe reste « dedans »
  jusqu'à minuit (défaut payé le 10/08/2026).
- Zone `EM_TRANSITO` pour qui a quitté un point mais reste dans l'école : dire
  « CDI » enverrait l'équipe chercher dans une salle vide.
- Avertissement supplémentaire quand quelqu'un se trouve dans un point **sans
  fermeture automatique** (l'infirmerie, dont la sortie est manuelle).
- ⚠️ **Ne remplace pas l'appel.** L'écran le dit au-dessus du nombre. Cache
  hors-ligne en `localStorage`, avec l'heure du cliché en évidence.
- Pas d'export CSV de masse : décision de Sam — la loi demande du papier pour la
  cellule de crise, et un CSV avec le nom de tous les enfants vit pour toujours sur
  le portable de quelqu'un.

---

## 3.12 Fermetures automatiques de présence

`services/PresenceAutoCloseService.java` · `config/PresenceAutoCloseProperties.java`

Le CDI ferme à 17:00 et personne n'y dort — mais la présence dérive du **dernier
événement**, donc qui n'a pas badgé en sortant reste « dedans » pour toujours.

- Une **`SAIDA` synthétique** est écrite, **déclarée et jamais déguisée** :
  `flag=FECHAMENTO_AUTO`, `created_by_user=system`.
- ⚠️ **Heure écrite = l'heure de FERMETURE** (17:00), pas celle du job. C'est ce qui
  rend le résultat déterministe même si le backend était arrêté.
- **Idempotent par deux voies** : après le premier passage le dernier événement est
  une `SAIDA` ; et de toute façon, rien n'est écrit s'il existe déjà un
  `FECHAMENTO_AUTO` pour cette personne / ce point / ce jour. La seconde voie est
  nécessaire : quelqu'un qui entre **après** la fermeture redeviendrait candidat.
- Job toutes les 5 minutes ; il ferme tout point dont l'heure **est déjà passée**.

Configuration en production (`application-prod.properties`, lignes 120-127) :
`BIBLIO=17:00` et `REFEI1=15:00`.

### ✅ L'heure de 15:00 est confirmée — mais la sortie reste synthétique

*(Répondu par Sam le 31/08/2026.)*

Le fichier porte la mention « ⚠️ CONFÉRER L'HEURE AVEC LA CANTINE avant le
jour 1 ». **La confirmation a été faite : 15:00 correspond au service réel.**
Personne n'est fermé au milieu de son repas.

⚠️ **Ce que cela ne dit pas, et qu'il faut lire lentement :** 15:00 est un
**plafond juste** — à cette heure-là le service est fini, donc la fermeture ne
ment pas sur la *présence*. Ce n'est pas une heure de sortie *individuelle*.
Mesuré en production le 25/08 : **72 sorties écrites à 15:00 pile, dans la même
minute.** Ce ne sont pas 72 personnes parties à 15:00 — ce sont 72 personnes
dont la sortie n'a **jamais été lue**.

**Conséquence : pour ces lignes, la durée de repas est un MAXIMUM, pas une
mesure.** Un déjeuner de vingt minutes peut apparaître à trois heures. Toute
moyenne qui les inclut est fausse vers le haut. Elles sont reconnaissables
(`flag=FECHAMENTO_AUTO`, `created_by_user=system`) et donc excluables — le
handoff, § 2.4, donne la requête et le piège du `flag IS NULL OR` qu'elle
contient.

**La question ouverte n'est donc plus l'heure, c'est le taux :** pourquoi
72 sorties ne sont-elles pas lues ? Terminal de sortie absent, mal placé, ou
personne ne badge en partant. Cela s'observe à la cantine à 13h, pas dans le
dépôt.

---

## 3.13 Les TROIS couches de déduplication — **elles ne sont pas la même chose**

C'est la confusion la plus fréquente du projet. Trois mécanismes, trois causes,
trois clés. Aucun ne remplace un autre.

| # | Service | Nature | Clé | Fenêtre | Ce qu'il attrape |
|---|---|---|---|---|---|
| 1 | `WebhookIngestionDedupService` | **infrastructure** | IP source + `serialNo` (caméras : `pId`) | `magbo.ingestion-dedup.ttl-seconds` = **60 s**, glissante | l'appareil **réenvoie le MÊME paquet** parce que la destination était tombée |
| 2 | `DeduplicationService` | **règle métier de cantine** | personne + point + action | `magbo.dedup.window-seconds` = **90 s** | quelqu'un veut **un second repas** |
| 3 | `SamePassageService` | **lecture répétée** | personne + point + action | `magbo.same-passage-window-seconds` = **30 s**, fenêtre des **deux côtés** de l'événement | le terminal a lu **la même face deux fois** — événements *différents*, `serialNo` neuf, donc (1) les laisse passer, correctement |

Notes qui sauvent du temps :

- La fenêtre de (1) est **glissante** exprès : un appareil bloqué en boucle reste
  supprimé tant que la boucle dure. Le 60 s est borné des deux côtés — assez long
  pour couvrir une boucle à ~1 req/s, assez court pour ne jamais atteindre deux
  passages réelles de la même personne.
- Dans (3), l'**action** fait partie de la clé : une `ENTRADA` suivie d'une `SAIDA`
  dans la même minute est une personne qui est entrée puis sortie, pas une lecture
  répétée.
- ⚠️ Dans (3), **la requête en base ne suffit pas**, et la cantine l'a prouvé le
  24/08/2026 : quatre appareils sur un même point (.10/.12 en entrée, .13/.14 en
  sortie) lisent la même personne à ~300 ms d'intervalle ; la deuxième transaction
  interroge **avant** que la première ait commité, les deux lisent « n'existe pas »
  et les deux écrivent. D'où `reservar` — une réservation **atomique en mémoire**,
  avec **exactement la même fenêtre**. La requête en base reste : elle couvre ce que
  la mémoire ne couvre pas (redémarrage, et la fenêtre entière après expiration).
- Une **quatrième** couche existe, de nature différente : `PostoFixoService` et
  `PresencaAbertaService` ne suppriment rien — ils **marquent** (`POSTO_FIXO`,
  `JA_PRESENTE`) des passages **physiques réelles**, séparées de plusieurs minutes.
  Élargir une fenêtre de dédup pour les couvrir effacerait des entrées et des
  sorties légitimes de tout le monde.

---

## 3.14 Les permissions

`backend/src/main/java/com/magbo/access/security/Permissions.java` — la liste
`TODAS` les rassemble, et **c'est la seule** : jusqu'au 14/08/2026 elle existait en
double dans `SystemUserController`, et un test cherchant le nom de la permission
passait même avec la vérification supprimée.

| Permission | Gouverne |
|---|---|
| `MEAL_ENTITLEMENT_WRITE` | modifier les droits repas |
| `EXIT_PERMISSION_WRITE` | créer/révoquer les autorisations de sortie |
| `ATTEMPTS_READ` | lire les tentatives refusées |
| `REGIME_WRITE` | saisir le régime de sortie d'un élève |
| `PPMS_READ` | lire la liste **nominative** de qui est dans l'école |
| `CANTINE_REMOVAL_WRITE` | retirer une ligne du Moniteur (**+** `can(#pointId)`) |
| `MEAL_SLOT_WRITE` | modifier le planning de cantine (lecture : par aire) |
| `PARCOURS_READ` | lire le parcours du jour d'une personne, tous points confondus |
| `CONFIG_WRITE` | lire **et** écrire les réglages `system_settings` |
| `CDI_EXCLUSION_WRITE` | lire **et** gérer les exclusions du CDI + le registre d'alertes |

Trois principes lisibles dans les javadocs :

1. **Une permission, pas une aire**, quand la donnée traverse l'école (`PPMS_READ`,
   `PARCOURS_READ`) ou nomme un enfant sous sanction (`CDI_EXCLUSION_WRITE`).
   « Restreindre, pas fermer » — décision de Sam, 14/08/2026.
2. **Lire ≠ écrire**, sauf pour `CONFIG_WRITE` et `CDI_EXCLUSION_WRITE`, où la
   lecture est déjà du matériel d'administration ou une donnée sensible.
3. Sans permission granulaire, les champs sont **désactivés, pas cachés** : la
   lecture reste ouverte par aire.

⚠️ `"*"` est accepté par `SystemUser.hasPermission` (compatibilité, et seulement
comme chaîne entière) mais **n'est pas proposé à l'écran** : il accorderait aussi ce
qui n'existe pas encore.

---

## 3.15 Vérifications à faire sur la VM

Rien de ce qui suit n'est vérifiable depuis le dépôt. Les états de production
ci-dessous ont été **affirmés par Sam le 28/08/2026**.

**[À VÉRIFIER]** Les migrations **V001 → V026** sont appliquées (affirmé par Sam le
28/08). Les tables créées par les six dernières :

```bash
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT tablename FROM pg_tables WHERE tablename IN
   ('cantine_removals','meal_slots','meal_slot_classes','meal_slot_students',
    'system_settings','cdi_exclusions','cdi_alert_events') ORDER BY 1;"
```
→ les 7 lignes doivent apparaître.

**[À VÉRIFIER]** Le CHECK de `denial_reason` contient bien les valeurs des V009,
V015 et V022 — sinon l'INSERT échoue **seulement en production**, à l'intérieur de
la transaction d'une passage :

```bash
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT pg_get_constraintdef(oid) FROM pg_constraint
   WHERE conname='access_attempts_denial_reason_check';"
```
→ doit contenir `MEAL_SLOT_NOT_CONFIGURED`, `REGIME_NOT_ALLOWED`, `REGIME_UNKNOWN`,
`REGIME_TO_VERIFY`, `UNKNOWN_FACE`, `AMBIGUOUS_NAME`.

**[À VÉRIFIER]** Les politiques réellement chargées au démarrage — `PolicyProperties`
les journalise en une ligne au boot :

```bash
docker logs magbo-backend 2>&1 | grep "MAGBO policies:"
```
→ attendu en production : `meal-pending=DENY`.

**[À VÉRIFIER]** Le seed V023 est bien en place et le planning correspond à
l'affiche au mur (voir `docs/operacional/controle-affiche-cantine.md` et son `.sql`
de contrôle) :

```bash
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT s.dia_semana, s.hora, count(c.turma)
     FROM meal_slots s LEFT JOIN meal_slot_classes c ON c.slot_id=s.id
    GROUP BY 1,2 ORDER BY 1,2;"
```

**[À VÉRIFIER]** Quels réglages ont été modifiés à l'écran (aucune ligne = tout est
au défaut du code, ce qui est l'état de naissance) :

```bash
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT chave, valor, updated_by, updated_at FROM system_settings ORDER BY chave;"
```

**[À VÉRIFIER]** Le régime est-il activé sur la VM ? La valeur vient de
l'environnement, pas du dépôt :

```bash
grep MAGBO_REGIME_HABILITADO deploy/.env      # sur la VM, .env n'est pas versionné
docker exec magbo-backend env | grep MAGBO_REGIME
```

**[À VÉRIFIER]** Les six terminaux en service (affirmé par Sam le 28/08 : portail
.166 SORTIE et .167 ENTRÉE, CDI .15 et .16, cantine .10/.12/.13/.14) correspondent
bien aux `door_mappings` — ⚠️ les IP bougent en DHCP et la panne est **silencieuse** :

```bash
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT terminal_ip, point_id, action, label FROM door_mappings WHERE ativo ORDER BY terminal_ip;"
```

---

## 3.16 Un défaut de rangement à signaler (ne pas corriger à l'aveugle)

⚠️ Le dossier `docs/architecture/decisoes/` contient **deux fichiers numérotés
ADR-005** :

- `ADR-005-creneaux-cantine.md` (26/08/2026 — celui que ce chapitre cite) ;
- `ADR-005-totvs-rastreabilidade-no-dono-do-dado.md`.

Les deux sont des décisions réelles et acceptées ; c'est la **numérotation** qui est
en double. Renuméroter casserait les liens existants dans le code et la
documentation, donc le fait est **signalé, pas corrigé**.

**[À COMPLÉTER PAR SAM]** Lequel des deux garde le numéro 005, et le second devient
lequel ? (Une redirection depuis l'ancien nom serait préférable à un renommage sec.)

---

## Pour aller plus loin

| Sujet | Document |
|---|---|
| Ce que chaque écran affiche, écran par écran | `docs/manual-utilisateur.md` |
| L'état opérationnel du jour | `docs/operacional/handoff.md` |
| Reconstruire / restaurer, commandes exactes | `docs/operacional/reconstruir-do-zero.md` |
| Ce qui est réglable et ce qui ne l'est pas | `docs/operacional/inventaire-configurabilite.md` |
| Contrôler le planning contre l'affiche | `docs/operacional/controle-affiche-cantine.md` (+ `.sql`) |
| Appliquer les migrations, dans l'ordre, avec les gardes | `deploy/migrations/README.md` |
| Revue des V021-V023 | `docs/operacional/revue-migrations-v021-v023.md` |
| Les décisions et leur pourquoi | `docs/architecture/decisoes/ADR-001` à `ADR-005` |
| Règles de code par domaine | `.claude/rules/backend.md`, `database.md`, `frontend.md` |
