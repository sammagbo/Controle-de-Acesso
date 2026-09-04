# Chapitre 8 — Les leçons du projet

Chaque section de ce chapitre est un défaut qui a réellement coûté quelque
chose. Le format est toujours le même : **contexte → symptôme → cause →
correction → règle**. La règle est ce qui reste ; le reste explique pourquoi
elle mérite d'être suivie.

Chaque leçon est vérifiable : le commit, le fichier ou le test est cité.

---

# I. ⚠️ LES QUATRE DÉFAUTS D'HORLOGE

Le même piège, quatre fois, sous quatre déguisements. Il mérite d'ouvrir le
chapitre parce qu'il est le seul à s'être répété — et parce que la règle qu'il
donne est la plus transférable du projet.

> ## ⚠️ LA RÈGLE GÉNÉRALE
>
> **Il y a toujours DEUX heures, et il faut savoir laquelle on écrit.**
>
> - L'heure de **l'événement** : quand la chose est arrivée dans le monde.
> - L'heure du **traitement** : quand le programme l'a apprise.
>
> Elles sont presque toujours identiques — jusqu'au jour où une file d'attente
> se vide, où un conteneur démarre dans un autre fuseau, ou où il est 21 h à
> Rio. **Ce jour-là, celui qui n'a pas choisi a choisi la mauvaise.**
>
> **Le corollaire :** un défaut d'horloge ne se voit jamais pendant une
> démonstration. Il attend le soir, la panne, la reprise. C'est pourquoi il faut
> le choisir par écrit, pas le découvrir.

## 1. L'heure de réception au lieu de l'heure de l'événement (03/08)

**Contexte.** Le backend écrivait `LocalDateTime.now()` au moment où la requête
arrivait.

**Symptôme.** Les rapports affichaient des **durées moyennes négatives**, et des
élèves à des heures et des points impossibles.

**Cause.** Un terminal a vidé sa file hors ligne : **33 événements en deux
minutes, à 14h51**, correspondant à des passages de plusieurs heures plus tôt.
Les 33 sont entrés en base comme s'ils avaient eu lieu à 14h51. Mettre en file
et renvoyer est le comportement **normal** des MinMoe quand la destination
tombe — observé deux fois sur le banc. L'heure de réception n'a donc jamais été
une approximation sûre.

**Correction.** `EventTimeResolver` (commit `8d78f41`) lit le `dateTime` du
payload. Trois gardes seulement font retomber sur l'heure de réception : absent
ou illisible, plus de 5 minutes dans le futur, plus de 30 jours dans le passé —
et **chaque repli laisse une ligne INFO** avec l'IP et le motif.

**Règle.** *Quand un événement porte sa propre heure, c'est elle qui compte. Et
tout repli doit être audible.*

⚠️ **Ce qui n'a PAS changé, et c'est une dette assumée :** les **règles**
(fenêtre de la cantine, dédup de repas, autorisation de sortie) restent
évaluées à l'heure de la **décision**. Une file rejouée à 14h51 écrit les bonnes
heures, mais a été jugée à 14h51.

## 2. Le régime jugé à `now` au lieu de l'heure de la passage

**Contexte.** Le régime de sortie décrit si un élève avait le droit de sortir.

**Symptôme.** Le verdict passait **vert toute la journée**. Le test ne l'a
attrapé que parce que la suite a tourné à 18h45.

**Cause.** La règle était évaluée contre `now`. Une sortie de 10 h, traitée à
18 h, tombait dans le degré « fin de journée — sortie normale », et l'alerte que
la Vie Scolaire devait voir **n'a jamais existé**.

**Correction.** Le régime est la seule règle jugée à l'heure de la **passage** —
exception consciente, et elle a une raison : cette règle **ne refuse jamais**,
elle décrit. La trave `RegimeGateWiringTest#regimeUsaAHoraDaPassagem` capture
**l'argument**, pas le verdict : un test qui échoue selon l'heure à laquelle on
le lance ne prouve rien.

**Règle.** *Une règle qui DÉCRIT se juge à l'heure des faits. Une règle qui
REFUSE se juge à l'heure de la décision, pour qu'une file ne puisse pas changer
un refus rétroactivement.*

## 3. Le conteneur en UTC — trois heures dans le futur

**Contexte.** L'image `eclipse-temurin:17-jre-alpine` démarre en **UTC**.

