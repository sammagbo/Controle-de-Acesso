# Nuit du 26 au 27 août 2026 — rapport

> **Rien n'a été mergé. Rien n'a touché la VM.** Six branches poussées sur
> `origin`, toutes reconstruites au-dessus de `origin/main` (`aeda162`).
> Sam part vendredi : ce document est écrit pour être lu par quelqu'un qui
> n'était pas là, y compris par Sam dans trois semaines.

---

## 1. État de chaque chantier

| # | Chantier | État | Branche | Dernier commit |
|---|---|---|---|---|
| 1 | CDI — capacité, exclusions, état | **fait, avec réserves** | `feat/cdi-capacite-exclusions` | `ebde9bf` |
| 2 | Cantine — familles de flags | **fait** | `feat/cantine-flags-creneaux` | `62db214` |
| 3 | Scintillement des photos | **fait** | `fix/scintillement-photos` | `8432ade` |
| 4 | Recherche centrale + autocomplétion | **fait** (veto levé en 2ᵉ passe) | `feat/recherche-centrale` | `2db776a` |
| 5 | Portaria — diagnostic | **fait : résultat NÉGATIF** | `diag/portaria-passagens` | `59d4760` |
| 6 | Écran de configuration générale | **fait** (2 défauts corrigés en 2ᵉ passe) | `feat/ecran-configuration` | `67ecda4` |

Compteurs sur le **résultat fusionné** : backend **934** (0 échec, exactement
2 `@Disabled`), npm **682**. Référence de départ : backend 889, npm 648.
Détail par branche en section 8.

---

## 2. Ce qui a été fait, chantier par chantier

### Chantier 1 — CDI

Capacité maximale réglable, alerte sonore et visuelle distincte quand la salle
est pleine, écran d'exclusions (élève **ou** classe, motif et durée
facultatifs), état déclaré « CDI occupé / fermé / réservé ».

**Le partage vie privée est la décision structurante.** Deux endpoints, pas un :
`GET /api/admin/cdi/etat` (permission de secteur `cdi`) rend les cibles
d'exclusion **sans motif ni auteur** — de quoi reconnaître la personne, rien de
plus ; `GET /api/admin/cdi/exclusions` (permission `CDI_EXCLUSION_WRITE`) rend
la liste complète. L'écran du CDI est visible depuis le comptoir par d'autres
élèves : il doit pouvoir prévenir sans raconter la sanction.

**Rien ne bloque jamais.** Le terminal a déjà ouvert la porte (ADR-003).
L'alerte s'adresse à l'adulte présent, et ce qu'il fait ensuite lui appartient.

### Chantier 2 — Cantine

Quatre familles de flags visibles et distinctes : `AVANT_CRENEAU`,
`APRES_CRENEAU`, passage trop court, séjour trop long. Toujours en
`OBSERVATION`, jamais en refus. Compteurs par service dans le Moniteur et dans
le rapport du réfectoire.

**Aucun horaire n'a été semé pour la maternelle ou l'élémentaire** — consigne
respectée : les données du 26/08 (service réel 11h54–12h37) contredisent les
horaires supposés, et inventer un créneau aurait produit des alertes fausses
dès le premier jour.

### Chantier 3 — Scintillement des photos

Cause trouvée et mesurée : cinq composants définis **à l'intérieur** de
`CantineMonitor`. React leur donne un type neuf à chaque rendu et démonte donc
tout le sous-arbre à chaque cycle de polling — la photo repartait de zéro
toutes les trois secondes. Corrigé par remontée au scope du module, plus un
`peek()` synchrone dans le cache de photos pour que la première peinture ait
déjà l'image. **Mesuré à l'écran**, 12 s (≈ 4 cycles de polling), 6 cartes avec
des photos réelles en base : **30 nœuds `<img>` créés avant, 0 après**, les
6 photos affichées en continu.

### Chantier 4 — Recherche centrale

La recherche devient l'élément principal du portail : les suggestions
apparaissent à la frappe (250 ms de débounce, 2 caractères minimum), flèches et
Entrée au clavier, **aucun bouton**. Les cartes KPI restent masquables et
passent dessous.

Trois points qui ne sont pas de la décoration :

- **Le même endpoint gardé.** Suggérer pendant la frappe, c'est la même requête
  plus souvent, pas une porte plus large. `PARCOURS_READ` décide toujours et
  `/api/users` n'est pas touché.
