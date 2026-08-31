# Le livre du système — MAGBO Access Control

**Lycée Molière, Rio de Janeiro.** Écrit le 29/08/2026, contre l'état du dépôt
au commit `7c4d54e`.

Ce livre existe parce que Sam — le propriétaire et unique développeur du
système — est parti. Il s'adresse à quelqu'un qui n'a jamais vu MAGBO tourner et
qui ne peut poser de question à personne.

---

## ⚠️ Comment lire ce livre

**Chaque affirmation technique est vérifiable dans le dépôt.** Quand un fichier
est cité, c'est qu'il dit ce qui est écrit. Deux marqueurs signalent les
limites :

| Marqueur | Ce qu'il veut dire |
|---|---|
| `[À VÉRIFIER]` | je n'ai pas pu le confirmer depuis le dépôt — suivi de **la commande ou la requête qui le tranche** |
| `[À COMPLÉTER PAR SAM]` | seul Sam le savait — suivi de **la question précise** |
| `[CAPTURE: …]` | une capture d'écran manque à cet endroit |

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

```bash
node scripts/build-livre.js
```

Produit `docs/livre/livre-complet.html` : tous les chapitres, un seul fichier
autonome (aucun script, aucune requête réseau — il s'ouvre depuis une clé USB
sur un poste hors ligne).

**Pour le PDF :** ouvrir le fichier dans un navigateur, `Ctrl+P`, **cocher
« Graphiques d'arrière-plan »**, enregistrer en PDF.

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
