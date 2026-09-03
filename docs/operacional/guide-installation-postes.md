# Installer MAGBO Access Control sur un poste

**Septembre 2026 · l'application s'ouvre par son `.exe`**

Compter **cinq minutes par machine**. Aucune connaissance technique : copier un
fichier, l'ouvrir, répondre à deux questions une seule fois.

> **Ce qui a changé.** L'application s'ouvrait par `Abrir-MAGBO.bat`, un fichier
> texte sans icône qu'il fallait modifier au Bloc-notes — et il fallait
> expliquer à chaque personne de **ne surtout pas** cliquer sur l'icône qui
> porte le logo. Désormais on clique sur l'application, comme sur Pronote ou
> Chrome. Elle demande son réglage la première fois, et plus jamais ensuite.
>
> ⚠️ **Les postes déjà installés continuent de fonctionner sans être touchés.**
> Un `.bat` qui existe garde la priorité. Voir la section 8.

---

## Avant de commencer

| À vérifier | Comment | Attendu |
|---|---|---|
| Le serveur répond | Ouvrir `http://192.168.1.253:8080/api/health` dans un navigateur **du poste** | Une réponse contenant `"database":"CONNECTED"` |
| Le poste est sur le réseau de l'école | — | Si la page ci-dessus ne s'ouvre pas, inutile de continuer : c'est le réseau, pas l'installation |
| Vous savez où se trouve ce PC | Portail ? CDI ? Cantine ? | L'application proposera la liste — rien à retenir |

**Récupérer le programme :** `MAGBO-Access-Control-Portable.exe`. C'est **le
seul fichier à copier**.

> ⚠️ **Où le prendre — à remplir avant la première tournée.**
>
> | | |
> |---|---|
> | Emplacement de l'exécutable approuvé | _(chemin du partage, ou étiquette de la clé USB)_ |
> | Date de construction | _(à noter en même temps)_ |
>
> Cette ligne existe parce qu'un guide qui renvoyait à `npm run build:portable`
> demandait, au premier geste du premier poste, un dépôt et des outils de
> développement que la personne qui installe n'a pas. La procédure de
> **construction** — pour qui reconstruit, pas pour qui installe — est dans
> [`release-portable.md`](release-portable.md), qui est écrit en portugais et
> adressé à Sam.
>
> ⚠️ Il n'y a **pas** de page « Releases » à télécharger. Le guide précédent en
> citait une, avec un numéro de version qui n'a plus cours.

---

## 1. Garder l'ancienne version de côté

Si le poste a déjà MAGBO, **ne rien supprimer**. Renommer le dossier :

```
MAGBO  →  MAGBO-ancien-2026-09-02
```

C'est le chemin de retour si quelque chose se passe mal en pleine journée. Il
pourra être effacé une semaine plus tard, une fois la nouvelle version éprouvée.

---

## 2. Copier le programme

