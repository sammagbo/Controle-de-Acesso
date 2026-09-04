# Chapitre 9 — Ce qui reste

Liste datée et priorisée au **29/08/2026**. Chaque entrée dit ce que c'est,
pourquoi ça compte, et ce qu'il faudrait faire.

L'ordre est justifié : d'abord ce qui empêche le système de faire son travail,
puis ce qui touche des données sur des personnes, puis ce qui est de la dette
technique, puis ce qui est en attente d'une décision.

---

# PRIORITÉ 1 — le système ne fait pas son travail

## 1.1 ⚠️ Le portail ne reconnaît presque plus personne

**Depuis le 25/08 : ~46 élèves distincts par jour, contre ~500 jusqu'au 24/08.**
Le personnel n'est pas touché.

C'est **le** problème du système aujourd'hui. Tout le reste de cette liste peut
attendre ; pas celui-là.

Les chiffres complets et la note historique (la caméra `.166` en panne
jusqu'au 24/08, et pourquoi les ~950 entrées d'avant n'étaient pas 950
personnes) sont **en tête de `docs/operacional/handoff.md`**. Ce qui a été
écarté avec preuve, les cinq requêtes SQL à lancer sur la VM, les `grep` de
logs et les actions HikCentral sont dans
`docs/operacional/diagnostic-portaria-2026-08-27.md`.

**Ce qu'il faut faire, dans l'ordre :** lancer les cinq requêtes du diagnostic
sur la VM avant de toucher à quoi que ce soit. La cause **n'est pas prouvée**.

⚠️ **La piste nº 1 s'est renforcée le 31/08 :** les imports de photos des 25 et
26/08 sont passés **par HikCentral**, donc par les **bibliothèques faciales des
caméras** — pas par la table `user_photos` du MAGBO, qui n'a aucun effet sur la
reconnaissance. Le lien cesse d'être une coïncidence de dates : il y a un
mécanisme. Les quatre vérifications côté HikCentral (la bibliothèque
existe-t-elle encore et avec combien de personnes · les images ont-elles été
remplacées · le `certificateNumber` a-t-il changé de format · le
« Apply to Device » a-t-il été fait) sont en tête du handoff.

**Effort :** une matinée de mesure. La correction dépend de ce qu'elle montre.

---

# PRIORITÉ 2 — des données sur des personnes

## 2.1 Les sept endpoints non gardés

Ils sont **nommés** dans `ControllerAuthorizationGuardTest`, sous la liste
`DIVIDA_CONHECIDA`, dont la taille est assertée — on ne peut pas en ajouter en
silence.

| Endpoint | Ce qu'il expose |
|---|---|
| `AccessController.getLogsByPoint` | les passages d'un point : qui, à quelle heure |
| `AccessController.getAllRecentLogs` | les passages de **tous** les points |
| ⚠️ **`AccessController.registerAccess`** | **une ÉCRITURE** : enregistrement manuel d'un passage |
| `UserController.searchStudents` | recherche d'élèves par nom |
| `UserController.getUserById` | la fiche d'une personne |
| `UserController.searchUsers` | recherche de personnes, tous types |
| `UserController.listActiveUsers` | la liste des personnes actives — la source du cache de tous les écrans |

Tous tombent dans `anyRequest().authenticated()` : il faut être connecté, mais
n'importe quel compte suffit.

⚠️ **`registerAccess` est le plus grave** : c'est une écriture. Le
`created_by_user` dit **qui** a fait, mais n'empêche personne.

**Ce qu'il faut faire :** ⚠️ **les garder cassera des écrans.** `listActiveUsers`
alimente le cache utilisé partout ; `getLogsByPoint` alimente le SectorView et
le Journal. C'est un chantier avec ses propres preuves à l'écran, pas une
retouche.

**Effort :** une nuit de travail avec vérification écran par écran.

## 2.2 Le registre des alertes du CDI n'a pas de filtre par personne

`GET /api/admin/cdi/alertes` rend les 500 dernières lignes. « Combien de fois cet
enfant a-t-il été signalé » se lit **à l'œil**.

L'index `idx_cdi_alert_events_user` a été créé (V026) **pour une requête
qu'aucun code n'exécute**. C'est littéralement la question qu'une famille pose.

**Effort :** un paramètre `?userId=` et un champ de filtre. Quelques heures.

## 2.3 L'écran des exclusions n'est pas sûr à laisser ouvert

