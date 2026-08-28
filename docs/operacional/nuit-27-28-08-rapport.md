# Nuit du 27 au 28 août 2026 — rapport de la dernière nuit de code

> **Rien n'a été mergé. Rien n'a touché la VM.** Huit branches poussées sur
> `origin`, construites sur `origin/main` (`7e35cb4`, l'état après les merges
> de Sam du 27).
>
> ⚠️ **Le calendrier n'a pas été tenu, et il faut le dire en premier.** La
> consigne était d'arrêter de coder à 06h00 et de livrer le rapport à 06h30.
> Les cinq chantiers de code et la correction de C5b étaient poussés et
> validés par leurs panels avant 06h00. Le balayage (C6) a été lancé sous forme
> d'éventail d'agents, et **la limite de session API a coupé l'éventail en
> plein vol** (60 agents en erreur « session limit, resets 12:50 »), ce qui a
> gelé la session jusqu'au début d'après‑midi. Le balayage, la branche
> « horloge locale » et ce rapport ont été terminés **vendredi entre 14h30 et
> 16h00**. Si la fenêtre de vendredi matin a été utilisée sans ce rapport, la
> section 4 dit exactement ce qui est mergeable et dans quel ordre — rien de
> ce qui est ici n'est à moitié poussé.

---

## 1. État de chaque chantier

| # | Chantier | État | Branche | Dernier commit |
|---|---|---|---|---|
| 1 | Configuration dans l'engrenage | **fait** (panel : approuvé, réserves corrigées) | `feat/config-engrenage` | `c29346b` |
| 2 | Recherche sur l'écran d'accueil | **fait** (panel : approuvé, réserves corrigées) | `feat/recherche-accueil` | `13fe63e` |
| 3 | Affiche fidèle et en couleur + 4ème 2 confirmée | **fait** (panel : approuvé, réserves corrigées) | `feat/affiche-couleur` | `c276f07` |
| 4 | Trace des alertes CDI (V026) | **fait** (panel : **veto sécurité levé** en 2ᵉ passe) | `feat/cdi-alertes-historique` | `d3036d5` |
| 5 | Vérifications de bout en bout (a–d) | **fait** — a, c, d tiennent ; **b a révélé un défaut, corrigé** | `fix/cdi-alerte-ferme` (empilée sur C4) | `61fbe32` |
| 6 | Balayage final | **fait, borné** — 33 corrections sur 17 écrans, voir §6 | `fix/balayage-28-08` (⚠️ **à merger en dernier**) | `11006f6` |
| 6b | « Aujourd'hui » en heure locale — 4ᵉ défaut d'horloge, trouvé par le balayage | **fait**, avec garde | `fix/aujourdhui-heure-locale` | `db243e9` |
| — | Ce rapport | — | `docs/nuit-27-28-08` | — |

