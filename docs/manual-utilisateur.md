# MAGBO Access Control — Manuel de l'utilisateur

**Pour qui :** le personnel du Lycée Molière qui se sert de l'application — Vie
Scolaire, cantine, infirmerie, CDI, portail, direction.
**Aucune connaissance technique n'est nécessaire.**

**Version :** 2026-08-06 · Application v2.1.0 (préparée, pas encore installée —
voir §0.2)

---

## Sommaire

**Pour commencer**
- [0. À lire avant tout](#0-à-lire-avant-tout)
- [Par où commencer selon votre rôle](#par-où-commencer-selon-votre-rôle)

**Les écrans, un par un**
1. [Connexion](#1-connexion)
2. [Tableau de bord](#2-tableau-de-bord)
3. [Poste de passage — Portail](#3-poste-de-passage--portail)
4. [Poste de passage — Infirmerie](#4-poste-de-passage--infirmerie)
5. [Poste de passage — Cantine](#5-poste-de-passage--cantine)
6. [CDI — Bibliothèque](#6-cdi--bibliothèque)
7. [Monitor Cantine](#7-monitor-cantine)
8. [Rapport Cantine](#8-rapport-cantine)
9. [Rapport Infirmerie](#9-rapport-infirmerie)
10. [Rapport Général](#10-rapport-général)
11. [Droits Repas](#11-droits-repas)
12. [Sorties](#12-sorties)
13. [Panneau administrateur](#13-panneau-administrateur)
14. [Paramètres et inscriptions](#14-paramètres-et-inscriptions)

**Annexes**
- [A. Les pièges connus](#a-les-pièges-connus)
- [B. Que faire quand ça ne marche pas](#b-que-faire-quand-ça-ne-marche-pas)
- [C. Petit lexique](#c-petit-lexique)

> **Nombre d'écrans.** Le tableau de bord affiche **13 destinations**. Les trois
> portails (Principal, Terrain, Garage) partagent exactement le même écran, ce
> qui donne les 12 écrans de travail ci-dessus, plus la fenêtre **Paramètres**
> accessible partout par l'engrenage — **14 sections** au total. Rien n'est omis.

---

## 0. À lire avant tout

### 0.1 Ce que le système fait — et ce qu'il ne fait pas

Le terminal à la porte reconnaît **qui est** la personne (visage ou carte) et
**ouvre pour tous ceux qu'il reconnaît**. MAGBO reçoit l'information **après**
coup, vérifie la règle et vous l'affiche à l'écran en quelques secondes.

> **MAGBO ne verrouille aucune porte.** Celui qui empêche physiquement un élève
> de passer, c'est **vous**. L'écran est votre instrument de travail : tout le
> service dépend de le garder ouvert et de le regarder.

C'est une décision assumée, pas une limite technique : elle porte le nom de
« blocage opérationnel assisté ». Le terminal valide l'identité · MAGBO valide
la règle · l'opérateur applique l'exception.

[CAPTURE — schéma simple : terminal → MAGBO → écran de l'opérateur]

### 0.2 Comment ouvrir l'application aujourd'hui

**Situation actuelle (août 2026) : la nouvelle version n'est pas encore
installée sur les postes.** En attendant, l'application se lance depuis le
dossier du projet, par la commande :

```
npm start
```

C'est provisoire. Dès que la v2.1.0 sera installée, vous ouvrirez simplement le
raccourci **Abrir-MAGBO** sur le bureau, et cette section disparaîtra du manuel.

> ⚠️ **Même après l'installation : ouvrez toujours par le raccourci
> `Abrir-MAGBO`, jamais directement par le fichier `.exe`.** Le `.exe` seul ne
> sait pas où se trouve le serveur : l'application s'ouvre, mais **vide**, sans
> le moindre message d'erreur. Une application vide n'est presque jamais une
> panne du système — c'est presque toujours le mauvais raccourci.

[CAPTURE — le raccourci Abrir-MAGBO sur le bureau]

### 0.3 Les trois choses à savoir sur les chiffres

Avant de lire le moindre rapport :

1. **« En attente » n'est pas « refusé ».** Un élève « En attente » est un élève
   dont **personne n'a encore renseigné le droit**. Ce n'est pas une décision,
   c'est une case vide.
2. **Les passages éclair ne comptent pas.** Une entrée suivie d'une sortie en
   **moins d'une minute** n'est pas une permanence : l'élève est venu passer un
   message. Les rapports du CDI l'ignorent (et le disent à l'écran).
3. **Le personnel est masqué par défaut dans les chiffres du CDI.** Voir §A.2 —
   c'est le piège le plus fréquent.

---

## Par où commencer selon votre rôle

### « Je suis à la Vie Scolaire… »

Vous travaillez au portail et vous suivez les mouvements de la journée.

| Pour… | Allez à |
|---|---|
| Tenir le poste du portail, enregistrer une entrée/sortie à la main | [§3](#3-poste-de-passage--portail) |
| Autoriser un élève à sortir (mot des parents, RDV médical) | [§12](#12-sorties) |
| Savoir où est un élève, ou ce qu'il a fait aujourd'hui | [§10](#10-rapport-général), onglet **Par élève** |
| Voir tout ce qui a été refusé aujourd'hui | [§10](#10-rapport-général), onglet **Vue d'ensemble** |
| Inscrire une nouvelle personne | [§14](#14-paramètres-et-inscriptions) |

### « Je gère la cantine… »

Votre journée se joue sur un seul écran pendant le service.

| Pour… | Allez à |
|---|---|
| **Le service du midi** — l'écran à garder ouvert | [§7](#7-monitor-cantine) |
| Donner ou retirer le droit au repas d'un élève | [§11](#11-droits-repas) |
| Charger la liste des élèves autorisés (fichier Excel) | [§11](#11-droits-repas), *Importer Liste* |
| Éditer le rapport des repas du mois | [§8](#8-rapport-cantine) |

> Avant le premier jour de service : **la liste des autorisés doit être chargée**
> (§11). Sans elle, tout le monde est « En attente », et en production un élève
> « En attente » est **refusé**. Voir §A.1.

### « Je suis au CDI… »

| Pour… | Allez à |
|---|---|
| Faire pointer les élèves à l'entrée et à la sortie | [§6](#6-cdi--bibliothèque) |
| Sortir les statistiques de fréquentation, imprimer le rapport | [§6](#6-cdi--bibliothèque), bouton *Statistiques* |
| Faire l'appel en cas d'urgence (liste des présents) | [§6](#6-cdi--bibliothèque), *Mode urgence* |

### « Je suis à l'infirmerie… »

| Pour… | Allez à |
|---|---|
| Enregistrer l'arrivée et le départ d'un élève | [§4](#4-poste-de-passage--infirmerie) |
| Éditer le relevé des visites et des séjours | [§9](#9-rapport-infirmerie) |

### « Je suis directeur / directrice… »

Vous n'avez pas besoin des écrans de saisie. Trois chiffres et un rapport.

| Pour… | Allez à |
|---|---|
| La vue consolidée : KPIs, anomalies, activité par secteur | [§10](#10-rapport-général) |
| Les compteurs du jour et le journal global | [§13](#13-panneau-administrateur) |
| Créer ou désactiver un compte opérateur | [§13](#13-panneau-administrateur), *Gestion des opérateurs* |
| Comprendre la ligne « Divergences » | [§13](#13-panneau-administrateur) et [§A.4](#a4-les-divergences-ne-sont-pas-des-erreurs) |

---

## 1. Connexion

C'est le premier écran. Rien n'est accessible avant de s'identifier.

[CAPTURE — écran de connexion complet]

**Pour vous connecter :**
1. Saisissez votre **identifiant** dans le champ `IDENTIFIANT`.
2. Saisissez votre **mot de passe**.
3. Cliquez sur **ACCÉDER** (ou appuyez sur Entrée).

**Si ça ne passe pas :** un bandeau rouge s'affiche sous les champs avec la
raison. Les deux cas courants :
- *« Identifiant ou mot de passe incorrect »* → vérifiez la touche Majuscule.
- *« Erreur de connexion »* → ce n'est pas votre mot de passe, c'est le serveur
  qui ne répond pas. Voir [§B](#b-que-faire-quand-ça-ne-marche-pas).

**Votre profil détermine ce que vous voyez.** Un opérateur de cantine et un
administrateur ne voient pas les mêmes cartes sur le tableau de bord. Si une
carte que vous cherchez n'apparaît pas, ce n'est pas un bug : c'est votre profil.
Demandez à la direction.

---

## 2. Tableau de bord

L'écran d'accueil après la connexion : **le choix du poste de travail**.

[CAPTURE — tableau de bord avec les cartes de secteurs]

En haut, trois compteurs : **Mouvements aujourd'hui**, **Personnes inscrites**,
**Points d'accès**.

En dessous, une carte par destination. Un point vert avec un nombre
(« 12 personnes ») signifie qu'il y a en ce moment des gens **entrés et pas
encore sortis** de ce secteur.

**Pour ouvrir un poste :** cliquez sur sa carte.
**Pour revenir ici depuis n'importe où :** cliquez sur **Dashboard** dans la
barre du haut.

**La barre du haut**, présente sur tous les écrans :
- l'horloge et la date (à droite),
- le cadenas 🔒 → **Panneau administrateur** (demande le code PIN, §13),
- l'engrenage ⚙ → **Paramètres et inscriptions** (§14),
- votre nom et votre profil, puis le bouton **Sortir**.

[CAPTURE — barre du haut, avec le cadenas et l'engrenage entourés]

---

## 3. Poste de passage — Portail

Concerne **Portail Principal**, **Portail Terrain** et **Garage** : le même
écran, un poste par porte.

[CAPTURE — écran d'un portail, les deux panneaux visibles]

L'écran est coupé en deux :
- **à gauche**, la zone d'action (recherche d'une personne) ;
- **à droite**, **Derniers accès** — ce qui vient de se passer à cette porte,
  actualisé automatiquement toutes les 3 secondes.

### Enregistrer un passage à la main

Le terminal enregistre tout seul les passages par le visage ou la carte. La
saisie manuelle sert aux **exceptions** : carte oubliée, visage non reconnu,
visiteur.

1. Cliquez dans le champ de recherche (il est déjà actif à l'ouverture).
2. Tapez le **nom** ou la **matricule**. La liste se met à jour après une
   demi-seconde.
3. Cliquez sur la bonne personne.
4. Une fenêtre de confirmation s'affiche. Elle se ferme seule au bout de
   5 secondes, ou immédiatement si vous cliquez sur **OK**.

Le système décide seul s'il s'agit d'une **entrée** ou d'une **sortie** : il
regarde le dernier passage de cette personne à cette porte et prend l'inverse.

> ⚠️ Un passage saisi à la main est **marqué à votre nom** dans la base.
> Ce n'est pas une surveillance : c'est ce qui permet, six mois plus tard, de
> distinguer un vrai passage devant le terminal d'une correction faite au
> clavier. Voir [§A.3](#a3-les-saisies-manuelles-portent-votre-nom).

### Le cas particulier des parents

Si la personne est un **élève** ou un **responsable** et qu'un responsable est
bien enregistré, la fenêtre affiche **les deux à la fois** — le responsable et
l'élève — pour que vous confirmiez que c'est la bonne personne qui récupère le
bon enfant.

- **Confirmer** → le passage est validé.
- **Annuler** → le passage disparaît de l'écran.

> ⚠️ **Annuler efface la ligne de l'écran, pas de la base.** Le passage reste
> enregistré. C'est voulu : on ne réécrit pas l'histoire. Si la saisie était
> vraiment une erreur, signalez-la — elle se corrige, elle ne s'efface pas.

[CAPTURE — fenêtre double responsable + élève]

---

## 4. Poste de passage — Infirmerie

Même écran que le portail (§3), avec **une bande supplémentaire en haut** :
les **chronomètres** des élèves actuellement présents à l'infirmerie.

[CAPTURE — bande des chronomètres actifs]

**Pour enregistrer une arrivée :** cherchez l'élève, cliquez dessus. La fenêtre
affiche **« DURÉE DE PRÉSENCE MAX 02:00 »** et le chronomètre démarre.

**Pour enregistrer un départ :** cherchez le même élève et cliquez dessus. Selon
la durée :
- moins de 2 h → **SORTIE AUTORISÉE · Dans les temps** (bandeau vert) ;
- plus de 2 h → **DURÉE MAXIMALE DÉPASSÉE** (bandeau rouge + signal sonore).

Le bandeau rouge n'empêche rien : il **signale**. Un séjour de plus de deux
heures à l'infirmerie remonte ensuite dans les anomalies du Rapport Général
(§10).

---

## 5. Poste de passage — Cantine

Concerne **Cantine Principale** et **Cantine Secondaire**. Même écran que le
portail (§3), avec deux règles en plus.

**Règle 1 — durée minimale de 10 minutes (élèves uniquement).**
Si vous enregistrez la sortie d'un élève entré il y a moins de 10 minutes,
l'écran affiche en rouge : **« ACCÈS BLOQUÉ — Durée minimale (10 min) non
atteinte. Retournez à la cantine. »** Rien n'est enregistré. Cette règle ne
s'applique **pas** au personnel.

**Règle 2 — repas déjà pris.**
Si l'élève a déjà un repas enregistré aujourd'hui, l'écran affiche
**« AVIS REPAS DUPLIQUÉ — Repas déjà enregistré aujourd'hui »**. Le deuxième
repas n'est pas comptabilisé.

[CAPTURE — bandeau rouge « repas dupliqué »]

> Pendant le service du midi, ce n'est **pas** cet écran qu'il faut garder
> ouvert, mais le **Monitor Cantine** (§7), qui montre tout le monde d'un coup
> d'œil.

---

## 6. CDI — Bibliothèque

Le CDI a une application à lui, en plein écran, pensée pour le pointage rapide.

[CAPTURE — écran principal du CDI]

**En haut à gauche :** le bouton **← Dashboard** pour revenir à MAGBO.
**En haut à droite :** six boutons, dans l'ordre —

| Bouton | À quoi ça sert |
|---|---|
| 📊 Statistiques | Le tableau de bord de fréquentation et le rapport imprimable |
| 👥 Base Élèves | Consulter la liste des élèves (**lecture seule**) |
| 🕘 Historique | Les mouvements récents |
| ❓ Aide | L'aide intégrée |
| 🔒 Verrouiller | Verrouille l'écran (raccourci : `Alt`+`L`) |
| ⚙ Paramètres | Sons, code PIN, import, sauvegardes |

### Faire pointer un élève

1. Cliquez dans le champ de recherche (raccourci : la touche `/`).
2. Tapez le nom, ou scannez la carte.
3. Cliquez sur l'élève : **Entrée** s'il était dehors, **Sortie** s'il était
   dedans. Le système bascule tout seul.

La colonne de droite liste les **élèves actuellement présents**.

### Le mode urgence

Le bouton **MODE URGENCE**, en bas, bascule l'écran en **liste d'appel** : les
présents en grand, à cocher un par un, avec un bouton **IMPRIMER LISTE**.
C'est prévu pour un exercice d'évacuation. **Désactiver** revient à l'écran
normal.

[CAPTURE — mode urgence / liste d'appel]

### Les statistiques et le rapport

Le bouton 📊 ouvre **Dashboard & Rapports** : nombre de visites, visiteurs
uniques, durée moyenne, classe la plus présente, fréquentation par jour et par
heure, répartition par niveau. Deux périodes : **Cette Semaine** / **Ce Mois**.

Le bouton **Générer Rapport (PDF Print)** ouvre la fenêtre d'impression de
Windows — choisissez « Enregistrer au format PDF » pour un fichier.

> ⚠️ **Lisez la petite ligne grise au-dessus des chiffres.** Elle dit exactement
> ce qui est compté : « **Élèves seulement** » ou « **Élèves + personnel** », et
> le nombre de **passages éclair ignorés**. Un nombre de « visites » qui exclut
> silencieusement des gens serait pire qu'un nombre faux — d'où cette ligne.
> Voir [§A.2](#a2-le-personnel-est-masqué-par-défaut-dans-les-chiffres-du-cdi).

[CAPTURE — les statistiques CDI, avec la ligne grise « Élèves seulement » entourée]

### Ce que le CDI ne peut pas faire

- **Inscrire un élève.** Le fichier des élèves vient de Pronote. Le CDI le lit,
  il ne l'écrit pas. Pour inscrire quelqu'un → §14.
- **Effacer l'historique.** Les mouvements sont sur le serveur central.

---

## 7. Monitor Cantine

**C'est l'écran du service du midi.** Il s'actualise **toutes les 3 secondes**.

[CAPTURE — Monitor Cantine, les 3 colonnes + le flux de droite]

### Les trois colonnes

| Colonne | Qui s'y trouve |
|---|---|
| **Dans la cantine** | Entrés, pas encore sortis, depuis **moins d'1 h** |
| **Sortis** | Sortis il y a **moins de 40 min** (puis la fiche disparaît) |
| **Doit sortir** | Entrés depuis **plus d'1 h** — cadre orange, les plus anciens en haut |

Une fiche bordée de rouge avec la mention **hors horaire** signale un passage en
dehors des heures de repas de cette classe.

### Le flux « Tentatives Refusées », à droite

C'est **votre charge de travail**. Chaque ligne est quelqu'un que le terminal a
laissé entrer mais que MAGBO refuse selon la règle. La fiche s'illumine environ
8 secondes et un signal sonore retentit (un seul par groupe d'arrivées).

**Que faire d'une ligne du flux :**
1. Lisez le motif (ex. *Pas de droit au repas*, *Repas dupliqué*, *Hors horaire*).
2. Repérez l'élève dans la file.
3. Appliquez la règle de la maison : le faire sortir, ou noter l'exception.
4. Si c'est une exception accordée, enregistrez-la **à la main** au poste
   Cantine (§5) — c'est la trace de votre décision.

**Le son se coupe** avec le bouton dédié du flux ; le choix est mémorisé sur ce
poste.

### Rechercher un élève

Le champ de recherche cherche **dans les trois colonnes à la fois** et affiche
*« Trouvé dans : … »*. Les autres fiches s'estompent.

### « Vider l'écran »

Le bouton **Vider l'écran** masque les passages en cours. Une confirmation
prévient : *« les données restent enregistrées »*.

> ⚠️ **Rien n'est supprimé** — c'est un chiffon, pas une gomme. À utiliser entre
> deux services. L'écran se vide de toute façon **tout seul à minuit**.

---

## 8. Rapport Cantine

Le relevé des repas : **repas, durée de présence et ponctualité**.

[CAPTURE — Rapport Cantine avec la barre de filtres]

1. Choisissez la **période**.
2. Filtrez si besoin par **classe** ou par **élève** (champ *Rechercher*).
3. Le tableau se met à jour ; l'en-tête *Rapport Cantine — Lycée Molière* sert
   d'en-tête d'impression.
4. Pour un PDF : `Ctrl`+`P`, puis « Enregistrer au format PDF ».

---

## 9. Rapport Infirmerie

Identique au Rapport Cantine dans son fonctionnement — **visites et séjours** au
lieu des repas. Mêmes filtres, même impression.

[CAPTURE — Rapport Infirmerie]

Les séjours anormalement longs y apparaissent, et sont repris dans les anomalies
du Rapport Général (§10).

---

## 10. Rapport Général

**La vue consolidée.** C'est l'écran de la direction. Trois onglets.

[CAPTURE — Rapport Général, onglet Vue d'ensemble]

### Le sélecteur de période

En haut : **Aujourd'hui · Cette semaine · Ce mois · Personnalisé**
(*Personnalisé* fait apparaître deux champs de dates).

À droite du sélecteur, une case à cocher : **« Inclure le personnel (CDI) »**.
Elle ne modifie **que la carte du CDI** — la cantine et l'infirmerie gardent
leurs chiffres habituels. Voir [§A.2](#a2-le-personnel-est-masqué-par-défaut-dans-les-chiffres-du-cdi).

### Onglet « Vue d'ensemble »

- **Les KPIs :** entrées et sorties des secteurs internes, mouvements incomplets.
- **Analyse de l'activité :** une phrase en clair (jour de pointe, heure de pointe).
- **Anomalies :** bandeau **vert** si rien à signaler, **rouge** sinon, avec le
  détail — *Séjours prolongés (infirmerie)*, *Repas hors horaire*,
  *Sorties non enregistrées*.
- **Par secteur :** une carte par lieu (mouvements, entrées, sorties, occupation
  actuelle, élèves uniques, durée moyenne).
- **Portail :** entrés aujourd'hui / actuellement dans les secteurs.
- **Tentatives refusées — agrégats** : le total des refus par motif.
- **Tentatives refusées — tous les points** : les **50 dernières**, tous lieux
  confondus. C'est l'historique, pas la surveillance temps réel (celle-ci est
  au §7 et au §12).

> **Un accès autorisé et une tentative refusée ne sont jamais mélangés dans la
> même liste.** Deux registres séparés, deux blocs séparés à l'écran. Si vous
> les voyez mélangés quelque part, c'est un défaut à signaler.

### Onglet « Par élève »

**Pour savoir ce qu'a fait un élève :**
1. Tapez son nom ou sa matricule dans le champ de recherche.
2. Cliquez sur le bon résultat.
3. Sa fiche apparaît : photo, classe, **dernier passage**, et des pastilles de
   présence (dans quel secteur il se trouve).
4. Choisissez la période : **Aujourd'hui / 7 jours / 30 jours**.
5. En dessous, la **chronologie** jour par jour, avec la durée de chaque séjour.

Le ✕ en haut à droite de la fiche désélectionne l'élève.

[CAPTURE — onglet Par élève avec la chronologie]

### Onglet « Journal »

La liste brute de tous les mouvements, page par page, triable et filtrable
(classe, nom ou matricule). C'est le registre de référence quand un chiffre est
contesté.

---

## 11. Droits Repas

**Qui a le droit de manger à la cantine.** Écran accessible à l'administrateur
et à l'opérateur de cantine.

[CAPTURE — écran Droits Repas]

### Les quatre compteurs du haut

**Total Autorisés · Total Non Autorisés · En attente · Total Élèves.**

> **« En attente » = personne n'a rempli la case.** Ce n'est pas un refus. Mais
> **en production, un élève « En attente » est refusé au terminal** — d'où
> l'importance de l'import (ci-dessous) avant le premier jour de service.

### Changer le droit d'un élève

1. Trouvez l'élève (champ *Rechercher par nom ou matricule*, ou filtres
   **classe** / **statut**).
2. Cliquez sur la **pastille de statut** dans la colonne *Statut Droit*.
3. Elle bascule immédiatement : vert **Autorisé** ⇄ rouge **Non autorisé**.

La colonne *Dernière Modif.* affiche la date et **qui** a fait le changement.

Si la pastille est grisée et ne réagit pas, vous n'avez pas le droit de
modification — c'est normal, la lecture reste ouverte.

### Voir l'historique d'un élève

L'icône 🕘 en bout de ligne ouvre la chronologie complète : quand, qui, de quel
statut vers quel statut, et par quel moyen (saisie manuelle ou import).
**Chaque modification est enregistrée, sans exception.**

[CAPTURE — fenêtre d'historique d'un élève]

### Importer la liste des autorisés (Excel)

C'est la manière de préparer une rentrée : la direction fournit la liste, vous
la chargez d'un coup.

1. Cliquez sur **Importer Liste (XLSX)**.
2. Choisissez le fichier.
3. Un récapitulatif s'affiche : reçus, créés, mis à jour, ignorés, erreurs.

Le fichier doit contenir une colonne de **matricule** (`Matricule`, `Matricula`,
`ID` ou `employeeNo`). Une colonne `Statut` est facultative : **sans elle, tout
le monde est mis à Autorisé** — parce que ce fichier *est* la liste des
autorisés.

> ⚠️ **Les zéros du début.** Les matricules commencent souvent par des zéros
> (`0004486`). Excel les mange en transformant la colonne en nombre, et plus
> aucune ligne ne correspond. **Mettez la colonne au format Texte avant
> d'enregistrer**, et ne « corrigez » jamais le fichier dans Excel après coup.

---

## 12. Sorties

**Les autorisations de sortie des élèves.** Écran du portail.

[CAPTURE — écran Sorties]

Le tableau **Autorisations Actives** liste, pour chaque élève : le **type**, la
**validité**, **qui a autorisé** et la note éventuelle.

### Créer une autorisation

1. Cliquez sur **Nouvelle Autorisation**.
2. **Matricule de l'élève** (ex. `0001764`).
3. **Autorisé par (Responsable)** — obligatoire. C'est la trace de la décision :
   écrivez un nom, pas « parents ».
4. Choisissez le **type** :
   - **Sortie unique** → une date et une heure de sortie, une date et une heure
     de retour maximum. Consommée à la première sortie réelle.
   - **Récurrente** → une heure de début, une heure de fin, et les jours de la
     semaine. Valable jusqu'au 31 décembre de l'année en cours.
5. **Observations** si nécessaire.
6. **Enregistrer l'autorisation**.

[CAPTURE — formulaire Nouvelle Autorisation, type Récurrente]

### Révoquer une autorisation

Bouton **Révoquer** en bout de ligne, avec confirmation.

> La révocation ne supprime rien : l'autorisation est marquée révoquée, avec la
> date et l'auteur. On peut toujours répondre à « qui avait autorisé quoi, et
> quand a-t-on annulé ».

### Le flux des tentatives refusées du portail

En bas de l'écran, le même flux qu'à la cantine, mais pour le portail : les
élèves sortis **sans autorisation valide**. Actualisé toutes les 5 secondes.

---

## 13. Panneau administrateur

Accessible par le **cadenas 🔒** de la barre du haut, **protégé par un code PIN**.

[CAPTURE — la demande de code PIN]

> Après 5 échecs, la saisie est bloquée pendant 60 secondes.

[CAPTURE — Panneau administrateur, les 7 compteurs]

### Les compteurs

**Première ligne :** Accès aujourd'hui · Autorisés · Barrés · En zones spéciales.
**Deuxième ligne :** Alertes aujourd'hui · Tentatives refusées · **Divergences**.

La carte **Divergences** a une bulle d'aide (survolez le ⓘ) — lisez-la, elle
explique tout. Voir aussi [§A.4](#a4-les-divergences-ne-sont-pas-des-erreurs).

### Synchronisation Pronote

La carte **Intégration Pronote** affiche la dernière synchronisation.
Le bouton **Synchroniser maintenant** la relance à la demande — la
synchronisation automatique tourne de toute façon toutes les nuits à 3 h.

### Le journal du jour

Les **50 derniers** mouvements, avec des filtres (secteur, action, dates) et deux
boutons d'export : **Exporter PDF** et **Exporter CSV**.

> ⚠️ Les filtres ne s'appliquent **qu'après avoir cliqué sur « Appliquer
> filtres »**. Tant que le bouton porte une petite puce (•), ce que vous voyez
> ne correspond pas encore à ce que vous avez choisi.

### Gestion des opérateurs *(administrateur uniquement)*

Créer, modifier, désactiver les **comptes qui se connectent à l'application**.

### Gestion des utilisateurs *(administrateur uniquement)*

Modifier ou désactiver les **personnes** — élèves, professeurs, personnels,
responsables.

1. Cherchez par nom ou matricule (cochez *Mostrar inativos* pour voir les
   désactivés).
2. **Éditer** → nom, type, classe ; téléphone et lien de parenté pour un
   responsable.
3. **Désactiver** → la personne ne passe plus dans les secteurs. **Il n'y a pas
   de suppression ici** : on désactive, on n'efface pas.

---

## 14. Paramètres et inscriptions

L'**engrenage ⚙** de la barre du haut. Six onglets dans la colonne de gauche.

[CAPTURE — la fenêtre Paramètres avec ses six onglets]

> La fenêtre occupe tout l'écran. **`Échap` la ferme**, et la touche `Tab`
> circule à l'intérieur sans partir sur l'écran de derrière. Le bouton principal
> de chaque onglet reste toujours visible en bas.

### 14.1 Onglet « Importar Excel » — inscrire en masse

Pour charger un fichier d'élèves et de responsables.

Colonnes attendues : `ID, Nome, Tipo, Turma, ResponsavelId, Parentesco,
Telefone, Foto`. Les types acceptés sont `ALUNO`, `PROFESSOR`, `FUNCIONARIO`,
`RESPONSAVEL` — **en majuscules**.

Déposez le fichier dans la zone en pointillés. Un message indique combien de
lignes sont passées, et combien ont échoué.

### 14.2 Onglet « HikCentral » — récupérer les visages

C'est ici qu'on relie les **visages enregistrés dans le terminal** aux personnes
du système. Sans ce lien, le terminal reconnaît la personne mais MAGBO ne sait
pas qui c'est, et **la refuse à chaque passage**.

**Le fichier :** l'export **« Renseignements personnels »** du HikCentral,
au format `.xlsx`. Les colonnes lues sont `ID`, `Prénom`, `Nom de famille`,
`Service`.

**Rien n'est enregistré avant que vous confirmiez.**

1. Déposez le fichier. Le système lit les lignes et **simule**.
2. Cinq compteurs s'affichent :

   | Compteur | Signification |
   |---|---|
   | **Créer** | Nouvelle personne à inscrire |
   | **Mettre à jour** | Personne déjà connue : on ajoute son identifiant de visage |
   | **Ignorer** | Rien à faire, c'est déjà à jour |
   | **Conflit** | Deux lignes se disputent le même identifiant |
   | **Conférer** | ⚠️ Demande votre intervention (voir ci-dessous) |

3. Vérifiez, puis cliquez sur le bouton du bas :
   **« CONFIRMER — X créer, Y mettre à jour »**.

[CAPTURE — la simulation avec ses cinq compteurs]

**Les lignes « Conférer ».** Ce sont des élèves dont l'identifiant HikCentral
n'est pas la matricule : impossible de faire le rapprochement automatiquement.
**Seul le nom fait le lien** — et rapprocher automatiquement reviendrait à
donner le visage d'un élève à un autre.

Pour chacune, cliquez sur **Conférer** :
1. Cherchez l'élève par son nom (le nom du HikCentral est déjà pré-rempli).
2. Cliquez sur le bon élève.
3. **Deux encadrés s'affichent côte à côte** — à gauche en vert, l'élève qui
   **reçoit** le visage ; à droite en rouge, l'enregistrement qui sera
   **désactivé**. **Lisez-les avant de confirmer.**
4. **CONFIRMER LE RAPPROCHEMENT**.

Une coche verte remplace le bouton une fois le rapprochement fait.

> Si l'élève n'existe pas du tout dans MAGBO, un message le dit : il doit
> **d'abord** arriver par l'import Pronote. **On n'inscrit pas un élève ici.**

[CAPTURE — les deux encadrés vert/rouge du rapprochement]

### 14.3 Onglet « Servidores » — le personnel

La liste des **professeurs et personnels**. **Les élèves n'y sont pas** : leur
fiche vient de Pronote.

Colonnes : matricule, nom, type, département, identifiant Hikvision, et le
**nombre de passages** enregistrés.

Cherchez avec le champ du haut (nom, matricule, département ou identifiant).
Quatre ou cinq boutons par ligne :

| Bouton | Effet |
|---|---|
| **Editar** | Changer le type (Professeur / Personnel) et le département |
| **É um aluno** | *« C'est en fait un élève »* — voir ci-dessous |
| **Inativar** / **Reativar** | Sortir de la circulation / remettre |
| **Remover** | Suppression définitive — **n'apparaît que si la fiche n'a aucun passage** |

> **Pourquoi « Remover » est souvent absent :** supprimer une fiche qui a des
> passages laisserait ces passages sans propriétaire. Le système ne le propose
> donc pas. Utilisez **Inativar**.

[CAPTURE — la liste des Servidores avec les boutons d'action]

#### « É um aluno » — corriger un élève classé comme personnel

**À quoi ça sert.** À la récupération des visages, des élèves qui n'étaient pas
dans le bon département du HikCentral ont été inscrits **comme personnel**, avec
une matricule `FUNC-###`. Leur visage fonctionne, mais leurs passages sont
comptés comme ceux d'un membre du personnel. Ce bouton transfère le visage à
l'élève et retire la fausse fiche.

1. Cliquez sur **É um aluno** sur la ligne fautive.
2. Cherchez le vrai élève par son nom (pré-rempli).
3. Cliquez sur le bon élève.
4. **Deux encadrés côte à côte** apparaissent :
   - **vert — Aluno (recebe a face)** : l'élève qui reçoit le visage. Son nom,
     sa classe et son type **ne changent pas**.
   - **rouge — Servidor (será inativado)** : la fiche qui sort de circulation.
     Ses passages **restent sur elle** — le passé n'est pas réécrit.
5. Si l'élève avait **déjà** un autre visage, une case à cocher orange apparaît
   et **vous devez la cocher** : l'ancien visage cessera de le reconnaître.
6. **CONFIRMAR — é um aluno**.

[CAPTURE — le panneau « É um aluno » avec ses deux encadrés]

> Si aucun élève ne ressort de la recherche, un message orange le dit : l'élève
> doit d'abord arriver par l'import Pronote.

### 14.4 Onglet « Importar Servidores » — le personnel en masse

Un fichier `.xlsx` avec les colonnes `nome, hikvision_employee_id, tipo,
departamento, matricula`.

- **nome** est obligatoire ;
- **matricula** vide → le système attribue le prochain `FUNC-###` ;
- **tipo** accepte `PROFESSOR` ou `FUNCIONARIO` (vide → `FUNCIONARIO`) ;
- **departamento** est du texte libre (*Vie Scolaire*, *Direção*, …).

Les lignes refusées sont listées avec leur motif. **Les élèves n'entrent pas par
ici.**

> ⚠️ Même piège des zéros du début qu'au §11 : matricule et identifiant Hikvision
> doivent être en **format Texte** dans Excel.

### 14.5 Onglet « Cadastro Manual » — inscrire une personne

Le formulaire change selon le **type** choisi :

- **ALUNO** → nom, classe, identifiant du responsable ;
- **RESPONSAVEL** → nom, lien de parenté, téléphone ;
- **PROFESSOR / FUNCIONARIO** → nom, **matricule** (laissée vide, le système
  affiche d'avance celle qu'il attribuera), **identifiant Hikvision**
  (10 chiffres — c'est lui qui relie le visage à la fiche) et **département**
  (liste de suggestions, mais vous pouvez taper autre chose).

Le bouton **CADASTRAR** est en bas, toujours visible.

> Après l'inscription d'un membre du personnel, le message de confirmation
> **affiche la matricule attribuée** : c'est le numéro à reporter dans le
> HikCentral. S'il n'y a pas d'identifiant Hikvision, le message le signale en
> orange — **le visage ne sera pas reconnu**.

[CAPTURE — formulaire d'inscription d'un membre du personnel]

### 14.6 Onglet « Gerais »

Un seul réglage aujourd'hui : **Mode plein écran**.

---

## A. Les pièges connus

### A.1 « En attente » n'est pas « refusé » — mais finit par l'être

Un élève **En attente** est un élève dont personne n'a rempli le droit au repas.
C'est une case vide, pas une décision.

**Mais en production, la règle configurée refuse les « En attente ».** Le
raisonnement : un élève dont le droit n'est pas confirmé ne doit pas être compté
comme un repas payé.

> **Conséquence pratique : si l'import de la liste des autorisés (§11) n'est pas
> fait avant le premier jour de service, tout le monde est refusé.** Ce n'est
> pas une panne, c'est la règle qui s'applique à une base vide.

### A.2 Le personnel est masqué par défaut dans les chiffres du CDI

Le CDI compte **152 personnels et 49 professeurs**. Ils entrent quelques
secondes, ressortent **sans pointer**, et la clôture automatique de 17 h
transforme ça en « présence d'une journée entière ». Un jour, une quinzaine de
fiches `FUNC-###` se sont retrouvées fermées ainsi.

**Le CDI parle des élèves.** Le personnel est donc masqué par défaut :
- dans les **statistiques du CDI** (§6) — la ligne grise annonce
  « Élèves seulement » ;
- dans la **carte CDI du Rapport Général** (§10) — la case
  « Inclure le personnel (CDI) » est décochée.

> ⚠️ **Ce n'est qu'un filtre d'affichage.** Rien n'est effacé : tous les passages
> sont enregistrés, et l'onglet **Journal** (§10) montre tout, tout le temps.
> Si vos chiffres ne concordent pas avec ceux d'un collègue, **regardez d'abord
> cette case à cocher** — c'est neuf fois sur dix l'explication.

### A.3 Les saisies manuelles portent votre nom

Un passage enregistré à la main dans l'application (§3, §4, §5) est marqué avec
**l'identifiant de la personne connectée**, dans un champ nommé
`created_by_user`. Un passage venu du terminal n'a pas cette marque.

C'est ce qui permet, plus tard, de répondre à « ce passage vient-il du visage ou
du clavier ? ». **À l'écran, les deux se ressemblent** : la distinction est dans
la base, pas dans l'affichage. Si vous devez prouver l'origine d'un
enregistrement, c'est là qu'il faut regarder.

La clôture automatique de 17 h suit la même règle : elle s'enregistre comme
`system`, **jamais déguisée en badge**.

### A.4 Les divergences ne sont pas des erreurs

Une **divergence** = le terminal a validé l'identité et laissé passer, mais
MAGBO a refusé selon la règle.

Pour la cantine, c'est **par construction** : le système ne verrouille pas la
porte, donc chaque exception traitée par l'opérateur produit une divergence.
Un compteur de divergences à zéro pendant le service voudrait plutôt dire que
**personne ne regarde l'écran**.

### A.5 Le même repas compté deux fois — les trois filets

Trois protections différentes existent, et elles ne font pas la même chose.
Vous n'avez rien à régler, mais si un passage « disparaît », voici pourquoi :

| Filet | Ce qu'il attrape | Fenêtre |
|---|---|---|
| Renvoi d'appareil | Le terminal a renvoyé **exactement le même** message | 60 s |
| Même passage | Le terminal a reconnu **deux fois la même personne** | 30 s |
| Repas dupliqué | **Règle métier** : deuxième repas dans la journée | 90 s |

### A.6 Les zéros du début, dans Excel

Les matricules (`0004486`) et les identifiants Hikvision commencent par des
zéros. Excel transforme volontiers la colonne en nombre et mange le zéro — et
alors **plus aucune ligne ne correspond**.

**Règle :** ces colonnes sont au format **Texte**. Toujours. À l'import comme à
l'export. Ne « nettoyez » jamais un fichier d'échange dans Excel.

### A.7 La clôture automatique de 17 h

La présence se déduit du **dernier événement**. Quelqu'un qui ne pointe pas en
sortant resterait « à l'intérieur » indéfiniment. Chaque soir, une sortie
automatique est donc écrite pour le CDI, **horodatée à 17 h 00** (pas à l'heure
où le traitement s'est exécuté).

Ces sorties **ne comptent pas** dans les durées moyennes : ce n'est l'heure de
sortie de personne.

> À ce jour, seul le **CDI** est clôturé automatiquement. La cantine ne l'est pas
> encore.

---

## B. Que faire quand ça ne marche pas

### L'application s'ouvre mais tout est vide

**C'est presque toujours le mauvais raccourci.** Fermez, et rouvrez par
**Abrir-MAGBO** (§0.2) — pas par le `.exe`.

Si vous avez bien ouvert par le raccourci, regardez l'indicateur de connexion en
bas à droite de l'écran : il vous dira si le serveur répond.

### « Erreur de communication avec le serveur »

Le poste ne joint pas le serveur. Dans l'ordre :
1. Attendez 30 secondes — le message peut être passager.
2. Vérifiez que le poste a bien le réseau.
3. Prévenez Sam. **N'essayez pas de réinstaller quoi que ce soit.**

> **Pendant ce temps, les passages continuent d'être enregistrés.** Le terminal
> envoie directement au serveur : c'est **votre écran** qui est aveugle, pas le
> système. Rien n'est perdu ; c'est la surveillance en direct qui manque.

### Le flux des tentatives refusées reste vide pendant le service

Deux possibilités : soit tout est en ordre, soit l'écran ne reçoit plus rien.
Pour trancher, faites passer un élève dont vous savez qu'il n'a pas le droit :
s'il n'apparaît pas dans les 5 secondes, prévenez Sam.

### Un élève est refusé alors qu'il a le droit

1. Ouvrez **Droits Repas** (§11) et cherchez-le.
2. Si son statut est **En attente**, c'est ça (§A.1) — mettez-le à *Autorisé*.
3. S'il est déjà **Autorisé**, notez l'heure et le nom, et prévenez Sam : c'est
   probablement un problème de visage non relié (§14.2).

### Je ne trouve pas un écran dont on m'a parlé

C'est votre profil (§1). Les écrans ne sont pas cachés au hasard : chaque profil
voit ce qui le concerne. Demandez à la direction.

### Sortir du mode plein écran (mode kiosque)

`Ctrl`+`Shift`+`Alt`+`Q`, puis le code PIN.

---

## C. Petit lexique

| Terme à l'écran | Ce que ça veut dire |
|---|---|
| **Autorisé / Non autorisé / En attente** | Le droit au repas. *En attente* = case non remplie (§A.1) |
| **Tentative refusée** | Le terminal a laissé passer, MAGBO refuse selon la règle |
| **Divergence** | Une tentative refusée où la personne est passée quand même (§A.4) |
| **Alerte** | Un passage enregistré mais signalé (hors horaire, durée dépassée) |
| **Hors horaire** | Passage en dehors des heures de repas de cette classe |
| **Repas dupliqué** | Deuxième repas dans la même journée |
| **Passage éclair** | Entrée + sortie en moins d'une minute — pas une permanence |
| **Matricule** | Le numéro de la personne (7 chiffres, zéros du début compris) |
| **Identifiant Hikvision** | Le numéro qui relie le **visage** enregistré à la fiche |
| **Servidor** | Un membre du personnel : professeur ou personnel |
| **FUNC-###** | Matricule attribuée automatiquement à un membre du personnel |
| **Clôture automatique** | La sortie écrite par le système à 17 h (§A.7) |

---

## Et si ce manuel se trompe ?

Il décrit l'application telle qu'elle est aujourd'hui, écran par écran. Si vous
trouvez un écart entre ce texte et ce que vous voyez, **c'est le manuel qui a
tort** : signalez-le à Sam. Un manuel faux est pire qu'une absence de manuel.

*MAGBO Access Control — Lycée Molière · MAGBO Studio*