Créer un dossier `C:\MAGBO` (ou l'emplacement habituel de ce poste) et y placer
le `.exe` :

```
C:\MAGBO\
   └── MAGBO-Access-Control-Portable.exe
```

C'est tout. Le fichier de réglage se créera tout seul à côté, à la première
ouverture.

> ⚠️ **Deux endroits à éviter pour ce dossier**, et la raison est la même dans
> les deux cas : l'application doit pouvoir **écrire** à côté du programme.
>
> - **`C:\Program Files\…`** — écriture interdite sans les droits
>   d'administrateur.
> - **Un dossier réseau** (`\serveur\partage\…`) — souvent en lecture seule,
>   et l'application dépendrait alors du réseau pour s'ouvrir.
>
> L'application ne bloque pas pour autant : si le dossier refuse l'écriture,
> elle range le réglage dans le profil Windows de la personne connectée
> (`C:\Users\<qui>\AppData\Roaming\MAGBO Access Control\magbo-poste.json`).
> **Le poste marche, mais le dossier n'est plus complet** : le copier sur une
> autre machine ne copie plus le réglage, et une autre personne qui ouvre une
> session sur ce PC retrouve l'écran de configuration. Un dossier local et
> inscriptible — `C:\MAGBO` — évite les deux.

---

## 3. Première ouverture

Double-cliquer sur **`MAGBO-Access-Control-Portable.exe`** — l'icône avec le
logo.

**Windows affiche un avertissement bleu** : « Windows a protégé votre
ordinateur ». C'est normal : l'application n'est pas signée numériquement, ce
qui est attendu pour un logiciel interne.

> Cliquer sur **« Informations complémentaires »**, puis sur
> **« Exécuter quand même »**. Cet avertissement n'apparaît qu'une fois par
> poste.

### L'écran de configuration

Il apparaît **une seule fois**, sur un PC neuf. Deux questions :

**1. L'adresse du serveur** — déjà remplie avec `http://192.168.1.253:8080`.
Ne pas y toucher, sauf si la VM a déménagé.

**2. Ce PC se trouve à** — choisir dans la liste :

| Ce qu'affiche la liste | Ce que ça règle | Code enregistré |
|---|---|---|
| Portail Principal | le poste du portail principal | `PORT1` |
| Portail Terrain | le portail latéral nord | `PORT2` |
| Garage | le portail latéral sud | `PORT3` |
| CDI | la banque de prêt | `BIBLIO` |
| Infirmerie | le poste de soins | `ENFERM` |
| Cantine Principale | le réfectoire 1 | `REFEI1` |
| Cantine Secondaire | le réfectoire 2 | `REFEI2` |
| **Poste administratif — pas un point de passage** | ce PC n'est posté nulle part | `ADMINISTRATIF` |

> ⚠️ **La troisième colonne n'est pas de la décoration.** C'est ce code qui
> s'écrit dans `magbo-poste.json` et que pose la ligne `set MAGBO_SECTOR=…`
> d'un ancien `.bat`. Pour les sept lieux, c'est aussi lui qui s'affiche dans
> la barre de titre ; **le poste administratif fait exception** : sa barre de
> titre porte « MAGBO Access Control — Poste administratif », jamais
> `ADMINISTRATIF`. Choisir « CDI » écrit **`BIBLIO`** : ce n'est pas une
> erreur, ce sont les deux noms de la même pièce — l'un pour les gens, l'autre
> pour le système.

### ⚠️ Les machines qui ne sont postées nulle part

**Vie Scolaire, direction, informatique** : ces PC ouvrent le panneau
d'administration, le planning, la recherche. Ils ne sont **pas** des points de
passage. Choisir **« Poste administratif — pas un point de passage »**.

| | |
|---|---|
| Ce que ça change | **rien**, sinon le titre de la fenêtre, qui affiche « MAGBO Access Control — Poste administratif » au lieu d'un code de portail |
| Ce que ça ne change pas | l'application est la même, les mêmes écrans s'ouvrent, les mêmes droits s'appliquent — et **un passage saisi à la main depuis ce PC compte comme partout ailleurs** : ce choix ne rend pas la machine inoffensive, il dit seulement qu'aucun portique n'y est raccordé |
| L'adresse du serveur | **toujours obligatoire**, et le test de connexion doit passer comme partout ailleurs |
| Le mode kiosque | **ne pas l'activer** sur ces machines (section 10) — il empêche d'utiliser normalement l'ordinateur |

> Pourquoi cette entrée existe : jusqu'ici l'écran obligeait à cocher un lieu.
> Le PC du directeur s'intitulait « MAGBO Access Control — PORT1 », et quelqu'un
> allait finir par croire que ce PC enregistrait des passages au portail.

> ⚠️ Ce choix sert à **identifier ce PC** : le nom apparaît dans la barre de
> titre de la fenêtre. C'est ce qui permet de dire au téléphone « le PC du CDI
> affiche ceci » sans se déplacer. Il ne change pas l'écran qui s'ouvre —
> l'application démarre sur le tableau de bord, comme avant.

### Puis : **Tester la connexion**

**Le bouton d'enregistrement reste fermé tant que le test n'a pas réussi.**
C'est voulu : un poste enregistré sur une mauvaise adresse s'ouvre tous les
matins sur un écran vide, et la personne devant lui n'a aucun moyen de deviner
que c'est l'adresse.

| Ce que dit le test | Ce que ça veut dire | Quoi faire |
|---|---|---|
| **Le serveur répond** | Tout va bien | Enregistrer |
| **Le serveur répond, mais sa base de données ne répond pas** | L'adresse est bonne, le serveur a un problème | Enregistrer quand même, et prévenir la direction |
| **Aucune réponse à cette adresse** | Adresse fausse, serveur éteint, ou PC hors du réseau | Vérifier les chiffres et le port, puis le réseau |
| **Le serveur n'a pas répondu à temps** | Souvent une adresse fausse sur le bon réseau | Vérifier les chiffres |
| **Quelque chose répond, mais ce n'est pas le serveur MAGBO** | L'adresse pointe vers un autre appareil de l'école | Vérifier l'adresse |

Puis **Enregistrer et ouvrir**. Le dossier contient maintenant :

```
C:\MAGBO\
   ├── MAGBO-Access-Control-Portable.exe
   └── magbo-poste.json          ← créé automatiquement
```

Ce fichier se lit au Bloc-notes. Il contient l'adresse et le poste, **rien
d'autre** — aucun mot de passe, aucun code.

---

## 4. Vérifier — à l'écran, pas seulement la fenêtre

Une fenêtre qui s'ouvre ne prouve rien. Se connecter, puis contrôler que les
**données apparaissent réellement** :

- [ ] La barre de titre porte le **code** du poste — pour le CDI :
      « MAGBO Access Control — BIBLIO » (troisième colonne de la section 3) ;
      **sur un poste administratif, elle porte
      « MAGBO Access Control — Poste administratif »**, sans code.
- [ ] Le tableau de bord affiche des chiffres, pas des zéros partout.
- [ ] **Rapport Général → Journal** : des lignes avec des noms de personnes.
- [ ] Le nom de l'opérateur connecté apparaît en haut à droite.

Si l'application s'ouvre mais reste vide, voir la section 7.

---

## 5. Le raccourci sur le bureau

Clic droit sur le `.exe` → **Envoyer vers** → **Bureau (créer un raccourci)**.

Le raccourci porte l'icône de l'application. ⚠️ **Il n'y a plus de piège** :
c'est bien sur cette icône qu'il faut cliquer. Si un ancien raccourci pointant
vers `Abrir-MAGBO.bat` existe encore, le supprimer — voir la section 8.

Pour un lancement automatique au démarrage : copier ce raccourci dans
`shell:startup` (touche Windows + R, taper `shell:startup`, Entrée).

> ⚠️ **Regarder ce que ce dossier contient déjà.** Sur un poste qui tournait
> avec l'ancienne version, c'est très souvent là — et pas sur le bureau — que
> vit le raccourci vers `Abrir-MAGBO.bat`. Un raccourci oublié dans
> `shell:startup` relance le `.bat` à **chaque ouverture de session** : il
> repose les variables, qui reprennent la priorité. Le poste semble
> « se dé-migrer » tout seul le lendemain matin, sans que personne n'ait rien
> touché.

---

## 6. Corriger un réglage plus tard

Sans réinstaller, et sans toucher au fichier.

**Engrenage → Poste.** L'onglet n'apparaît que pour un compte **administrateur**
ou porteur de la permission **Configuration**. Un opérateur ne peut pas changer
le poste par mégarde ; un administrateur corrige une erreur d'installation en
trente secondes.

L'écran est le même qu'à la première ouverture, test de connexion compris.

---

## 7. Si quelque chose ne va pas

| Symptôme | Cause probable | Remède |
|---|---|---|
| L'application s'ouvre **vide**, sans erreur | Mauvaise adresse de serveur | Engrenage → Poste → Tester la connexion (section 6) |
| Toujours vide, et le test réussit | Le serveur répond mais sa base est tombée | Prévenir la direction ; ce n'est pas le poste |
| L'écran de configuration revient **à chaque ouverture** | Le réglage n'est pas là où on le croit : soit le fichier a été supprimé, soit c'est un **autre compte Windows** qui ouvre la session (voir la ligne suivante) | Vérifier que `magbo-poste.json` est bien à côté du `.exe` |
| Le poste marche, mais `magbo-poste.json` n'est **pas** à côté du `.exe` | Le dossier refuse l'écriture (`Program Files`, dossier réseau) : le réglage est parti dans `AppData`, donc il ne vaut que pour ce compte Windows | Déplacer le dossier vers `C:\MAGBO`, rouvrir, répondre une fois de plus — encadré de la section 2 |
| « Windows a protégé votre ordinateur » | Application non signée | « Informations complémentaires » → « Exécuter quand même » |
| Le mauvais poste s'affiche dans le titre | Réglage à corriger | Section 6 |
| Le titre affiche un code de portail (`PORT1`, `BIBLIO`…) sur un PC **de bureau** | Ce PC a été réglé comme un point de passage alors qu'il n'en est pas un | Engrenage → Poste → **« Poste administratif — pas un point de passage »** → tester → enregistrer (sections 3 et 6). Si la liste est **grisée**, un `.bat` gouverne encore ce PC : section 8 d'abord |
| Le titre affiche « MAGBO Access Control » **tout court** | Ce PC n'est pas réglé du tout — ce n'est pas la même chose qu'un poste administratif, qui affiche son libellé | Répondre aux deux questions (section 3) |
| Le poste est verrouillé : **il n'y a pas de barre de titre** | C'est normal en mode kiosque | Le poste se lit dans Engrenage → Poste (section 6) |
| **« Le serveur ne répond pas à l'adresse … »** au moment de se connecter | Ce PC ne joint pas le serveur : adresse fausse (la VM a déménagé), serveur éteint, ou réseau | Voir la ligne suivante — ce **n'est pas** un problème de mot de passe |
| L'adresse est fausse et **je ne peux pas me connecter**, donc pas atteindre l'engrenage | L'écran de correction est derrière la connexion, de propos délibéré : changer l'adresse du serveur est un droit d'administrateur | Ouvrir `magbo-poste.json` (à côté du `.exe`) au **Bloc-notes** et corriger l'adresse ; ou le **supprimer** et rouvrir, l'écran de configuration revient (section 9 b) |
| Impossible de se connecter, et le serveur répond | Compte ou mot de passe | Voir l'administrateur — ce n'est pas l'installation |
| L'engrenage dit que le poste est réglé par le lanceur | Un `.bat` est encore là et garde la priorité | Section 8 |

---

## 8. ⚠️ Migrer un poste qui a déjà un `.bat`

**Rien ne presse.** Un poste avec son `Abrir-MAGBO.bat` continue de fonctionner
exactement comme avant, même après avoir remplacé le `.exe` : le `.bat` pose des
variables qui **gardent la priorité** sur le fichier de réglage. C'est
délibéré — mettre à jour le parc ne devait pas pouvoir casser les postes.

Quand vous voulez migrer un poste, dans cet ordre :

1. **Remplacer le `.exe`** par la nouvelle version. Ouvrir, vérifier que tout
   marche encore par le `.bat`. S'arrêter là est une position stable.
2. **Noter ce que dit le `.bat`** : ouvrir au Bloc-notes et relever **les deux
   lignes**, `set MAGBO_API_URL=…` **et** `set MAGBO_SECTOR=…`.
   - Le code du poste (`PORT2`) se traduit en nom (« Portail Terrain ») avec le
     tableau de la section 3 — c'est le nom que l'écran proposera.
   - ⚠️ **Si ce PC est un poste de BUREAU** (Vie Scolaire, direction,
     informatique), **ne traduisez pas l'ancien code** : l'ancien `.bat`
     portait un code de portail faute d'autre choix. Vous choisirez
     « Poste administratif — pas un point de passage » (section 3).
   - ⚠️ **Regarder aussi s'il y a `set NODE_ENV=production`** : ce poste est
     alors en **mode kiosque**, et il faudra le rétablir (étape 4 bis).
3. **Déplacer le `.bat`** hors du dossier (par exemple sur le bureau, dans un
   dossier `ancien`). Ne pas le supprimer tout de suite.
4. **Ouvrir le `.exe`** directement. L'écran de configuration apparaît.
   ⚠️ **Comparer l'adresse pré-remplie à celle relevée à l'étape 2** : le champ
   affiche l'adresse par défaut du programme, **pas** celle du `.bat` — qui
   vient d'être retiré et ne peut plus rien pré-remplir. Si elles diffèrent,
   corriger avant de tester. Puis choisir le poste, tester, enregistrer.

   > ⚠️ **L'écran de configuration n'apparaît pas ?** Alors le poste est
   > gouverné par une variable **système**, posée un jour avec `setx` au lieu
   > d'un `.bat`. Ouvrir une invite de commandes et taper `set MAGBO_` : si des
   > lignes s'affichent, les supprimer dans **Paramètres → Variables
   > d'environnement** (compte **et** système), puis fermer et rouvrir la
   > session Windows.

4 bis. **Si le `.bat` portait `NODE_ENV=production`** (étape 2), ce poste était
   verrouillé et ne l'est plus. Recréer le `Abrir-MAGBO-kiosque.bat` de la
   section 10, avec le même code, et lancer le poste par lui. Sans cela, le PC
   du portail devient un Windows ordinaire, en fenêtre, devant les élèves — et
   personne n'aura rien fait de travers.
5. **Refaire le raccourci** vers le `.exe`, et supprimer celui du `.bat` —
   ⚠️ **aux DEUX endroits** : sur le bureau *et* dans `shell:startup`
   (Windows + R → `shell:startup`). C'est l'oubli qui défait la migration : le
   raccourci de démarrage relance le `.bat` à la prochaine ouverture de
   session, les variables reviennent, et le poste retourne à son ancien réglage
   sans rien signaler.
6. **Fermer et rouvrir la session Windows**, et vérifier que c'est bien le
   `.exe` qui démarre. C'est le seul contrôle qui prouve l'étape 5.
7. Une semaine plus tard, si tout va bien : supprimer le `.bat`.

> ⚠️ **Ne laissez pas le `.bat` et le fichier de réglage en désaccord.** Tant
> que le `.bat` est là, c'est lui qui gagne — et l'écran de correction refusera
> d'enregistrer en vous disant pourquoi, plutôt que d'annoncer un « enregistré »
> qui serait effacé à la prochaine ouverture.

---

## 9. Revenir en arrière

Trois niveaux, du plus léger au plus lourd. Aucun ne touche au serveur : toutes
les versions parlent au même backend.

**a) Le réglage est mauvais.** Engrenage → Poste, corriger, tester,
enregistrer (section 6).