- **La réponse périmée est jetée.** Deux frappes rapides partent dans l'ordre et
  peuvent revenir dans le désordre ; sans le compteur, les suggestions de « Mar »
  écraseraient celles de « Marie ». Le défaut ne se voit qu'en tapant vite,
  c'est-à-dire comme on tape vraiment.
- **`Estado` est sorti de son parent** — le dernier composant du projet atteint
  de la maladie du chantier 3, dans un écran qui se re-rend maintenant à chaque
  touche.

### Chantier 5 — Portaria : **résultat négatif, et c'est le résultat**

La consigne était « diagnostique avant de coder, ne devine pas ». Le diagnostic
a été fait sur les données réelles (volumes PORT1 sur deux semaines, caméra
`.166` isolée, taux d'`UNKNOWN`, logs backend, comparaison avec l'avant-merge)
et **il n'a trouvé aucun défaut de code**. Aucune ligne de production n'a donc
été modifiée : `diag/portaria-passagens` ne contient **aucun changement de
production**. Un document — `docs/operacional/diagnostic-portaria-2026-08-27.md`
— avec cinq requêtes SQL à lancer sur la VM, les `grep` de logs correspondants
et les actions HikCentral qui restent à faire côté matériel.

Un test a quand même été ajouté (`MultipartCameraPortariaTest`, 6 cas) : il
prouve que le format réel de la caméra survit au parseur tolérant. Il ne
corrige rien — il empêche que ce qui marche cesse de marcher sans bruit.

### Chantier 6 — Écran de configuration

Tous les réglages au même endroit, groupés par domaine, chacun avec sa valeur
actuelle, sa valeur d'origine et qui l'a changée en dernier. Derrière
`CONFIG_WRITE`, en lecture comme en écriture.

**Le défaut affiché EST le défaut**, jamais une copie : chaque entrée du
catalogue va le chercher dans la source que le code lit vraiment
(`CantineProperties`, `CdiController.CAPACIDADE_PADRAO`). Écrire « 50 » dans la
liste aurait créé une deuxième vérité, et l'écran aurait continué à annoncer
« défaut : 50 » le jour où la property aurait changé.

⚠️ **Et la règle était déjà fausse d'une ligne dans le fichier qui la
proclame** : `() -> "OUVERT"` était une copie. Le panel l'a trouvée, et le
garde ne pouvait pas la voir — son expression ne cherchait que des chiffres.
C'est corrigé aux deux bouts (2ᵉ passe), et ça dit quelque chose sur ce genre
de règle : écrire la doctrine en commentaire ne suffit pas, il faut un test qui
échoue.

Au passage, un trou bouché qui n'était la faute de personne : **l'écran des
exclusions du CDI était inatteignable pour un administrateur**. Le raccourci du
tableau de bord se cache volontairement de l'admin (il entre par le panneau) et
le panneau n'avait pas d'entrée. Deux règles justes, un vide entre les deux.

---

## 3. Le principe transversal : tout se règle à l'écran

Dix réglages sont désormais modifiables sans recompiler ni éditer un fichier
sur le serveur : les quatre seuils de la cantine, les classes dispensées, la
capacité du CDI et son état déclaré (quatre clés : état, début, fin, note).

**Le contrat, en une phrase : pas de ligne en base = comportement d'avant.**
`system_settings` naît vide. Un réglage au défaut n'a pas de ligne — c'est
pourquoi l'écran lit `GET /api/admin/settings/catalogue` et non la liste des
lignes enregistrées : construit sur celle-ci, il aurait affiché une liste
**vide** sur une base neuve, et qui l'aurait ouverte en aurait conclu qu'il n'y
avait rien à configurer.

`SettingsCatalogGuardTest` balaie les sources et échoue quand une clé lue par le
code n'est pas déclarée au catalogue : un réglage invisible est un réglage que
personne ne peut voir ni remettre au défaut.

---

## 4. Verdicts du panel et vetos non résolus

Chaque chantier est passé devant ses relecteurs. Deux allers-retours au
maximum ; ce qui restait ouvert est écrit ici plutôt que corrigé en hâte.

**Aucun veto ne reste ouvert.** Les trois qui ont été prononcés (chantiers 1,
2 et 4) sont levés, chacun en une seule passe de correction, chacun prouvé à
l'écran ou par mutation. Ce qui reste est en section 5, et ce sont des
décisions, pas des défauts.

### Chantier 1 — deux VETOS en première passe, tous deux fondés

Le bibliothécaire et la Vie Scolaire ont renvoyé le travail. Le premier veto
vidait le chantier de son objet :

