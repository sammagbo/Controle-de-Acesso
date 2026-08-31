# Chapitre 4 — Guide de l'opérateur

Ce chapitre s'adresse aux personnes qui utilisent le système tous les jours. Il
répond à une seule question, mais pour chaque situation : **le système vient de
me dire quelque chose — qu'est-ce que je fais ?**

Le détail écran par écran vit dans `docs/manual-utilisateur.md` (964 lignes).
Ce chapitre ne le recopie pas : il donne les gestes et renvoie.

> ⚠️ **La règle qui vaut pour tout ce chapitre : le système n'a bloqué
> personne.** Quand un écran affiche un refus, la personne est **déjà passée**.
> L'alerte s'adresse à l'adulte présent, et ce qui se passe ensuite lui
> appartient. Voir chapitre 1, ADR-003.

---

## 1. Par profil — ce que vous ouvrez le matin

### Portaria

**Vous voyez :** l'écran du portail, avec les passages en direct.

**Votre geste quotidien :** enregistrer à la main le passage de quelqu'un que la
reconnaissance n'a pas vu. Le bouton est sur l'écran du secteur ; la personne
est cherchée par nom ou par matricule.

⚠️ **Une saisie manuelle laisse une signature** : votre login part dans
`created_by_user`. Ce n'est pas une surveillance, c'est ce qui permet de
répondre, six mois plus tard, à « d'où vient cet enregistrement ». Voir le
chapitre 3.

**Ce que vous ne pouvez pas faire :** effacer un passage. Rien ne s'efface.

### Cantine

**Vous voyez :** le **Moniteur Cantine**, trois colonnes qui se rafraîchissent
toutes les 3 secondes, et à droite le flux des tentatives refusées.

| Colonne | Ce qu'elle contient |
|---|---|
| **Dans la cantine** | les personnes entrées, qui n'ont pas encore de sortie |
| **Doit sortir** | celles dont le séjour dépasse le plafond — **la seule colonne sur laquelle on agit** |
| **Sortis** | celles qui sont sorties, gardées visibles un moment |