**b) Repartir de zéro sur ce poste.** Fermer l'application, **supprimer
`magbo-poste.json`**, rouvrir. L'écran de configuration revient comme sur un PC
neuf. Rien d'autre n'est perdu : ce fichier ne contient que deux réponses.

> Sur un poste en kiosque, l'application s'ouvre alors **en fenêtre** — elle
> refuse de se verrouiller sur une question. Le verrouillage revient de
> lui-même dès que vous avez répondu et enregistré.

**c) Revenir à l'ancienne version.** Remettre `Abrir-MAGBO.bat` dans le dossier
et le rouvrir : il reprend la main immédiatement, sans qu'il y ait rien à
défaire. Si l'ancien `.exe` a été conservé (section 1), renommer le dossier
`MAGBO` en `MAGBO-suspendu` et redonner à `MAGBO-ancien-…` son nom d'origine.

---

## 10. Mode kiosque — seulement pour les postes en libre accès

Sur un poste laissé sans surveillance (portail, cantine), on peut verrouiller
l'application en plein écran.

> ## ⚠️⚠️ IL N'Y A PAS DE SORTIE PAR CODE. Lisez ceci avant de verrouiller.
>
> Le mode kiosque bloque **Alt+F4, Ctrl+W, F11, Alt+Tab et la touche Windows**,
> pour tout le PC, et la fenêtre n'a plus de croix. Le raccourci
> `Ctrl+Shift+Alt+Q` et la variable `MAGBO_KIOSK_PIN` **existent dans le
> programme mais ne sont branchés sur rien** : taper un code n'est proposé
> nulle part. Les versions précédentes de ce guide promettaient une « sortie
> protégée par un code » ; c'était faux, et cette page ne le répétera pas.
>
> **Pour fermer un poste verrouillé : `Ctrl+Alt+Suppr` → Gestionnaire des
> tâches → MAGBO Access Control → Fin de tâche.**
>
> Ne verrouillez donc que des postes où quelqu'un sait faire ce geste, et
> écrivez-le sur la fiche de suivi. (Câbler une vraie sortie par code est une
> décision de Sam, pas une retouche de ce guide.)