**Symptôme.** Le système horodatait **trois heures dans le futur**. Mesuré en
direct : 20h27 écrit pour 17h27 réelles.

**Cause.** La JVM adopte le fuseau du conteneur. Tout `LocalDateTime.now()` du
backend rendait de l'heure UTC — pendant que `access_logs.timestamp` était écrit
en `America/Sao_Paulo` par `EventTimeResolver`. **Deux moitiés du même système,
deux fuseaux.**

**Correction.** `TZ: America/Sao_Paulo` sur **les deux** conteneurs de
`deploy/docker-compose.yml`, et une `Clock` explicite dans les services
concernés (`Clock.system(EventTimeResolver.ZONA_ESCOLA)`).

**Règle.** *Le fuseau d'un conteneur fait partie de sa configuration, pas de son
environnement. Une image qui démarre en UTC le fera sur toutes les machines, y
compris celle qu'on n'a pas testée.*

## 4. « Aujourd'hui » calculé en UTC dans le frontend (28/08)

**Contexte.** Une vingtaine d'endroits faisaient
`new Date().toISOString().slice(0, 10)` pour obtenir la date du jour.

**Symptôme.** Aucun — **avant 21 h**.

**Cause.** `toISOString()` est en **UTC**. Rio est à UTC−3 : à partir de 21 h,
l'expression rend **demain**. Le compteur « Mouvements aujourd'hui » tombait à
0, les rapports interrogeaient un jour qui n'existait pas encore, le Moniteur
demandait les passages du lendemain, la sauvegarde automatique du CDI croyait
n'avoir pas encore tourné, et un régime nouveau était daté de demain.

**Correction.** `dayKey(date)` (`js/utils/helpers.js`), composantes locales —
**la fonction existait déjà**, avec un commentaire mettant en garde contre
exactement cette forme. Le garde `tests/aujourdhuiHeureLocale.test.js` parcourt
`js/` et échoue sur toute ligne qui nomme un jour en UTC ; deux noms de fichiers
téléchargés sont des exceptions **nommées**.

**Règle.** *`toISOString()` ne donne jamais « aujourd'hui ». Il donne
« aujourd'hui à Greenwich ».*

---

# II. LES AUTRES LEÇONS

## 5. `ddl-auto` crée mais n'altère jamais un CHECK

**Contexte.** Le schéma est géré par `ddl-auto=update`, y compris sur la VM.

**Symptôme.** Un `INSERT` qui échoue **seulement en production**, des semaines
après la livraison. Les tests sont verts, le PC va bien.

**Cause.** Hibernate génère le CHECK **à la création** de la table. Sur une
table existante, `ddl-auto=update` ajoute des colonnes mais **n'altère jamais**
une contrainte. Une valeur nouvelle dans un enum Java passe donc partout — H2
recrée tout à chaque suite, le PC ne bouge pas — et échoue à la VM.

**Correction.** Une migration qui élargit le CHECK, appliquée **à la main**,
**avant** de monter le backend : V009, V015, V022. Et
`tests/migrations.test.js` échoue quand le CHECK de `denial_reason` oublie une
valeur de l'enum.

**Règle.** *Ce qui n'existe que sur la machine de production doit être créé par
une migration, pas espéré d'un outil de développement.*

## 6. `psql` sort avec le code 0 quand le SQL échoue

**Contexte.** Les migrations sont appliquées par une boucle shell.

**Symptôme.** Le script annonce le succès. Le backend démarre. Le défaut se
découvre en production.

**Cause.** Sans `ON_ERROR_STOP=1`, `psql` **continue après l'erreur** et sort
avec le code **0**. Le `|| echo ÉCHEC` de la boucle ne se déclenche jamais.

**Correction.** `-v ON_ERROR_STOP=1` dans **toutes** les commandes de migration,
documenté dans `deploy/migrations/README.md` et répété dans le handoff.

**Règle.** *Un outil qui rend 0 en cas d'échec transforme une boucle de
vérification en théâtre. Vérifier le comportement de sortie AVANT de bâtir une
boucle dessus.*

## 7. `CREATE TABLE IF NOT EXISTS` ignore la FORME de la table

**Contexte.** Les migrations sont idempotentes, pour pouvoir être rejouées.

**Symptôme.** La migration passe, la table existe — **sans ses contraintes**.

