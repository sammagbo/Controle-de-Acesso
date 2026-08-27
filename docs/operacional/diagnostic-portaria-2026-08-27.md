# Portail — passages manquants : ce que j'ai pu écarter, et ce qui reste à mesurer

**27/08/2026.** Constat de Sam : peu de passages au portail, des élèves non
identifiés.

> ⚠️ **La base locale s'arrête au 2026-07-17.** Le trafic de production vit sur
> la VM, à laquelle cette nuit n'avait pas le droit de toucher. La moitié
> « données » de ce diagnostic n'a donc **pas** été faite — les requêtes sont
> écrites, prêtes, et il faut vingt minutes pour les passer.
>
> La moitié « code » a été faite en entier, et elle donne un **résultat
> négatif** utile : la piste la plus plausible est éliminée avec preuve.

---

## 1. Ce que j'ai ÉCARTÉ, avec preuve

### L'hypothèse la plus sérieuse : le changement de parser multipart

Le 24/08, le webhook a cessé d'utiliser `request.getParts()` pour lire les
octets lui-même (`MultipartTolerante`), afin de sauver les 95 entrées de cantine
que le parser du container jetait. **Ce changement traverse aussi le chemin des
caméras** — et c'est le seul commit qui touche ce chemin depuis le 20/08 :

```
569d462  fix(cantine): 95 entrées perdues par jour, et une personne comptée deux fois
```

⚠️ **Et il n'était couvert par aucun test côté caméra.** Les `PortariaCameraIT`
entrent par MockMvc, donc par le repli `getParts()` — le contrôleur le dit
lui-même : « esses testes exercitam ESTE ramo, nao o de cima ». Aucun test ne
faisait passer un corps de caméra par le parser que la production utilise.

**Test écrit et passé** (`MultipartCameraPortariaTest`, 6 cas) : corps caméra
complet, corps coupé dans `faceImage`, corps sans image, corps sans terminateur
final, boundary entre guillemets. Dans **tous** les cas la part `alarmResult`
ressort **intacte**.

→ **Le parser n'est pas la cause.** Le test reste dans le dépôt : il ferme le
trou de couverture qui a rendu cette question coûteuse à répondre.

### Ce qui n'a pas bougé du tout

`CameraIdentityService` et `PersonNameMatcher` : **zéro commit depuis le 20/08**.
La reconnaissance faciale, la translittération des accents, le préfixe tronqué —
rien de tout cela n'a changé pendant les nuits de merge.

→ **Une régression de code dans l'identification est très improbable.**

### Le seul risque de code encore ouvert (hypothétique, documenté)

Certains firmwares Hikvision envoient `Content-Disposition: form-data` **sans**
`name=`. Le parser rend alors `nome == null`, et le contrôleur compare
`PART_ALARM_RESULT.equalsIgnoreCase(null)` → false : **l'événement tomberait
dans le branchement générique et la passage mourrait en silence**.

Je n'affirme **pas** que la caméra du Lycée fait ça. Le test `partSemNome`
documente ce que le parser rend dans ce cas, pour que la signature soit
reconnaissable dans le log : chercher `part=null`.

---

## 2. Ce qui reste à mesurer — sur la VM

À passer dans cet ordre. Chaque requête répond à **une** question.

### A. La chute est-elle réelle, et datée ?

```sql
SELECT timestamp::date AS jour,
       point_id,
       count(*) FILTER (WHERE action='ENTRADA') AS entrees,
       count(*) FILTER (WHERE action='SAIDA')   AS sorties,
       count(*) AS total
  FROM access_logs
 WHERE point_id LIKE 'PORT%' AND timestamp >= current_date - 21
 GROUP BY 1,2 ORDER BY 1,2;
```

⚠️ **Lire par POINT, pas en total.** La caméra `.166` (SAIDA) est en panne
physique connue : son effet doit être **isolé**, sinon il masque tout le reste.
Une chute qui ne touche que les SAIDA = la panne connue, rien d'autre à
chercher. Une chute sur les ENTRADA = un vrai problème neuf.

### B. Le taux de non-identifiés

```sql
SELECT timestamp::date AS jour,
       count(*) FILTER (WHERE denial_reason='UNKNOWN_FACE')   AS inconnus,
       count(*) FILTER (WHERE denial_reason='AMBIGUOUS_NAME') AS ambigus,
       count(*) AS tentatives
  FROM access_attempts
 WHERE point_id LIKE 'PORT%' AND timestamp >= current_date - 21
 GROUP BY 1 ORDER BY 1;
```