> **L'alerte ne partait jamais sur un vrai badge.** Un élève qui passe sa carte
> au terminal BIBLIO n'entre pas par `togglePresence` — il arrive par le
> polling de 3 s. La première version n'alertait que sur les scans faits *dans*
> l'écran, c'est-à-dire sur tout sauf le cas que le chantier existe pour couvrir.

Sept défauts bloquants au total, **tous corrigés en deuxième passe** :

1. deux capacités affichées en même temps (`CDI_CAPACITY` lu à côté de la valeur serveur) ;
2. le bandeau et l'état déclaré enfermés dans le bloc `if (emergency)` — invisibles en service normal ;
3. aucun écran n'écrivait le réglage (il fallait un `UPDATE` en base) ;
4. l'alerte absente du chemin réel (ci-dessus) ;
5. la modale d'exclusion ne se refermait jamais : nom, classe et **photo** d'un enfant restaient en plein écran pendant les passages suivants ;
6. une exclusion de classe suit la classe et non les élèves — **assumé par écrit**, pas corrigé (voir réserves) ;
7. une exclusion remontait **avant sa propre création** : il n'y a pas de colonne de début, donc `ativaEm` était vraie pour tout jour passé. Juger à l'heure de l'ÉVÉNEMENT — ce qui est correct — sans cette borne devenait le défaut même qu'elle évite, à l'envers. `criado_em` **est** la date de début.

### Chantier 4 — VETO du CPE, et c'était le pire défaut de la nuit

> **Entrée pouvait ouvrir un autre enfant.** Taper « ma », attendre la liste,
> continuer « marie » et frapper Entrée avant l'arrivée de la nouvelle liste
> ouvrait MARCOS — la première ligne de la liste PRÉCÉDENTE — et écrivait son
> nom dans le champ. Sur un écran dont la doctrine écrite est « il n'affirme
> jamais une présence que le système n'a pas vue », il affirmait celle de
> quelqu'un d'autre.

Le compteur de requêtes protégeait l'ÉCRITURE de l'état, pas l'ACTION. Cinq
défauts bloquants, **tous corrigés en deuxième passe** :

1. Entrée appliquée à une liste périmée (ci-dessus) ;
2. la fiche de l'enfant précédent survivait sous les suggestions du suivant —
   l'écran montrait une recherche pour l'un et la présence de l'autre ;
3. un refus du serveur s'affichait « Personne trouvée » ;
4. `ocupado` était écrit cinq fois et lu zéro : aucun retour d'attente, et
   l'objet d'erreur de `abrir` ne correspondait à aucune branche de rendu ;
5. la liste était dans le flux et poussait les cartes KPI hors de l'écran.

La leçon tenait dans la remarque du panel : cette logique vivait dans le JSX,
donc rien ne la retenait. Elle est sortie dans `js/utils/rechercheAutocomplete.js`
— pure, sans DOM, sans React — avec dix tests dont le premier **est** le veto.
Le projet a déjà cette forme (`postoFixo.js`, `travaDeVoo.js`, `permissions.js`) ;
elle n'avait simplement pas été suivie ici.

### Chantier 6 — approuvé avec réserves, deux défauts bloquants corrigés

1. **Le défaut écrit à la main** (ci-dessus) ;
2. **le nouvel écran était une porte dérobée** : `PUT /api/admin/settings/{clé}`
   écrivait n'importe quoi — une capacité de CDI à 0 passait, alors que l'écran
   qu'il remplace refuse tout ce qui est en dessous de 1, et le CDI se serait
   déclaré plein en permanence. Les valeurs sont maintenant validées contre le
   TYPE déclaré, et une clé inconnue est refusée en écriture (mais reste
   supprimable, sinon une orpheline déjà en base y resterait pour toujours).
   Effet de bord utile : un porteur de `CONFIG_WRITE` ne peut plus écrire
   `magbo.webhook.token` dans une table qui affiche les valeurs en clair.

Le panel a aussi fermé le point aveugle de son propre garde : celui-ci résout
les constantes par le motif `CHAVE_*`, donc une constante nommée autrement
serait passée inaperçue. Un second test refuse désormais tout nom hors
convention. Les deux gardes sont vérifiés **par mutation**.

### Chantiers 2 et 3 — un veto chacun, corrigés

- **C2 :** `if ("FORA_HORARIO".equals(flag))` était devenu du code mort quand les
  flags directionnels sont apparus : la politique `magbo.policy.outside-meal-time`
  était **débranchée en silence**. Corrigé par une constante de famille, vérifié
  par mutation.
