# Licence MAGBO — émettre, déposer, vérifier

**Une page. Pour Sam, depuis n'importe où, sans relire de code.**
Le raisonnement derrière tout ceci vit dans
[`ADR-006`](../architecture/decisoes/ADR-006-licence-degradation-par-couches.md).

---

## ⚠️ D'abord, ce qui ne s'arrête jamais

Quel que soit l'état de la licence — expirée, absente, fichier abîmé, horloge
cassée — **ces quatre choses continuent de fonctionner** :

- l'enregistrement des passages venant des terminaux (le webhook) ;
- les écrans des postes : portail, CDI, cantine, infirmerie ;
- **le PPMS et sa liste NOMINATIVE**, impression comprise ;
- la connexion des opérateurs.

Ce qui se ferme, ce sont les **écrans de gestion**. Si vous lisez cette page en
urgence parce que « le système est bloqué » : il ne l'est pas. Regardez d'abord
`/api/health` (§ 4).

---

## 0-bis. ⚠️ VOUS N'ÊTES PAS SAM, et la licence a expiré

Cette page est écrite pour l'émetteur. Toutes les actions d'émission demandent
la **clé privée**, que par construction vous n'avez pas. Voici votre matinée.

**1. Rien n'a été supprimé, et rien n'est en panne.** Vérifiez-le en trente
secondes plutôt que de me croire :

```bash
curl -s http://localhost:8080/api/health
```

`"database":"CONNECTED"` et un `"licence"` qui répond : la base est là, le
service tourne. Puis regardez le compteur de passages monter dans
l'application — les portiques continuent d'écrire.

**2. Ce qui marche encore, et c'est l'essentiel :** l'enregistrement des
passages, tous les écrans de poste, **le PPMS avec les noms**, et la connexion.
Une évacuation se gère exactement comme avant.

**3. Ce qui est fermé :** les écrans d'administration (rapports, exports,
configuration, planning cantine, droits repas, sorties, régimes, importations,
gestion des comptes).

**4. Ce que vous pouvez faire tout de suite :**

- Distribuer `docs/operacional/licence-note-aux-postes.md` aux postes — une page,
  à imprimer. Elle dit surtout **de ne pas ouvrir de cahier papier**.
- Écrire à **MAGBO STUDIO — sammagbo@gmail.com** pour un renouvellement.
- Vérifier d'abord si ce n'est pas un **déploiement raté** plutôt qu'une
  échéance : si `/api/health` dit `"motif":"ABSENTE"`, le fichier ou son montage
  manque, et cela se corrige sans rien renouveler (§ 2).

**5. ⚠️ Une limite à connaître :** la gestion des comptes étant fermée, un
opérateur qui **oublie son mot de passe** ne peut plus être débloqué. Le compte
**ADMIN**, lui, se connecte toujours. Avant la date d'échéance, assurez-vous que
la direction détient le mot de passe administrateur. (Voir aussi § 10.)

---

## 0. ⚠️ La clé privée

Elle a été générée **hors du dépôt** et se trouve ici :

```
C:\Users\smagbo\magbo-licence-cles\magbo-licence-privee.pem
```

**Sauvegardez-la ailleurs aujourd'hui** — gestionnaire de mots de passe, disque
chiffré, coffre. Elle n'est nulle part d'autre.

- **Perdue** → plus aucune licence émissible. Il faudrait régénérer une paire,
  recompiler le backend avec la nouvelle clé publique, et redéployer.
- **Divulguée** → n'importe qui peut émettre une licence perpétuelle pour ce
  logiciel.
- **Elle ne va JAMAIS** : dans le dépôt (il est public), sur la VM, dans un
  courriel, dans une capture d'écran.

La clé **publique** correspondante est compilée dans le backend
(`LicenceVerifier.CLE_PUBLIQUE`). Elle ne permet que de vérifier.

---

## 1. Quelle licence tourne en ce moment ?

⚠️ **La réponse n'est pas dans ce document, et c'est délibéré.** Elle est sur le
serveur :

```bash
curl -s http://localhost:8080/api/health | grep -o '"licence".*'
```

C'est la **seule** source qui ne peut pas mentir : elle lit le fichier qui est
réellement monté, avec la signature réellement vérifiée. Un document qui
annoncerait une date deviendrait faux le jour du premier renouvellement — et ce
défaut s'est produit, voir l'encadré du § 7.