**Cause.** Si le backend démarre **avant** la migration, Hibernate crée la table
avec les mêmes colonnes mais **sans les CHECK**. `CREATE TABLE IF NOT EXISTS`
voit une table du bon nom et **ne fait rien, sans rien dire**.

**Correction.** Une clause de garde dans V021, V025 et V026 qui **lève une
exception explicite** quand la table préexiste avec la mauvaise forme. Et, pour
V026, un second bloc idempotent qui pose le CHECK s'il manque — quel que soit
celui qui a créé la table.

**Règle.** *`IF NOT EXISTS` teste un nom, pas une forme. Quand la forme compte,
la vérifier explicitement.*

## 8. Le multipart tronqué

**Contexte.** Les terminaux envoient du `multipart/form-data` avec une part
JSON et une part image.

**Symptôme.** Des événements réels ignorés, avec un `200` et une ligne de log
disant « écarté ».

**Cause.** Le format réel des appareils ne correspond pas à la documentation :
en-têtes de parts incomplets, limites atypiques, et un champ `score` **emballé**
(`{"value": 52}` au lieu d'un nombre) qui faisait échouer le parsing sur **tous**
les événements de caméra.

**Correction.** `MultipartTolerante` et un `parsePayload` tolérant, écrits
contre des captures réelles, avec des fixtures (`modelData` remplacé par
`<<modelo-biometrico-removido>>` — un gabarit biométrique ne se committe pas).

**Règle.** *Un parseur qui parle à du matériel se écrit contre le matériel, pas
contre sa fiche technique. Et un rejet silencieux est pire qu'une erreur.*

## 9. La course avec `@Transactional`

**Contexte.** Un service annoté `@Transactional` appelé depuis la même classe.

**Symptôme.** L'annotation ne s'applique pas — l'appel interne court-circuite le
proxy Spring.

**Correction.** Passer par un autre bean, ou expliciter la propagation. Le cas
qui compte dans ce dépôt est l'inverse et il est délibéré : voir la leçon 12.

**Règle.** *Une annotation Spring décrit ce qui se passe quand on entre par la
porte. Un appel interne n'entre pas par la porte.*

## 10. Les hooks React — deux pièges, tous deux visibles à l'écran seulement

**a) Le `return` anticipé avant les hooks.**

**Symptôme.** L'écran entier casse avec « rendered fewer hooks than expected »,
mais **seulement** le jour où la condition change en cours de vie.

**Cause.** `if (!pode) return null;` placé **avant** un `useRef` ou un
`useEffect`. React compte les hooks par leur **ordre d'appel**.

**Correction.** La sortie anticipée vient **après tous les hooks**.

**b) Un composant défini à l'intérieur de son parent.**

**Symptôme.** Les photos clignotaient toutes les 3 secondes dans le Moniteur
Cantine : photo → initiales → photo.

**Cause.** Un composant défini dans le corps d'un parent reçoit un **type React
neuf à chaque rendu**. React démonte tout le sous-arbre, le composant photo
repart de son état initial, peint les initiales, et ne rend l'image qu'au
microtask suivant. **Cinq occurrences dans le seul `CantineMonitor.js`.**

**Mesuré :** 30 nœuds `<img>` créés en 12 secondes → **0** après correction.

