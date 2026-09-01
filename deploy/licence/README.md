# `deploy/licence/` — le fichier de licence de cette installation

La vraie licence se dépose **ici**, sous le nom exact **`licence.magbo`**.
Le `docker-compose.yml` monte ce répertoire dans le conteneur en **lecture
seule** (`./licence:/licence:ro`), et le backend lit `/licence/licence.magbo`.

⚠️ **`licence.magbo` est ignoré par git**, et c'est voulu. Une licence émise
n'est pas un secret — elle n'autorise qu'un établissement, jusqu'à une date —
mais la ranger dans le dépôt installerait l'idée qu'une licence vit dans git,
et la prochaine fois quelqu'un y mettrait la **clé privée** qui les signe.
Celle-là ne doit jamais approcher ce dépôt : il est public.

`licence.exemple.magbo` est suivi par git et montre le format. Sa signature est
délibérément fausse.

⚠️ **Et une licence ne se recopie pas non plus dans un document.** La procédure
d'exploitation en a contenu une, « à recopier si le fichier est perdu ». Une
licence plus longue a été émise deux jours plus tard, le document a continué
d'afficher l'ancienne, et quiconque l'aurait suivie aurait déployé une licence
**expirée** en croyant réparer. Une licence perdue se **réémet** (§ 7 de la
procédure) ; l'échéance en service se **lit** sur `/api/health`. Aucun document
n'a besoin d'en garder une copie, et un exemple qui ressemble à la licence en
service finit par être pris pour elle — d'où les gabarits `AAAA-MM-JJ` partout
où le format est illustré.

## Vérifier que le déploiement a réussi

Après `docker compose up -d`, une seule commande :

```bash
curl -s http://localhost:8080/api/health | grep -o '"licence".*'
```

- `"etat":"VALIDE"` — tout va bien.
- `"motif":"ABSENTE"` — le fichier ou le montage manque. **Les passages, les
  écrans de poste et le PPMS continuent de fonctionner**, mais les écrans de
  gestion sont fermés : c'est un déploiement raté, pas une échéance.
- `"motif":"SIGNATURE_INVALIDE"` — le fichier a été modifié après émission, ou
  émis avec une autre clé.

## Renouveler sans redémarrer

Déposer le nouveau `licence.magbo` ici, puis, avec un compte ADMIN :

```bash
curl -X POST http://localhost:8080/api/admin/licence/recharger      -H "Authorization: Bearer <jeton>"
```

Procédure complète, y compris l'émission depuis la France :
[`docs/operacional/procedimento-licence.md`](../../docs/operacional/procedimento-licence.md).