Le fichier lui-même vit à deux endroits, et à aucun autre :

| Où | Quoi |
|---|---|
| VM | `~/Controle-de-Acesso/deploy/licence/licence.magbo` (monté en lecture seule) |
| PC de Sam | le dossier de clés, **hors du dépôt** (voir § 0) |

*Observation datée, pas une vérité permanente — au **01/09/2026**, la licence en
service était `LYCEEM-20270331`, émise le 2026-09-01, valide jusqu'au
2027-03-31. Si vous lisez ceci plus tard, la commande ci-dessus fait foi.*

---

## 2. Déposer la licence sur la VM

Le fichier va dans **`deploy/licence/licence.magbo`** (le nom exact compte).
`docker-compose.yml` monte ce répertoire en lecture seule dans le conteneur.

```bash
# depuis le poste qui a le fichier
scp licence.magbo utilisateur@vm:~/Controle-de-Acesso/deploy/licence/licence.magbo

# sur la VM
cd ~/Controle-de-Acesso/deploy
docker compose up -d          # ou : docker restart magbo-backend
```

⚠️ **Ne mettez jamais la licence sous `backend/target/`.** Ce répertoire est la
sortie de Maven : `mvn clean` l'efface et chaque build le réécrit. La licence
disparaîtrait au premier redéploiement et les écrans de gestion se fermeraient
sans que personne ne fasse le lien.

**Sur le PC de développement** (profil `prod` en local), le fichier va dans
`backend/licence/licence.magbo` — chemin ignoré par git.

---

## 3. Émettre une nouvelle licence (depuis la France, en deux minutes)

Il faut un **JDK 17+** et la clé privée. Rien d'autre : pas de Maven, pas de
réseau.

```bash
java tools/licence/MagboLicence.java emettre \
     --etablissement "Lycée Molière" \
     --jusqu-au 2027-06-30 \
     --cle-privee /chemin/vers/magbo-licence-privee.pem \
     --sortie licence.magbo
```

`--mois 6` remplace `--jusqu-au` si vous préférez compter en mois à partir
d'aujourd'hui. `--id` est facultatif (un identifiant est calculé sinon).

**Puis vérifiez AVANT d'envoyer** — c'est l'étape qu'on saute et qu'on regrette :

```bash
java tools/licence/MagboLicence.java verifier \
     --fichier licence.magbo \
     --cle-publique /chemin/vers/magbo-licence-publique.txt
```

La dernière ligne doit dire `signature : VALIDE`.

> ⚠️ **Console Windows et accents.** Si votre terminal affiche `Lyc?e Moli?re`,
> ce n'est probablement que l'affichage. L'outil **refuse** d'émettre si le nom
> lui arrive réellement abîmé (il détecte `?` et le motif `Ã©`) — donc si la
> commande passe, le nom signé est correct. En cas de doute :
> `cat licence.magbo` dans Git Bash, ou lancez la commande depuis Git Bash /
> Windows Terminal / PowerShell 7.

---

## 4. Vérifier l'état courant — une seule commande

```bash
curl -s http://localhost:8080/api/health | grep -o '"licence".*'
```

| Ce que vous lisez | Ce que ça veut dire |
|---|---|
| `"etat":"VALIDE"` | Tout va bien, aucun bandeau à l'écran |
| `"etat":"ALERTE"` | Moins de 30 jours. Bandeau pour l'admin et la direction. **Rien n'est fermé** |
| `"etat":"COURTOISIE"` | Date passée depuis moins de 30 jours. **Rien n'est fermé** |
| `"etat":"EXPIREE"` + `"motif":"PERIODE_DEPASSEE"` | Écrans de gestion fermés. Émettre une nouvelle clé (§ 3) |
| `"etat":"EXPIREE"` + `"motif":"ABSENTE"` | **Déploiement raté**, pas une échéance : fichier ou montage manquant (§ 2) |
| `"etat":"EXPIREE"` + `"motif":"SIGNATURE_INVALIDE"` | Le fichier a été modifié après émission, ou émis avec une autre clé |
| `"etat":"EXPIREE"` + `"motif":"HORLOGE_RECULEE"` | L'horloge de la VM est en retard. Voir § 6 |