Compteurs sur le **résultat fusionné** (les sept branches de code, dans
l'ordre du §4) : backend **943** (0 échec, exactement 2 `@Disabled`), npm
**684**. Référence de départ : backend 934, npm 682. Détail par branche au §7.

---

## 2. Ce qui a été fait, chantier par chantier

### Chantier 1 — la configuration vit dans l'engrenage

L'engrenage du header, qui était admin‑only avec un commentaire qui le
justifiait, s'ouvre maintenant aussi au porteur de `CONFIG_WRITE` qui n'est pas
admin. Dans le modal, cette personne voit **une seule** entrée — la
configuration du système — et aucune des sept abas d'administration, dont la
garde est posée sur le **contenu** et pas seulement sur les boutons de la
sidebar (un `setActiveTab` forcé au clavier ne rend rien). Le titre et le
sous‑titre du modal, et l'infobulle de l'engrenage, suivent le profil : au
porteur de `CONFIG_WRITE` seul, l'interface ne promet plus un import qu'il ne
verra jamais.

**Le card du Panneau Administratif a été SUPPRIMÉ, pas transformé en
raccourci.** La voix Vie Scolaire du panel a tranché, comme Sam l'avait
délégué : *« Le card n'a vécu qu'un jour (créé le 27/08, retiré le 27/08) :
on ne construit pas une deuxième porte permanente pour protéger une habitude
d'un jour. Un raccourci laisserait deux chemins vers le même écran, et le
prochain défaut serait corrigé derrière un seul des deux. L'engrenage est
l'endroit où toute application range sa configuration. »* Le point d'accès
`SYSTEM_CONFIGURATION`, sa route et son raccourci ont disparu avec lui.

Preuve à l'écran, trois profils créés par l'API des opérateurs et supprimés
après : admin (engrenage + les huit entrées), opérateur sans permission
(**aucun** engrenage, aba inatteignable même en forçant l'événement), porteur
de `CONFIG_WRITE` (engrenage, **une** entrée, catalogue chargé).

### Chantier 2 — la recherche sur l'accueil

La barre est le premier élément de l'écran d'accueil des profils admin / Vie
Scolaire / direction — grande, centrée, comme une page de moteur de recherche.
Tout ce qu'elle avait appris la veille voyage intact : autocomplétion à la
frappe, flèches + Entrée, et la protection « Entrée sur une liste périmée
n'ouvre personne », que `tests/rechercheAutocomplete.test.js` garde. Sans
`PARCOURS_READ` la barre n'existe pas ; les tuiles de chiffres passent dessous
et deviennent masquables (clés i18n dédiées — coupler leur libellé à celui des
KPI du Panneau aurait fait hériter l'accueil d'une reformulation que personne
n'aurait décidée pour lui). CDI et Moniteur Cantine : inchangés.

### Chantier 3 — l'affiche, fidèle et en couleur

`print-color-adjust: exact` (et son préfixe `-webkit-`) sur le bloc
d'impression et ses descendants — **c'est la ligne qui fait la couleur** : sans
elle le navigateur jette les fonds à l'impression, et c'est pourquoi les
réimpressions étaient ternes. La première version de ce fichier imprimait en
noir et blanc *exprès* ; la décision de Sam la remplace, et le commentaire le
dit plutôt que de retourner la veste en silence.

La mise en page suit le mur pièce par pièce : en‑tête LYCÉE MOLIÈRE / RIO DE
JANEIRO / VIE SCOLAIRE et badge rouge RESTAURATION 2026 ; bandeau bleu foncé
« CANTINE 12H30 — PASSAGE PRIORITAIRE / PRIORIDADE » (13H00 — SECONDAIRE /
LYCÉE) avec CLASSES AUTORISÉES à droite ; cinq blocs‑jours à bandeau ; le
**code couleur du mur** sur les pastilles — Terminale (T1, T2) en saumon, 1ère
et 2nde en bleu, collège en blanc à liseré gris (`TPS/PS A` ne passe pas pour
une Terminale : la regex exige un chiffre après le T, vérifié contre les 43
codes réels de la base) ; encadré RAPPEL / AVISO ; pied SFBE / AEFE ; une page
par passage, A4 paysage.

**La 4ème 2 est confirmée.** La marque `a_confirmar` du badge caché par
l'aimant (mercredi 13H00) est retirée aux trois endroits où elle vivait : la
V023 (pas encore appliquée sur la VM — le seed part correct), la base dev
(UPDATE, 1 ligne, 0 restante), et la question C du document de contrôle,
marquée résolue avec la réponse.

Le panel a attrapé mon propre commit qui mentait : « l'écran corrige le
rotulo » — aucun champ ne l'éditait, et la page 11h imprimait « REPRIS DE
CLASS_SCHEDULES », un nom de table interne, sur une page lue par les familles
de 25 classes. Le rotulo est maintenant un champ sur la carte du créneau
(l'endpoint l'acceptait déjà). Prouvé : édité à l'écran, gravé en base,
imprimé sur le bandeau.

Preuve : aperçu d'impression émulé (`media: print`) — styles calculés T1
`rgb(249,168,160)`, 1E1 `rgb(191,219,254)`, bandeau `rgb(30,58,95)`,
`printColorAdjust: "exact"` ; la 4E2 en trait plein, sans « ? ».

### Chantier 4 — chaque alerte du CDI laisse une trace (V026)

`cdi_alert_events` : type (`EXCLUSION` / `CAPACITE` / `FERME`), la personne
quand il y en a une, le point, **l'heure du badge** (jamais celle du
traitement), ce que l'écran affichait — et **jamais le motif** de l'exclusion,
qui reste dans `cdi_exclusions` derrière sa porte. Écriture en `REQUIRES_NEW`
(test sur l'annotation) et POST fire‑and‑forget **après** l'affichage de
l'alerte, jamais comme condition. POST par aire `cdi` (l'opérateur déclare ce
que son écran a montré), GET par `CDI_EXCLUSION_WRITE`. Onglet « Historique
des alertes » dans l'écran des exclusions, même permission que la gestion.

**Le panel a rendu un VETO sécurité, et il avait raison** : la table naissait
**sans colonne d'auteur** — alors que tous ses frères en ont une
(`access_logs.created_by_user`, `cdi_exclusions.criado_por` : « o campo é
prova ») et qu'un compte d'aire `cdi` peut poster n'importe quel `userId` avec
n'importe quelle heure passée. Un registre probatoire aux lignes inattribuables
n'est pas un registre. Et c'était réparable une seule fois : la table n'existe
encore dans aucun environnement ; après la première ligne déployée, la colonne
ajoutée après coup aurait laissé toutes les précédentes orphelines.
`criado_por` est là, estampillé par le **serveur** depuis le principal
authentifié, jamais lu du corps.

Trois autres bloquants du même panel, tous réels et corrigés : l'alerte
CAPACITE inscrivait le nom du premier entrant du tick de polling — un enfant
qui n'avait rien fait, dans un registre de signalements (elle est sans nom,
comme la V026 le disait déjà) ; la garde de la migration avait une porte de
derrière (backend monté avant la migration → table créée par Hibernate **sans**
le CHECK, garde muette — un second bloc idempotent pose le CHECK quand il
manque, quel que soit le créateur de la table) ; et la limite structurelle
n'était écrite nulle part — elle l'est, dans le README et **à l'écran** :

> **Ce registre n'écrit que lorsque l'écran du CDI est ouvert.** Poste éteint,
> écran fermé, réseau coupé : le badge a eu lieu, l'alerte n'a pas sonné, il
> n'y a pas de ligne. **L'absence de ligne ne prouve jamais l'absence de
> badge** — pour ça il y a `access_logs`, qui ne dépend d'aucun écran.

Dans six semaines, cette phrase est la différence entre une réponse juste et
une réponse fausse à une famille.

Preuve de bout en bout : un badge inséré directement dans `access_logs`, daté
**40 minutes dans le passé**, lève l'alerte par le polling ; la ligne en base
lit `EXCLUSION | Wilfreda TRACE | 17:45 | exclusion individuelle |
ecart_min=40` — les 40 minutes entre `event_time` et `criado_em` sont l'horloge
de l'événement qui marche ; le motif n'apparaît nulle part ; l'onglet montre
la ligne avec sa pastille.

### Chantier 5 — les quatre vérifications de Sam

| | Vérification | Résultat |
|---|---|---|
| a | Capacité changée dans la Configuration → l'écran CDI la reflète au poll suivant, sans rechargement | **tient** : « / 25 » → « / 60 » 35 s plus tard, sans reload (le poll de `/etat` est à 30 s) |
| b | État « CDI fermé » actif → un badge RÉEL (polling) déclenche l'alerte | **défaut confirmé, corrigé** — voir ci‑dessous |
| c | Les trois sons sont distincts et partent sur le bon événement | **tient** — inventaire ci‑dessous |
| d | Moniteur Cantine : les photos ne scintillent plus sur plusieurs cycles | **tient** : 4 photos réelles chargées par `objectURL`, **0 `<img>` créé** en 13 s (≈ 4 cycles de 3 s) |

**b — le défaut.** Le bandeau « CDI FERMÉ » s'affichait, mais un badge réel
pendant la fermeture ne déclenchait **rien** : l'écran savait la salle fermée
et regardait quelqu'un entrer sans un mot. Correction sur `fix/cdi-alerte-ferme`
: chaque nouvelle entrée pendant un état ≠ OUVERT lève la modale violette avec
nom, classe et photo (le bibliothécaire veut savoir **qui** vient d'entrer
dans une salle fermée) et écrit une ligne `FERME` au registre. Chaque entrée
alerte — pas seulement le front montant : une salle fermée est censée ne
recevoir personne, chaque badge y est l'exception (l'inverse de l'alerte de
capacité, où répéter la modale par personne pendant la récréation était le
bruit que le panel avait refusé). Priorités : exclusion > fermé > capacité.
Prouvé : état FERME posé avant l'ouverture, badge inséré en base, modale avec
« Yolanda FERMEE », ligne `FERME | Yolanda FERMEE | état FERME`.

