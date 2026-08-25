# Installer MAGBO Access Control sur un poste

**Version : v2.1.0 · Août 2026**

Cette procédure s'applique à chaque poste de l'école, un par un. Compter
**dix minutes par machine**. Aucune connaissance technique n'est nécessaire :
tout se fait par copier-coller de dossier et une ligne à modifier dans un
fichier texte.

> **La règle qui évite 90 % des problèmes :** l'application s'ouvre toujours par
> `Abrir-MAGBO.bat`, **jamais** par le fichier `.exe`. Un `.exe` ouvert
> directement affiche une application vide, sans message d'erreur.

---

## Avant de commencer

| À vérifier | Comment | Attendu |
|---|---|---|
| Le serveur répond | Ouvrir `http://192.168.1.253:8080/api/health` dans un navigateur du poste | Une réponse contenant `"database":"CONNECTED"` |
| Le poste est sur le réseau de l'école | — | Si la page ci-dessus ne s'ouvre pas, inutile de continuer : c'est un problème réseau, pas d'installation |
| Vous savez quel secteur ce poste représente | Voir le tableau de la section 3 | Par exemple `BIBLIO` pour le poste du CDI |

Récupérer le paquet : page **Releases** du dépôt GitHub, version **v2.1.0**,
fichier `MAGBO-Access-Control-Portable.exe`. Le fichier `Abrir-MAGBO.bat` se
trouve dans le dépôt sous `deploy/portable/`.

---

## 1. Garder l'ancienne version de côté

Si le poste a déjà une version de MAGBO, **ne pas la supprimer**. La renommer :

```
MAGBO  →  MAGBO-ancien-2026-08-12
```

C'est le chemin de retour si quelque chose se passe mal en pleine journée.
Elle pourra être effacée une semaine plus tard, une fois la nouvelle version
éprouvée.

---

## 2. Copier les deux fichiers

Créer un dossier `C:\MAGBO` (ou l'emplacement habituel de ce poste) et y placer
**les deux fichiers ensemble** :

```
C:\MAGBO\
   ├── MAGBO-Access-Control-Portable.exe
   └── Abrir-MAGBO.bat
```

Les deux doivent rester dans le même dossier : le `.bat` lance le `.exe` qui se
trouve à côté de lui.

---

## 3. Régler le secteur du poste

Clic droit sur `Abrir-MAGBO.bat` → **Modifier** (ouvre le Bloc-notes).

Deux lignes comptent :

```bat
set MAGBO_API_URL=http://192.168.1.253:8080
set MAGBO_SECTOR=PORT1
```

- `MAGBO_API_URL` : ne pas y toucher. C'est l'adresse fixe du serveur.
- `MAGBO_SECTOR` : remplacer par le code du poste.

| Poste | Code à écrire |
|---|---|
| Portail principal | `PORT1` |
| Portail secondaire | `PORT2` |
| Troisième portail | `PORT3` |
| CDI / Bibliothèque | `BIBLIO` |
| Infirmerie | `ENFERM` |
| Cantine — service 1 | `REFEI1` |
| Cantine — service 2 | `REFEI2` |

Enregistrer et fermer le Bloc-notes.

---

## 4. Premier lancement

Double-cliquer sur **`Abrir-MAGBO.bat`**.

**Windows va afficher un avertissement bleu** : « Windows a protégé votre
ordinateur ». C'est normal — l'application n'est pas signée numériquement, ce
qui est attendu pour un logiciel interne à l'école.

> Cliquer sur **« Informations complémentaires »**, puis sur
> **« Exécuter quand même »**.

Cet avertissement n'apparaît qu'à la première ouverture sur chaque poste.

---

## 5. Vérifier — à l'écran, pas seulement la fenêtre

Une fenêtre qui s'ouvre ne prouve rien. Se connecter, puis contrôler que les
**données apparaissent réellement** :

- [ ] Le tableau de bord affiche des chiffres, pas des zéros partout.
- [ ] **Rapport Général → Journal** : des lignes avec des noms de personnes.
- [ ] Le nom de l'opérateur connecté apparaît en haut à droite.

Si l'application s'ouvre mais reste vide, voir le tableau de la section 7.

---

## 6. Refaire le raccourci

Si le poste avait un raccourci sur le bureau ou un lancement automatique au
démarrage, le refaire en pointant vers **`Abrir-MAGBO.bat`**.

Clic droit sur le `.bat` → **Envoyer vers** → **Bureau (créer un raccourci)**.

⚠️ Un raccourci qui pointe vers le `.exe` ouvrira l'application vide. C'est la
cause la plus fréquente de « l'application ne marche plus ».

---

## 7. Si quelque chose ne va pas

| Symptôme | Cause probable | Remède |
|---|---|---|
| L'application s'ouvre **vide**, sans erreur | Ouverte par le `.exe` au lieu du `.bat` | Fermer, rouvrir par `Abrir-MAGBO.bat` |
| Toujours vide, même par le `.bat` | Le serveur ne répond pas depuis ce poste | Ouvrir `http://192.168.1.253:8080/api/health` dans un navigateur du poste |
| « Windows a protégé votre ordinateur » | Application non signée | « Informations complémentaires » → « Exécuter quand même » |
| Le mauvais secteur s'affiche | `MAGBO_SECTOR` mal réglé | Section 3, puis fermer et rouvrir l'application |
| Impossible de se connecter | Compte ou mot de passe | Vérifier auprès de l'administrateur — ce n'est pas un problème d'installation |
| Le `.bat` s'ouvre et se referme aussitôt | Le `.exe` n'est pas dans le même dossier | Section 2 : les deux fichiers ensemble |

---

## 8. Mode kiosque — seulement pour les postes en libre accès

Sur un poste laissé sans surveillance (portail, cantine), on peut verrouiller
l'application en plein écran, sortie protégée par un code. Dans le `.bat`,
retirer les `REM` des deux lignes et choisir un code :

```bat
set NODE_ENV=production
set MAGBO_KIOSK_PIN=1234
```

Ne pas activer ce mode sur un poste administratif : il empêche d'utiliser
normalement l'ordinateur.

---

## Fiche de suivi

À remplir au fur et à mesure, pour savoir où en est le parc.

| Poste | Secteur | Installé le | Par | Ancienne version conservée | Vérifié à l'écran |
|---|---|---|---|---|---|
| | | | | ☐ | ☐ |
| | | | | ☐ | ☐ |
| | | | | ☐ | ☐ |
| | | | | ☐ | ☐ |
| | | | | ☐ | ☐ |

---

## En cas de retour en arrière

Renommer le dossier `MAGBO` en `MAGBO-v2.1-suspendu`, puis redonner à
`MAGBO-ancien-2026-08-12` son nom d'origine. L'ancienne version repart telle
qu'elle était : rien n'a été modifié côté serveur, les deux versions parlent au
même backend.
