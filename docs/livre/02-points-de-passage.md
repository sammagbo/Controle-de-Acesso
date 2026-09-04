# Chapitre 2 — Les points de passage

Ce chapitre décrit les quatre endroits où le système regarde passer des gens :
le **portail**, le **CDI**, la **cantine** et l'**infirmerie**. Pour chacun : le
matériel, ce qu'il envoie, les règles qui lui sont propres, et les écrans qui le
servent.

> Convention du livre : `[À VÉRIFIER]` marque une affirmation que je n'ai pas pu
> confirmer dans le dépôt, suivie de la commande qui la tranche.
> `[À COMPLÉTER PAR SAMMY]` marque ce que seul Sammy savait.

---

## 1. Deux familles de matériel, et elles ne se ressemblent pas

C'est la première chose à comprendre, parce que presque tous les pièges du
portail viennent de là.

| | **MinMoe** (CDI, cantine) | **DeepinView** (portail) |
|---|---|---|
| Modèle | DS-K1T344MX-E1 | iDS-2CD7A46G2-IZHSY |
| Ce que c'est | un **terminal de contrôle d'accès** | une **caméra** |
| Ce qu'il fait | il **authentifie** : il connaît la personne, il ouvre | il **compare** : il dit « ce visage ressemble à… » |
| Identité dans le payload | `employeeNoString` — l'identifiant, net | un `certificateNumber` et un **nom**, avec une similarité |
| Qui résout l'identité | le terminal | **MAGBO**, via `CameraIdentityService` |

⚠️ **La caméra du portail n'authentifie pas : elle compare.** Elle envoie le
résultat d'une comparaison contre sa bibliothèque de visages, et c'est le MAGBO
qui décide si cette comparaison désigne quelqu'un. Toute la fragilité du portail
est dans cette phrase.

---

## 2. Le portail — et le défaut ouvert le plus grave du système

### 2.1 Le matériel

| IP | Rôle | Nom de canal observé |
|---|---|---|
| `.167` | **ENTRÉE** | `ENTRADA-INTERNA-01` |
| `.166` | **SORTIE** | — |

Firmware relevé : **V5.9.10** (`.claude/rules/hikvision.md`).

> ⚠️ Ces IP viennent de Sammy (28/08) et ne sont pas dans le dépôt. La source de
> vérité en production est `door_mappings`.
> **[À VÉRIFIER]**
> ```bash
> docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
>   "SELECT terminal_ip, point_id, action, label, ativo FROM door_mappings ORDER BY terminal_ip;"
> ```

### 2.2 ⚠️ Le défaut ouvert : le portail ne reconnaît presque plus personne

**Depuis le 25/08, ~46 élèves distincts par jour, contre ~500 jusqu'au 24/08.**
Le personnel n'est pas touché (~40/jour avant et après). Sur ~1160 visages non
identifiés par jour, seuls 22 atteignent la comparaison de nom, avec des
similarités de 0,13 à 0,46.

**Le backend reçoit et traite normalement — ce n'est pas un défaut logiciel.**
Le diagnostic du 27/08 a écarté avec preuve l'hypothèse la plus sérieuse (le
changement de parser multipart) et n'a trouvé aucun défaut de code.

La chute **coïncide** avec les imports de photos des 25 et 26/08 — et depuis le
31/08 on sait que ces imports sont passés **par HikCentral**, donc par **les
bibliothèques faciales des caméras**, et non par l'écran Photos du MAGBO (qui
remplit `user_photos`, sans aucun effet sur la reconnaissance).

⚠️ **Ce n'est donc plus une simple coïncidence de dates : il existe un
mécanisme.** Les caméras ne font que *comparer* un visage à cette bibliothèque ;
un repeuplement change ce à quoi elles comparent. C'est arrivé une fois déjà :
le format du `certificateNumber` a changé le 08/08 pour la même raison.

**La cause n'est pas prouvée pour autant**, et ce livre ne conclut pas à sa
place. Un mécanisme plausible est plus qu'une coïncidence et moins qu'une
preuve. **Mesurez avant de réparer** — en commençant par le nombre de personnes
ayant encore un `camera_person_id` : s'il s'est effondré, la bibliothèque est
bien en cause.

Les chiffres complets, les cinq requêtes SQL à lancer sur la VM et les actions
HikCentral sont dans :
- `docs/operacional/handoff.md` — en tête, c'est le document à ouvrir en premier
- `docs/operacional/diagnostic-portaria-2026-08-27.md` — le détail de ce qui a
  été écarté et de ce qui reste à mesurer

