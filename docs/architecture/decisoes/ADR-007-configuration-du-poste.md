# ADR-007 — La configuration du poste vit à côté du `.exe`

**Date :** 2026-09-02 · **Statut :** accepté · **Branche :** `feat/premier-lancement`
**Auteur de la décision :** Sam (MAGBO STUDIO)

---

## Contexte

Un poste s'ouvre aujourd'hui par `Abrir-MAGBO.bat`, qui pose `MAGBO_API_URL` et
`MAGBO_SECTOR` puis lance le `.exe`. Ce lanceur a trois défauts, et le troisième
est le plus coûteux :

1. Il n'a pas d'icône. Sur un bureau, il ressemble à un bricolage à côté d'une
   application.
2. Le `.exe`, lui, **a** l'icône — donc c'est sur lui qu'on clique. Il fallait
   expliquer à chaque personne de ne surtout pas cliquer sur celle qui a le logo.
3. Il n'existe qu'en un exemplaire par PC, écrit à la main. Personne ne sait ce
   qu'il contient sans l'ouvrir dans le Bloc-notes.

**L'application doit s'ouvrir par son `.exe`, comme Pronote ou Chrome.**

### ⚠️ Ce que le diagnostic a trouvé en chemin, et qui change l'énoncé

Le symptôme rapporté était : « ouvrir le `.exe` directement fait tomber
l'application sur `http://localhost:8080` ». C'est vrai, mais **ce n'était pas
la faute du `.exe` ouvert sans le `.bat`** :

- `main.js` ne défaut plus sur `localhost` depuis le commit `ff6f26e` — il
  défaut sur l'adresse de la VM.
- Le `localhost` venait de la **page**, et de **deux lignes précises**, toutes
  deux antérieures à ce chantier, toutes deux corrigées ici :

  1. `js/utils/auth.js` — **la connexion elle-même** :
     ```js
     const baseUrl = window.API_BASE_URL ? window.API_BASE_URL
                                         : 'http://localhost:8080/api';
     ```
     `window.API_BASE_URL` n'est affecté **nulle part** dans le dépôt.
     `js/api.js` déclare bien `const API_BASE_URL`, mais un `const` de premier
     niveau va dans l'environnement lexical global et **pas** en propriété de
     `window`. La condition était donc toujours fausse et le repli toujours
     pris : `window.auth.login()` interrogeait `http://localhost:8080` **sur
     tous les postes de l'école**, `.bat` ou pas.
  2. `js/components/LoginScreen.js` — la **demande de mot de passe** lisait
     `window.magboConfig.MAGBO_API_URL`, propriété que le pont n'expose pas.
     La requête partait sur `localhost`, échouait, le `catch` l'avalait, et
     l'écran confirmait quand même.

**⚠️ Une première rédaction de cet ADR attribuait le symptôme à une course**
entre le cache du preload (rempli par un `ipcRenderer.invoke` asynchrone non
attendu) et le premier script de la page. **C'est faux, ou du moins ce n'est
pas ce qui a été mesuré** : les fichiers de `js/` sont chargés en
`<script type="text/babel">`, et Babel ne les exécute qu'au
`DOMContentLoaded` — bien après que l'aller-retour IPC soit revenu. La course
était théoriquement possible, jamais observée, et elle n'explique pas les
postes correctement configurés qui tombaient sur `localhost`. La cause prouvée
est celle des deux lignes ci-dessus. C'est écrit ici parce qu'un ADR qui garde
un diagnostic commode enseigne à chercher au mauvais endroit la prochaine fois.

Le preload passe tout de même à `sendSync`, mais pour une **autre** raison, et
il faut la nommer honnêtement : `getCached()` est lu par huit fichiers **au
chargement du script**, et une valeur lue partout sans être attendue nulle part
n'a pas de contrat. `sendSync` en donne un — la valeur existe avant le premier
script, ou le programme n'a pas démarré. C'est le seul endroit du projet où
bloquer est la bonne réponse, parce que cela arrive une fois, avant qu'il n'y
ait quoi que ce soit à l'écran. ⚠️ En contrepartie, le handler
`get-config-sync` de `main.js` est enveloppé d'un `try/catch` qui pose
`event.returnValue = null` : un `sendSync` dont le handler lève ne reçoit
**jamais** de réponse et la fenêtre reste blanche, sans message.