⚠️ Cette branche est **empilée sur C4** de propos délibéré : la correction
touche le même `avisar` que le registre venait de modifier ; une branche
indépendante garantissait un conflit. Merger C4 d'abord.

**c — les sons.** Il n'y a **aucun fichier audio** : les cinq sons sont
synthétisés par Web Audio dans `js/cdi/cdiData.js` (`CdiSound`). Inventaire :

| Son | Timbre | Événement | Où |
|---|---|---|---|
| `success` | 880 Hz sinus, 150 ms | entrée normale (scan ou badge) | `togglePresence` / `avisar` (défaut) |
| `exit` | 440 Hz sinus, 200 ms | sortie | idem |
| `error` | 220 Hz carré, double bip | carte inconnue | `togglePresence` (404) |
| `complet` | paire **descendante** 520 → 390 Hz | franchissement de la capacité (front montant) — et, depuis C5b, badge pendant FERMÉ/RÉSERVÉ | `avisar` |
| `exclu` | 300 Hz dents‑de‑scie → 1180 Hz triangle → 300 Hz, gain 0,22 (plus fort que la routine à 0,1) | personne ou classe exclue | `avisar` |

`tests/cdiCapaciteContract.test.js` fige la distinction : la première note
d'`exclu` doit être nettement plus grave que `success` (elle ouvrait sur un
aigu bref, c'est‑à‑dire sur ce qu'est le son du OK en entier — corrigé le 27).
Le son FERMÉ réutilise `complet` : les deux disent « la salle n'est pas
disponible », et Sam fige **trois** sons, pas quatre.