Vue complète (nécessite d'être connecté) : `GET /api/licence`.

Les journaux du backend disent la même chose, en clair et en gros, à chaque
démarrage :

```bash
docker logs magbo-backend 2>&1 | grep -i licence
```

---

## 5. Renouveler SANS redémarrer

Déposez le nouveau `licence.magbo` (§ 2), puis, avec un compte **ADMIN** :

```bash
# a) obtenir un jeton ADMIN
JETON=$(curl -s -X POST http://localhost:8080/api/auth/login \
          -H "Content-Type: application/json" \
          -d '{"username":"admin","password":"<mot-de-passe-admin>"}' \
        | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

# b) relire la licence
curl -X POST http://localhost:8080/api/admin/licence/recharger \
     -H "Authorization: Bearer $JETON"
```

La réponse est le nouvel état. Cette route **reste ouverte même sous licence
expirée** — sans quoi le système se verrouillerait hors de sa propre
réparation. Ce n'est pas un contournement : la relecture repasse par la
signature.

Sans cet appel, la nouvelle licence est prise en compte **au plus tard le
lendemain** (contrôle quotidien), ou immédiatement après un
`docker restart magbo-backend`.

---

## 6. ⚠️ « HORLOGE_RECULEE » — le cas qui n'est pas une expiration

Le système mémorise la date la plus récente qu'il ait jamais vue. Si l'horloge
de la VM revient de plus de **deux jours** en arrière, la licence est traitée
comme expirée et l'anomalie est journalisée. C'est ce qui empêche un simple
`date -s` de prolonger la licence indéfiniment.

**Le cas fréquent n'est pas une fraude** : quelqu'un avance l'horloge pour un
test, puis la remet à l'heure. La borne, elle, ne recule jamais — et le recul
est alors détecté en permanence.

**La réparation** (accès à la base requis) :

```bash
# 1. D'ABORD remettre l'horloge de la VM à l'heure, et vérifier :
date

# 2. Puis réaligner le témoin :
docker exec -i magbo-postgres psql -v ON_ERROR_STOP=1 -U magbo -d magbodb \
  -c "UPDATE licence_clock SET date_max_vue = CURRENT_DATE, observe_le = now() WHERE id = 1;"

# 3. Relire la licence (§ 5), ou : docker restart magbo-backend
```

⚠️ **Ne pas utiliser `rollback/R027`** pour ça : il supprime la table et la
trace de l'incident. L'`UPDATE` suffit **dans le cas normal**.

### ⚠️ Si l'`UPDATE` ne suffit pas : c'est le REGISTRE qui parle

Il y a **deux** témoins, et le plus avancé des deux décide. Le second est le
registre des passages lui-même : le système regarde la **20ᵉ passage la plus
récente** (pas la dernière — une ligne isolée ne doit pas pouvoir décider).
C'est ce qui empêche de désarmer l'anti-recul en supprimant simplement une ligne
de `licence_clock`, ou en figeant l'horloge.

**Lequel a parlé ?** `GET /api/licence` le dit :

```json
"referenceDate": "2026-11-25", "referenceTemoin": "registre des passages"
```

- `"licence_clock"` → l'`UPDATE` ci-dessus est le bon remède.
- `"registre des passages"` → **l'`UPDATE` ne servira à rien.** Le registre
  contient réellement des passages datées du futur. Regardez lesquelles :

```bash
docker exec magbo-postgres psql -U magbo -d magbodb \
  -c "SELECT id, user_id, point_id, timestamp, created_by_user
      FROM access_logs ORDER BY timestamp DESC LIMIT 30;"
```

⚠️ **C'est un incident de DONNÉES, pas un incident de licence**, et il faut le
traiter comme tel : ces lignes sont fausses pour tout le monde — les rapports,
les durées de visite, le PPMS. Décidez avec la direction ce qu'on en fait, et
gardez une trace de la décision. Ne les modifiez pas « pour débloquer la
licence » : ce serait toucher au registre pour une raison commerciale, et c'est
précisément ce que ce système promet de ne jamais faire.

⚠️ Pendant tout ce temps, **les passages continuent d'être enregistrés, le PPMS
reste nominatif et les postes travaillent**.

⚠️ Pendant tout ce temps, **les passages, les écrans de poste, le PPMS et la
connexion continuent**. Ce n'est jamais une urgence de sécurité.

---

## 7. Le fichier de licence est perdu — le RÉÉMETTRE

> ### ⚠️ Ce paragraphe contenait une licence en clair. C'était une erreur.
>
> Il reproduisait les six lignes signées d'une licence, « à recopier telle
> quelle si le fichier est perdu ». Deux jours plus tard, une licence plus
> longue était émise et déployée — et le document continuait d'afficher
> l'ancienne, échue, avec sa signature valide.
>
> Quelqu'un qui aurait suivi cette page pour restaurer un fichier perdu aurait
> **déployé une licence expirée en croyant réparer**, et vu les écrans de
> gestion se fermer par le geste censé les rouvrir.
>
> **Un document qui contient un artefact daté devient faux dès que l'artefact
> change.** Celui-ci dit désormais COMMENT en obtenir une ; il n'en contient
> plus.

Une licence perdue **ne se recopie pas : elle se réémet.** C'est une commande,
elle prend dix secondes, et le résultat est forcément à jour.

```bash
# 1. Émettre (§ 3 pour toutes les options)
java tools/licence/MagboLicence.java emettre \
     --etablissement "Lycée Molière" \
     --jusqu-au AAAA-MM-JJ \
     --cle-privee /chemin/vers/magbo-licence-privee.pem \
     --sortie licence.magbo

# 2. VÉRIFIER avant d'envoyer — l'étape qu'on saute et qu'on regrette
java tools/licence/MagboLicence.java verifier \
     --fichier licence.magbo \
     --cle-publique /chemin/vers/magbo-licence-publique.txt
#    → la dernière ligne doit dire : signature : VALIDE

# 3. Déposer (§ 2), puis relire sans redémarrer (§ 5)
scp licence.magbo utilisateur@vm:~/Controle-de-Acesso/deploy/licence/licence.magbo
```

⚠️ **Quelle date mettre dans `--jusqu-au` ?** Celle que la négociation
commerciale a fixée. Si vous réémettez pour *restaurer* et non pour prolonger,
lisez d'abord l'échéance en service (§ 1, `/api/health`) et reprenez-la : une
licence réémise avec la même date d'expiration remplace exactement l'ancienne.

⚠️ **Il n'y a rien à récupérer d'un fichier perdu.** Une licence n'est pas un
secret et n'est pas unique : ce qui compte est la clé **privée** (§ 0), et tant
qu'elle existe, une licence se refabrique à l'identique. C'est aussi pourquoi ce
document n'a pas besoin d'en garder une copie.

### Si vous devez tout de même écrire un fichier de licence à la main

Par exemple parce qu'on vous l'a envoyé par un canal qui ne transporte pas les
pièces jointes.

⚠️ Le fichier doit être encodé en **UTF-8** (à cause du `é` et du `è`). Un
fichier recopié dans un éditeur en **latin-1** donnera `SIGNATURE_INVALIDE` :
c'est la seule erreur d'encodage qui casse la licence.

Sont **tolérés**, parce qu'ils arrivent tout le temps sous Windows et qu'aucun
éditeur ne les montre :

- les fins de ligne **CRLF** ;
- le **BOM UTF-8** en tête de fichier (ce que la redirection `>` de PowerShell
  et « Enregistrer en UTF-8 avec BOM » du Bloc-notes ajoutent).

Après recopie, vérifiez toujours avec la commande `verifier` du § 3.

---

## 8. Régénérer la paire de clés (rare)

Uniquement si la clé privée est perdue ou divulguée.

```bash
java tools/licence/MagboLicence.java generer-cles --sortie /un/dossier/hors/du/depot
```

La commande affiche la ligne à coller dans
`backend/src/main/java/com/magbo/access/services/licence/LicenceVerifier.java`,
constante `CLE_PUBLIQUE`. Ensuite : recompiler, redéployer, **et réémettre la
licence de l'école** — l'ancienne devient invalide à l'instant où la nouvelle
clé publique est déployée.

L'outil **refuse d'écraser** une clé privée existante, pour cette raison même.

---

## 8-bis. ⚠️ Trois limites connues, à lire AVANT la date

Elles sont assumées et écrites, pas découvertes le jour venu.

### a) Un opérateur qui oublie son mot de passe ne peut plus être débloqué

La gestion des comptes (`/api/system-users/**`) est fermée par le cahier des
charges, et c'est par là que passe la redéfinition d'un mot de passe. Le
registre des demandes « mot de passe oublié » reste consultable, mais **le
changer, non**.

**Parade, à faire aujourd'hui :** la direction doit détenir le mot de passe du
compte **ADMIN** — celui-là se connecte toujours, dans les quatre états.

⚠️ **Mais ne faites PAS travailler un poste sous le compte ADMIN.** Ce système
signe chaque saisie manuelle avec `created_by_user` : c'est ainsi qu'on
distingue un enregistrement fait par une personne d'un événement venu d'un
terminal. Un poste qui travaille sous « admin » signe toutes ses saisies à ce
nom, et l'attribution — sur des données concernant des mineurs — est perdue
sans moyen de la reconstituer. Si un opérateur est bloqué, faites-le travailler
depuis un autre compte nominatif, pas depuis l'administrateur.

*(La correction propre serait une route étroite `POST /api/system-users/{id}/password`
laissée ouverte. C'est une décision du propriétaire, pas un effet de bord.)*

### b) L'AED du portail ne peut plus CONSULTER la liste des autorisations de sortie

`/api/admin/exit-permissions/**` est fermé en entier — « autorisations de
sortie » figure nommément dans la liste de ce qui se ferme.

⚠️ **Le cas qui compte reste couvert** : l'élève qui PASSE au portail est jugé
correctement, permission ponctuelle comprise, parce que le verdict affiché au
portail (`/api/admin/regimes/gate/**`) reste ouvert. Ce qui n'est plus possible,
c'est la consultation **avant** le passage — « Madame Untel vient chercher Paul
à 15h, est-ce autorisé ? ».

**Parade :** imprimer la liste des autorisations actives avant la date, ou
ouvrir la lecture seule (`GET /api/admin/exit-permissions/active`) — **décision
du propriétaire**, la ligne est prête dans `LicencePortee`.

### c) La correspondance des terminaux ne peut plus être réparée

`/api/admin/door-mappings/**` est fermé (c'est de la configuration). Or les
**IP des terminaux bougent par DHCP** et cassent les `door_mappings` en silence
— c'est un incident déjà vécu (16/07/2026, `.claude/rules/hikvision.md`).

Conséquence : les passages continuent d'être enregistrés, mais retombent sur le
point par défaut `PORT1/ENTRADA`. **La zone affichée par le PPMS devient alors
fausse**, ce qui enverrait une équipe d'évacuation chercher au mauvais endroit.

**Parade, à faire avant la date :** obtenir du SI la **réservation DHCP** des
terminaux et de la VM (demande D7, ouverte depuis juillet auprès de Fabiano).
C'est de toute façon la bonne pratique — la licence ne fait qu'en augmenter le
prix.

⚠️ **Si la réservation n'est pas obtenue avant la date, notez les IP actuelles**
des terminaux et de la VM sur papier. Sans l'écran de correspondance, c'est la
seule façon de garder un diagnostic possible :

```bash
docker exec magbo-postgres psql -U magbo -d magbodb \
  -c "SELECT point_id, terminal_ip, action, ativo FROM door_mappings ORDER BY point_id;"
```

---

## 9. Ce que le mécanisme ne fait pas

- Il **ne bloque personne** : ni une porte, ni un enfant, ni un opérateur.
- Il **ne supprime aucune donnée**.
- Il **n'appelle rien sur le réseau** : tout se vérifie hors ligne.
- Il **n'est pas une forteresse** : quelqu'un qui recompile le backend depuis
  les sources peut le retirer. C'est assumé et écrit dans l'ADR-006.

---

## 10. À dire à la direction aujourd'hui, par écrit

Le bandeau ne prévient que **30 jours avant l'échéance**. D'ici là, personne
dans l'établissement ne sait que cette date existe.

Commencez par la lire — ne la citez pas de mémoire, et ne la reprenez pas d'un
document :

```bash
curl -s http://localhost:8080/api/health | grep -o '"expireLe":"[^"]*"'
```

Puis trois phrases suffisent :

1. La période d'utilisation du logiciel court **jusqu'au \<date lue ci-dessus\>
   inclus**.
2. Passée cette date, il y a **un mois de tolérance pendant lequel rien ne se
   ferme**. Ensuite, seuls les écrans d'administration se suspendent —
   l'enregistrement des passages, les écrans de poste et **le PPMS avec les
   noms** continuent, quoi qu'il arrive.
3. Pour renouveler : **MAGBO STUDIO, sammagbo@gmail.com**.

Et deux choses à vérifier avant la date : que la direction détient le **mot de
passe ADMIN** (§ 8-bis a), et que le SI a posé les **réservations DHCP**
(§ 8-bis c).
