# Licence — vérification contre un backend qui tourne (31/08/2026)

Branche `feat/licence`. Backend lancé avec le profil `dev` (H2), grille de
licence **active**, et la **vraie licence signée** déposée dans
`backend/licence/licence.magbo`.

⚠️ **Pourquoi cette page existe.** Toute la suite de tests passe par MockMvc.
Deux choses ne s'y reproduisent pas : le contournement par URI percent-encodée
(MockMvc rend 400 sur un `%` dans l'URL, il traite l'URL comme un gabarit) et le
comportement d'un vrai client HTTP. Ce qui suit a été exécuté avec `curl` contre
un serveur réel.

⚠️ **Piège rencontré, à retenir pour la prochaine fois :** un premier backend
lancé en tâche de fond avait survécu à l'arrêt de son wrapper Maven et tenait
toujours le port 8080. Les premières mesures portaient donc sur du **code
périmé**. Vérifier `Get-NetTCPConnection -LocalPort 8080` et tuer le PID **java**
avant de conclure quoi que ce soit.

---

## 1. Licence VALIDE

```
gestion  /api/admin/settings/catalogue   200
poste    /api/access/logs/refectory      200
```

## 2. Licence RETIRÉE (fichier déplacé, puis `POST /api/admin/licence/recharger`)

### Ce qui continue — le principe non négociable

| Route | Code | |
|---|---|---|
| `POST /api/hikvision/webhook` | **200** | l'enregistrement des passages, **jamais 402** |
| `GET /api/ppms/inside` | **200** | la liste nominative de l'évacuation |
| `GET /api/access/logs/refectory` | **200** | le Moniteur Cantine (⚠️ G1 corrigé) |
| `GET /api/access/logs/PORT1` | **200** | l'écran du portail |
| `GET /api/admin/regimes/gate/PORT1` | **200** | le verdict de régime au portail |
| `GET /api/admin/cdi/etat` | **200** | la banque de prêt du CDI |
| `GET /api/users` | **200** | le userCache de toutes les vitres |
| `GET /api/health` | **200** | la sonde de déploiement |
| `POST /api/auth/login` | **200** | un jeton est bien émis |

### Ce qui se ferme

| Route | Code |
|---|---|
| `GET /api/admin/settings/catalogue` | **402** |
| `GET /api/system-users` | **402** |
| `GET /api/stats/global` | **402** |
| `GET /api/access/refectory/meals` | **402** (le rapport de facturation) |

### ⚠️ Le contournement par URI percent-encodée — refermé

Avant la correction, ces trois-là renvoyaient **200** : Spring MVC route sur le
chemin décodé, la grille comparait le chemin brut, la règle ne correspondait plus
et la requête retombait sur une règle ouverte.

```
GET /api/admin/s%65ttings/catalogue    402
GET /api/%61ccess/overview             402
GET /api/stats/glob%61l                402
```

*(`curl --path-as-is`, pour que le `%` parte réellement sur le réseau.)*

### Le message rendu

```json
{"error":"La période d'utilisation de MAGBO Access Control est arrivée à son terme.
 Les fonctions de gestion sont suspendues. Aucune donnée n'a été supprimée :
 l'enregistrement des passages et la liste PPMS continuent de fonctionner normalement.
 Pour renouveler, contacter MAGBO STUDIO — sammagbo@gmail.com",
 "licence":"EXPIREE","motif":"ABSENTE"}
```

Accentué, ton neutre, et il dit **ce qui continue** avant de dire à qui écrire.

### `/api/health`, publiquement

```json
"licence":{"etat":"EXPIREE","motif":"ABSENTE","expireLe":null,"gestionOuverte":false}
```

`"motif":"ABSENTE"` — le message oriente vers un **déploiement raté**, pas vers
une échéance. C'est la distinction qui fait gagner une soirée.

## 3. Licence REDÉPOSÉE (+ `recharger`)

```
gestion  /api/admin/settings/catalogue   200      ← rouvre
```

```json
{"etat":"VALIDE","motif":"OK","gestionOuverte":true,"bandeau":false,
 "etablissement":"Lycée Molière","licenceId":"LM-20261130",
 "emisLe":"2026-08-31","expireLe":"2026-11-30","joursRestants":91,
 "contact":"sammagbo@gmail.com","grilleActive":true,
 "dateMaxVue":"2026-08-31","reculDetecteLe":null}
```

Le nom accentué survit au trajet **argument de la commande → fichier signé →
lecture → JSON**, et le témoin d'horloge s'est initialisé au jour même.

---

## Ce que cette page NE prouve pas

- **PostgreSQL.** Tout ceci tourne sur H2 (Docker n'était pas démarré). Les deux
  requêtes natives PG-only restent à vérifier à la main sur la VM, comme
  d'habitude (section 6-bis de `frontend-smoke-checklist.md`).
- **La V027 appliquée pour de vrai.** Le schéma vient d'`ddl-auto` ici. Les trois
  vérifications du README de migrations restent obligatoires sur la VM — en
  particulier celle du `CHECK`, « celle que personne ne pense à faire ».
- **L'écran.** Aucun clic n'a été fait dans l'application Electron. Le bandeau
  est couvert par des tests unitaires, pas par un parcours réel. **Le smoke
  post-déploiement inclut des CLICS, pas seulement des curls** — la leçon du
  17/07 vaut ici aussi.