Il affiche des noms complets, des classes, **des motifs en clair** et le login
de l'auteur. La seule protection est une phrase d'avertissement en tête.
L'écran du CDI, lui, a un verrou `Alt+L`.

**Ce qu'il faudrait :** masquage des motifs derrière un clic, et retour
automatique au tableau de bord après quelques minutes d'inactivité.

## 2.4 Une exclusion de classe suit la CLASSE, pas les élèves

Un élève muté en 6E1 en octobre déclenche l'alerte d'une mesure décidée en
septembre pour d'autres ; un élève qui quitte la classe cesse d'être signalé.

C'est **assumé et écrit** dans V025, dans le modèle et sur l'écran de création.
Figer la composition demanderait des lignes filles par élève — décision de
modèle, pas effet de bord.

---

# PRIORITÉ 3 — dette technique connue

## 3.1 Les deux onglets de l'engrenage jamais relus

Le balayage du 28/08 a relu 17 écrans. **Deux familles n'ont été relues par
personne** — la limite de session a coupé les agents : *Importer Excel*,
*HikCentral*, *Personnels*, *Importer les personnels*, *Photos*,
*Enregistrement manuel*, *Généraux*.

Les captures existent (`%TEMP%/magbo-balayage/`), aucun relecteur n'est passé.
**Ce ne sont pas des écrans propres : ce sont des écrans non examinés.**

## 3.2 Les quatorze réserves du rapport du 26–27/08

Elles sont listées au §5 de `docs/operacional/nuit-26-27-08-rapport.md`. Les
trois qui comptent le plus :

1. **`MEAL_SLOT_NOT_CONFIGURED` apparaît dans le panneau rouge « tentatives
   refusées », avec un bip.** Ce n'est pas un refus, c'est « je ne sais pas ».
   `REGIME_TO_VERIFY` et `REGIME_UNKNOWN` ont chacun leur couleur pour cette
   raison exacte ; celui-ci tombe dans la couleur par défaut.
2. **`PpmsView` ne mentionne pas les classes dispensées.** Si la dispense est un
   jour activée, le décompte d'évacuation est amputé **sans le dire**.
3. **Le « LRU » de `photoCache` est en réalité un FIFO.** Sans conséquence au
   volume actuel ; c'est le nom qui ment, pas le code.

## 3.3 `duplicate-meal` en OBSERVATION gonfle le compte

La politique est en `OBSERVATION` : chaque deuxième lecture d'une même personne
produit une ligne dans `access_attempts`. Ces lignes se mélangent aux vrais
refus dans les compteurs.

**Décision à prendre :** passer en `DENY`, ou séparer les compteurs.

## 3.4 Le contrôle au démarrage de V022

Rien ne vérifie au démarrage que le CHECK de `denial_reason` couvre toutes les
valeurs de l'enum. `tests/migrations.test.js` le vérifie **au moment des
tests**, contre le fichier SQL — pas contre la base réelle.

**Ce qu'il faudrait :** un contrôle au démarrage, sur le modèle de
`ProdSecurityStartupCheck`, qui compare l'enum au CHECK effectivement présent.
C'est le troisième incident de cette famille (V009, V015, V022) — le prochain
est prévisible.

## 3.5 La divergence `class_schedules` / `meal_slots`

Depuis la V021, la cantine lit `meal_slots` et **plus** `class_schedules`
(ADR sur les créneaux). Les deux tables coexistent, et rien ne garantit qu'elles
racontent la même chose.

**Décision à prendre :** retirer `class_schedules`, ou écrire noir sur blanc
qu'elle n'est plus lue par la cantine et par qui elle l'est encore.

## 3.6 ⚠️ Deux fichiers portent le numéro ADR-005

**C'est un fait, pas une hypothèse :**

| Fichier | Décision | Date | Ajouté au dépôt |
|---|---|---|---|
| `ADR-005-totvs-rastreabilidade-no-dono-do-dado.md` | TOTVS : la traçabilité reste chez le propriétaire de la donnée | **14/08/2026** | 14/08 (`b388275`) |
| `ADR-005-creneaux-cantine.md` | Le planning de cantine devient une configuration | **26/08/2026** | 25/08 (`7567a75`) |

**Tranché le 04/09/2026 : on ne renumérote rien.** La règle est de citer le nom
de fichier complet, jamais le seul numéro — ce que le chapitre 5 pratiquait déjà.