> ⚠️ **Avant de comparer avec « avant », lisez la note historique.** La caméra
> `.166` (SORTIE) était en panne jusqu'au 24/08 : le portail produisait ~950
> ENTRÉES et zéro SORTIE par jour. **Ces 950 n'étaient pas 950 personnes** —
> c'était la même population recomptée à chaque retour, faute de lecture de
> sortie. Le seul nombre comparable est celui des personnes **distinctes**.

### 2.3 Comment le MAGBO met un nom sur un visage

`CameraIdentityService` essaie quatre choses, **dans cet ordre**, et l'ordre est
la décision :

1. **`camera_person_id` déjà enregistré** (colonne de `app_users`, ajoutée par
   la V008). Déterministe : cette personne a déjà été reconnue une fois, et on
   a retenu son `certificateNumber`.
2. **Le `certificateNumber` lu comme matricule ou comme `hikvision_employee_id`**,
   normalisé. ⚠️ **Avant le nom, délibérément** : un identifiant a été saisi une
   fois et pointe vers une ligne ; un nom arrive tronqué et se compare par
   ressemblance. Si le numéro et le nom se contredisent, **le numéro gagne**.
3. **Le nom normalisé, s'il correspond à exactement UNE personne active.**
4. **Le nom tronqué** (voir §2.4), aussi seulement si un seul actif correspond.

Zéro ou plusieurs correspondances → `UNKNOWN_FACE` ou `AMBIGUOUS_NAME`. **Le
service ne crée jamais une personne.**

⚠️ **Depuis le 08/08/2026, le `certificateNumber` est la matricule de l'élève**,
complétée de zéros jusqu'à 16 chiffres : `0000000000003535` pour l'élève
`0003535`. Les enregistrements plus anciens portent encore l'identifiant à 10
chiffres du HikCentral. **La comparaison retire les zéros des deux côtés** —
comparer brut ne trouve rien, et l'échec est **silencieux**.

### 2.4 Trois pièges mesurés en production

Ils sont tous les trois dans `.claude/rules/hikvision.md`, et tous les trois ont
coûté des passages perdus.

**a) La caméra translittère les accents.** Le diacritique devient un caractère
ASCII **avant** la lettre : `S'A` pour SÁ, `BRAND~AO` pour BRANDÃO, `C^ORTE`
pour CÔRTE, `` CHAUVI`ERE `` pour CHAUVIÈRE, `Isma"el` pour ISMAËL.
**57 personnes reconnues ne correspondaient à aucun enregistrement à cause de
ça** (mesuré le 11/08/2026).

Pourquoi ça cassait si fort : pour la normalisation, ces cinq caractères sont de
la ponctuation, donc des **séparateurs**. `LABB'E` devenait `labb e`, le `e`
isolé était jeté par la règle des initiales, et il restait `labb` contre
`labbe`. Avec l'accent dans la première syllabe, c'est pire : `C^ORTE` devient
**`orte`** — c'est le `C` qui disparaît.

⚠️ `PersonNameMatcher.normalizeRecebido` produit **deux lectures** du nom reçu
(la littérale et la décodée) et **ajoute** sans jamais remplacer, parce que la
translittération est **ambiguë** : `S'A` est SÁ et `D'AVILA` est D'ÁVILA — les
mêmes trois caractères, deux sens. **Le nom enregistré, lui, n'est jamais
décodé** : le décoder transformerait une apostrophe légitime en accent et
corromprait la donnée de référence.

**b) Le nom est tronqué à 32 caractères bruts** par l'appareil. Deux cas réels
sont devenus `UNKNOWN_FACE` alors que la personne existait :
`Luis Fernando FIGUEIREDO DOS SAN` (pour `…DOS SANTOS`) et
`Marcos Vinicius CLEMENTE FERREIR` (pour `…FERREIRA`).

⚠️ Pire que l'échec lui-même : **la personne ne recevait jamais son
`camera_person_id`**, celui qui aurait résolu tous les passages suivants — elle
restait piégée dans le défaut pour toujours.

Le traitement accepte le préfixe si l'enregistrement **commence par** le nom
reçu, si **un seul** actif correspond, et au-dessus d'un **plancher de 16
caractères normalisés**. Le 16 n'est pas rond par hasard : « maria santos », « ana
carolina » et « carlos souza » font **exactement 12** — un plancher à 12
admettrait justement la famille de noms génériques que le plancher existe pour
exclure.

