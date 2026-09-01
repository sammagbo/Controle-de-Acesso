# À imprimer et scotcher à côté de l'écran

> **Une page. Pour l'AED du portail, la cantine, le CDI, l'infirmerie.**
> Personne ici n'a besoin d'ouvrir un fichier dans un dépôt git.

---

# Si un bandeau apparaît en haut de l'écran

## ✅ CE QUI CONTINUE DE FONCTIONNER, NORMALEMENT

- **Les passages sont toujours enregistrés.** Les portiques, la cantine, le CDI,
  l'infirmerie : tout ce que les lecteurs voient entre en base, comme d'habitude.
- **Votre écran de poste fonctionne.** Le portail, le Moniteur Cantine, la
  banque de prêt du CDI, l'infirmerie : rien n'a changé.
- **Au portail, le verdict affiché au moment du passage fonctionne toujours** —
  y compris pour une autorisation de sortie ponctuelle.
- **La liste PPMS fonctionne, avec les NOMS.** En cas d'évacuation, vous savez
  toujours qui est à l'intérieur. C'est l'écran « PPMS », il est intact.
- **Vous pouvez vous connecter** comme d'habitude.

## ⛔ N'OUVREZ PAS DE CAHIER PAPIER

C'est la seule erreur à ne pas faire. Le système enregistre toujours ; noter les
passages à la main les ferait exister à deux endroits, dont un seul est
consultable ensuite.

## ⚠️ AU PORTAIL, UNE SEULE CHOSE CHANGE

**La LISTE des autorisations de sortie n'est plus consultable** (l'écran
« Sorties »). Le verdict qui s'affiche quand l'élève PASSE, lui, fonctionne
normalement.

Concrètement : si un parent se présente pour venir chercher un élève **avant**
son passage, vous ne pouvez plus vérifier à l'écran. **Demandez la liste
imprimée du jour à la Vie Scolaire** — elle doit l'imprimer chaque matin
pendant cette période.

## ⚠️ CE QUI EST SUSPENDU

Seuls les écrans d'**administration** : les rapports et exports, la
configuration, le planning de la cantine, les droits repas, les autorisations et
régimes de sortie, les importations, la gestion des comptes.

Si vous ouvrez l'un d'eux, il affichera un message expliquant que la fonction
est suspendue. **Ce n'est pas une panne, et rien n'a été effacé.**

---

# Que faire

1. **Continuez à travailler normalement.** Rien de ce que vous faites au
   quotidien n'est concerné.
2. **Prévenez la direction** — une fois suffit, ce n'est pas urgent.
3. **N'appelez pas le SI pour le réseau ou les terminaux** : ce n'est ni l'un ni
   l'autre, ni la base de données. (La direction, elle, a une vérification à
   faire — voir en bas de page : dans un cas, c'est bien un problème
   d'installation.)

**Renouvellement du logiciel :** MAGBO STUDIO — sammagbo@gmail.com

---

# Les trois bandeaux possibles

| Ce que vous voyez | Ce que ça veut dire |
|---|---|
| **« Période d'utilisation : encore N jours »** (bleu) | Simple préavis. **Rien n'est suspendu.** Normalement seuls la direction et l'administrateur le voient. |
| **« Période dépassée depuis N jours »** (orange) | La date est passée. **Rien n'est encore suspendu** — il y a un mois de tolérance. |
| **« Fonctions de gestion suspendues »** (gris) | Les écrans d'administration sont fermés. Tout le reste, ci-dessus, fonctionne. |

---

## Pour la direction, en une ligne

L'état exact se lit sur le serveur :

```
curl -s http://<serveur>:8080/api/health
```

Si la réponse contient `"motif":"ABSENTE"`, ce n'est **pas** une échéance : le
fichier de licence n'a pas été déposé sur le serveur, ou son montage manque.
C'est un problème de déploiement, et il se corrige sans rien renouveler.
Procédure complète : `docs/operacional/procedimento-licence.md`.

---

*Affiché le ________ · en cas de doute, voir ______________________ (Vie Scolaire / direction)*

*Une feuille scotchée sans date reste au mur deux ans. Datez-la.*
