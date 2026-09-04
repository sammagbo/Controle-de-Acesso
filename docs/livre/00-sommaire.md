# Le livre du système — MAGBO Access Control

**Lycée Molière, Rio de Janeiro.** Écrit le 29/08/2026, contre l'état du dépôt
au commit `7c4d54e`.

Ce livre existe parce que Sammy — le propriétaire et unique développeur du
système — est parti. Il s'adresse à quelqu'un qui n'a jamais vu MAGBO tourner et
qui ne peut poser de question à personne.

---

## ⚠️ Comment lire ce livre

**Chaque affirmation technique est vérifiable dans le dépôt.** Quand un fichier
est cité, c'est qu'il dit ce qui est écrit. Trois marqueurs signalent les
limites :

| Marqueur | Ce qu'il veut dire |
|---|---|
| `[À VÉRIFIER]` | je n'ai pas pu le confirmer depuis le dépôt — suivi de **la commande ou la requête qui le tranche** |
| `[À COMPLÉTER PAR SAMMY]` | seul Sammy le savait — suivi de **la question précise** |
| `[CAPTURE: …]` | une capture d'écran manque à cet endroit — la case **nomme le fichier attendu** ; le mode d'emploi est dans `docs/livre/captures/LISEZ-MOI.md` |

> **Une documentation fausse est pire qu'absente, parce qu'on lui fait
> confiance.** Si vous trouvez une affirmation que le dépôt contredit,
> corrigez-la dans `docs/livre/` et régénérez le HTML.

---

## Par où commencer

**Il y a un problème maintenant** → `docs/operacional/handoff.md`. C'est l'état
opérationnel du jour : le défaut ouvert en tête, les cinq gestes d'urgence, le
rite de déploiement. Ce livre explique le système ; le handoff le fait tourner.

**Vous reprenez le système** → chapitres 1, 2, 6, puis 9.

**Vous reprenez le code** → chapitres 1, 3, 7, 8.

**Vous formez quelqu'un** → chapitres 1, 4, 5.

---

## Les neuf chapitres