**c) Les échelles de similarité sont mélangées** dans le même payload :
`similarity` arrive en **fraction** (0.95) et `FDLibThreshold` en
**pourcentage** (70). Comparer brut recalerait tout bon reconnaissement **en
silence**. `normalizarSimilaridade` ramène les deux sur 0..1.

### 2.5 Deux champs qui n'identifient pas ce qu'on croit

| Champ | Ce qu'il identifie | Mesuré |
|---|---|---|
| `pId` | **la détection** | 38 valeurs distinctes en 38 occurrences |
| `faceId` | **rien** | 2 valeurs en 18 occurrences — le même 69205 sur un échec puis, 8 s après, sur une **autre personne** |

⚠️ **`faceId` ne peut être la clé de rien.** L'utiliser comme clé de
déduplication jetterait des passages réels en silence.

⚠️ `faces[].score` arrive **emballé** — `{"value": 52}`, pas un nombre. Le
modéliser en `Double` fait échouer le parsing sur **tous** les événements réels :
le contrôleur répond 200, le log dit « ignoré », et le portail devient invisible.

---

## 3. Le CDI

**Terminaux `.15` et `.16`** (MinMoe), point `BIBLIO`.

> ⚠️⚠️ **Sur le `.15`, le champ « Nom de la porte » affiche `CDI-SAIDA`.**
> Il ment. **Fiez-vous à l'IP, jamais au nom affiché par l'appareil.** C'est le
> genre de détail qui fait perdre une matinée à quelqu'un qui débranche le bon
> terminal en croyant débrancher l'autre.

**Ce qui est propre au CDI :**

- **Fermeture automatique à 17:00.** Qui entre et ne repasse pas le visage en
  sortant resterait « dedans » indéfiniment, et l'écran ouvrirait le lendemain
  avec les gens de la veille. La sortie synthétique est **déclarée** :
  `flag=FECHAMENTO_AUTO`, `created_by_user=system`, et elle porte l'heure de
  **fermeture**, pas celle où le travail a tourné.
- **Présence déjà ouverte** (`flag=JA_PRESENTE`) : une ENTRÉE dans un point où
  la personne a déjà une présence ouverte n'ouvre pas une visite nouvelle. En
  production le 10/08/2026, l'élève `0003053` est entré 4 fois en 5 minutes sans
  sortir. ⚠️ Cette règle **ne tourne pas au portail** : là-bas la sortie
  échappe, « il est déjà dedans » est une supposition, et marquer cacherait une
  **entrée réelle**.
- **Capacité, état déclaré et exclusions** (V025), avec leur registre (V026).
  Voir le chapitre 3.
- **Un mode urgence** (confinement), avec appel nominal.

**Écrans :** l'écran CDI (`js/cdi/BibliotecaView.js`), et l'écran d'exclusions
(`CdiExclusionManagement`, derrière `CDI_EXCLUSION_WRITE`).

---

## 4. La cantine

**Terminaux `.10`, `.12`, `.13`, `.14`** (MinMoe), points `REFEI*` / `CANTINA*`.

> **[À VÉRIFIER]** Quel terminal sert quel point : la réponse est dans
> `door_mappings` (requête au §2.1). Le dépôt ne l'écrit nulle part.

**Deux problèmes matériels connus** (déclarés par Sammy, non vérifiables ici) :

- Le **`.10` n'est pas enregistré au HikCentral** : erreur `SYS[904]`, numéro de
  série en conflit.
- Le **`.14` est en Wi-Fi** — c'est celui qui perdra des paquets et videra une
  file d'un coup. Voir la leçon sur l'heure de l'événement (chapitre 8).

**Ce qui est propre à la cantine :**

- C'est **le seul point où le MAGBO influe sur ce qui se passe** — et encore, par
  un geste humain (ADR-004 : le terminal valide l'identité, MAGBO valide la
  règle, **l'opérateur applique l'exception**).
- L'ordre des règles est fixé et compte : **déduplication → droit au repas →
  créneau**. La première qui refuse arrête tout.
- Quatre familles de flags : avant le créneau, après le créneau, passage trop
  court, séjour trop long.
- Le **Moniteur** en direct (polling de 3 s) avec ses trois colonnes, et le flux
  des tentatives refusées.

Tout le détail est au chapitre 3.