⚠️ **La proposition qui figurait ici était périmée, et il faut savoir pourquoi**,
parce que c'est une leçon sur les propositions écrites et jamais relues. Elle
suggérait de faire des créneaux l'`ADR-006`. Elle a été écrite le 31/08 à 10h42
(`0060f0b`) ; l'`ADR-006` — la licence — a été créé **le même jour à 19h58**
(`473f45c`), puis mis en production le 01/09. L'`ADR-007` a pris le suivant le
02/09. Neuf heures et seize minutes séparaient une proposition de sa péremption,
et personne ne l'a relue en huit jours : l'appliquer aurait recréé exactement la
collision qu'elle réparait.

Le détail du coût — vingt-neuf renvois par nom, six par numéro nu dont un dans
la base — est au chapitre 3.

**Ce qu'il faut faire :** renommer le fichier des créneaux, corriger son titre
et son en-tête, et vérifier les renvois — `grep -rn "ADR-005" docs/ .claude/ CLAUDE.md`
avant et après.

---

# PRIORITÉ 4 — en attente d'une décision ou d'un tiers

## 4.1 Les horaires réels de la maternelle et de l'élémentaire

**Mesuré le 26/08 : service réel de 11h54 à 12h37.** Cela **contredit** les
horaires supposés.

⚠️ **Aucun horaire n'a été semé pour ces classes, et c'est délibéré.** Inventer
un créneau aurait produit de fausses alertes dès le premier jour. Elles tombent
donc dans `MEAL_SLOT_NOT_CONFIGURED` — le système dit « je ne sais pas », ce qui
est vrai.

**Il faut la décision de la Vie Scolaire**, pas une mesure supplémentaire.

## 4.2 Six classes de collège du mercredi 13h à confirmer

**1E1, 1E2, 2E1, 2E2, 3E1, 3E2.**

**Ce n'est plus une question de fait : la mesure a tranché.** 89 passages sur ces
six classes, et ceux de `3E1` et `3E2` concentrés entre 13h08 et 13h32. Vingt
passages en vingt-quatre minutes, c'est une classe qui vient à son heure ; un
débordement d'un autre service arriverait dispersé. Le tableau complet est en
tête de `docs/operacional/handoff.md`. **L'affiche est incomplète, pas les élèves
en faute.**

`[À COMPLÉTER PAR LA VIE SCOLAIRE]` Valider que ces six classes sont bien au
second service du mercredi, pour que le `Planning Cantine` les nomme et que
l'affiche du mur les annonce.

⚠️ **Cette question n'est plus adressée à Sammy, et c'est le changement.** Il ne
peut pas y répondre seul : fixer l'heure de service d'une classe est un acte de
Vie Scolaire, pas une lecture de la base. État au 04/09/2026 : non validée.
Tant qu'elle ne l'est pas, l'affiche que lisent **les familles** n'annonce pas
l'heure à laquelle ces six classes mangent — soit elles viennent à une heure que
l'école ne publie pas, soit l'école en publie une où elles ne vont pas.

## 4.3 `5E3` et `3E3` : sur l'affiche, aucun élève en base

Elles figurent au mur et sont chargées dans le planning ; **aucun élève ne leur
est rattaché**. `5E3` est même absente de `class_schedules`.

Elles ne changent le verdict de personne. Elles signalent soit un code de classe
qui a changé, soit une classe qui n'existe plus. Le détail est dans
`docs/operacional/controle-affiche-cantine.md`, section A.

**Il faut une réponse de la Vie Scolaire** : ces classes existent-elles encore,
et sous quel code ?

## 4.4 La liste DAF — ✅ la demande n'a jamais été lancée

*(Répondu par Sammy le 31/08/2026.)* Elle n'a été formalisée auprès de personne.
**Ce n'est donc pas une relance, c'est une démarche à initier.**

⚠️ **Ce que cela laisse en place, et pourquoi l'ordre compte :** en attendant,
**995 personnes** (874 élèves + 121 personnels) ont un droit au repas accordé
**en bloc**, « temporairement », sans échéance ni processus de sortie.
**Ne retirez pas ce droit avant d'avoir la liste** — l'inverse affamerait ceux
qui y ont droit pour punir ceux qui n'y ont pas droit. Requête de contrôle au
§ 8.2.8 du handoff.

## 4.5 Le terminal `.10` non enregistré au HikCentral — ✅ un ticket existe