### Chantier 6 — le balayage

*(§6)*

---

## 3. Verdicts du panel et vetos

Chaque chantier est passé devant deux voix ; deux allers‑retours au maximum.
**Un seul VETO a été prononcé** (C4, sécurité, la colonne d'auteur) et il est
**levé**. Tous les autres verdicts sont « approuvé avec réserves », et chaque
réserve corrigeable en une passe l'a été (C1 : titre/sous‑titre/infobulle par
profil, gardes des effets, clés orphelines ; C2 : commentaire honnête, clés
dédiées ; C3 : rotulo éditable, filtre `ativo`, règle morte, commentaire FR/PT,
phrase du document restituée ; C4 : les quatre bloquants ci‑dessus).

**Aucun veto ne reste ouvert.** Ce qui reste est en §8, et ce sont des
décisions, pas des défauts.

---

## 4. Ordre de merge — testé par fusion réelle

Les sept branches de code ont été fusionnées dans cet ordre sur une branche
d'essai construite sur `origin/main` (`7e35cb4`). **Aucun conflit dans cet
ordre.** Les deux suites passent sur le résultat : backend **943 · 0 · 2**,
npm **684**.

```
1. feat/config-engrenage         c29346b   indépendante
2. feat/recherche-accueil        13fe63e   indépendante
3. feat/affiche-couleur          c276f07   indépendante
4. feat/cdi-alertes-historique   d3036d5   indépendante — porte la V026
5. fix/cdi-alerte-ferme          61fbe32   ⚠️ EMPILÉE sur 4 — merger après elle
6. fix/aujourdhui-heure-locale   db243e9   indépendante
7. fix/balayage-28-08            11006f6   ⚠️ REBASÉE SUR 1–6 — merger EN DERNIER
8. docs/nuit-27-28-08            —         documentation seule
```

Les branches 1 à 4 et 6 se mergent dans n'importe quel ordre entre elles
(fichiers partagés : `js/utils/i18n.js`, les deux rapports — à des endroits
distincts, vérifié par fusion). La 5 dépend de la 4. **La 7 dépend de toutes
les autres** : elle touchait les mêmes lignes que la 6 (les deux rapports) et
`i18n.js`, elle a donc été rebasée sur l'ensemble et **contient** leurs
commits — la merger seule sur `main` mergerait tout le reste avec elle. La
merger en dernier ne coûte rien ; la merger avant en coûte un.