Croisé avec A : beaucoup d'`UNKNOWN_FACE` **et** peu d'`access_logs` = la caméra
voit des gens et le MAGBO ne les reconnaît pas → **problème de photos /
bibliothèque faciale**, pas de code. Peu des deux = la caméra n'envoie plus
rien → **réseau ou appareil**.

### C. Combien de personnes ont un `camera_person_id`

```sql
SELECT count(*) FILTER (WHERE camera_person_id IS NOT NULL) AS lies,
       count(*) AS actifs
  FROM app_users WHERE ativo AND tipo='ALUNO';
```

Ce champ se remplit tout seul à la première reconnaissance. S'il est bas alors
que l'année est avancée, **la bibliothèque faciale des caméras ne contient pas
les élèves** — c'est du HikCentral, pas du MAGBO.

### D. Comparaison avant / après les nuits de merge

```sql
SELECT CASE WHEN timestamp < '2026-08-20' THEN 'avant les merges'
            ELSE 'apres les merges' END AS periode,
       point_id, count(*) AS passages,
       round(count(*)::numeric / GREATEST(count(DISTINCT timestamp::date),1), 1) AS par_jour
  FROM access_logs
 WHERE point_id LIKE 'PORT%' AND timestamp >= '2026-08-01'
 GROUP BY 1,2 ORDER BY 2,1;
```

⚠️ **`par_jour`, pas le total** : les deux périodes n'ont pas le même nombre de
jours, et comparer des totaux bruts inventerait une chute ou en cacherait une.

### E. Les logs du backend

```bash
docker logs magbo-backend --since 72h 2>&1 | grep -c "corpo multipart CORTADO"
docker logs magbo-backend --since 72h 2>&1 | grep -iE "UNKNOWN_FACE|AMBIGUOUS" | tail -20
docker logs magbo-backend --since 72h 2>&1 | grep -i "casou por PREFIXO" | tail -10
docker logs magbo-backend --since 72h 2>&1 | grep -iE "part=null|part='null'" | tail -10
```

- `corpo multipart CORTADO` **> 0** : l'appareil coupe le corps — la correction
  du 24/08 le rattrape, mais le nombre dit l'ampleur.
- `casou por PREFIXO` : reconnaissances par nom tronqué — normal en petit
  nombre, suspect en masse.
- `part=null` : **la signature du risque hypothétique** ci-dessus. S'il apparaît,
  la cause est trouvée et la correction est de reconnaître la part par son
  CONTENU (`"eventType":"alarmResult"`) et non par son nom.

---

## 3. Si c'est matériel / photos — ce qu'il faut faire côté HikCentral

1. **La caméra `.166` (SAIDA) est en panne connue** : tant qu'elle est morte,
   toute analyse des sorties du portail est faussée. La remplacer ou la retirer
   des `door_mappings` pour que son absence soit explicite et non un trou.
2. **Vérifier que la bibliothèque faciale contient les élèves de l'année** —
   c'est le module Personnes du HCP, pas le MAGBO. Depuis le 08/08 le
   `certificateNumber` est la **matricule remplie à 16 chiffres** ; les fiches
   plus anciennes portent l'ID à 10 chiffres du HCP.
3. **Vérifier l'IP des caméras et l'Écoute HTTP** : les IP bougent en DHCP et
   cassent l'envoi **en silence** (déjà arrivé le 16/07). Comparer l'IP affichée
   sur l'appareil, l'URL de l'Écoute HTTP, et les `door_mappings`.

---

## 4. Ce que je n'ai pas fait, et pourquoi

- **Aucune requête sur la VM** : interdit cette nuit. Les requêtes ci-dessus
  n'ont donc **pas** été exécutées sur les données réelles.
- **Aucune correction de code** : la seule hypothèse testable a été testée et
  **écartée**. Corriger quelque chose sans cause identifiée aurait ajouté du
  risque à un chemin qui traite les passages d'enfants.
- Le risque `part=null` **n'est pas corrigé** : le corriger à l'aveugle
  changerait la reconnaissance des parts sur le chemin le plus critique du
  système, pour un défaut que rien ne prouve. La signature à chercher est
  écrite ; si elle apparaît dans le log, la correction est de trois lignes.
