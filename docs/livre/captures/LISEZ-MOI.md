# Les sept captures d'écran du livre

Le livre annonce sept captures. Elles ne peuvent pas être prises depuis le
dépôt : il faut ouvrir chaque écran du système en marche. Tant qu'un fichier
manque, le livre imprime **une case en pointillés** qui dit ce qui devrait être
là et sous quel nom — une capture promise ne disparaît jamais en silence.

## Comment ça marche

1. Prenez la capture.
2. Enregistrez-la dans ce dossier, **sous exactement le nom indiqué**.
3. Lancez `npm run livre:pdf`.

L'image prend sa place, avec sa légende, à l'endroit exact où était la case.
**Il n'y a rien d'autre à modifier** — ni le HTML, ni le CSS, ni les chapitres.

Le nom du fichier est écrit dans le marqueur du chapitre
(`[CAPTURE: nom-du-fichier.png — la légende]`). Si vous renommez le fichier,
renommez-le **aussi** dans le marqueur, sinon la case en pointillés revient.

## Les règles, avant de déclencher

- **PNG ou JPEG.** Le type est lu sur les octets du fichier, pas sur son
  extension : un JPEG renommé en `.png` fait échouer la génération avec un
  message clair, il ne produit pas une image cassée chez l'imprimeur.
- **Largeur visée : 1200 à 1600 px.** L'image est ramenée à la colonne de
  164 mm. En dessous de 1000 px le texte de l'écran devient illisible à
  l'impression ; au-delà de 2000 px vous alourdissez le livre pour rien.
- **⚠️ Aucun secret dans le cadre.** Jeton du webhook, mot de passe, `ADMIN_PIN` :
  un livre s'imprime et circule. Masquez avant de déclencher, pas après.
- **⚠️ Aucun nom d'élève dans le cadre.** Préférez un compte ou une fiche de
  test. Ce sont des mineurs, et le livre n'est pas le bon domicile pour leurs
  noms.
- **⚠️ Fermez le PDF avant de régénérer.** Si `docs/livre/livre-complet.pdf` est
  ouvert dans un lecteur, Windows verrouille le fichier ; le script s'arrête
  et vous dit lequel fermer.

Après régénération, la vérification tient en une ligne — elle doit rendre le
nombre de captures que vous avez ajoutées :

```
grep -c 'class="capture-image"' docs/livre/livre-complet.html
```

Si `node scripts/paginer-livre.js` s'arrête sur **« LE LIVRE EST RÉDUIT PAR
CHROME »**, une image dépasse la largeur imprimable : réduisez-la et
relancez. Ne passez pas outre — Chrome ne rogne pas ce qui dépasse, il réduit
**tout le livre**, en silence.

---

## 1 — `01-ecoute-http-terminal.png`

**Chapitre 1, « Vue d'ensemble ».** La page qui explique pourquoi les
événements cessent d'arriver quand une IP change.

**Ce n'est pas l'application MAGBO** : c'est l'interface web d'un terminal
Hikvision.

1. Relevez l'IP du terminal **sur l'écran de l'appareil lui-même**.
2. Dans un navigateur : `http://<IP du terminal>`.
3. Connectez-vous avec le compte administrateur **du terminal** (`admin` et le
   mot de passe que vous avez enregistré — ce n'est pas le compte de MAGBO).
4. **Configuration → Réseau → Service réseau → Écoute HTTP.**

**Cadrez** : l'IP du serveur, le port `8080`, et l'URL avec le jeton.

> ⚠️ **L'URL contient le jeton du webhook.** Masquez-le (bandeau noir, ou
> remplacez les caractères) **avant** d'enregistrer l'image. C'est le secret qui
> autorise à écrire dans la base des passages.

## 2 — `05-formulaire-operateur.png`

**Chapitre 5, « Administration ».** Le passage qui explique le rôle, les
secteurs et les permissions particulières.

1. Ouvrez MAGBO avec un compte **ADMIN**.
2. **Panneau Administratif** (il demande l'`ADMIN_PIN`).
3. Carte **« Gestion des opérateurs »**.
4. Ouvrez un opérateur en modification.

**Cadrez** : le rôle, les cases de secteurs, et la grille des permissions
particulières juste en dessous — les trois dans la même image, c'est ce que le
texte décrit.

## 3 — `05-carte-creneau.png`

**Chapitre 5, « Administration ».** Le créneau de cantine et son étiquette.

1. **Panneau Administratif** → carte **« Planning Cantine »**.
2. Restez en mode édition (pas l'affiche).

**Cadrez** : une carte de créneau montrant le champ **rotulo**, les **deux
tolérances**, et les **pastilles de classes**.

## 4 — `05-affiche-cantine.png`

**Chapitre 5, « Administration ».** L'affiche que lisent les familles.

1. Même écran **« Planning Cantine »**.
2. Bouton **« Affiche imprimable »** (icône imprimante, en haut).
3. Ouvrez l'aperçu d'impression (`Ctrl+P`).
4. Pour revenir : **« Revenir à l'édition »**.

**Cadrez** : l'aperçu — bandeau bleu foncé, pastilles en couleur, **une page par
passage**.

## 5 — `05-configuration-systeme.png`

**Chapitre 5, « Administration ».** Les réglages, avec leur valeur d'origine.

1. **Engrenage** (réglages), onglet **« Configuration du système »**.
2. Il faut être ADMIN ou avoir la permission `CONFIG_WRITE`.

**Cadrez** : une ligne avec sa valeur, **son défaut écrit à côté**, la mention
« modifié par … le … », et les deux boutons **Enregistrer / Rétablir**.

## 6 — `06-permissions-particulieres.png`

**Chapitre 6, « Exploitation ».** Le passage qui dit qu'une permission absente
ne ressemble pas à une panne : le bouton n'est simplement pas là.

1. **Panneau Administratif** → **« Gestion des opérateurs »**.
2. Ouvrez en modification un opérateur **de rôle ADMIN**.

**Cadrez** : le bloc **« Permissions particulières »** et ses **dix cases**.

> ⚠️ Choisissez bien un **ADMIN** : les dix cases doivent apparaître **grisées**,
> et c'est précisément ce que la légende annonce. Sur un OPERATOR elles sont
> actives, et l'image contredirait le texte.

## 7 — `06-premier-lancement.png`

**Chapitre 6, « Exploitation ».** Le premier démarrage sur un poste neuf.

1. Sur un poste **où MAGBO n'a jamais été lancé**, lancez l'exécutable.
2. Windows affiche l'avertissement bleu **« Windows a protégé votre
   ordinateur »**.
3. Capturez **avant** de cliquer.

**Cadrez** : la fenêtre bleue entière, avec le lien **« Informations
complémentaires »** bien visible — c'est le lien sur lequel l'opérateur doit
cliquer, et c'est pour cela que la capture existe.