Erreur `SYS[904]`, numéro de série en conflit. *(Répondu par Sammy le 31/08.)*
**Un ticket est ouvert chez le fournisseur** — le revendeur qui a livré les
terminaux.

**[À COMPLÉTER — la référence du ticket et le nom du contact n'ont pas pu être
retrouvés.]** **Où chercher :** la messagerie de Sammy, ou le service informatique
de l'établissement, qui a traité la commande. ⚠️ **Sans la référence, rouvrir une
demande revient au même :** l'erreur `SYS[904]` et le numéro de série suffisent à
décrire le cas.

## 4.6 Le terminal `.14` en Wi-Fi — ✅ définitif, ce n'est pas une action ouverte

*(Répondu par Sammy le 31/08.)* **L'emplacement ne permet pas de tirer un câble.**
C'est une **contrainte permanente**, pas une tâche en attente : ne la comptez
plus comme du travail à faire.

C'est donc lui qui perdra des paquets et videra une file d'un coup — exactement
le scénario de la première leçon d'horloge (chapitre 8). Le système sait déjà
absorber une file rejouée (`EventTimeResolver` écrit l'heure de l'**événement**).
Ce qui reste est la dette « les règles sont jugées à l'heure de la décision ».

## 4.7 L'interface servie par la VM / la mise à jour automatique

**La conception est faite, la décision est reportée.** Aujourd'hui chaque poste
porte sa propre copie du frontend, et une mise à jour se distribue **à pied**.

**Décision à prendre :** servir l'interface depuis la VM (une seule version, mise
à jour instantanée, mais dépendance au réseau), ou garder le portable (autonome
hors ligne, mais distribution manuelle).

⚠️ Le portable a une propriété que la VM n'aurait pas : **il fonctionne quand le
réseau tombe.** Ce n'est pas un détail dans une école.

## 4.8 L'e-mail à Fabiano et le PDF du guide — ✅ les deux sont partis

*(Répondu par Sammy le 31/08.)* L'e-mail au service informatique a été envoyé et le
PDF du guide d'installation a été remis. **Rien à relancer.** La source reste
`docs/operacional/guide-installation-postes.md` : c'est elle qu'il faut mettre à
jour puis réexporter si la procédure change.

⚠️ **Ce qui reste ouvert, c'est le contact lui-même.** Sammy ne se souvient ni du
nom complet de Fabiano, ni de son e-mail, ni de l'état des réservations DHCP.
**[À COMPLÉTER — Sammy n'a plus l'information.]**
**À qui demander :** le secrétariat ou la direction connaissent le service
informatique. **Ce qu'il faut lui demander :** « les adresses IP des six
terminaux et de la VM `192.168.1.253` sont-elles réservées en DHCP, ou
peuvent-elles encore changer ? »
**N'attendez pas la réponse pour vous protéger :** la méthode empirique du
handoff (§ 2.1) donne le risque réel en une requête, sans contact.

---

## 5. Ce qui n'est PAS sur cette liste, et pourquoi

Trois choses reviennent régulièrement et **ne doivent pas être « corrigées »** :

1. **Le système n'ouvre pas les portes.** Ce n'est pas une lacune (ADR-003).
2. **Les règles sont évaluées à l'heure de la décision.** C'est une dette
   **assumée** : la changer permettrait à une file hors ligne de transformer un
   refus en autorisation rétroactivement.
3. **Les deux couches HTTP du frontend.** Dette connue. **Ne pas en créer une
   troisième** ; consolider est un chantier à part.

Chacune est gelée par un test ou par un ADR. Les « corriger » sans décision
ferait échouer une suite qui protège un choix.

---

## 6. Où regarder ensuite

| Question | Document |
|---|---|
| Le défaut du portail, avec ses chiffres | `docs/operacional/handoff.md` (en tête) |
| Ce qui a été écarté, ce qui reste à mesurer | `docs/operacional/diagnostic-portaria-2026-08-27.md` |
| Les 14 réserves, en détail | `docs/operacional/nuit-26-27-08-rapport.md` §5 |
| Le balayage : corrigé vs listé | `docs/operacional/nuit-27-28-08-rapport.md` §6 |
| Les classes de l'affiche contre la base | `docs/operacional/controle-affiche-cantine.md` |
| Les demandes au service informatique | `docs/testing/pedidos-fabiano-si.md` |
| Les questions pour Sammy, toutes ensemble | `docs/operacional/handoff.md` §11 |