---

## 5. L'infirmerie

**Point `ENFERM`.**

🔴 **Répondu par Sammy le 04/09/2026 : l'infirmerie n'a pas de terminal, et les
visites n'y sont pas enregistrées du tout.** Ni lecture faciale, ni saisie à la
main. Le point existe dans le système, et il ne reçoit rien.

⚠️ **Ce qui suit décrit donc une mécanique qui tourne à vide.** Elle est écrite,
elle fonctionne, et elle attend des lignes qui n'arrivent pas :

- les visites longues sont comptées à part (`countLongInfirmaryStays`) — sur
  zéro ligne ;
- il n'y a **pas de fermeture automatique**, ce qui serait une information utile
  si des visites entraient : une visite qui ne se ferme pas se voit dans le
  rapport comme « sortie non enregistrée ». En l'état il n'y a rien à fermer ;
- l'écran du rapport infirmerie (`InfirmaryReport`) s'ouvre et n'a rien à
  montrer.

⚠️ **Un mapping n'est pas un appareil.** `DoorMappingBootstrap` sème bien
`ENFERM` en porte 5, lecteurs 1 et 2 (entrée et sortie) — mais ce sont des
correspondances **génériques, sans adresse IP**, exactement comme celles du CDI
et de la cantine. Elles attendent un terminal qui n'existe pas. Quiconque lit la
table `door_mappings` en conclura que l'infirmerie est équipée ; elle ne l'est
pas.

### 🔴 La conséquence : le PPMS ne peut pas savoir qu'un enfant est à l'infirmerie

La liste nominative de « qui est à l'intérieur » se construit sur les passages
**enregistrés**. Une visite qui n'entre jamais dans `access_logs` n'y figure
pas. Un enfant allongé à l'infirmerie pendant une évacuation est, pour l'écran,
quelqu'un qui a quitté l'établissement — ou qui n'est jamais entré.

C'est le même raisonnement que la condition bloquante du § 3.5 sur la dispense
de badge, à une différence près, et elle est de taille : **personne n'a choisi
celle-ci**. Là-bas, activer une dispense aurait retiré des enfants du décompte ;
ici, c'est l'absence de matériel qui les en retire, sans qu'aucune décision ne
l'ait déclenché et sans que rien ne le signale.

⚠️ **Et le code croit encore autre chose.** `PpmsService` (l. 74-79) prévoit un
troisième avertissement pour les points sans fermeture automatique — « aujourd'hui
l'infirmerie, dont l'enregistrement est manuel et dont la sortie n'est presque
jamais lancée » — né d'une objection de l'infirmière au panel du 14/08. Cet
avertissement protège contre une présence qui **reste collée** : quelqu'un
affiché à l'infirmerie depuis 9 h alors qu'il est reparti. Or le risque réel est
l'inverse : personne n'y est jamais affiché. La garde a été dessinée pour le
mauvais mode de panne, et elle ne se déclenchera jamais pour `ENFERM` puisque le
point est toujours vide. Cela ne change aucun comportement — mais cela oriente
vers le mauvais raccommodage : ce n'est pas la saisie qui est imparfaite, c'est
le point qui n'existe que sur le papier.

`[À COMPLÉTER PAR SAMMY]` Faut-il équiper l'infirmerie, ou assumer qu'elle reste
hors du système ? Les deux réponses sont défendables — mais la seconde doit être
écrite, et l'écran PPMS doit alors le dire à qui le lit pendant une évacuation.

---

## 6. ⚠️ Comment un terminal sait où envoyer ses événements

C'est le réglage qui casse en silence, et le menu n'est pas là où on le cherche.

> **Le chemin réel, sur l'appareil :**
> **Système et maintenance → Réseau → Service réseau → HTTP(S) → Écoute HTTP**
>
> **Ce n'est PAS le menu « Événement ».** C'est là que tout le monde commence,
> et on peut y passer une heure.

On y renseigne l'IP du serveur, le port `8080`, l'URL avec le jeton, et `HTTP`.

**Trois formes d'authentification du webhook sont acceptées**, parce que tous
les appareils ne savent pas faire la même chose :

| Forme | Endpoint | Pour qui |
|---|---|---|
| En-tête `X-MAGBO-WEBHOOK-TOKEN` | `POST /api/hikvision/webhook` | le cas normal |
| `?token=…` dans l'URL | idem | les MinMoe |
| Jeton **dans le chemin** | `POST /api/hikvision/webhook/t/{token}` | ⚠️ la DeepinView, **qui jette la query string** |