---

## Décision

**Trois branches, dans cet ordre :**

```
1. variables d'environnement (MAGBO_API_URL / MAGBO_SECTOR)   ← PRIORITAIRE
2. fichier magbo-poste.json, à côté du .exe
3. écran de première configuration
```

Le fichier est **relu à chaque ouverture**, jamais figé au build. La correction
du réglage passe par l'engrenage, derrière `CONFIG_WRITE`.

---

## ⚠️ Pourquoi les variables d'environnement gardent la priorité

**C'est ce qui rend ce chantier déployable, et rien d'autre.**

Le parc tourne sur des postes lancés par un `.bat`. Distribuer un `.exe` qui
ignorerait ces variables — ou qui les laisserait perdre contre un fichier —
casserait **chaque poste installé**, le jour de la mise à jour, tous en même
temps. Et il n'y a plus personne sur place pour les rouvrir un par un.

La règle est donc : **un poste déjà installé et non touché doit se comporter
exactement comme avant.** Il ne voit pas l'écran de configuration, il n'écrit
pas de fichier, il ne change pas de comportement d'un iota.

Deux corollaires, tous deux testés :

- **Une seule des deux variables suffit** à rester en « mode `.bat` », avec les
  replis d'avant ce chantier (`MAGBO_SECTOR` absent valait `PORT1` dans
  `main.js`). Un lanceur incomplet ne doit pas se mettre soudain à poser des
  questions.
- **L'écran de correction refuse d'écrire** quand un `.bat` gouverne le poste,
  et dit pourquoi. Sans ce refus, un administrateur corrigerait l'adresse,
  verrait « enregistré », et retrouverait l'ancienne valeur à la réouverture —
  parce que le `.bat` la repose. Un « enregistré » qui ment coûte plus cher que
  l'impossibilité d'enregistrer.

C'est aussi la stratégie de retour arrière : **remettre le `.bat` suffit.** Il
reprend la main sur le fichier sans qu'il y ait rien à défaire.

---

## ⚠️ Pourquoi un fichier à côté du `.exe`, et pas le registre ni le profil utilisateur

### Pas le **registre Windows**

- Le paquet est **portable** : il est fait pour ne rien laisser sur la machine.
  Une clé de registre survit à la suppression du dossier, et c'est exactement ce
  qu'un portable promet de ne pas faire. Le PC de la cantine qu'on réinstalle
  garderait une trace invisible.
- Il est **invisible**. Diagnostiquer « quelle adresse utilise ce poste ? »
  demanderait `regedit` et un chemin appris par cœur, sur un PC de la Vie
  Scolaire, par quelqu'un qui n'est pas informaticien. Un fichier JSON à côté du
  programme se lit avec le Bloc-notes.
- Il n'est **pas transportable**. Aujourd'hui, configurer un poste de plus se
  fait en copiant un dossier. Avec le registre, il faudrait exporter une clé.

### Pas `%APPDATA%` (le profil utilisateur)

- Ces PC sont **partagés**. Deux personnes qui ouvrent une session Windows
  différente sur le même poste du portail auraient deux configurations
  différentes — et la seconde retrouverait l'écran de première configuration
  sans comprendre pourquoi. Le réglage décrit **la machine et son lieu**, pas
  la personne assise devant.
- Le chemin est **loin** : `C:\Users\<qui>\AppData\Roaming\...`, un dossier
  caché. Même argument de diagnostic que ci-dessus.

### Le fichier à côté du `.exe`

- **Il se voit.** Il est dans le même dossier que le programme, il s'appelle
  `magbo-poste.json`, et son contenu tient en deux lignes lisibles.
- **Il se copie.** Installer un poste de plus, c'est copier le dossier et
  changer une ligne — le geste que l'école fait déjà.
- **Il se supprime.** Effacer le fichier remet le poste à neuf : l'écran de
  configuration revient. C'est le retour arrière le plus simple qui soit.
