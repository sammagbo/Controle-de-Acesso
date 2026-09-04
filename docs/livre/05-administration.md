# Chapitre 5 — Administration

Ce chapitre s'adresse à la personne qui **administre** MAGBO : celle qui crée les comptes
opérateurs, charge les listes (élèves, personnels, droits repas, régimes, photos), tient le
planning de la cantine et règle les valeurs du système. Il répond à trois questions : *qui a le
droit de faire quoi*, *comment entrent les données sans les abîmer*, et *où se règle ce qui se
règle*. Il ne couvre ni l'exploitation quotidienne (voir `docs/manual-utilisateur.md`) ni le
déploiement (voir `docs/operacional/reconstruir-do-zero.md` et `docs/operacional/mise-a-jour-vm.md`).

---

## 5.1 Carte des écrans d'administration

Deux portes, et elles ne mènent pas au même endroit.

| Porte | Comment on y entre | Ce qu'on y trouve |
|---|---|---|
| **Panneau Administratif** | Bouton **Administration** (cadenas) de la barre du haut → **code PIN** | Compteurs du jour, journal, synchronisation Pronote, *Gestion des opérateurs*, *Gestion des utilisateurs*, et les raccourcis vers les écrans de gestion |
| **Engrenage ⚙** | Icône engrenage de la barre du haut | Imports (Excel, HikCentral, personnels, photos), enregistrement manuel, réglages du poste, **et depuis le 28/08 la « Configuration du système »** |

Les écrans de gestion (`Droits Repas`, `Sorties`, `Régimes`, `Planning Cantine`,
`Exclusions CDI`) sont déclarés `hidden: true` dans `js/data/constants.js` : ils
n'apparaissent pas sur le tableau de bord public. On y entre par le Panneau Administratif
(`js/App.js:435-464`, les gestionnaires `onNavigateToMeal`, `onNavigateToMealSlots`,
`onNavigateToExit`, `onNavigateToRegime`, `onNavigateToCdiExclusions`) — ou, pour un opérateur
non-admin, par un **raccourci** posé sur son tableau de bord dès qu'il détient la permission
correspondante (`js/utils/permissions.js`, fonction `podeVerPonto`, lignes 116-148).

> ⚠️ Le raccourci n'apparaît **jamais** pour l'ADMIN : `mostraAtalhoNoDashboard`
> (`js/utils/permissions.js:97-101`) renvoie `false` pour lui, parce qu'il entre par le Panneau.
> Deux chemins vers le même écran, c'est un défaut corrigé derrière un seul des deux.

---

## 5.2 Opérateurs et permissions

### 5.2.1 Les trois étages du droit

Le système empile **trois** choses distinctes, et les confondre est la source d'erreur la plus
fréquente :

1. **Le rôle** — `backend/.../security/Role.java` : deux valeurs seulement, `ADMIN`
   (« Vie Scolaire — accès total ») et `OPERATOR`. L'ADMIN passe **toutes** les gardes.
2. **Les secteurs** (`setoresPermitidos`, CSV) — `cantine`, `infirmerie`, `cdi`, `portail`, ou
   `*`. Ils gouvernent la **lecture** : quels écrans de poste et quels rapports on voit. La liste
   des cases est dans `js/components/UserManagement.js:317-322`.
3. **Les permissions** (`permissoes`, CSV) — elles gouvernent l'**écriture**, et quelques
   lectures particulièrement sensibles. La liste canonique vit dans
   `backend/.../security/Permissions.java`, constante `TODAS` (lignes 115-125).

La garde côté serveur s'écrit toujours de la même façon :
`@PreAuthorize("hasRole('ADMIN') or @areaSecurity.hasPermission('X')")`
(`backend/.../security/AreaSecurity.java:41-58`).

Où l'on crée et modifie un compte : **Panneau Administratif → Gestion des opérateurs**
(`js/components/AdminDashboard.js:455-490`, écran `js/components/UserManagement.js`).