**Correction.** Les composants remontent au scope du module ; les dépendances
descendent par props. Des clés stables (`key={ev.userId}`, jamais l'index).

**Règle.** *Un composant défini dans un parent est un composant remonté à chaque
rendu. Le symptôme est visuel, donc invisible pour une suite qui ne rend rien.*

## 11. Un garde qui lit un identifiant au lieu de sa valeur

**Contexte.** `ControllerAuthorizationGuardTest` extrait les `@PreAuthorize` du
code source pour dresser l'inventaire des endpoints gardés.

**Symptôme.** Le garde déclarait **non gardés 8 endpoints qui l'étaient**.

**Cause.** Certains endpoints portent `@PreAuthorize(ESCRITA)` — une
**constante**. Le parseur lisait l'identifiant `ESCRITA` au lieu de résoudre sa
valeur, et ne reconnaissait pas une garde.

**Correction.** `resolverConstante()` résout la constante avant de juger.

> ## ⚠️ La règle, et elle vaut au-delà des tests
>
> **Un garde qui accuse l'innocent apprend à être ignoré.**
>
> Un faux positif ne coûte pas une correction inutile : il coûte la confiance
> dans le garde. La fois suivante, quelqu'un le contournera — et ce jour-là il
> aura peut-être raison.

## 12. L'écriture observationnelle en `REQUIRES_NEW`

**Contexte.** Plusieurs registres existent pour permettre de rendre compte plus
tard : `access_attempts`, les fermetures automatiques, le registre des alertes du
CDI (V026).

**Symptôme potentiel.** Un registre qui échoue fait échouer la transaction qui
l'entoure — et emporte avec lui l'enregistrement d'un **passage réel**.

**Correction.** Ces écritures se font en `Propagation.REQUIRES_NEW`, et
l'appelant **attrape**. `CdiAlertServiceTest` vérifie l'annotation elle-même :
aujourd'hui l'appelant est un endpoint dédié, mais le jour où le webhook
appellera, cette annotation est ce qui empêchera un registre en panne d'emporter
un `access_log`.

**Règle.** *Un registre de soutien ne doit jamais pouvoir faire tomber ce qu'il
observe.*

## 13. ⚠️ « Je n'ai pas vu » n'est pas « il n'était pas là »

C'est la leçon la plus importante du projet, et la seule qui soit d'abord une
leçon d'écriture.

**Contexte.** Le système produit en permanence des états qui veulent dire « je
ne sais pas ».

**Symptôme.** Une donnée manquante affichée comme un refus fait accuser
quelqu'un à la place d'une case vide.

**Les cas :**

| État | Ce que ça veut dire | Ce que ça ne veut PAS dire |
|---|---|---|
| `PENDING` (droit au repas) | la case n'a jamais été remplie — l'état de 923 élèves le jour 1 | « pas le droit » |
| `INCONNU` (régime) | aucun régime enregistré | « pas autorisé à sortir » |
| `REGIME_TO_VERIFY` | ça dépend d'une heure de cours que le MAGBO n'a pas | une objection |
| `MEAL_SLOT_NOT_CONFIGURED` | un trou dans le planning | un refus |
| « Aucun passage vu aujourd'hui » | le système n'a rien vu | « absent » |
| Pas de ligne dans `cdi_alert_events` | l'écran du CDI était fermé | « il n'y a pas eu d'alerte » |
| Un compteur à `—` | le cache n'est pas chargé | « zéro » |

**Correction.** Chacun de ces états a **sa propre couleur, son propre mot et sa
propre action** à l'écran. `INCONNU` est ambre et non gris, parce que le gris
clair est la couleur de ce que l'opérateur a appris à ignorer. Un compteur qui
ne sait pas affiche `—`, jamais `0`.

**Règle.** *Une interface doit distinguer « non », « oui » et « je ne sais
pas ». Fondre le troisième dans le premier, c'est mentir sur des gens.*

## 14. Les dates dans Excel

**Contexte.** Les imports (droits repas, régimes, HikCentral) arrivent en `.xlsx`.

**Symptôme.** Des matricules qui ne correspondent à personne. Des dates
décalées.

**Cause.** ⚠️ **Les identifiants Pronote ont des zéros à gauche** (`0003535`).
Excel les traite comme des nombres et **mange le zéro**. Et les dates
deviennent des numéros de série.

**Correction.** Tout est lu **comme du TEXTE** (`raw: false`), et la comparaison
retire les zéros des deux côtés. Le lecteur du HikCentral commence à la **ligne
9** (les 8 premières sont des instructions du HCP) et associe les colonnes **par
nom**, pas par position — le HCP réordonne entre versions, et une position fixe
casse en silence.

**Règle.** *Un identifiant qui commence par zéro n'est pas un nombre. Le
traiter comme tel est une perte de données silencieuse.*

## 15. `env_file` et le compose

**Contexte.** La configuration de la VM vit dans `deploy/.env`.

**Symptôme.** Le backend démarre et se connecte à une base **vide** ou à la
mauvaise, sans erreur explicite.

**Cause.** Les valeurs de repli du profil `prod` pointent ailleurs. Une variable
absente n'est pas une erreur : c'est un repli silencieux.

**Correction.** Les variables qui ne peuvent pas avoir de repli utilisent la
syntaxe de variable **obligatoire** (`${VAR:?message}`) : le compose refuse de
démarrer et dit laquelle manque. `ProdSecurityStartupCheck` avertit au démarrage
pour le mot de passe de développement, le JWT de développement et le jeton de
webhook absent.

**Règle.** *Une configuration manquante doit faire échouer bruyamment. Un repli
silencieux vers « une autre base » est le pire des comportements.*

## 16. Deux verrous d'outillage, rapportés par Sammy

> ⚠️ Ces deux-là ne sont pas reproductibles depuis le dépôt. Ils sont écrits
> parce qu'ils feront perdre une heure à la personne suivante.

**a) `build:portable` bloqué par un handle sur `app.asar`.** La construction
échoue en disant que le fichier est utilisé, **alors qu'aucun processus n'est
visible**. Ni le gestionnaire de tâches ni la fermeture de l'application ne le
libèrent. **Seul un redémarrage du poste débloque.**