- **Il ne survit pas au dossier.** C'est la promesse du portable, tenue.

### ⚠️ Le piège du portable, et il est réel

Un `.exe` portable **s'auto-extrait dans un dossier temporaire**.
`process.execPath` et `app.getPath('exe')` pointent donc vers ce temp — effacé à
la fermeture. Un fichier écrit là **disparaîtrait**, et l'écran de configuration
reviendrait à chaque ouverture.

`electron-builder` pose `PORTABLE_EXECUTABLE_DIR` avec le dossier du **vrai**
`.exe`. Vérifié à la source dans ce dépôt, pas de mémoire :
`node_modules/app-builder-lib/templates/nsis/portable.nsi` fait
`SetEnvironmentVariable("PORTABLE_EXECUTABLE_DIR", "$EXEDIR")`.

Trois cas, donc, et `main.js` les traite explicitement :

| Cas | Où va le fichier | Pourquoi |
|---|---|---|
| **Portable, dossier inscriptible** | `PORTABLE_EXECUTABLE_DIR` | le dossier du vrai `.exe`, pas le temp — c'est le cas normal, et le seul où le dossier reste complet |
| **Portable, dossier en lecture seule** | `userData` | clé USB protégée, partage réseau, `.exe` déposé dans `Program Files` |
| **Installé (NSIS)** | `userData` | le `.exe` est sous `Program Files`, non inscriptible sans élévation — on ne demande pas l'élévation pour deux champs |
| **Développement** | racine du dépôt | `app.getPath('exe')` serait le binaire d'Electron dans `node_modules` |

⚠️ **Chaque case n'est pas devinée, elle est SONDÉE** : `main.js` écrit un
fichier vide et l'efface. `fs.accessSync(dir, W_OK)` ne dit pas la vérité sous
Windows pour un **répertoire** — libuv n'y regarde que
`FILE_ATTRIBUTE_READONLY`, qui n'a pas de sens sur un dossier, et ignore les ACL
NTFS. Il répondait donc « oui » sur `Program Files` à un utilisateur ordinaire :
le repli n'était jamais choisi et l'écriture échouait plus tard en `EPERM`.

⚠️ **Le repli `userData` a un prix, et il est écrit dans le guide** : le réglage
n'est plus à côté du programme. Copier le dossier ne copie plus le poste, et il
ne vaut que pour **ce compte Windows**. C'est mieux qu'un poste qui ne démarre
pas, ce n'est pas équivalent — d'où la consigne « un dossier local et
inscriptible » à la section 2 du guide, plutôt qu'un silence qui ferait passer
le repli pour le cas normal.

---

## ⚠️ Pourquoi `ACCESS_POINTS` fait autorité pour la liste des postes, et pas `door_mappings`

Deux listes existent. Celle du code (`js/data/constants.js`) et celle de la base
(`door_mappings`). La question est tranchée par un argument qui ne se discute
pas :

**1. On ne peut pas interroger la base avant de connaître l'adresse du serveur —
et c'est exactement la question que l'écran pose.** Une liste venue du serveur
exigerait de connaître le serveur pour demander où l'on est. L'œuf et la poule,
et un écran vide le jour où la VM est éteinte, c'est-à-dire précisément le jour
où quelqu'un configure un poste pour la première fois.

**2. `door_mappings` décrit les TERMINAUX, pas les postes de travail.** Un PC
n'est pas un lecteur facial. La table semée porte **deux lignes par point**
(entrée et sortie), ce qui n'a aucun sens dans une liste de lieux ; et elle
**ne connaît pas REFEI2**, qui est pourtant une vraie salle avec un vrai écran.
Le PC de la seconde cantine n'aurait pas pu se nommer.

**3. `ACCESS_POINTS` est déjà la liste des écrans que l'application sait
ouvrir.** Choisir un poste, c'est choisir l'un de ces lieux. En fabriquer une
deuxième garantirait qu'elles divergent.

La liste est filtrée sur `category !== 'monitor'` : on garde les **lieux
physiques** — les trois portails, le CDI, l'infirmerie, les deux réfectoires —
et on écarte les écrans qui n'en sont pas (rapports, surveillance, PPMS, écrans
de gestion). Un PC ne se trouve pas « à Rapport Cantine » ; il se trouve à la
cantine. Sept entrées sur dix-sept.