- **C3 :** réserves sur la justification de `peek()` et un test manquant, comblés.

---

## 5. Réserves non levées — à décider, pas à oublier

Aucune n'est un défaut de fonctionnement. Toutes sont des choix qui méritent
une décision de Sam plutôt qu'une correction nocturne.

1. **Une exclusion de classe suit la CLASSE, pas les élèves.** Un élève muté en
   6E1 en octobre déclenche l'alerte d'une mesure décidée en septembre pour
   d'autres ; un élève qui quitte la classe cesse d'être signalé. Figer la
   composition demande des lignes filles par élève — décision de modèle, pas
   effet de bord. **C'est écrit dans V025, dans le modèle et sur l'écran de
   création.**
2. **Une alerte d'exclusion ne laisse aucune trace.** Ni `access_attempt`, ni
   `OBSERVATION`. La Vie Scolaire ne peut pas savoir si la mesure a été
   appliquée ni combien de fois l'enfant est revenu. C'est l'inverse de la
   doctrine retenue pour `REGIME_TO_VERIFY`, et l'argument des 923 lignes/jour
   qui la justifiait pour `INCONNU` ne vaut pas ici : le volume est de quelques
   lignes. **Recommandation : le faire.**
3. **`CdiExclusionManagement` n'est pas sûr à laisser ouvert.** Noms complets,
   classes, motifs en clair. La seule protection est une phrase d'avertissement ;
   l'écran du CDI, lui, a un verrou Alt+L. Masquage des motifs par défaut et
   verrouillage sur inactivité seraient à ajouter.
4. **La lecture des exclusions est gardée par une permission nommée `_WRITE`.**
   On ne peut pas accorder la consultation sans le pouvoir de sanctionner.
   Cohérent avec `CONFIG_WRITE`, mais à savoir au moment d'attribuer les droits.
5. **Le son « exclu » diffuse la sanction dans la salle.** L'écran cache le
   motif ; le triple bip s'entend de toutes les tables. Le seul remède actuel
   est le mute global, qui coupe aussi le reste.
6. **`turma` est du texte libre non validé** à la création d'une exclusion. Une
   faute de frappe crée une mesure qui n'avertira jamais personne — alors que le
   code refuse déjà une date déjà expirée pour exactement cette raison.
7. **`MEAL_SLOT_NOT_CONFIGURED` apparaît dans le panneau rouge « TENTATIVES
   REFUSÉES » avec un bip.** Ce n'est pas un refus : c'est « je ne sais pas ».
   Vérifié : `js/components/DeniedAttemptsFeed.js` n'a pas de `case` pour lui,
   il tombe donc dans la couleur par défaut — alors que `REGIME_TO_VERIFY` et
   `REGIME_UNKNOWN` ont chacun la leur, précisément pour cette raison. Même
   traitement à lui donner.
8. **`PpmsView` ne mentionne pas les classes dispensées.** Si la dispense est un
   jour activée, le décompte d'évacuation est amputé sans le dire. L'écran de
   configuration l'annonce (« elles disparaissent du Moniteur **ET** du décompte
   PPMS »), l'écran PPMS non.
9. **Le « LRU » de `photoCache` est en réalité un FIFO.** Sans conséquence au
   volume actuel ; le nom ment, pas le code.
10. **`SettingsCatalogGuardTest` prouve l'appartenance par recherche de texte**
    dans le fichier source, pas en appelant `entradas()`. Un `// TODO:
    "magbo.x"` en commentaire suffirait à le satisfaire. Le rendre exact
    demande d'instancier le catalogue avec des doubles — faisable, non fait.
11. **Le sens inverse de l'i18n n'est testé nulle part** : une clé présente au
    dictionnaire et citée par personne n'est signalée par rien.
    `recherche.botao` est restée orpheline jusqu'à ce que le panel la trouve à
    la main. Un test du sens dictionnaire → code demanderait une liste
    d'exceptions pour les clés construites dynamiquement (`config.chave.` + clé,
    `creneaux.dia.` + n).
12. **`SystemConfiguration.js` n'est pas dans `MIGRADAS`** de
    `tests/i18nGuard.test.js`, comme `CdiExclusionManagement.js` et
    `MealSlotManagement.js` — lacune antérieure à cette nuit. Ces écrans ne
    sont pas protégés contre un futur libellé écrit en dur.