**Votre geste quotidien :** regarder la colonne du milieu, et appliquer les
exceptions que le règlement vous laisse (ADR-004 : le MAGBO valide la règle,
**vous** appliquez l'exception).

**Le `×` d'une ligne** la retire de **votre écran**, pas de la base : le passage
reste enregistré, la présence PPMS reste ouverte, les rapports le comptent
toujours. Une confirmation vous le dit avant.

### CDI

**Vous voyez :** la liste des présents, un champ de scan, et le compteur avec la
capacité.

**Votre geste quotidien :** rien, la plupart du temps — les passages arrivent
seuls par le terminal. Vous pointez à la main quand quelqu'un entre sans badger.

⚠️ **À 17:00, tout le monde est fermé automatiquement.** Ce n'est pas une
erreur : sans ça, l'écran ouvrirait le lendemain avec les gens de la veille.
Les sorties automatiques sont marquées et reconnaissables.

### Vie Scolaire

**Vous voyez :** l'écran d'accueil, avec **la barre de recherche au centre**.

**Votre geste quotidien :** taper un nom. Les suggestions arrivent à la frappe,
les flèches et Entrée les parcourent, et le **parcours du jour** s'ouvre : où
la personne est entrée, à quelle heure, où elle est allée ensuite.

⚠️ **Les trois réponses, et ce qu'elles veulent dire :**

| Réponse | Ce que ça veut dire |
|---|---|
| **Dans \<zone\>, depuis HH:MM** | le dernier événement est une entrée |
| **Sorti de \<zone\> à HH:MM** | le dernier événement est une sortie — **la personne n'y est plus** |
| **Aucun passage vu aujourd'hui** | le système **n'a rien vu**. Ce n'est **pas** « absent » |

⚠️ **« Aucun passage vu » ne veut pas dire « absent ».** Un enfant entré par une
porte non équipée est à l'école sans une seule ligne. C'est la distinction la
plus importante de tout le système : voir chapitre 8, « je n'ai pas vu ≠ il
n'était pas là ».

### Direction

**Vous voyez :** les rapports, les KPI, le PPMS.

⚠️ **Le PPMS ne remplace pas l'appel.** L'écran le dit lui-même, au-dessus du
nombre. Il donne un point de départ, avec l'heure du portrait en évidence, et un
cache local pour le cas où le réseau tombe — c'est la première chose qui tombe
dans une urgence.

---

## 2. Les alertes du CDI — les trois sons et ce qu'ils veulent dire

⚠️ **Il n'y a aucun fichier audio.** Les sons sont synthétisés dans le
navigateur (`js/cdi/cdiData.js`). C'est pourquoi ils fonctionnent sur un poste
hors ligne.

| Son | Ce qu'on entend | Quand | **Ce que vous faites** |
|---|---|---|---|
| **Succès** | une note brève, aiguë (880 Hz) | entrée normale | rien |
| **Sortie** | une note plus grave (440 Hz) | sortie normale | rien |
| **Erreur** | double bip grave et sec (220 Hz, carré) | carte inconnue | la personne n'est pas au fichier — la pointer à la main, ou la signaler |
| **Capacité** | **deux notes descendantes** (520 → 390 Hz) | le seuil de capacité vient d'être franchi | la salle est pleine. **La porte s'ouvre quand même** — à vous de voir |
| **Exclusion** | **grave → aigu → grave**, plus fort que le reste | une personne exclue vient d'entrer | voir ci-dessous |

⚠️ **Le son d'exclusion commence par le grave, et c'est délibéré.** La première
version ouvrait sur un aigu bref — c'est-à-dire sur ce qu'est le son de succès
en entier. À un comptoir, on est déjà passé au suivant avant la deuxième note.
Il est aussi **plus fort** que les autres : celui qui compte ne peut pas être au
même volume que la routine.

### Quand l'alerte d'exclusion sonne

L'écran affiche **le nom, la classe et la photo** — de quoi reconnaître la
personne.

⚠️ **Il n'affiche PAS le motif, et c'est voulu.** Le motif d'une exclusion est
une donnée sensible sur un mineur, lisible seulement avec la permission dédiée —
et l'écran du CDI est visible depuis le comptoir, par d'autres élèves.

**Ce que vous faites :** vous savez que cette personne ne devrait pas être là.
Ce que vous en faites relève de vous et du règlement. La modale affiche la date
de fin quand il y en a une (« jusqu'au 5 »), ce qui vous donne une phrase à dire
sans rien révéler de la sanction.

**Échap la ferme**, et le bouton prend le focus — pas besoin de la souris.

---

## 3. Les flags de la cantine — le tableau à connaître

| Flag | Ce que ça veut dire | **Ce que vous faites** |
|---|---|---|
| `AVANT_CRENEAU` | la personne est passée **avant** son créneau | rien d'urgent. Si ça se répète pour toute une classe, le planning est peut-être faux — voir le chapitre 5 |
| `APRES_CRENEAU` | passée **après** son créneau | idem |
| passage trop court (< 15 min) | entrée puis ressortie très vite — **elle n'a probablement pas mangé** | ce n'est **ni un refus ni une accusation**. C'est un signal : elle est venue chercher quelqu'un, a renoncé à la file, ou le lecteur de sortie l'a attrapée en passant |
| séjour trop long (> 30 min) | elle est là depuis longtemps | c'est la colonne « Doit sortir ». C'est là qu'on agit |
| `FORA_HORARIO` | hors de la fenêtre de la cantine | idem `AVANT`/`APRÈS`, forme ancienne |
| `POSTO_FIXO` | quelqu'un qui **travaille** à ce point y repasse | rien. C'est du bruit attendu, écarté des écrans standard |
| `JA_PRESENTE` | entrée alors que la personne est déjà dedans | rien. La visite n'est pas rouverte |
| `FECHAMENTO_AUTO` | sortie posée automatiquement à l'heure de fermeture | rien. C'est le système qui range |
| `EXCEDEU_TEMPO` | le plafond de durée a été dépassé | idem « séjour trop long » |

⚠️ **Les deux dernières lignes du tableau sont des marques de RÉPÉTITION**
(`POSTO_FIXO`, `JA_PRESENTE`) : ces passages ont bien eu lieu, ils sont bien
enregistrés, ils sortent seulement des écrans standard et des compteurs. **Rien
n'est effacé** — le Journal les montre, avec une lentille pour les filtrer.

---

## 4. Le flux des tentatives refusées — chaque motif, et le geste

C'est le panneau rouge, à droite du Moniteur et sur l'écran du portail.

⚠️ **Un « refus » ici n'a fermé aucune porte.** C'est une décision **logique**,
écrite pour que quelqu'un puisse la lire.

| Motif | Ce que ça veut dire | **Ce que vous faites** |
|---|---|---|
| `MEAL_NOT_ENTITLED` | pas de droit au repas enregistré | vérifier avec la Vie Scolaire. Si c'est une erreur, l'écran Droits Repas la corrige |
| **`PENDING`** *(statut, pas un refus)* | ⚠️ **la case n'a jamais été remplie** | **ce n'est PAS un refus.** C'est l'état de 923 élèves le jour 1. À traiter comme une donnée manquante |
| `DUPLICATE_MEAL` | deuxième repas dans la journée | regarder. C'est souvent une double lecture, pas une fraude |
| `OUTSIDE_MEAL_TIME` | hors de la fenêtre | voir les flags ci-dessus |
| `MEAL_SLOT_NOT_CONFIGURED` | ⚠️ **le système ne sait pas** à quelle heure cette classe mange | **ce n'est pas un refus** : c'est un trou dans le planning. Signaler la classe à la Vie Scolaire — elle apparaîtra dans le contrôle de l'affiche |
| `EXIT_NOT_AUTHORIZED` | pas d'autorisation de sortie | c'est le motif qui compte au portail. Vérifier auprès de la Vie Scolaire |
| `OUTSIDE_EXIT_WINDOW` | autorisation existante, mais hors de sa plage horaire | idem |
| `REGIME_NOT_ALLOWED` | le régime annuel ne permet pas cette sortie | voir chapitre 3, les cinq verdicts |
| `REGIME_TO_VERIFY` | ⚠️ **le système ne sait pas** : ça dépend d'une heure de cours qu'il n'a pas | **ce n'est pas une objection.** L'écran vous dit quoi vérifier |
| `REGIME_UNKNOWN` | aucun régime enregistré pour cet élève | l'état normal tant que les régimes ne sont pas chargés. Ne laisse pas de trace, exprès |
| `USER_INACTIVE` | la personne est désactivée au fichier | vérifier : départ, ou erreur de saisie ? |
| `UNKNOWN_USER` | l'identifiant n'existe pas au fichier | probablement quelqu'un qui n'a jamais été importé |
| `UNKNOWN_FACE` | ⚠️ le portail n'a **pas** reconnu ce visage | voir le chapitre 2 : c'est le défaut ouvert du portail |
| `AMBIGUOUS_NAME` | le nom correspond à **plusieurs** personnes | le système refuse de choisir. Il a raison |
| `MISSING_DOOR_MAPPING` | l'IP du terminal n'est pas dans la table | **problème technique** : une IP a changé. Voir chapitre 6 |
| `DEVICE_DENIED` | c'est **le terminal** qui a refusé, pas le MAGBO | validité expirée sur l'appareil, ou sous-type inconnu |

⚠️ **Trois de ces motifs disent « je ne sais pas », pas « non »** :
`PENDING`, `MEAL_SLOT_NOT_CONFIGURED` et `REGIME_TO_VERIFY`. Les traiter comme
des refus fait accuser des gens à la place d'une case vide. Les écrans les
peignent différemment pour cette raison.

---

## 5. Les couleurs et ce qu'elles promettent

Une convention tient dans tout le système, et elle vaut la peine d'être connue :

| Couleur | Ce que ça veut dire |
|---|---|
| **Rouge** | quelque chose que quelqu'un doit regarder maintenant |
| **Ambre** | le système ne sait pas, ou une situation à vérifier |
| **Ardoise / gris clair** | information de configuration — le genre qu'on apprend à ignorer |
| **Vert** | normal |

⚠️ C'est pourquoi `REGIME_UNKNOWN` est **ambre et non gris** : le gris clair est
la couleur de `MISSING_DOOR_MAPPING`, que l'opérateur a appris à lire comme
« affaire de technicien ». Un verdict qui a besoin d'être vu ne peut pas porter
la couleur de ce qu'on ignore.

---

## 6. Trois choses à ne jamais conclure d'un écran

1. **« Le compteur dit 0, donc il n'y a personne. »** Non : ça peut vouloir dire
   que le cache n'est pas encore chargé. Les écrans affichent **« — »** pour
   « je ne sais pas » et **« 0 »** pour zéro — la différence est délibérée.
2. **« Il n'y a pas de ligne, donc ça n'est pas arrivé. »** Le registre des
   alertes du CDI (chapitre 3) n'écrit que quand l'écran est ouvert. `access_logs`,
   lui, ne dépend d'aucun écran — c'est là qu'il faut regarder.
3. **« L'écran est vide, donc le système est en panne. »** Sur un poste, une
   application vide vient presque toujours du lancement par le `.exe` au lieu du
   `.bat`. Voir chapitre 6.

---

## 7. Où regarder ensuite

| Question | Document |
|---|---|
| Chaque écran, bouton par bouton | `docs/manual-utilisateur.md` |
| Le guide dédié de la cantine | `docs/operacional/guia-operador-cantina.md` |
| D'où vient une règle, et pourquoi | chapitre 3 |
| Un problème technique (rien n'arrive, écran vide, heures fausses) | chapitre 6, et `docs/operacional/handoff.md` §7 |
| Administrer les droits, les imports, le planning | chapitre 5 |