⚠️ **`/api/hikvision/webhook/capture` est un outil de BANC, jamais de
production.** Il **écrit le corps de la requête dans le log** — et sur une
caméra du portail, ce corps contient des **noms d'élèves** lus dans la
bibliothèque faciale. Le log n'a pas la protection de la base.

### Ce qui casse en silence, et comment le voir

⚠️ **Les IP changent par DHCP.** Ni erreur, ni alerte : les événements cessent
simplement d'arriver. C'est arrivé le 16/07 (terminal `.12`→`.10`, serveur
→`.9`).

**Avant toute session sur le matériel, les quatre vérifications :**

1. l'IP du serveur ;
2. l'IP au dos de chaque terminal (elle s'affiche sur l'écran de l'appareil) ;
3. l'URL de l'*Écoute HTTP* — pointe-t-elle vers l'IP **actuelle** du serveur ?
4. la colonne `terminal_ip` de `door_mappings` — correspond-elle à l'IP
   **actuelle** du terminal ?

**Une réservation DHCP a été demandée au service informatique** pour les
terminaux et la VM. **[À COMPLÉTER — Sammy ne se souvient plus de l'état de cette
demande (répondu le 31/08), et n'a pas retrouvé le contact.]**
**À qui demander :** le secrétariat ou la direction connaissent le service
informatique.
⚠️ **N'attendez pas la réponse pour vous protéger** : les quatre vérifications
ci-dessus donnent le risque réel en quelques minutes, sans contact.

⚠️ **Fuseau d'usine.** Les terminaux sortent en **GMT+8**. Il faut corriger en
GMT−3 et remettre l'heure à l'installation — sinon ils émettent des événements
« d'authentification expirée ».

---

## 7. Ce que le terminal envoie, et ce que le MAGBO en fait

La liste des sous-types a été confirmée avec du matériel le 13/07/2026
(firmware V4.13.0) :

| Sous-type | Ce que c'est | Ce que le MAGBO en fait |
|---|---|---|
| **75** | authentification par **VISAGE**, approuvée | `access_logs`, `auth_method=FACE` |
| **1** | authentification par **CARTE**, approuvée | `access_logs`, `auth_method=CARD` |
| **8** | authentification **refusée / expirée** | `access_attempts` (`DEVICE_DENIED`) — **jamais** `access_logs` |
| **9** | événement d'appareil, sans personne | ignoré, `200` |
| **21 / 22** | la porte s'ouvre / se ferme | ignoré, `200` |
| autres | démarrage, configuration | ignoré, `200` |

⚠️ **La liste blanche est rigide** : seuls **75** et **1** peuvent produire un
accès. Un sous-type inconnu accompagné d'un `employeeNoString` devient une
**tentative**, jamais un accès.

⚠️ **Le sous-type 8 porte aussi un `employeeNoString`.** C'est le piège qui a
justifié la liste blanche : sans elle, un refus du terminal serait entré dans
`access_logs` comme un accès valide. Confirmé avec du matériel en plaçant la
validité d'une personne dans le passé — le terminal refuse **à la voix**, et
l'événement arrive quand même.

⚠️ **On ne distingue pas *quel* carte** : le terminal traduit la carte en
`employeeNoString` en interne et **le numéro de carte n'arrive jamais dans le
payload** (ADR-002). C'est pourquoi le MAGBO ne garde aucun numéro de carte.

**Les images ne sont jamais conservées.** Les parts `faceImage`,
`backgroundImage` et `faceLibImage` sont écartées. `modelData` (le gabarit
biométrique) n'est ni conservé ni committé — dans les fixtures de test il est
remplacé par `<<modelo-biometrico-removido>>`.

---

## 8. Où regarder ensuite

| Question | Document |
|---|---|
| Le défaut du portail, avec ses chiffres | `docs/operacional/handoff.md` (en tête) |
| Ce qui a été écarté, et ce qui reste à mesurer | `docs/operacional/diagnostic-portaria-2026-08-27.md` |
| Tous les pièges Hikvision, dans le détail | `.claude/rules/hikvision.md` |
| Les bibliothèques faciales et le cycle des personnes | `docs/operacional/procedimento-hikcentral.md` |
| Les règles appliquées à chaque passage | chapitre 3 |
| Ce que l'opérateur voit et doit faire | chapitre 4 |