Si Sam préfère **ne pas** prendre le balayage : les branches 1 à 6 se mergent
sans lui, et le §6 liste ce qu'il contient pour le reprendre à froid.

⚠️ **Après le merge, reconstruire le jar AVANT de le distribuer** : ce que
vous mettez dans les postes doit être construit depuis `main` mergée, pas
depuis une branche.

---

## 5. Migrations pour la VM

**Une migration nouvelle cette nuit : V026.** Aucune autre branche (balayage,
horloge locale) ne touche la base. Et la V023 a été **modifiée**
(la ligne 4E2/mercredi passe de `true` à `false`) — sans conséquence pour la
VM puisqu'elle n'y a jamais été appliquée : le seed part correct.

`ddl-auto=update` ne fait rien de tout ceci sur une table existante et ne
posera jamais un CHECK. **Appliquer à la main, avant de monter le backend.**
Les V020 à V025 des nuits précédentes sont **toujours en attente** sur la VM.

```bash
cd /opt/magbo   # racine du dépôt sur la VM, main mergée, jar reconstruit

for f in V020__cantine_removals \
         V021__meal_slots V022__denial_reason_meal_slot V023__meal_slots_seed \
         V024__system_settings V025__cdi_exclusions V026__cdi_alert_events; do
  echo "== $f"
  docker exec -i magbo-postgres psql -v ON_ERROR_STOP=1 -U magbo -d magbodb \
    < deploy/migrations/$f.sql || { echo "ÉCHEC sur $f — NE PAS monter le backend"; break; }
done
```

⚠️ **`ON_ERROR_STOP=1` n'est pas décoratif** : sans lui `psql` continue après
l'erreur et sort avec le code 0.

Vérifications après application (V026 en plus des précédentes) :

```bash
docker exec magbo-postgres psql -U magbo -d magbodb -c "\d cdi_alert_events"
# le CHECK doit MORDRE (doit ÉCHOUER) :
docker exec magbo-postgres psql -U magbo -d magbodb -c \
  "INSERT INTO cdi_alert_events (tipo,point_id,event_time,criado_por) VALUES ('AUTRE','BIBLIO',now(),'t');"
# la table naît vide, et la 4E2 n'a plus de marque :
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT (SELECT count(*) FROM cdi_alert_events)||' alertes, '||(SELECT count(*) FROM meal_slot_classes WHERE a_confirmar)||' a_confirmar';"
```

Rollbacks : `R020`, `R021`, `R022`, `R024`, `R025`, **`R026`** (V023 est un
seed, ses lignes partent avec R021). ⚠️ **R025 et R026 effacent des données
sur des enfants** — les exclusions, et le registre des signalements. Sans le
dump antérieur, elles ne reviennent pas. Un `pg_dump` **avant**, toujours.

---

## 6. Le balayage — corrigé vs à faire

