# Inventaire de configurabilité — ce qui est encore écrit en dur

**Relevé du 26/08/2026.** Scan de `backend/src/main/java` et `js/`, croisé avec
les propriétés déjà existantes (`magbo.*`).

## La règle qui trie cette liste

Un nombre mérite d'être une configuration quand il est **une affirmation sur
cette école** plutôt qu'une propriété du système. « La cantine ouvre à 11h » est
une affirmation sur le Lycée Molière ; « on lit les octets avant d'interpréter »
n'en est pas une.

Le second critère est le **coût du silence** : que se passe-t-il si le nombre est
faux ? Un chiffre qui, faux, accuse quelqu'un ou fait disparaître une ligne de
l'écran vaut plus cher qu'un chiffre qui rend une page lente.

---

## Converti cette nuit (cantine uniquement, comme demandé)

| Ce qui était en dur | Où | Devenu |
|---|---|---|
| `LYCEE_START` / `LYCEE_END` (11h/15h) | `AccessDecisionService` | `magbo.cantine.lycee-*` — 24/08 |
| `MAX_CANTINA_TIME` (1 h) | `AccessDecisionService` | `magbo.cantine.duracao-maxima-minutos` — 24/08 |
| Le planning par turma | `class_schedules`, sans écran | **3 tables + un écran** (V021, ADR-005) |
| `SORTIS_VISIVEL_MS` (40 min) | `js/utils/cantine.js` | `magbo.cantine.sortis-visiveis-minutos` |
| `List.of("REFEI1","REFEI2","CANTINA1")` | **3 copies**, 2 fichiers | `magbo.cantine.pontos` |

⚠️ **La liste des points de réfectoire existait trois fois, copiée à la main** —
deux dans `AccessController`, une dans `AccessAttemptController`. Ajouter un
quatrième réfectoire demandait de se souvenir des trois endroits, et celui qu'on
oublierait échouerait **en silence** : moins de passages à l'écran, aucune
erreur, personne pour savoir qu'il manque un point.

---

## Reste à faire — liste priorisée

### P1 — un nombre faux accuse quelqu'un ou cache une ligne

**1. `class_schedules` et les créneaux peuvent diverger** · *coût : ½ journée*
Depuis ADR-005, la cantine lit `meal_slots` et le régime lit encore
`class_schedules` pour « à quelle heure finit la matinée ». Déplacer une turma
dans les créneaux ne met pas à jour l'autre. N'ouvre ni ne ferme aucune porte
(le régime observe), mais peut afficher « fin de journée » au mauvais moment.
*Piste : dériver l'heure de fin de matinée du premier créneau du jour, avec
`class_schedules` en repli.* **C'est la dette n°1 de cette livraison.**

**2. `JANELA_PORTAO_HORAS = 2` et `JANELA_CONSUMO_MIN = 2`** · `RegimeSortieService` · *coût : 1 h*
Combien de temps une sortie « compte » au portail, et la fenêtre de consommation
d'une permission SINGLE. Deux nombres qui décident si une permission est brûlée
ou non. Affirmations sur l'organisation de l'école, pas sur le système.

**3. `INFIRMARY_LONG_STAY_MIN = 30`** · `AccessController` · *coût : 30 min*
Le seuil du KPI « séjours longs à l'infirmerie ». Faux, il produit des alertes
sur des enfants qui vont bien — ou tait celles qui comptent. Jumeau exact du
`MAX_CANTINA_TIME` déjà converti.

**4. `LYCEE_CLASSES`** (8 codes de turma) · `AccessDecisionService` · *coût : déjà neutralisé, à supprimer*
⚠️ **N'est plus lu par la cantine** depuis V021 : il ne sert plus que la méthode
`validateEntryWindow`, `@Deprecated`, exercée seulement par sa cuirasse de
régression. À supprimer *avec* cette cuirasse le jour où on décide d'oublier le
comportement historique — pas avant, et jamais séparément.

### P2 — un nombre faux gêne sans mentir

**5. `TETO_LINHAS_EXAMINADAS = 200`** · `RegimeSortieService` · *coût : 30 min*
Plafond de lignes examinées. Trop bas, il tronque en silence.
⚠️ À convertir **avec un log** quand le plafond est atteint : un plafond muet
est pire qu'un plafond bas.

**6. `LIMITE_MAXIMO = 50` / `LIMITE_PADRAO = 20` / `MINIMO_CARACTERES = 2`** · `StudentSearchService` · *coût : 30 min*
Taille et déclenchement de la recherche. Ajustements d'ergonomie.

**7. `MAX_PENDENTES = 200`** · `PasswordResetRequestController` · *coût : 20 min*
Garde anti-inondation des demandes de mot de passe.

**8. `CACHE = Duration.ofMinutes(30)`** · `UserPhotoController` · *coût : 20 min*
Durée de cache des photos. Trop long = une photo remplacée met du temps à
apparaître.

**9. Les cadences de polling** (3 s cantine, 5 s dashboard, 10 s horloge) · `js/` · *coût : 1 h*
Aujourd'hui écrites dans chaque composant. Sur un poste lent ou un réseau
chargé, on voudrait les baisser sans rebuild.

### P3 — à NE PAS convertir, et pourquoi

| Ce qui est en dur | Pourquoi ça doit le rester |
|---|---|
| `MIN_PREFIXO_NORMALIZADO = 16` (`PersonNameMatcher`) | Le 16 n'est pas un réglage : c'est la longueur en dessous de laquelle « maria santos » (12) deviendrait un préfixe acceptable. Le rendre configurable invite à le baisser, et le baisser rattache un enfant au dossier d'un autre. |
| `FOLGA_FUTURO = 5 min`, `IDADE_MAXIMA = 30 j` (`EventTimeResolver`) | Bornes de plausibilité d'une horloge d'appareil, pas d'une école. |
| `DIGITOS = 3` (`StaffRegistrationService`) | Format `FUNC-###`, gravé dans des données existantes. |
| `FLAGS_DE_REPETICAO`, `AccessLogRepository.REPETICOES` | Une **règle**, pas un nombre : la liste des flags qui ne sont pas des visites. Un test la verrouille. |
| Les fenêtres de dédup (60 s / 30 s / 90 s) | **Déjà** des propriétés (`magbo.ingestion-dedup.*`, `magbo.same-passage-window-seconds`, `magbo.dedup.window-seconds`). Aucune action. |

---

## ⚠️ Ce que ce relevé ne couvre pas

- Les **libellés de points** (`ACCESS_POINTS` dans `js/data/constants.js`, miroir
  conscient de `AreaMapping`) : ils sont déjà documentés comme devant changer
  **ensemble**. Les rendre configurables demanderait de fusionner d'abord les
  deux miroirs — c'est un chantier à part, pas une conversion.
- Les valeurs présentes uniquement dans les **tests** : elles doivent rester
  écrites en clair, c'est ce qui rend un test lisible.
- Le scan est **textuel** (`static final` + littéraux). Un nombre calculé ou
  passé en argument lui échappe. Dit ici plutôt que présenté comme exhaustif.