> ⚠️ **DANS CET ORDRE, ET PAS L'INVERSE : sections 3 et 4 D'ABORD.** Le mode
> kiosque bloque Alt+F4, Alt+Tab et F11. Configurer le poste **après** l'avoir
> verrouillé, c'est répondre à deux questions sur une machine dont on ne peut
> plus sortir — à la cantine, à 11h50. (L'application se protège d'elle-même :
> tant que le poste n'est pas réglé, elle **refuse** de se verrouiller et
> s'ouvre en fenêtre normale. Ne comptez pas dessus comme méthode de travail :
> c'est un filet, pas une procédure.)

⚠️ **Ce réglage reste dans un `.bat`, et c'est voulu** — mais pas pour la raison
qui était écrite ici. `NODE_ENV` gouverne le **verrouillage d'une machine**, et
cela se décide depuis la machine, pas depuis l'application qu'elle affiche.
⚠️ **Il n'y a AUCUN code de sortie à protéger** : `MAGBO_KIOSK_PIN` n'est lue par
aucun écran et `Ctrl+Shift+Alt+Q` ne fait rien (mesuré le 03/09/2026 — voir
l'encadré plus haut). Créer un `Abrir-MAGBO-kiosque.bat` à côté du `.exe`, qui ne
pose **que cette ligne** — l'adresse et le poste continuent de venir du fichier :

```bat
@echo off
set NODE_ENV=production
set MAGBO_KIOSK_PIN=choisir-un-code
start "" "%~dp0MAGBO-Access-Control-Portable.exe"
```

Ce lanceur-là **ne pose pas** `MAGBO_API_URL` ni `MAGBO_SECTOR` : l'adresse et le
poste continuent de venir du fichier de réglage, et l'onglet **Engrenage →
Poste** reste utilisable pour les corriger. Ne pas activer ce mode sur un poste
administratif — il empêche d'utiliser normalement l'ordinateur.

> ⚠️ **Corriger le réglage depuis l'engrenage recharge l'application**, donc
> **déconnecte** la personne en cours. L'écran le dit avant, mais sur un poste
> de portail en pleine sortie, cela vaut la peine de choisir le moment. Le
> bouton **Annuler** referme l'écran sans rien changer.

---

## Fiche de suivi

| Poste | Lieu choisi | Installé le | Par | Ancienne version conservée | `.bat` retiré | Raccourci de démarrage refait | Kiosque rétabli | Vérifié à l'écran |
|---|---|---|---|---|---|---|---|---|
| | | | | ☐ | ☐ | ☐ | ☐ | ☐ |
| | | | | ☐ | ☐ | ☐ | ☐ | ☐ |
| | | | | ☐ | ☐ | ☐ | ☐ | ☐ |
| | | | | ☐ | ☐ | ☐ | ☐ | ☐ |
| | | | | ☐ | ☐ | ☐ | ☐ | ☐ |

> « Lieu choisi » = le lieu, ou « Poste administratif » pour une machine qui
> n'est postée nulle part. « Raccourci de démarrage refait » = celui du
> **bureau** *et* celui de `shell:startup` (section 8, étape 5). « Kiosque
> rétabli » ne concerne que les postes qui étaient verrouillés avant la
> migration — section 8, étape 4 bis ;
> laisser vide sinon.

---

*Le raisonnement derrière ce choix — pourquoi un fichier à côté du programme
plutôt que le registre Windows, et pourquoi le `.bat` garde la priorité — est
dans [`ADR-007`](../architecture/decisoes/ADR-007-configuration-du-poste.md).*