[CAPTURE: 05-formulaire-operateur.png — le formulaire d'un opérateur — le rôle, les cases de secteurs, et la grille des permissions particulières juste en dessous]

### 5.2.2 La liste complète des permissions

La colonne « Qui devrait l'avoir » est une **proposition**, pas une configuration existante :
elle n'est écrite nulle part dans le code, et la répartition réelle des comptes de production
n'est pas vérifiable depuis le dépôt (voir la fin de cette section).

| Permission | Ce qu'elle ouvre | Où c'est gardé | Qui devrait l'avoir *(proposition)* |
|---|---|---|---|
| `MEAL_ENTITLEMENT_WRITE` | Modifier un droit repas (activer, retirer, dater), l'import en masse, l'historique | `MealEntitlementController` (4 routes, l. 62-128) | L'opérateur de la cantine et la Vie Scolaire. **La Direction décide, l'opérateur exécute** (ADR-004) |
| `EXIT_PERMISSION_WRITE` | Créer et révoquer une autorisation de sortie **ponctuelle** | `ExitPermissionController:75, 91` | Vie Scolaire uniquement — c'est elle qui reçoit le mot des familles |
| `ATTEMPTS_READ` | Consulter les tentatives refusées et leurs agrégats (`/api/access/attempts`, `/stats`) | `AccessAttemptController:29, 44` | Vie Scolaire, direction, et l'opérateur qui doit comprendre un refus au moment où il arrive |
| `REGIME_WRITE` | Écrire le **régime de sortie annuel** d'un élève (V014) | `StudentRegimeController:130-170` | Vie Scolaire **et elle seule** : c'est elle qui tient le carnet signé par la famille. Le javadoc de `Permissions.java:13-22` le dit explicitement — l'ADMIN n'est pas le bon profil |
| `PPMS_READ` | Lire la liste **nominative** de qui est à l'intérieur (évacuation) | `PpmsController:51` | Vie Scolaire, direction, infirmerie. Décision de Sammy du 14/08 : **restreindre, pas fermer** — un nom est ce qui permet de retrouver un enfant |
| `CANTINE_REMOVAL_WRITE` | Retirer une ligne du Moniteur Cantine (et la remettre) | `CantineRemovalController:62, 77` | L'opérateur de la cantine. ⚠️ voir l'avertissement ci-dessous |
| `MEAL_SLOT_WRITE` | Modifier le planning cantine : créneaux, classes, exceptions par élève | `MealSlotController` (`ESCRITA`, l. 47) | Vie Scolaire — c'est elle qui tient l'affiche au mur |
| `PARCOURS_READ` | Le parcours du jour d'une personne, tous points confondus | `ParcoursController` (`GATE`, l. 50) | Vie Scolaire et direction. Traverse toute l'école : plus que ce qu'aucun secteur ne donne |
| `CONFIG_WRITE` | **Lire et écrire** les réglages du système ; capacité et état du CDI ; classes dispensées de badge | `SettingsController` (`GATE`, l. 36), `CdiController:173`, `MealSlotController:172` | Sammy, la direction, et éventuellement la Vie Scolaire. C'est la carte complète du comportement du système |
| `CDI_EXCLUSION_WRITE` | **Lire et gérer** les exclusions du CDI (qui, pourquoi, jusqu'à quand, qui a décidé) | `CdiController` (`GATE_EXCLUSOES`, l. 51-52) | Vie Scolaire et responsable du CDI. Une exclusion nomme un enfant et raconte une sanction |

Quelques règles qui ne se devinent pas :

- **Lecture par secteur, écriture par permission.** L'opérateur de la cantine ouvre le Moniteur
  parce qu'il a le secteur `cantine` ; il en *retire* une ligne parce qu'il a
  `CANTINE_REMOVAL_WRITE`. Deux choses différentes, et c'est voulu.
- **Trois exceptions** où la *lecture* passe par une permission : `PPMS_READ`, `PARCOURS_READ`,
  `CDI_EXCLUSION_WRITE`, et `CONFIG_WRITE`. Chacune porte son javadoc expliquant pourquoi
  (`Permissions.java`, l. 25-95). La raison commune : la donnée traverse l'école entière, ou elle
  nomme un mineur dans une situation qu'un secteur n'a pas à connaître.
- **Sans permission, les champs sont DÉSACTIVÉS, jamais cachés** (`.claude/rules/frontend.md`).
  Exception assumée : l'engrenage lui-même, qui est *caché* aux profils qui n'y ont rien à lire —
  le commentaire de `js/components/Header.js:120-152` explique pourquoi (une porte dessinée qui ne
  s'ouvre pas n'apprend qu'à ne plus cliquer).
- **`*` existe mais n'est pas offert.** `SystemUser.hasPermission` l'accepte quand c'est la chaîne
  entière, et `SystemUserController.validatePermissoes` le laisse passer — mais aucune case ne le
  coche à l'écran : il accorderait aussi les permissions **qui n'existent pas encore**
  (`Permissions.java:111-113`, `js/components/UserManagement.js:381-386`). Un compte qui l'a reçu
  par API voit un bandeau d'avertissement.

> ⚠️ **`CANTINE_REMOVAL_WRITE` ne suffit pas seule, et l'oubli ne produit aucune erreur visible.**
> Le `@PreAuthorize` du `CantineRemovalController` exige **aussi** `@areaSecurity.can(#pointId)`.
> La permission est globale, le point ne l'est pas : sans la seconde moitié, quiconque l'obtient
> pourrait masquer une ligne du CDI ou du portail. Une **troisième** garde vit dans le service :
> le point doit appartenir à la cantine. Tout est expliqué dans le javadoc du contrôleur
> (`backend/.../controllers/CantineRemovalController.java:14-38`).

### 5.2.3 Ajouter une permission : les trois miroirs

Le nom d'une permission existe à **trois** endroits qui doivent bouger ensemble :

1. `backend/.../security/Permissions.java` — la constante **et** son ajout dans `TODAS` ;
2. `js/utils/permissions.js`, objet `PERMISSIONS` — c'est lui qui dessine les cases de l'écran
   opérateurs ;
3. la clé i18n `operadores.permissao.<NOM>` dans `js/utils/i18n.js` (FR et PT).

> ⚠️ Oublier `TODAS` est le piège historique : la permission existe alors *uniquement* comme
> littéral dans un `@PreAuthorize`. L'admin ne peut pas l'accorder (« Permission invalide ») et
> l'écran concerné devient accessible au seul ADMIN — c'est-à-dire justement au profil qui ne
> devrait pas l'utiliser. C'est arrivé à `REGIME_WRITE`, rattrapé le 14/08/2026
> (`Permissions.java:13-22` et `:99-113`).

### 5.2.4 Ce que le dépôt ne peut pas dire

`[À COMPLÉTER PAR SAMMY]` Quels comptes opérateurs existent réellement sur la VM de production,
avec quel rôle, quels secteurs et quelles permissions ? En particulier : **qui détient
`CONFIG_WRITE`** aujourd'hui, et **qui détient `REGIME_WRITE`** à la Vie Scolaire ?

`[À COMPLÉTER PAR SAMMY]` Le mot de passe du compte applicatif `admin` et la valeur de `ADMIN_PIN`
sur la VM (les défauts `admin1234` / `1234` doivent avoir été changés — voir
`.claude/rules/deploy-seguranca.md`). Où sont-ils consignés ?

`[A VERIFIER]` La liste vivante des comptes se lit avec un jeton ADMIN :
`curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/system-users`
(route `GET /api/system-users`, `SystemUserController:26`).

---

## 5.3 Les imports, et leurs pièges

### 5.3.1 La règle qui les gouverne tous : simuler, puis confirmer

Quatre imports (HikCentral, droits repas, régimes, photos) suivent le **même** dessin, et il n'est
pas décoratif :

- `plan(...)` **n'écrit rien** et rend, ligne par ligne, ce qui se passerait ;
- `apply(...)` **refait le plan** contre l'état actuel de la base — il ne fait jamais confiance au
  plan que l'opérateur a vu à l'écran.

La raison est écrite dans `backend/.../services/HikCentralImportService.java:109-118` et répétée
dans `UserPhotoService.java:25-33` : entre la vérification et la confirmation, quelqu'un a pu
modifier une fiche. Appliquer un plan périmé, c'est écrire d'après ce qui n'est plus vrai.

Un vocabulaire commun aux quatre : **CRÉER · METTRE À JOUR · IGNORER · CONFLIT · À VÉRIFIER**.
Un **conflit n'est pas une panne** : c'est une ligne que le système **refuse** d'appliquer, avec le
motif écrit — et les autres lignes passent quand même.

### 5.3.2 ⚠️ Le piège n°1 : les zéros à gauche

Les matricules Pronote ont **7 chiffres avec des zéros en tête** (`0001764`). Excel les convertit
en nombre et mange le zéro — et `1764` est **un autre élève**.

Le système se protège partout où il lit un fichier : `raw: false` dans les options xlsx
(`js/utils/hikcentralSheet.js:80-…`, `js/utils/mealSheet.js:55-60`,
`js/utils/regimeSheet.js:43-51`), et le nom de fichier photo comparé **comme texte**
(`UserPhotoService.java:337-343`).

Mais **rien ne peut réparer un fichier déjà abîmé**. La discipline est donc en amont :

- formater la colonne matricule en **Texte** *avant* d'enregistrer le fichier ;
- **ne jamais ouvrir dans Excel** le CSV destiné au HikCentral — l'écran le dit en toutes lettres
  (`js/utils/i18n.js:400-403`, affiché par `AppSettingsModal.js:1291-1293`) ;
- l'éditer en éditeur de texte si besoin.

Voir aussi `docs/manual-utilisateur.md` §A.6 « Les zéros du début, dans Excel ».

### 5.3.3 Import Excel — élèves et responsables

**Engrenage → « Importer Excel ».** Le format complet (colonnes, types acceptés, ordre de
traitement des responsables, comportement en cas d'erreur partielle) est déjà documenté :
voir **`docs/IMPORT_TEMPLATE.md`**. Les points à retenir :

- l'import **crée seulement** ; une ligne dont l'ID existe déjà est rejetée, jamais écrasée ;
- les types s'écrivent **en majuscules** : `ALUNO`, `PROFESSOR`, `FUNCIONARIO`, `RESPONSAVEL` ;
- les responsables sont traités en premier, même s'ils sont en bas du fichier.

> Le cadastre des **élèves** vient normalement de **Pronote** (`PronoteSyncService`, huit colonnes
> obligatoires — voir `js/utils/regimeSheet.js:7-13`, qui les énumère). Cet import est un filet,
> pas le chemin normal.

### 5.3.4 Import HikCentral — relier les visages aux personnes

**Engrenage → « HikCentral ».** C'est ce qui donne à MAGBO le lien entre le visage enregistré dans
le terminal et la fiche de la personne. **Sans ce lien, le terminal reconnaît la personne et MAGBO
la refuse à chaque passage.**

Le fichier attendu est l'export **« Renseignements personnels »** du HikCentral, en `.xlsx`.

> ⚠️ **L'EN-TÊTE EST À LA LIGNE 9.** Les huit premières lignes sont des instructions du HCP
> lui-même. Le lecteur démarre à `range: 8` (0-indexé) — `js/utils/hikcentralSheet.js:17-24`. Sans
> cela les colonnes s'appelleraient `__EMPTY_3` et le fichier entier serait lu comme du bruit
> (`AppSettingsModal.js:340-357`). La première ligne de données est donc la **10**, et c'est ce
> numéro-là que le rapport d'import affiche (`HikCentralImportService.java:143`).

Les colonnes lues — `ID`, `Prénom`, `Nom de famille`, `Service` — sont casées **par leur nom**,
jamais par leur position : le HCP réordonne et ajoute des colonnes entre versions, et une position
fixe casserait sans prévenir (`hikcentralSheet.js:38-53`). Les colonnes de validité et de niveau
d'accès sont ignorées : ce sont des affaires du HCP (ADR-004, « le HCP est du provisionnement
pur »).

**Les lignes « À vérifier ».** Un élève dont l'ID HikCentral n'est pas la matricule (neuf cas dans
l'export réel) part en **révision humaine** : seul le nom fait le lien, et rapprocher
automatiquement par le nom reviendrait à donner le visage d'un enfant à un autre
(`HikCentralImportService.java:180-190`). Le pas-à-pas de l'écran, avec les deux encadrés
vert/rouge à lire avant de confirmer, est dans `docs/manual-utilisateur.md` §14.2.

**Le chemin inverse (F7b).** Le même onglet génère le **CSV à importer dans le HCP** pour les
élèves qui n'ont pas encore de visage lié — `HikCentralCsvService`, boutons en
`AppSettingsModal.js:1296-1314`. Tous les champs sortent entre guillemets, précisément pour dire
« ceci est du texte ».

> ⚠️ Le **template exact du HCP** reste une inconnue. Le générateur réutilise, faute de mieux, les
> colonnes de l'*export* que MAGBO sait déjà lire, et l'encadré du javadoc le déclare
> (`HikCentralCsvService.java:23-38`). Le nom de la colonne de classe (`"Classe"`) est une
> **supposition assumée, isolée dans une constante** pour qu'un seul mot ait à changer
> (`HikCentralCsvService.java:63-82`).

Le cycle complet — MAGBO génère le CSV → l'informatique l'importe → *Apply to Device* → **0
échec** — et les six questions encore ouvertes avec le SI sont dans
**`docs/operacional/procedimento-hikcentral.md`** (§1, §2 et la liste finale des pendências).

### 5.3.5 ⚠️⚠️ « Restaurer les paramètres par défaut » doit rester DÉCOCHÉ

> ```
> ┌──────────────────────────────────────────────────────────────────────────┐
> │  ⚠️  DANS LE HIKCENTRAL, POUR L'EXPORT DES PERSONNES ET POUR CELUI       │
> │      DES PHOTOS : LA CASE « RESTAURER LES PARAMÈTRES PAR DÉFAUT »        │
> │      DOIT RESTER **DÉCOCHÉE**.                                           │
> │                                                                          │
> │  Cochée, elle remet la sélection de champs du HCP à son état d'usine.    │
> │  Le fichier qui en sort n'a plus les mêmes colonnes ni la même mise en   │
> │  page — et l'import de MAGBO, qui cherche son en-tête à la LIGNE 9 et    │
> │  ses colonnes PAR LEUR NOM, ne reconnaît plus rien. L'écran répond       │
> │  « Feuille non reconnue » et, dans le meilleur des cas, on perd une      │
> │  demi-heure ; dans le pire, on croit que l'export est vide.              │
> └──────────────────────────────────────────────────────────────────────────┘
> ```

**Origine de cette consigne : Sammy, le 28/08/2026.** Elle n'est **pas** vérifiable dans le dépôt —
aucun fichier du projet ne mentionne cette case, qui appartient à l'interface du HikCentral et non
à MAGBO.

`[A VERIFIER]` Ouvrir le HikCentral (`192.168.1.90`) → module Personnes → **Exporter**, et
localiser la case exacte ainsi que l'écran où elle apparaît (export des renseignements, export des
photos, ou les deux). Noter la formulation exacte dans la langue de l'installation, puis la
recopier ici.

`[À COMPLÉTER PAR SAMMY]` La consigne vaut-elle aussi pour l'**import** dans le HCP (*Apply to
Device*), ou uniquement pour les deux exports ?

### 5.3.6 Import du personnel

Deux chemins, tous deux dans l'engrenage :

- **« Importer les personnels »** — un `.xlsx` avec `nome, hikvision_employee_id, tipo,
  departamento, matricula` ; la matricule laissée vide reçoit le prochain `FUNC-###`
  (`js/utils/i18n.js:539-541`).
- **« Enregistrement manuel »** — une personne à la fois ; l'écran affiche à l'avance la matricule
  qui sera émise si le champ reste vide (`AppSettingsModal.js:101-110`), parce que sans cela
  l'opérateur ne peut pas savoir ce que le système va graver.

L'onglet **« Personnels »** liste, cherche, édite, désactive — et porte l'outil **« C'est un
élève »**, qui transfère un visage vers la bonne fiche d'élève et désactive l'enregistrement
`FUNC-###` créé par erreur. Les règles qu'il respecte et qu'il ne faut pas assouplir (les passages
restent sur l'ancien enregistrement, confirmation explicite si l'élève a déjà un visage, jamais de
rapprochement automatique par le nom) sont dans `docs/operacional/handoff.md` §2.7.

### 5.3.7 Droits repas

**Panneau Administratif → Droits Repas** (ou raccourci avec `MEAL_ENTITLEMENT_WRITE`). Édition
unitaire, historique, et **import en masse** d'un `.xlsx`.

Colonnes acceptées (FR, PT et le nom du champ système, pour qu'un fichier ré-exporté depuis MAGBO
revienne sans traduction) — `js/utils/mealSheet.js:47-53` :
`Matrícula/Matricule/ID` · `Status/Statut/Droit` · `Valable du` · `Valable au` · `Note`.

> ⚠️ **Un élève absent de MAGBO n'est jamais créé ici.** La fiche élève vient de Pronote ; créer
> produirait un « élève » sans nom, sans classe et sans responsable, pour satisfaire une ligne de
> tableur (`MealEntitlementImportService.java:39-43`).

> ⚠️⚠️ **`PENDING` n'est pas « refusé », mais en production il finit par l'être.** Un élève sans
> ligne de droit est `PENDING` — donnée non renseignée. Or la production met
> `magbo.policy.meal-pending=DENY` (décision D5, ADR-004). **Conséquence opérationnelle : la liste
> des autorisés doit être chargée en masse AVANT le premier service**, sinon tous les `PENDING`
> sont refusés le jour 1. C'est écrit dans `docs/operacional/procedimento-hikcentral.md` §4 et
> repris dans `docs/manual-utilisateur.md` §A.1.

### 5.3.8 Régimes de sortie

**Panneau Administratif → Régimes** (ou raccourci avec `REGIME_WRITE`). Le régime est le droit
**annuel** de sortir, déclaré par écrit par les responsables légaux (circulaire n° 96-248). Il ne
remplace pas les autorisations ponctuelles de l'écran *Sorties* : le régime est la règle de
l'année, l'autorisation est l'exception du jour, **et l'exception l'emporte**.

> ⚠️ **Pronote n'apporte pas le régime**, et l'import Excel des élèves non plus. Vérifié dans
> `PronoteSyncService#processLine` ; le constat est écrit en tête de `js/utils/regimeSheet.js:7-13`
> et de `RegimeImportService.java:24-29`. Le chemin bon marché a été cherché : il n'existe pas.
> Cette feuille **est** le chemin.

Colonnes acceptées — `js/utils/regimeSheet.js:31-41` :
`Matricule` · `Régime général` · `Régime de sortie` · `Valable du` · `Valable au` ·
**`Autorisé par`** · `Document` · `Signé le` · `Note`.

> ⚠️ `Autorisé par` (`authorized_by_family`) est **obligatoire en base** (V014). Une ligne sans
> auteur affirmerait qu'un enfant peut sortir seul sans que personne ne l'ait dit. Un régime n'est
> **jamais supprimé** : le remplacer clôt l'ancienne ligne (`encerrado_em`) et en ouvre une
> nouvelle — les deux restent, parce qu'un régime est une preuve
> (`.claude/rules/database.md`, section `student_regimes`).

L'utilité de l'import en masse est arithmétique : un élève à la fois, ce sont **923 opérations en
septembre**, et le module ne sort jamais du jour 1 (`RegimeImportService.java:18-22`).

### 5.3.9 Photos

Voir **§5.6** — ce sont des photos de mineurs et les règles sont d'une autre nature.

---

## 5.4 Le planning cantine et l'affiche imprimable

### 5.4.1 Pourquoi cet écran existe

Le 25/08/2026, la cantine a produit **63 `OUTSIDE_MEAL_TIME` sur 22 classes** qui mangeaient
pourtant à l'heure juste : les fenêtres de `class_schedules` dataient de 2025 et l'affiche du mur
avait changé. La cause n'était pas une faute de saisie — c'est que **le planning n'avait pas
d'écran**, et qu'en changer demandait du SQL à la main sur la VM. Tout est exposé dans
**`docs/architecture/decisoes/ADR-005-creneaux-cantine.md`**.

Depuis V021, trois tables — `meal_slots`, `meal_slot_classes`, `meal_slot_students` — sont la
**seule source de vérité** de la fenêtre d'accès au réfectoire.

### 5.4.2 L'écran

**Panneau Administratif → Planning Cantine** (ou raccourci avec `MEAL_SLOT_WRITE`).
Fichier : `js/components/MealSlotManagement.js`.

Ce qu'on y fait :

| Geste | Où | Permission |
|---|---|---|
| Créer un créneau (jour + heure) | Bloc « nouveau créneau » | `MEAL_SLOT_WRITE` |
| Attacher / détacher une classe, ou tout un préfixe | Pastilles du créneau | `MEAL_SLOT_WRITE` |
| Régler la tolérance **− avant / + après** (minutes) | Sur la carte du créneau | `MEAL_SLOT_WRITE` |
| Éditer le **rotulo** (le libellé imprimé) | Champ en haut de la carte | `MEAL_SLOT_WRITE` |
| Exception **par élève** | `POST/DELETE /api/admin/meal-slots/{slotId}/eleve/{userId}` | `MEAL_SLOT_WRITE` |
| **Classes dispensées de badge** | Bloc rouge en bas | ⚠️ **`CONFIG_WRITE`**, pas `MEAL_SLOT_WRITE` |

> ⚠️ **La dispense est gardée plus fort que le reste du planning, et c'est délibéré.** Une classe
> dispensée disparaît du Moniteur **et cesse de compter dans le PPMS**. Déplacer une classe de
> créneau, c'est du planning ; ne plus la compter dans un calcul d'évacuation, non. Le javadoc de
> `MealSlotController:160-172` le dit, et l'avertissement est écrit **en toutes lettres à côté du
> réglage** — c'est le seul endroit où la personne qui décide le lira au moment de décider
> (`MealSlotManagement.js:216-263`).

L'écran **montre les désaccords, il ne les tranche pas** : classes sans créneau, classes du
planning sans aucun élève. C'est la Vie Scolaire qui tient le mur.

### 5.4.3 L'affiche

Bouton **imprimante** en haut à droite → la grille d'édition est remplacée par l'affiche, puis
**Imprimer** (`MealSlotManagement.js:119-133` ; composant `js/components/AfficheCantine.js`).

- L'affiche **sort de la configuration du moment** : on change les créneaux à l'écran et on
  réimprime. C'est tout l'intérêt — tant que le mur et la base étaient deux documents séparés, ils
  ont divergé.
- **En couleur, fidèle au mur** : Terminale en saumon, 1ère et 2nde en bleu, collège en blanc à
  liseré gris. Le code couleur porte du sens, et le changer casserait une lecture que toute
  l'école a apprise (`AfficheCantine.js:18-46`).
- ⚠️ `print-color-adjust: exact` (avec son préfixe `-webkit-`) **n'est pas de la décoration** :
  sans cette ligne, les navigateurs suppriment les fonds colorés à l'impression et tout sort en
  gris. C'est exactement pourquoi les réimpressions étaient ternes
  (`AfficheCantine.js:10-16`).
- **Une page par passage, en A4 paysage** : 12H30 et 13H00 sont deux affiches distinctes au mur.
- Aucune bibliothèque PDF : c'est l'impression du navigateur.

**Le rotulo est éditable depuis le 28/08/2026.** Avant, la page 11h imprimait
« REPRIS DE CLASS_SCHEDULES » — un nom de table interne — sur une page lue par les familles de 25
classes, et **aucun champ de l'écran ne permettait de le corriger**. Le champ est maintenant sur la
carte du créneau ; l'endpoint l'acceptait déjà (`MealSlotManagement.js:289-302`,
`MealSlotController:184`). Le défaut et sa correction sont racontés dans
`docs/operacional/nuit-27-28-08-rapport.md` (Chantier 3).

[CAPTURE: 05-carte-creneau.png — la carte d'un créneau, avec le champ rotulo, les deux tolérances et les pastilles de classes]
[CAPTURE: 05-affiche-cantine.png — l'aperçu d'impression de l'affiche — bandeau bleu foncé, pastilles en couleur, une page par passage]

### 5.4.4 Le contrôle à faire à chaque rentrée

Quatre requêtes SQL disent où le planning **ne correspond pas** à la réalité des élèves, sans rien
corriger — parce que seule la Vie Scolaire peut trancher. Elles sont prêtes à l'emploi :

```bash
docker exec magbo-postgres psql -U magbo -d magbodb -f - < docs/operacional/controle-affiche-cantine.sql
```

Le document **`docs/operacional/controle-affiche-cantine.md`** explique chacune, avec les réponses
mesurées le 26/08/2026. À relancer **avant le premier service de chaque rentrée** : c'est le moment
où les codes de classe changent, et le seul où ces listes sont faciles à corriger.

> ⚠️ La liste B (« classes qui mangent sans figurer dans aucun créneau ») **doit rester vide**. Le
> jour où une vraie classe y apparaît, ses élèves mangent sans horaire connu tant que personne ne
> l'ajoute.

---

## 5.5 ⚠️ L'écran de configuration a DÉMÉNAGÉ le 28/08/2026

**Il n'est plus dans le Panneau Administratif.**

> **Chemin exact :** barre du haut → **icône engrenage ⚙** → première entrée de la colonne de
> gauche, **« Configuration du système »**.
>
> **Visible avec : rôle `ADMIN` ou permission `CONFIG_WRITE`.**

Ce qui a changé, et pourquoi :

- L'engrenage était réservé à l'ADMIN. Il s'ouvre désormais aussi au porteur de `CONFIG_WRITE` qui
  n'est pas admin — et cette personne y voit **une seule** entrée, la configuration ; aucune des
  sept autres (imports, personnels, photos, enregistrement, réglages généraux)
  (`js/components/Header.js:145-170`, `js/components/AppSettingsModal.js:31-42`).
- La garde est posée sur le **contenu**, pas seulement sur les boutons de la barre latérale : un
  `setActiveTab` forcé depuis la console ne rend rien (`AppSettingsModal.js:1963-1974`).
- **Le card du Panneau Administratif a été SUPPRIMÉ, pas transformé en raccourci.** Il n'avait
  vécu qu'un jour (créé le 27/08, retiré le 27/08). Un raccourci laisserait deux chemins vers le
  même écran, et le prochain défaut serait corrigé derrière un seul des deux. Le point d'accès
  `SYSTEM_CONFIGURATION`, sa route et son raccourci ont disparu avec lui — le commentaire qui
  l'explique est resté à sa place dans `js/data/constants.js:35-40`, précisément pour que personne
  ne le recrée. Récit complet : `docs/operacional/nuit-27-28-08-rapport.md`, Chantier 1.

### Ce qu'on y règle

Le catalogue est déclaré **une seule fois**, dans
`backend/.../services/SettingsCatalog.java` (méthode `entradas()`, l. 72-102). Il est construit à
chaque appel pour que les défauts soient lus **maintenant**, à leur source réelle, et non figés au
démarrage :

| Domaine | Clés |
|---|---|
| **cantine** | `magbo.cantine.duracao-curta-minutos`, `…duracao-maxima-minutos`, `…decantacao-minutos`, `…sortis-visiveis-minutos`, et les **classes dispensées** |
| **cdi** | `magbo.cdi.capacidade`, `magbo.cdi.estado`, `…estado-inicio`, `…estado-fim`, `…estado-nota` |

Chaque ligne dit **trois** choses et pas une : ce qui s'applique maintenant, ce qui s'appliquerait
sans intervention (le défaut), et **qui a décidé autrement** (`js/components/SystemConfiguration.js`,
en-tête et l. 224-240).

- **« Rétablir le défaut » est un bouton**, pas une manœuvre : vider la valeur supprime la ligne en
  base et le code reprend la main. C'est le contrat de la V024, et il ne vaut que si l'on peut y
  revenir sans savoir quelle était la valeur d'origine.
- **Une clé au défaut n'a pas de ligne** dans `system_settings`. C'est pourquoi l'écran lit
  `/catalogue` et non `GET /` : un écran construit sur les seules lignes gravées afficherait une
  liste **vide** sur une base neuve, et on en conclurait qu'il n'y a rien à configurer
  (`SettingsController:43-52`).
- **Les orphelins** — une clé gravée qui n'est plus déclarée — apparaissent en ambre, dans un
  domaine à part (`SettingsCatalog.java:187-196`). Ils n'ont pas de défaut : plus rien ne les
  déclare.
- ⚠️ **Aucun secret ne passe par là.** Jetons, mots de passe et clé JWT vivent dans
  l'environnement (`.env` de la VM, `setx` du PC). Un écran qui les afficherait les mettrait sur
  une capture d'écran le jour même.

[CAPTURE: 05-configuration-systeme.png — l'écran Configuration du système — une ligne avec sa valeur, son défaut écrit à côté, « modifié par … le … », et les deux boutons Enregistrer / Rétablir]

### Ce qui n'est PAS dans cet écran

Les **politiques** `magbo.policy.*` se règlent par properties et non à l'écran. Défauts lus dans
`backend/.../config/PolicyProperties.java:26-39` :

| Politique | Défaut du code | Effet |
|---|---|---|
| `meal-not-entitled` | `DENY` | Refus enregistré, aucun `access_log` |
| `meal-pending` | `OBSERVATION` | ⚠️ **la production met `DENY`** — décision D5, ADR-004 |
| `outside-meal-time` | `OBSERVATION` | Trace, sans refus |
| `meal-slot-not-configured` | `OBSERVATION` | Classe sans créneau : on laisse passer |
| `duplicate-meal` | `OBSERVATION` | |
| `exit-not-authorized` | `DENY` | |
| `user-inactive` | `DENY` | |
| `missing-door-mapping` | `FALLBACK` | |

`OBSERVATION` enregistre **le passage et la tentative** ; `DENY` n'enregistre que la tentative.
Rappel structurel : MAGBO **n'ouvre ni ne ferme aucune porte** (ADR-003) — un `DENY` est une
qualification, pas un blocage physique.

`[A VERIFIER]` La valeur réellement appliquée en production se lit dans la ligne INFO du démarrage
(`PolicyProperties.java:51`) : `docker logs magbo-backend | grep "MAGBO policies"`.

L'inventaire de ce qui reste écrit en dur, avec sa priorité et la raison de ne PAS convertir
certaines valeurs, est dans **`docs/operacional/inventaire-configurabilite.md`**.

---

## 5.6 Les photos d'identité — ce sont des photos de MINEURS

Ces règles ne sont pas des recommandations. Elles sont écrites dans le code, testées, et rappelées
dans `.claude/rules/backend.md` et `.claude/rules/deploy-seguranca.md`. Le contrat est énoncé en
tête de `backend/.../services/UserPhotoService.java:35-47` et de
`backend/.../controllers/UserPhotoController.java:26-44`.

### Les cinq promesses

1. **Lecture authentifiée, une photo à la fois.** `GET /api/users/{userId}/photo` est
   `@PreAuthorize("isAuthenticated()")`, avec ETag (SHA-256) et `Cache-Control: private`, 30
   minutes (`UserPhotoController.java:55-99`). `private` et jamais `public` : « public »
   autoriserait un proxy du réseau de l'école à stocker des portraits d'élèves et à les servir à
   qui les demande.
   ⚠️ La page ne peut pas faire `<img src="/api/users/X/photo">` — le navigateur n'envoie pas
   l'en-tête `Authorization` dans une balise `<img>`. `js/utils/photoCache.js` récupère l'image par
   `fetch` avec le jeton et construit un `objectURL`. **Ouvrir l'endpoint « juste pour le kiosque »
   publierait un catalogue de visages d'enfants sur le réseau de l'école.**
2. **Aucun export en masse.** Il n'existe pas d'endpoint qui rende l'ensemble, pas de ZIP de
   sortie, pas de CSV avec les images. `.claude/rules/backend.md` précise qu'un test casse si
   quelqu'un en crée un.
3. **Aucun octet d'image en log.** Les lignes de log portent matricule, nom de fichier et
   compteurs — jamais de contenu, pas même « les premiers octets pour déboguer »
   (`UserPhotoService.java:126-131`).
4. **Les images de la caméra restent jetées.** `faceImage`, `backgroundImage`, `faceLibImage` du
   webhook ne touchent jamais cette table. Seul entre ici un fichier qu'un opérateur a choisi et
   envoyé exprès.
5. **La suppression est définitive.** `DELETE` réel, sans effacement logique
   (`UserPhotoService.delete`, l. 134-141). Supprimer une fiche personnel efface sa photo dans la
   **même transaction** (`StaffAdminService.deleteStaff`) : un portrait orphelin attaché à un
   identifiant disparu, c'est une image que personne ne retrouve pour l'effacer et qui survit à
   tous les sauvegardes suivantes.

### L'import (engrenage → « Photos »)

- **Le nom du fichier fait le lien** : `0004048.jpg` = la matricule, ou l'identifiant Hikvision.
  **Les zéros de gauche comptent** — la comparaison se fait comme texte
  (`UserPhotoService.java:331-343`).
- **Le format est décidé par les octets** (JPEG `FF D8 FF`, PNG, WebP), jamais par l'extension ni
  par le `Content-Type`, qui sont tous deux déclarés par l'expéditeur : un `.exe` renommé `.jpg`
  passerait les deux (`UserPhotoService.java:319-329` et `tipoPorConteudo`).
- **Deux fichiers pour la même personne dans un lot → CONFLIT sur les deux, aucun appliqué.**
  Appliquer le premier reviendrait à laisser l'ordre alphabétique d'un dossier décider quel est le
  visage de cette personne — et dans un portail, le mauvais visage sur la bonne fiche, c'est une
  sortie autorisée au nom d'un autre (`UserPhotoService.java:206-215`).
- **Simulation d'abord**, comme les autres imports ; `apply` refait le plan.
- Plafonds : **2 Mo par image** (`magbo.photos.max-bytes`), **2000 fichiers par lot**
  (`magbo.photos.max-arquivos-por-lote`) ; pour un ZIP, **5000 entrées** et **256 Mo
  décompressés**, avec le plafond par entrée vérifié **pendant** la lecture — protection contre la
  bombe zip (`PhotoZipReader.java:47-56, 94-141`).
- ⚠️ **Le ZIP entre par corps brut** (`consumes="application/zip"`), pas en multipart : les limites
  `spring.servlet.multipart.*` ont été mesurées pour le webhook des **caméras**, et les desserrer
  pour un écran d'administration reviendrait à toucher le nombre qui protège le chemin le plus
  critique du système.
- Après un import en masse, appeler `MagboPhotoCache.clear()` (rechargement de l'application),
  sinon les personnes qui viennent de recevoir une photo gardent leurs initiales
  (`.claude/rules/frontend.md`).

### Où elles vivent, et pourquoi

Dans **PostgreSQL**, table `user_photos` (V011), colonne `bytes BYTEA`. La raison est vérifiable :
`deploy/docker-compose.yml` monte **un** volume dans le conteneur du backend
(`../backend/target:/app`), qui est la sortie de Maven — `mvn clean` l'efface et chaque build la
réécrit. **Une photo sur disque ne survivrait pas au déploiement lui-même.** En base, elles entrent
gratuitement dans le `pg_dump` qui existe déjà : **la sauvegarde de la base EST la sauvegarde des
photos**.

> ⚠️ `user_photos` est la première table dont la donnée n'existe **nulle part ailleurs**. Le
> rollback `R011` **efface les images** ; les restaurer exige le dump précédent ou une
> réimportation des fichiers.

---

## 5.7 Migrations et état de la base

27 migrations, `deploy/migrations/V001` à `V027`, avec un `rollback/` pour toutes **sauf** V006,
V008, V009 et V023 — soit 23 fichiers dans `rollback/` (comptés le 03/09/2026 : `ls
deploy/migrations/V0*.sql | wc -l` → 27, `ls deploy/migrations/rollback/*.sql | wc -l` → 23). Pour V023 c'est normal : c'est un *seed*, et ses lignes partent avec `R021` —
c'est documenté dans `deploy/migrations/README.md`. Flyway n'est **pas** adopté ; la VM applique
les fichiers dans l'ordre, à la main, avant de démarrer le backend.

> ⚠️ Le piège qui ne se voit **que sur la VM** : avec `ddl-auto=update`, Hibernate crée un CHECK à
> la création d'une table mais ne le **modifie jamais** ensuite. Ajouter une valeur à un enum Java
> (par exemple `DenialReason`) fait donc échouer l'INSERT **uniquement en production** — le PC ne
> bouge pas non plus, et les tests recréent H2 à zéro et restent verts. C'est pourquoi V009, V015 et
> V022 existent : elles élargissent le CHECK de `access_attempts.denial_reason`. Même piège pour
> `meal_entitlement_events.source` et `student_regime_events.source`, qui sont des CHECK **manuels**
> (`.claude/rules/database.md`).

`[A VERIFIER — état au 03/09/2026, non vérifiable dans le dépôt]` V001 à V027
seraient toutes appliquées sur la VM de production (V027 = `licence_clock`, posée au
déploiement de la licence le 01/09). Le confirmer en listant les objets attendus,
par exemple :

```bash
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' ORDER BY 1;"
```
(on doit y trouver `access_attempts`, `meal_entitlements`, `meal_entitlement_events`,
`student_exit_permissions`, `user_photos`, `student_regimes`, `cantine_removals`, `meal_slots`,
`system_settings`, `cdi_exclusions`, `cdi_alert_events`.)

`[A VERIFIER — état affirmé par Sammy le 28/08/2026]` Six terminaux en service : portail `.166`
(SORTIE) et `.167` (ENTRÉE), CDI `.15` et `.16`, cantine `.10`, `.12`, `.13`, `.14` — soit **huit**
adresses pour six terminaux ; l'écart n'est pas expliqué par le dépôt. À confirmer par :

```bash
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT terminal_ip, door_no, reader_no, point_id, action, label
     FROM door_mappings WHERE ativo ORDER BY terminal_ip;"
```

> ⚠️ **Les IP dansent en DHCP et cassent en silence** la « Écoute HTTP » du terminal **et** les
> `door_mappings` : aucune erreur, les événements cessent simplement d'arriver ou de correspondre.
> Avant toute séance matériel : IP du serveur, IP au écran du terminal, URL de l'Écoute HTTP,
> `door_mappings` (`.claude/rules/hikvision.md`).

**Pour la VM : oui.** `192.168.1.253` est réservée, confirmé auprès du service
informatique (Sammy, 04/09/2026).

`[À COMPLÉTER PAR SAMMY]` **Pour les terminaux : on ne sait pas.** La demande de
Fabiano les couvrait, la réponse obtenue ne porte que sur la VM. C'est ce qui
reste de la *pendência 6* de `docs/operacional/procedimento-hikcentral.md` — et
c'est la moitié qui coûte le plus cher, puisqu'un terminal qui change d'adresse
cesse d'émettre sans que rien ne le dise.

---

## 5.8 Le calendrier de l'administrateur

| Quand | Quoi | Où c'est écrit |
|---|---|---|
| **À chaque rentrée**, avant le 1er service | Relancer les 4 requêtes de contrôle de l'affiche ; corriger les créneaux ; réimprimer l'affiche | `docs/operacional/controle-affiche-cantine.md` |
| **Avant le 1er service** | Charger la liste des autorisés repas en masse (sinon tout `PENDING` est refusé) | §5.3.7 ; `procedimento-hikcentral.md` §4 |
| **Septembre** | Charger les régimes de sortie en masse | §5.3.8 |
| **À chaque arrivée / départ** | HikCentral : provisionner, *Apply to Device*, vérifier **0 échec** ; puis import HikCentral dans MAGBO | `procedimento-hikcentral.md` §1-2 |
| **Après chaque import de photos** | Recharger l'application (cache des photos) | §5.6 |
| **Avant toute séance matériel** | Contrôle des IP et des `door_mappings` | `.claude/rules/hikvision.md` |
| **Avant toute mise à jour** | Sauvegarde de la base — **c'est aussi la sauvegarde des photos** | `docs/operacional/mise-a-jour-vm.md` §2 |

---

## 5.9 Défauts connus de la documentation elle-même

À signaler, pas à corriger sans décision :

- ⚠️ **Deux fichiers portent le numéro ADR-005** dans `docs/architecture/decisoes/` :
  `ADR-005-creneaux-cantine.md` (26/08/2026, le planning de cantine) et
  `ADR-005-totvs-rastreabilidade-no-dono-do-dado.md` (14/08/2026, la traçabilité TOTVS). Deux
  décisions réelles et distinctes, un seul numéro. Toute référence à « ADR-005 » est donc
  ambiguë : **citer le nom de fichier complet**, jamais le seul numéro.
- `docs/manual-utilisateur.md` §14 annonce « **six** onglets » dans l'engrenage. Il y en a
  **huit** pour un ADMIN (`config`, `import`, `hikcentral`, `staff-list`, `staff-import`,
  `photos`, `manual`, `general` — `AppSettingsModal.js:1896-1957`) et **un** pour un porteur de
  `CONFIG_WRITE` seul. Le manuel est antérieur au déménagement du 28/08.
- `docs/IMPORT_TEMPLATE.md` est en portugais alors que le reste de la documentation
  d'administration est en français ; son contenu reste exact.

---

## 5.10 Où aller ensuite

| Sujet | Document |
|---|---|
| Chaque écran, pas à pas, pour l'opérateur | `docs/manual-utilisateur.md` |
| État opérationnel réel, dettes ouvertes, signatures de lecture | `docs/operacional/handoff.md` |
| Reconstruire de zéro / restaurer une sauvegarde | `docs/operacional/reconstruir-do-zero.md` |
| Mettre à jour la VM existante | `docs/operacional/mise-a-jour-vm.md` |
| Installer l'application sur un poste | `docs/operacional/guide-installation-postes.md` |
| Publier une nouvelle version portable | `docs/operacional/release-portable.md` |
| Cycle de vie des personnes dans le HikCentral | `docs/operacional/procedimento-hikcentral.md` |
| Ce qui reste écrit en dur, et pourquoi | `docs/operacional/inventaire-configurabilite.md` |
| Les décisions et leurs raisons | `docs/architecture/decisoes/` |
| Règles de code par domaine | `.claude/rules/*.md` |
