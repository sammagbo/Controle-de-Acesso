# Procédure de mise à jour annuelle des élèves — MAGBO Access Control

Ce document décrit, étape par étape, comment mettre à jour la liste des élèves
au début de chaque année scolaire. Aucune compétence en programmation n'est
nécessaire : il suffit de suivre les étapes dans l'ordre.

La synchronisation gère automatiquement les trois cas :
- **Nouvel élève** (identifiant inconnu) → créé.
- **Élève qui continue** (identifiant déjà connu) → mis à jour (classe, responsables).
- **Élève parti** (présent en base, absent du nouvel export) → désactivé
  (`ativo = false`). Son historique est conservé, il n'apparaît plus dans les listes.

---

## Vue d'ensemble

```
Pronote  ->  fichier export  ->  script de conversion  ->  export_pronote.csv  ->  synchronisation  ->  base à jour
```

---

## Étape 1 — Exporter la liste depuis Pronote

Dans Pronote, exporter la liste des élèves avec, pour chaque élève, les colonnes
suivantes :

| Colonne Pronote | Contenu |
|---|---|
| `ID` | Identifiant de l'élève (7 chiffres, ex. `0003614`) |
| `NOM` | Nom de famille |
| `PRENOM` | Prénom |
| `CLASSES` | Classe (ex. `1E1`, `CE2A`) |
| `Responsable1_NOM` | Nom du responsable principal |
| `Responsable1_PRENOM` | Prénom du responsable principal |
| `Responsable1_CIVILITE` | Civilité (M., Mme) |
| `Responsable2_NOM` | Nom du second responsable (facultatif) |
| `Responsable2_PRENOM` | Prénom du second responsable (facultatif) |
| `Responsable2_CIVILITE` | Civilité du second responsable (facultatif) |

Pronote permet d'exporter en **CSV** ou en **XLSX** : les deux formats fonctionnent
avec le script de conversion.

> **Important — les zéros initiaux.** Les identifiants Pronote commencent par des
> zéros (`0003614`). Si vous ouvrez un fichier dans Excel, celui-ci supprime ces
> zéros (`3614`). Ce n'est pas grave : le script de conversion les rétablit
> automatiquement. Vous n'avez rien à corriger à la main.

> **Note sur les responsables.** Pronote ne fournit pas d'identifiant pour les
> responsables. Le système en génère un automatiquement à partir de l'identifiant
> de l'élève (`R0003614` pour le premier responsable, `R0003614_2` pour le second).
> C'est volontaire, il n'y a rien à faire de votre côté.

---

## Étape 2 — Convertir au format MAGBO

Le fichier Pronote n'est pas directement utilisable : il faut le convertir au
format attendu par le système (12 colonnes, identifiants à 7 chiffres). Le script
`convert_pronote.py` s'en charge.

Prérequis (une seule fois sur le poste) : installer les dépendances.
```
pip install pandas openpyxl
```

Conversion (à chaque mise à jour) :
```
python convert_pronote.py CHEMIN_DU_FICHIER_PRONOTE export_pronote.csv
```

Exemples :
```
python convert_pronote.py eleves_2026.xlsx export_pronote.csv
python convert_pronote.py eleves_2026.csv export_pronote.csv
```

Le script affiche le nombre d'élèves convertis. S'il signale des élèves « sans
identifiant Pronote ignorés », ce sont généralement d'anciens élèves : vérifiez
que c'est attendu.

---

## Étape 3 — Placer le fichier dans le dossier de synchronisation

Copier le fichier `export_pronote.csv` produit à l'étape 2 dans le dossier :
```
backend/ftp_drop/export_pronote.csv
```

Le fichier doit porter exactement ce nom : `export_pronote.csv`.

---

## Étape 4 — Lancer la synchronisation

Deux possibilités, au choix.

**A — depuis l'application (recommandé)**
1. Ouvrir l'application MAGBO et se connecter en administrateur.
2. Aller dans le tableau de bord d'administration.
3. Cliquer sur le bouton de synchronisation Pronote.

**B — par requête directe** (si l'application n'est pas disponible)
Le backend doit être démarré. Envoyer une requête `POST` authentifiée vers :
```
POST http://localhost:8080/api/pronote/sync
```

---

## Étape 5 — Vérifier le résultat

La synchronisation renvoie un rapport :
```json
{
  "created": 12,
  "updated": 911,
  "deactivated": 5,
  "errors": 0,
  "filePath": "CSV[./ftp_drop/export_pronote.csv]"
}
```

Points à contrôler :
- **`errors` doit être à 0.** S'il y a des erreurs, elles sont listées dans
  `errorMessages` avec le numéro de ligne concerné.
- `created` / `updated` / `deactivated` doivent correspondre à ce que vous attendez
  (nouveaux élèves, élèves existants, élèves partis).
- Dans le tableau de bord, le compteur « Inscrits » doit refléter le nouveau total.

Après une synchronisation réussie (`errors: 0`), le fichier est automatiquement
renommé avec un suffixe `.processed` et la date du jour, pour éviter de le
retraiter par erreur.

---

## Étape 6 — Cas particuliers

### Nouvelle classe
Si une classe n'existait pas l'année précédente (ex. une nouvelle section), il faut
lui définir un horaire de cantine, sinon la logique du réfectoire ne saura pas la
gérer. Ajouter l'horaire via l'API d'administration :
```
PUT /api/admin/class-schedules/{classe}
```
en précisant l'heure de déjeuner pour chaque jour (lundi à vendredi).

### Photos des nouveaux élèves
Les photos sont stockées dans le terminal Hikvision, pas dans MAGBO. Pour les
nouveaux élèves, transmettre les photos au service informatique, **nommées avec
l'identifiant à 7 chiffres** (ex. `0003614.jpg`).

### Identifiants dans le terminal
Le terminal Hikvision doit utiliser les **mêmes identifiants à 7 chiffres** que
MAGBO. Pour les nouveaux élèves, s'assurer auprès du service informatique qu'ils
sont enregistrés dans le terminal avec ce format.

---

## Résumé rapide (mémo)

```
1. Exporter depuis Pronote (CSV ou XLSX) avec les colonnes requises
2. python convert_pronote.py fichier_pronote export_pronote.csv
3. Copier export_pronote.csv dans backend/ftp_drop/
4. Lancer la synchronisation (bouton admin)
5. Vérifier : errors = 0
6. Nouvelles classes -> définir l'horaire ; nouvelles photos -> au service info (nom = ID 7 chiffres)
```