**Méthode.** Chaque écran a été ouvert avec le driver Electron sur l'ensemble
fusionné (28 captures : accueil, secteurs, CDI, Moniteur, trois rapports et
leurs onglets, PPMS, panneau, six écrans de gestion, opérateurs, huit abas de
l'engrenage), puis relu par un agent par famille d'écrans qui devait citer le
texte vu sur la capture **et** la ligne de code qui le produit. Un second
agent sceptique devait re‑vérifier chaque défaut « petit » dans le code.

⚠️ **La limite de session API a coupé ce second passage** : sur ~55 défauts
« petits », 9 ont été confirmés par un sceptique, les autres pas — et deux
familles (les abas *Importer / HikCentral / Personnels* et *Photos /
Enregistrement / Généraux* de l'engrenage) n'ont **pas été relues du tout**.
J'ai donc vérifié chaque correction appliquée **moi‑même, dans le code, avant
de l'écrire** ; les deux familles non relues sont listées ci‑dessous comme
non couvertes, pas comme propres.

**Le classement est celui de Sam** : petit = un composant (ou `i18n.js`), sans
changement de comportement, un commit par écran, réversible ; gros = va au
rapport.

### Corrigé — `fix/balayage-28-08`, un commit par écran (16 commits)

| Écran | Corrigé |
|---|---|
| i18n (clés) | rôles et flags traduits, singulier de « passage », « Effacer la recherche », « il y a X min », double préposition « depuis il y a », `feed.vazio` sans « aujourd'hui » (le flux couvre 12 h à la cantine et les 50 dernières au rapport), « {n} mouvement(s) », « Par personne » sans *élève/ID/timeline*, « Rétablir le défaut », options de l'état du CDI, sévérités, « Tous les mouvements », « État déclaré » |
| Accueil | rôle brut « ADMIN » → traduit ; flag brut `POSTO_FIXO` dans le parcours → traduit ; « Personnes enregistrées 0 » avant chargement → « — » (inconnu ≠ zéro) ; « Points d'accès 17 » contre 11 cartes → compte les points visibles |
| Secteurs + header | « 0 passages » / « 1 passages » → singulier ; ligne sans nom forcée en `'fr'` → langue courante ; icône « effacer » sans tooltip ; titre, fil d'Ariane et date de l'en‑tête qui se cassaient sur deux lignes |
| CDI | barre de défilement horizontale deux fois plus épaisse que la verticale (on aurait dit un squelette de chargement) |
| PPMS | le « 0 » d'une zone vide quasi invisible (contraste 1,5:1 → 3:1) — sur un écran d'évacuation, « vide » et « pas chargé » ne doivent pas se ressembler |
| Moniteur Cantine | colonne DOIT SORTIR décalée de 8 px (un `extra` toujours truthy rendait un wrapper vide) ; « il y a X min » et « Trouvé dans : doit sortir » en français dur, visibles en PT ; quatre `lang: 'fr'` forcés |
| Rapport Infirmerie | boutons de période en français dur (les clés existaient) ; dates `yyyy-MM-dd` → locale ; « Durée moyenne 0 min » sans visite → « — » |
| Rapport Cantine | idem dates et moyenne ; les familles par service au milieu de la grille d'impression orphelinaient deux KPI → déplacées après le dernier |
| Rapport Général | rangée de filtres désalignée (les `<input type=date>` font 2 px de plus) ; « Tous » sous RÉPÉTITIONS → « Tous les mouvements » ; bouton CSV actif à 0 ligne (téléchargeait un fichier vide) ; sévérités et « aujourd'hui » en dur |
| Opérateurs | *Ativo / Inativo / Editar / Desativar / Nunca / Editando* en portugais sur l'écran FR ; dernière connexion en ISO brut |
| Sorties | jours *Seg/Ter/Qua/Qui/Sex* en dur ; classe `btn` fantôme (boutons sans padding ni arrondi) ; racine sans marge ; plages horaires avec secondes |
| Droits repas | même classe `btn` fantôme ; « Inconnu » en dur ; **le filtre de statut n'avait pas « En attente »**, l'état de 923 élèves le jour 1 |
| Régimes | « Matrícula » en PT dans la liste FR des colonnes ; dates de validité **un jour trop tôt** (LocalDate parsé en UTC minuit) ; bouton retour sans tooltip |
| Configuration | options OUVERT/RESERVE/FERME brutes → libellées ; « modifié le » en ISO → locale ; bouton « Défaut » ambigu à côté de « défaut : 15 » → « Rétablir le défaut » |
| Exclusions CDI | étiquette du champ État réutilisait le texte d'une option ; champ motif plus haut que ses voisins ; date de fin en ISO avec séparateur orphelin |

Et deux retouches portées sur **leurs** branches d'origine, parce que le
code corrigé y est né : sur `feat/affiche-couleur` (champ du rotulo trop
étroit, tooltip du ✓, placeholder PT mêlant les langues) et sur
`feat/cdi-alertes-historique` (heure de l'historique en locale, nom du point
au lieu de `BIBLIO`, état vide qui citait « V026 » à un opérateur).

### Le défaut systémique sorti du balai — `fix/aujourdhui-heure-locale`

Le relecteur des rapports l'a classé « gros », à raison : **« aujourd'hui »
était calculé en UTC** (`new Date().toISOString().slice(0, 10)`) à ~20
endroits dans 9 fichiers. Rio est à UTC−3 : **à partir de 21 h, l'expression
rend demain**. Le compteur « Mouvements aujourd'hui » de l'accueil tombait à
0, les rapports Infirmerie / Cantine / Général interrogeaient un jour qui
n'existait pas encore, le Moniteur Cantine demandait les passages du
lendemain, la sauvegarde automatique du CDI croyait n'avoir pas encore tourné,
et un régime nouveau était daté de demain. Un défaut qui ne se voit qu'après
21 h — jamais pendant une démonstration. C'est le **quatrième défaut
d'horloge** du projet.

Le remède existait : `dayKey(date)` dans `js/utils/helpers.js`, composantes
locales, avec un commentaire qui mettait en garde contre exactement cette
forme. Tous les sites qui nomment un **jour** l'utilisent ; deux noms de
fichiers téléchargés gardent la forme UTC et sont **nommés** dans le garde
`tests/aujourdhuiHeureLocale.test.js`, qui parcourt `js/` et échoue sur toute
ligne qui nommerait un jour en UTC. Branche à part, parce que 9 fichiers
dépassent la frontière du balai — mais un seul motif, mécanique, et un test
qui l'empêche de revenir.

### Listé sans toucher — gros, ou décision

1. **Les pastilles « N personnes » des cartes de l'accueil** sont calculées
   sur les logs du **dernier secteur ouvert**, jamais sur l'école. Il faut une
   source serveur par point, et la seule requête existante
   (`currentOccupancyByPoint`) est PG‑only et `@Disabled`.
2. **Filtre « Toutes les classes » des Droits repas** propose A1/A2/B1/B2 —
   aucune n'existe. Le peupler depuis les classes réelles change un
   comportement et demande de choisir la source.
3. **« Surveillance Cantine » (carte) vs « Moniteur Cantine » (titre de
   page)** : deux noms pour un écran. Le premier est une décision du 20/08 ;
   le second est le vocabulaire de Sam. Décision, pas retouche.
4. **Le compte `admin` s'appelle « Administrador »** sur l'interface FR —
   c'est une donnée (`AdminBootstrap`), à renommer depuis l'écran Opérateurs.
5. **« Dernière synchronisation automatique : 03:00 »** est une constante
   présentée comme un fait.
6. **Colonnes « Heure » sans date** sur des listes qui couvrent plusieurs
   jours (Rapport des accès du panneau, « Dernier événement » de l'analyse).
7. **Liste des Droits repas coupée à 100** élèves sans mention (926 attendus).
8. **Encadré capacité/état du CDI** qui disparaît sans message si `GET /etat`
   échoue.
9. **Nom du point tronqué** (« Cantine Princi… ») dans le feed des refusées.
10. **Flag brut `FORA_HORARIO`** dans la colonne Action du rapport du panneau
    (clés partielles existent ; à unifier avec `enum.flag.*` introduit ce
    soir).
11. **Recherche d'élève muette en cas d'échec** dans le planning cantine ;
    boutons « × » des pastilles sans tooltip.
12. **Non relus** (limite API) : les abas *Importer Excel*, *HikCentral*,
    *Personnels*, *Importer les personnels*, *Photos*, *Enregistrement manuel*,
    *Généraux* de l'engrenage. Captures faites, aucun relecteur passé.

---

## 7. Compteurs avant / après

| Branche | backend | npm | Note |
|---|---|---|---|
| départ (`origin/main` `7e35cb4`) | 934 | 682 | référence |
| `feat/config-engrenage` | 934 | 682 | front seul |
| `feat/recherche-accueil` | 934 | 682 | front seul |
| `feat/affiche-couleur` | 934 | 682 | front + V023 + doc |
| `feat/cdi-alertes-historique` | **943** | 682 | +9 (`CdiAlertServiceTest`) |
| `fix/cdi-alerte-ferme` | 943 | 682 | front seul, empilée |
| `fix/aujourdhui-heure-locale` | 934 | **684** | +2 (garde de l'heure locale) |
| `fix/balayage-28-08` | 943 | 684 | rebasée sur l'ensemble : contient tout |
| **résultat fusionné** | **943** | **684** | 0 échec, exactement 2 `@Disabled` |

Le critère reste **0 échec et exactement 2 `@Disabled`**. Un total inférieur
veut dire qu'un test a été supprimé.

---

## 8. Réserves ouvertes — des décisions, pas des défauts

1. **Le registre des alertes n'a pas de filtre par élève.** `GET /alertes`
   rend les 500 dernières lignes ; « combien de fois » se lit à l'œil.
   L'index `idx_cdi_alert_events_user` existe pour une requête qu'aucun code
   n'exécute encore — c'est littéralement la question d'une famille.
2. **Un compte d'aire `cdi` peut poster n'importe quelle ligne** (userId,
   heure passée) — par design, car le client est le seul à savoir ce qu'il a
   montré. Depuis C4 round 2 chaque ligne est **attribuable** (`criado_por`) ;
   la fabrication laisse donc un nom. Aucun plafond d'écriture.
3. **`a_confirmar` ne peut plus être POSÉ à l'écran** (le lien crée toujours
   `false`) — un futur doute de transcription se marque en SQL, et le document
   de contrôle le dit. Antérieur à cette nuit.
4. **Le scanner wedge et la barre de recherche** : si un opérateur détenant
   `PARCOURS_READ` a cliqué dans la barre, un scan + Entrée n'ouvre personne
   (protection des listes périmées) mais la liste de suggestions peut
   s'afficher 250 ms plus tard sur un écran visible. Échap la ferme. Pas
   d'escalade de droit.
5. **Le page 11h de l'affiche** imprime le rotulo de la base ; il est
   maintenant éditable, mais sa valeur actuelle en base dev est encore « 11:00
   — repris de class_schedules ». À renommer à l'écran avant d'imprimer
   cette page (ou ne pas l'afficher — le mur n'en a pas).
6. Les quatorze réserves de la nuit du 26→27 restent telles quelles, sauf la
   n°1 (trace des alertes), qui est ce chantier 4.

---

## 9. Ce qui part avec Sam vendredi, et ce qui reste au successeur

### Vendredi matin, dans l'ordre

1. **Merger** dans l'ordre du §4. Relire est permis ; réordonner 1–4 est
   permis ; mettre la 5 avant la 4 ne l'est pas.
2. **Reconstruire le jar depuis `main` mergée** (`mvn package`), puis les
   suites une dernière fois sur `main` : 943 · 0 · 2 et 682 attendus.
3. **Appliquer V020 → V026 sur la VM** (§5) **avant** de monter le backend.
4. **Le portable** : le paquet Electron embarque le front — c'est lui qui va
   dans les postes à pied. Vérifier `grep -cE 'src="https?://|cdn\.' index.html`
   → 0 avant de le construire.
5. **À l'écran, sur la VM, avant de distribuer** : l'engrenage avec un compte
   `CONFIG_WRITE`, la barre sur l'accueil, l'affiche en aperçu d'impression
   couleur, un badge d'exclu au CDI qui écrit sa ligne dans l'Historique.

### Ce qui reste au successeur

- **`docs/operacional/handoff.md` s'arrête au 05/08.** C'était déjà la
  première ligne de la liste de la nuit précédente. Il a maintenant trois
  semaines et deux nuits de retard : créneaux, régime, PPMS, photos, réglages
  à l'écran, exclusions et registre du CDI, configuration dans l'engrenage,
  recherche sur l'accueil. C'est la tâche dont la valeur dépend le plus du
  fait d'être faite par quelqu'un qui a vu le système tourner.
- Les réserves du §8, et celles du 26→27.
- Les sept endpoints non gardés (`/api/users`, `/api/access/logs/*`,
  `registerAccess`) — **interdits de modification cette nuit** par Sam, dette
  documentée dans `ControllerAuthorizationGuardTest.DIVIDA_CONHECIDA` (7
  entrées, taille assertée). Les garder cassera des écrans : c'est un chantier
  avec ses propres preuves, pas une retouche.
- La dispense de badge des turmas : préparée, **désactivée par défaut**, et
  `PpmsView` ne la mentionne toujours pas.