13. **`ParcoursController` ne journalise aucune lecture.** Avec l'autocomplétion,
    les requêtes sont désormais automatiques : « qui a consulté la journée de cet
    enfant » n'a aucune réponse. Le volume a changé, la question aussi.
14. **La recherche ne trouve que des élèves** (`StudentSearchService` filtre
    `ALUNO`) alors que le champ dit « Chercher une personne ». Antérieur, mais
    l'autocomplétion rend l'échec permanent et muet pour un nom de personnel.

---

## 6. Ordre de merge

**Testé, pas prédit** : les six branches ont été fusionnées dans cet ordre sur
une branche d'essai construite sur `origin/main`. **Aucun conflit.** Les deux
suites passent sur le résultat fusionné.

```
1. fix/scintillement-photos       8432ade   (base de la pile)
2. feat/cantine-flags-creneaux    62db214   (empilée sur 1)
3. feat/cdi-capacite-exclusions   ebde9bf   (empilée sur 2)
4. feat/recherche-centrale        2db776a   (part de b2f5cda — voir ci-dessous)
5. feat/ecran-configuration       67ecda4   (empilée sur 3)
6. diag/portaria-passagens        59d4760   (indépendante — document seul)
```

⚠️ **`feat/recherche-centrale` part de `b2f5cda`, c'est-à-dire du chantier 1
AVANT sa deuxième passe.** Elle ne contient donc pas les corrections
`ebde9bf`. Ce n'est pas un problème dans cet ordre — le merge les apporte — mais
si quelqu'un mergeait la 4 **seule** dans `main`, il obtiendrait le CDI de la
première version. Merger la 3 avant la 4.

`diag/portaria-passagens` peut être mergée n'importe quand : deux fichiers
neufs (le document et un test), aucun fichier partagé avec les autres branches.

**Conflits attendus : aucun.** Vérifié par fusion réelle, pas par lecture. Si un
conflit apparaît malgré tout, ce sera sur `js/utils/i18n.js`, `js/App.js` ou
`js/data/constants.js` — les trois fichiers que plusieurs branches touchent —
et il sera d'addition, pas de contradiction.

---

## 7. Migrations pour la VM

Aucune migration nouvelle cette nuit. **Celles des nuits précédentes ne sont
toujours pas appliquées** et le sont obligatoirement avant de monter le backend
correspondant.

`ddl-auto=update` **ne les fera pas** : il ajoute des colonnes, il ne crée ni
CHECK ni contrainte sur une table existante, et il ne touche pas à un CHECK
déjà là. Sur le PC il ne fait rien non plus ; sur H2 les tests recréent tout et
restent verts. **Le défaut n'existe que sur la VM.**

Ordre, tel qu'écrit dans `deploy/migrations/README.md` :

```bash
cd /opt/magbo   # racine du dépôt sur la VM

for f in V020__cantine_removals \
         V021__meal_slots V022__denial_reason_meal_slot V023__meal_slots_seed \
         V024__system_settings V025__cdi_exclusions; do
  echo "== $f"
  docker exec -i magbo-postgres psql -v ON_ERROR_STOP=1 -U magbo -d magbodb \
    < deploy/migrations/$f.sql || { echo "ÉCHEC sur $f — NE PAS monter le backend"; break; }
done
```

⚠️ **`ON_ERROR_STOP=1` n'est pas décoratif.** Sans lui, `psql` continue après
l'erreur et **sort avec le code 0** : le script annonce le succès, le backend
monte, et le défaut se découvre au premier élève.

⚠️ **V022 avant le backend, pas après.** Elle élargit le CHECK de
`denial_reason` avec `MEAL_SLOT_NOT_CONFIGURED`. Sans elle, l'`INSERT` échoue
**dans la transaction** de la première passage d'un élève sans créneau, en
emportant avec lui l'`access_log` d'un passage réel.

Vérifications après application — les trois, la dernière est celle qu'on oublie :

```bash
# 1. les créneaux existent
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT dia_semana, hora, rotulo FROM meal_slots ORDER BY dia_semana, hora;"

# 2. le fait qui a dicté le modèle : une turma dans DEUX créneaux le même jour
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT mc.turma, count(*) FROM meal_slot_classes mc JOIN meal_slots ms ON ms.id=mc.slot_id \
    WHERE ms.dia_semana=2 GROUP BY 1 HAVING count(*)>1;"

# 3. aucune turma d'élèves sans créneau
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT DISTINCT u.turma FROM app_users u WHERE u.tipo='ALUNO' AND u.ativo AND u.turma<>'' \
     AND NOT EXISTS (SELECT 1 FROM meal_slot_classes mc WHERE mc.turma=u.turma);"

# 4. les deux tables neuves sont là et VIDES (c'est le contrat)
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT 'system_settings', count(*) FROM system_settings
   UNION ALL SELECT 'cdi_exclusions', count(*) FROM cdi_exclusions;"
```