---

## ⚠️ Pourquoi le test de connexion est obligatoire avant d'enregistrer

Un poste enregistré sur une mauvaise adresse s'ouvre **tous les matins sur un
écran vide**, et la personne devant lui n'a aucun moyen de deviner que c'est
l'adresse. Elle conclut que « le logiciel ne marche pas ».

Le bouton interroge `/api/health` — la seule route publique qui réponde sans
jeton **et** qui dise qu'on parle bien à un MAGBO. Une adresse qui répond « 200 »
peut être n'importe quel appareil du réseau de l'école ; sans cette
vérification, on enregistrerait l'imprimante.

Quatre issues, quatre messages distincts, parce qu'elles n'appellent pas la même
action : injoignable · délai dépassé · répond mais refuse · répond mais n'est
pas MAGBO. Le délai est plafonné à six secondes : une adresse fausse peut sinon
bloquer bien plus longtemps, et l'écran paraît figé.

**Une exception assumée :** si le serveur répond mais que sa base de données est
tombée, on **prévient sans interdire**. L'adresse est bonne — c'est le serveur
qui a un problème — et bloquer obligerait à revenir configurer le poste une fois
la base réparée.

---

## ⚠️ Aucun écran ne doit être sans issue, et il a fallu deux tours pour y arriver

Trois mécanismes distincts verrouillent un poste, et **ils ne se corrigent pas
ensemble** — c'est la leçon la plus chère de cette revue :

| Mécanisme | Portée | Ce qu'il bloque |
|---|---|---|
| `kiosk` / `fullscreen` de la `BrowserWindow` | la fenêtre | la croix, la barre de titre |
| `globalShortcut.register(...)` | **tout le système** | Alt+F4, Ctrl+W, F11, Alt+Tab, la touche Windows — dans **toutes** les applications du PC |
| l'absence de sortie applicative | l'écran affiché | il n'y a nulle part où cliquer pour partir |

Le premier tour de revue n'avait corrigé que la **première** ligne : sur un PC
neuf en production, l'écran de configuration s'ouvrait bien en fenêtre, mais
l'AED à qui ce guide fait ouvrir un navigateur pour vérifier `/api/health` ne
pouvait plus le fermer. **La règle vit donc désormais dans le module partagé**
(`posteConfig.verrouillable`), appliquée aux deux endroits et exécutée par la
suite de tests : deux copies d'une règle, c'est une copie qu'on oublie.

Et parce qu'énumérer les états où l'on peut rester coincé est un exercice qu'on
perd toujours, l'écran de **première** configuration a une sortie inconditionnelle
— « Fermer l'application », par le canal `quitter-application`. Il n'a pas
d'« Annuler » (il n'y a rien derrière lui), mais il existe au moins un état où
il s'affiche **et** où l'enregistrement sera refusé pour toujours : le canal de
configuration muet sur un poste que des variables d'environnement gouvernent —
la page croit devoir configurer, le processus principal sait que non, et il a
créé la fenêtre en quiosque. Sur cet écran il n'y a rien à protéger : le poste
n'est pas encore réglé.

### ⚠️ Ce qui reste ouvert : la sortie du mode kiosque n'existe pas

`main.js` enregistre `Ctrl+Shift+Alt+Q`, qui envoie `request-admin-pin` ;
`preload.js` expose `window.magboIpc` avec `verifyKioskPin`, `exitKiosk` et
`onRequestAdminPin`. **Aucun fichier de `js/` ne consomme ce pont** — vérifié
par recherche exhaustive. Le PIN `MAGBO_KIOSK_PIN` ne fait donc rien, et le
`AdminPinModal` de l'application est un autre PIN (celui de `/api/admin/verify`).

Le défaut est **antérieur à ce chantier**, mais ce chantier réécrit la section
du guide qui invite à verrouiller le portail et la cantine : elle dit désormais
la vérité — pour fermer un poste verrouillé, `Ctrl+Alt+Suppr` → Gestionnaire des
tâches. Câbler une vraie sortie par code est une **décision**, pas une retouche :
c'est une saisie de code de plus, montée avant les retours anticipés de
`js/App.js`, et elle n'appartient pas au périmètre « premier lancement ».