| # | Chapitre | Ce qu'il répond |
|---|---|---|
| **1** | [Vue d'ensemble](01-vue-ensemble.md) | Ce que le système fait, ce qu'il **n'est pas**, et le chemin d'un passage de la porte à l'écran |
| **2** | [Les points de passage](02-points-de-passage.md) | Portail, CDI, cantine, infirmerie : le matériel, les règles propres, les pièges — et le défaut ouvert du portail |
| **3** | [Les règles métier](03-regles-metier.md) | Droits repas, créneaux, flags, exclusions, régimes, PPMS, déduplication, permissions — et à quelle heure chaque règle est jugée |
| **4** | [Guide de l'opérateur](04-guide-operateur.md) | Par profil : ce que chaque alerte veut dire, et **quoi faire** |
| **5** | [Administration](05-administration.md) | Opérateurs et permissions, imports et leurs pièges, photos, planning, écran de configuration |
| **6** | [Exploitation](06-exploitation.md) | La VM, le `.env`, le rite de déploiement, les migrations, la sauvegarde, le portable, et le tableau symptôme → geste |
| **7** | [Architecture technique](07-architecture-technique.md) | Backend, frontend, base, tests — et **pourquoi** ils sont faits comme ça |
| **8** | [Les leçons du projet](08-lecons.md) | Chaque défaut qui a coûté quelque chose : contexte → symptôme → cause → correction → **règle** |
| **9** | [Ce qui reste](09-ce-qui-reste.md) | Liste datée et priorisée de ce qui est ouvert |

---

## Les trois choses à savoir avant tout le reste

Si vous ne lisez qu'une page, lisez celle-ci.

**1. ⚠️ Le système n'ouvre et ne ferme aucune porte.**
Le webhook est post-événement : quand MAGBO apprend qu'une personne est passée,
elle est déjà passée. Quand un écran dit « refusé », c'est une décision
**logique**, écrite pour être lue. Ce n'est pas une lacune à combler :
c'est [ADR-003](../architecture/decisoes/ADR-003-webhook-pos-evento.md), et la
moitié du code en dépend.

**2. ⚠️ « Je n'ai pas vu » n'est pas « il n'était pas là ».**
`PENDING`, `INCONNU`, « aucun passage vu », un compteur à `—` : ce sont des
états qui disent *je ne sais pas*. Les lire comme des refus fait accuser
quelqu'un à la place d'une case vide. C'est la leçon 13 du chapitre 8, et elle
revient partout.

**3. ⚠️ Il y a toujours deux heures.**
Celle où la chose est arrivée, celle où le programme l'a apprise. Elles sont
identiques — jusqu'au jour où une file se vide, où un conteneur démarre en UTC,
ou où il est 21 h à Rio. Ce piège a mordu **quatre fois**. Il ouvre le
chapitre 8.

---

## Le livre imprimable

Deux commandes, et la seconde est celle qui compte pour l'imprimeur.

```bash
node scripts/build-livre.js      # le HTML, depuis docs/livre/*.md
node scripts/paginer-livre.js    # les vrais numéros de page + le PDF
```

La première produit `docs/livre/livre-complet.html` : tous les chapitres, un
seul fichier autonome (aucun script, aucune requête réseau — il s'ouvre depuis
une clé USB sur un poste hors ligne).

La seconde produit `docs/livre/livre-complet.pdf`, prêt à relier. Elle fait
deux choses qu'une feuille de style ne sait pas faire :

1. **Elle numérote la table des matières.** En CSS d'impression cela s'écrit
   `target-counter()`, que Chrome ne connaît pas — mesuré : le parseur jette la
   déclaration entière, on perd le numéro *et* le texte qui l'accompagne. La
   seule méthode exacte est de poser la question au PDF : chaque chapitre
   ouvre sur une page neuve, donc on imprime le livre arrêté juste avant le
   chapitre *k*, on compte les pages, et on sait. Les numéros mesurés vivent
   dans `docs/livre/pagination.json` ; sans ce fichier, la table des matières
   renvoie aux chapitres **sans numéro** — dégradé, jamais faux.
2. **Elle refuse un livre réduit.** Quand un élément dépasse la largeur
   imprimable, Chrome ne le coupe pas et n'avertit pas : il réduit *tout le
   document*. Le livre sortait ainsi à 80,7 % — un corps déclaré à 10,5 pt
   imprimé à 8,5 pt, sur les 84 pages, et rien nulle part pour le dire. Le
   script mesure le facteur d'échelle dans le PDF et s'arrête s'il n'est pas
   exactement `0.750000`, en nommant les éléments qui débordent.

**À la main, sans les scripts :** ouvrir le HTML dans un navigateur, `Ctrl+P`,
A4, marges « Par défaut », **cocher « Graphiques d'arrière-plan »**, et
**« Taille réelle »** — jamais « Ajuster à la page », qui détruirait les marges
de reliure.

⚠️ Le style d'impression porte `print-color-adjust: exact` — sans cette ligne,
le navigateur **jette les fonds colorés** et le livre sort en gris. C'est la
même ligne qui fait la couleur de l'affiche cantine ; la leçon a déjà été payée
une fois.

---

## Ce que ce livre ne remplace pas

| Document | Ce qu'il porte |
|---|---|
| `docs/operacional/handoff.md` | **l'état du jour** — à ouvrir en premier en cas de problème |
| `docs/manual-utilisateur.md` | chaque écran, bouton par bouton |
| `docs/operacional/reconstruir-do-zero.md` | reconstruire et restaurer, commandes exactes |
| `docs/operacional/guide-installation-postes.md` | installer un poste |
| `deploy/migrations/README.md` | chaque migration, une par une |
| `docs/architecture/decisoes/` | pourquoi chaque décision structurelle a été prise |
| `.claude/rules/` | les pièges par domaine, pour qui écrit du code |

---

## ⚠️ Ce que la mise en page n'a pas encore — mesuré le 03/09/2026

Ces quatre points ont été **mesurés**, et délibérément **non corrigés** : ils
changent l'objet physique, et cela se décide avant d'être imprimé, pas après.

**1. Trois chapitres sur neuf s'ouvrent encore sur un VERSO** (une page de
gauche) : les chapitres **2, 8 et 9**, aux feuilles 24, 94 et 102. Les six
autres, chapitre 1 compris, s'ouvrent bien au recto.

Ce qui gouverne cela est la **parité** : les liminaires occupent **douze** pages,
un nombre pair, donc le folio 1 tombe sur la feuille 13, une page de droite.
Quand elles étaient **onze**, c'était l'inverse — six chapitres au verso, et
tous les folios impairs à gauche. Cette page-ci a fait passer les liminaires de
onze à douze, et a donc corrigé six ouvertures sur neuf **par accident**.
⚠️ Ce qui est fragile est exactement cela : la parité tient à la longueur d'un
texte, et personne ne le saura en le modifiant.

`break-before: right`, qui règlerait tout en une ligne, **ne fonctionne pas dans
Chrome** (vérifié : 4 pages produites au lieu de 6, dans les deux orthographes).
*Le correctif :* `scripts/paginer-livre.js` doit **calculer** les pages blanches
— il connaît déjà la parité de chaque début de chapitre — et les faire écrire
par `build-livre.js`, avec une passe de convergence, puisque insérer une page
blanche déplace tous les chapitres suivants. C'est un petit chantier, pas un
réglage, et c'est pour cela qu'il n'a pas été fait dans la précipitation d'un
dernier jour.

**2. Le PDF porte dix-neuf liens `file:///C:/Users/…`**, fabriqués par Chrome
qui absolutise les liens relatifs en annotations. Le texte imprimé, lui, est
juste. Ces annotations sont mortes pour tout lecteur et **font voyager un nom
de compte Windows** jusque chez l'imprimeur.
*Le correctif :* imprimer le PDF final depuis une copie où les `href` qui ne
commencent ni par `#` ni par `http` ont été retirés — les ancres internes du
sommaire, elles, doivent survivre.

**3. « L'architecture en une page » tient sur deux pages** (folios 2 et 3) : le
titre ne garde que cinq lignes d'un bloc d'une soixantaine, et la figure se lit
à cheval sur un pli. `pre.code { break-inside: auto }` est le bon choix pour les
blocs longs — mais celui-là est une **figure**, pas du code à dérouler.

**4. Cette page-ci n'a ni folio ni entrée au sommaire** : la section `00` est
traitée comme une liminaire, alors qu'elle porte du contenu véritable — celui
que vous lisez. Personne ne peut le citer par un numéro de page. Le colophon
annonce d'ailleurs « neuf chapitres, plus le sommaire », alors qu'il y a bien
une dixième section.

> ⚠️ **Et une limite qui vaut pour tout ce livre :** chaque nombre ci-dessus a
> été mesuré avec **Chrome 152.0.7977.75**. `trouverChrome()` accepte Edge ou
> Chromium en remplacement **sans contrôler la version**. Une autre machine peut
> donner un autre nombre de pages pour le même fichier — c'est pourquoi les
> numéros du sommaire portent une empreinte et se refusent quand elle ne colle
> plus, plutôt que d'être crus sur parole.
