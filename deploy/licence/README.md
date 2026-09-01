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