---

## ⚠️ « Enregistré » ne se dit qu'après avoir relu

Écrire sans relire déplace le mensonge d'un cran au lieu de le supprimer.
`aEcrire('', '')` produit `{"apiUrl":"","sector":"","version":1}` : un JSON
parfaitement valide, que `resoudre` relit en `doitConfigurer: true`. Le fichier
partait donc sur le disque, l'écran répondait « enregistré », la page se
rechargeait — et revenait sur l'écran de configuration, sans un mot. Le
`<select>` de l'écran empêche ce cas, mais le seul contrôle vivait dans le
**rendu**, pas dans le processus qui écrit.

Le processus principal vérifie donc deux choses, dans cet ordre :

1. **avant** d'écrire, que ce qui est proposé se relira comme une configuration
   (`posteConfig.utilisable`) ;
2. **après** avoir écrit, que ce qui se relit vraiment en est une — sinon c'est
   un échec d'écriture, et il se dit.

⚠️ `utilisable` est volontairement **muet sur la liste des postes** :
`ACCESS_POINTS` n'existe pas dans le processus principal, et refuser un
identifiant inconnu empêcherait d'ajouter un point sans republier le `.exe`. On
refuse le vide, pas l'inattendu.

---

## Ce que ce chantier ne change pas

- **`MAGBO_SECTOR` ne pilote toujours que le titre de la fenêtre.** Vérifié :
  aucun fichier de `js/` ne lit `config.sector`. Le rendre soudain capable
  d'ouvrir directement l'écran du poste changerait le comportement des postes
  du parc — qui atterrissent aujourd'hui sur le tableau de bord — et violerait
  la règle de compatibilité ci-dessus. **C'est une décision à prendre à part**,
  et elle est signalée comme telle.
- Le mode kiosque, le PIN et `NODE_ENV` restent des variables d'environnement.
  Le PIN n'a rien à faire dans un fichier en clair sur un PC partagé.
- Le `.bat` continue d'exister et de fonctionner. Il devient **optionnel**.

---

## Conséquences

- **`js/utils/posteConfig.js` est chargé par les DEUX processus** : `require`
  dans `main.js`, `<script>` dans `index.html`. Une seule règle de résolution,
  pas deux copies à tenir d'accord. Le module est pur — aucun accès disque,
  aucun `window`, aucun module Node — ce qui le rend testable sans Electron.
  ⚠️ C'est aussi ce qui a permis de **ne pas** toucher aux quatre points
  d'entrée de `scripts/indexAssets.js`, dont le commentaire dit que la liste ne
  grandit pas : un module qui entre par la page entre tout seul dans le portail
  de release.
- **`preload.js` lit la configuration par `sendSync`.** `getCached()` n'est
  plus jamais `null` — ce qui répare les huit sites qui retombaient sur
  `localhost`.
- **Nouveau fichier ignoré par git** : `magbo-poste.json`. Deux postes n'ont pas
  la même réponse ; committer celui du PC de développement le distribuerait à
  tout le monde.
- **Le fichier ne contient jamais de secret** : une adresse et un nom de lieu.
  Il est en clair sur un PC partagé de la Vie Scolaire, et un test le vérifie.
- **Les trois branches sont testées** (`tests/posteConfig.test.js`) et
  **vérifiées contre l'application qui tourne**, en lisant la ligne
  `[MAGBO] poste=… source=…` que `main.js` écrit au démarrage — ligne qui existe
  d'abord pour l'exploitation : quand un poste « n'a pas de données », la
  première question est toujours « quelle adresse, et d'où la tient-il ? ».

---

## Références

- Résolution : `js/utils/posteConfig.js`
- Processus principal : `main.js`, `preload.js`
- Écran : `js/components/PremierLancement.js`
- Les trois branches : `tests/posteConfig.test.js`
- Guide d'installation : `docs/operacional/guide-installation-postes.md`