Les rollbacks existent pour V020, V021, V022, V024 et V025 (`deploy/migrations/rollback/`).
V023 n'en a pas, et c'est documenté : c'est un **seed**, ses lignes vivent dans
les tables de la V021 et meurent avec `R021`.

⚠️ **`R025` efface les exclusions.** Ce sont des mesures prises sur des enfants :
sans le dump précédent, elles ne reviennent pas.

---

## 8. Compteurs avant / après

| Branche | backend | npm | Note |
|---|---|---|---|
| départ (`origin/main` `aeda162`) | 889 | 648 | référence |
| `fix/scintillement-photos` | 889 | 651 | +3 (dont `peek()`) |
| `feat/cantine-flags-creneaux` | 921 | 655 | +32 backend |
| `feat/cdi-capacite-exclusions` | 925 | 669 | +4 / +14 (garde de capacité) |
| `feat/recherche-centrale` | 925 | 672 | front seul (part de `b2f5cda`) ; +12 en 2ᵉ passe |
| `feat/ecran-configuration` | 928 | 670 | +3 (gardes du catalogue) |
| `diag/portaria-passagens` | +6 | — | `MultipartCameraPortariaTest`, hors de la pile |
| **résultat fusionné** | **934** | **682** | 0 échec, exactement 2 `@Disabled` |

⚠️ Le total fusionné (934) est supérieur à celui de la branche la plus haute
(928) : `diag/portaria-passagens` est **hors de la pile** et apporte ses six
tests au moment du merge, et `feat/recherche-centrale` ses douze tests front.
Un total de 928 après fusion voudrait dire que la branche du diagnostic a été
oubliée.

Le critère reste **0 échec et exactement 2 `@Disabled`** — jamais un total fixe.
Un total inférieur veut dire qu'un test a été supprimé ; `Skipped ≠ 2` veut dire
qu'une requête native a été débranchée.

---

## 9. Ce qui reste — jeudi, puis après le départ de Sam

### Jeudi 28, dans l'ordre

1. **Relire et merger** dans l'ordre de la section 6. Rien n'est urgent au point
   de sauter la relecture : tout ce qui est ici prévient, rien ne bloque.
2. **Appliquer les migrations sur la VM** (section 7) **avant** de monter le
   backend. C'est la seule étape qui casse en silence si elle est sautée.
3. **Vérifier à l'écran** ce que la suite ne peut pas voir : aucune suite ne rend
   de React dans ce projet. Le Moniteur Cantine un jour de service, l'écran du
   CDI avec une exclusion réelle, l'écran de configuration.
4. **Lancer les cinq requêtes du diagnostic portaria** sur la VM
   (`docs/operacional/diagnostic-portaria-2026-08-27.md`) : le diagnostic local
   n'a rien trouvé côté code, la réponse est dans les données de production.

### Après le départ

- ⚠️ **`docs/operacional/handoff.md` s'arrête au 05/08.** C'est le document
  explicitement écrit « pour qui reprendra le MAGBO après Sam », et il a trois
  semaines de retard : les créneaux de cantine, le régime de sortie, le PPMS,
  les photos d'identité, les réglages à l'écran et tout ce qui est décrit ici
  lui sont postérieurs. **C'est la première chose à mettre à jour**, et c'est
  la seule tâche de cette liste dont la valeur dépend entièrement du fait
  qu'elle soit faite pendant que Sam est encore là.
- **Les neuf réserves de la section 5** — chacune est une décision, pas une
  tâche. Les numéros 2 (trace de l'exclusion) et 3 (verrouillage de l'écran des
  exclusions) sont ceux qui touchent des données sur des mineurs.
- **La dispense de badge est préparée, pas activée** — désactivée par défaut,
  volontairement. Ne pas l'activer sans avoir traité la réserve 8 (PPMS).
- **`f442db9` a une leçon qui se répète** : deux nombres pour la même chose sur
  le même écran. C'est arrivé au plancher de visite, puis à la capacité du CDI.
  Le prochain endroit sera un autre réglage — d'où le catalogue du chantier 6 et
  son test de garde.