**b) GitHub refuse une branche rebasée quand `main` porte les commits de merge.**
Le merge **local** passe sans conflit ; la plateforme, elle, calcule des bases
multiples et refuse.

**La manœuvre n'était notée nulle part — mais l'historique la porte**, pour le
seul cas de ce type que le dépôt contienne, la nuit du 27 au 28/08 :

- **Une répétition à blanc, d'abord.** Une branche jetable `ensaio-merge` — elle
  existe encore en local — porte cinq commits de fusion, un par branche de la
  nuit, fusionnées une à une : `88d684d`, `78f1094`, `1dd7cbe`, `6d5445e`,
  `d94a850`. La séquence a été jouée avant d'être jouée pour de vrai.
- **Puis un merge LOCAL, poussé directement.** La septième branche —
  `fix/balayage-28-08`, celle qui avait été rebasée sur les six autres — est
  entrée par `7c4d54e`, « Merge fix/balayage-28-08 - 33 corrections sur 17
  ecrans », signé Sammy MAGBO le 28/08. ⚠️ Son sujet ne commence pas par
  « Merge pull request » : c'est la **seule des sept** à n'être pas passée par
  GitHub. Ses six sœurs sont les PR #79 à #85.
- **Et la forme du défaut se vérifie encore aujourd'hui.** Les deux parents de
  `7c4d54e` ont pour base de fusion `61fbe32` — le sommet de
  `fix/cdi-alerte-ferme` **avant** son propre merge, et non la `main` fusionnée.
  C'est exactement la « base multiple » que la plateforme refuse.

**Donc : répéter la séquence en local sur une branche jetable, puis fusionner et
pousser sans passer par la pull request.** C'est ce qui a été fait ; cela a
marché ; et cela laisse une trace différente de celle de ses sœurs, ce qui est
le prix.

`[À COMPLÉTER PAR SAMMY]` Ce que l'historique ne peut pas dire : GitHub
a-t-il été essayé pour ce merge-là avant d'y renoncer, et quelque chose d'autre
a-t-il été tenté d'abord — un nouveau rebase sur la `main` déjà fusionnée, une
recréation de la branche ? La réponse tient en une phrase, et elle décide si ce
contournement est **le seul chemin** ou seulement le plus court.

---

## 17. Ce que ces leçons ont en commun

En les relisant, trois familles se dégagent — et elles suffisent à prédire le
prochain défaut :

1. **Le silence.** `psql` qui rend 0, `IF NOT EXISTS` qui ne fait rien, un CDN
   qui ne charge pas, une variable qui retombe sur un repli, un multipart
   écarté, un `<>` qui écarte les NULL. ⚠️ **Presque tous les défauts coûteux de
   ce projet étaient silencieux.** Le corollaire pratique : quand vous écrivez
   du code qui peut échouer, demandez-vous **qui l'apprendra, et comment**.

2. **Les deux vérités.** Deux capacités sur un écran, deux couches HTTP, deux
   ordres de règles, deux défauts pour le même réglage, le miroir
   `constants.js` / `AreaMapping`. ⚠️ **Une valeur qui vit à deux endroits
   divergera** — la seule question est quand.

3. **La confusion entre l'absence et le refus.** La leçon 13, sous toutes ses
   formes.

---

## 18. Où regarder ensuite

| Question | Document |
|---|---|
| Le détail de chaque nuit et de chaque correction | `docs/operacional/nuit-26-27-08-rapport.md`, `nuit-27-28-08-rapport.md` |
| Les règles de code qui en sont sorties | `.claude/rules/*.md` |
| Les décisions structurelles | `docs/architecture/decisoes/` |
| L'état opérationnel du jour | `docs/operacional/handoff.md` |
| Ce qui reste ouvert | chapitre 9 |
