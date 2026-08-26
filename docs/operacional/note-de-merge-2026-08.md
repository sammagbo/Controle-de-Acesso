# Note de merge — les sept branches ouvertes

**Écrite le 26/08/2026, à partir d'un essai de fusion réel** (worktree jetable,
jamais poussé, supprimé après). Ce qui suit n'est pas une prédiction : les sept
merges ont été joués, les conflits relevés, résolus, et les deux suites lancées
sur le résultat.

> **Résultat de l'essai : backend 889 · 0 échec · exactement 2 `@Disabled` ·
> npm 648.** C'est le chiffre à retrouver une fois les sept merges faits.

---

## Ordre de merge

```
1. fix/vm-compose-tz-e-admin        db53631   ← EN PREMIER
2. docs/guide-installation-postes   eab021a
3. docs/inventaire-configurabilite  0c830df
4. feat/creneaux-cantine            7567a75
5. feat/affiche-cantine             51cad16   ← contient déjà (4)
6. feat/recherche-globale           6e44015   ← LE SEUL QUI ENTRE EN CONFLIT
7. test/guard-lecture-autorisation  2d840dc
8. docs/note-de-merge               (ce fichier)
```

⚠️ **(1) en premier**, et ce n'est pas de la superstition : sans le `TZ`, tout
conteneur reconstruit repart en UTC et écrit trois heures dans le futur. Tout
ce qu'on merge ensuite s'exécuterait sur une horloge fausse.

⚠️ **(5) contient déjà (4)** — `feat/affiche-cantine` est empilée sur
`feat/creneaux-cantine`. Merger (4) puis (5) est correct et sans surprise ;
merger (5) seule marche aussi. Ne pas s'inquiéter si (5) n'affiche presque rien
de neuf après (4).

⚠️ **(7) en dernier, et pas avant (4) ni (6)** : ce test exige que
`MealSlotController` et `ParcoursController` soient gardés. Il tolère leur
absence, donc il passe aussi ailleurs — mais il ne *protège* quelque chose
qu'une fois ces deux fichiers présents.

**Mergées dans cet ordre, (1) à (5) et (7) passent SANS AUCUN CONFLIT.**
Seule (6) en produit.

---

## (6) `feat/recherche-globale` — 6 fichiers en conflit

Tous les conflits ont la même origine : **deux branches ont ajouté une entrée à
la même liste**. Mais « garder les deux » à l'aveugle casse trois de ces
fichiers, et de façon *silencieuse pour l'œil*. Détail ci-dessous.

### Résolution mécanique — garder les deux, en corrigeant le séparateur

Ces trois fichiers se résolvent en gardant les deux côtés, **à une condition** :

> ⚠️ Le côté HEAD **ferme** la liste (`);` en Java, `'X'` sans virgule en JS).
> Quand le côté de la branche la continue, ce terminateur doit devenir un
> **séparateur**. Sinon la deuxième valeur se retrouve **hors** de la liste.
> En Java ça ne compile pas ; **en JS ça compile**, et la permission n'existe
> simplement plus. C'est arrivé lors de l'essai.

#### `backend/.../security/Permissions.java`

Deux hunks. Le second est la liste `TODAS`. Contenu final attendu :

```java
    public static final java.util.List<String> TODAS = java.util.List.of(
            MEAL_ENTITLEMENT_WRITE,
            EXIT_PERMISSION_WRITE,
            ATTEMPTS_READ,
            REGIME_WRITE,
            PPMS_READ,
            CANTINE_REMOVAL_WRITE,
            MEAL_SLOT_WRITE,
            PARCOURS_READ);
```

⚠️ **Le premier hunk de ce fichier est le piège.** La frontière de conflit
tombe **à l'intérieur d'un javadoc** : le `/**` d'ouverture est en contexte
commun, donc le corps du javadoc de PARCOURS_READ arrive **sans son ouverture**.
Il faut la remettre à la main :

```java
    public static final String MEAL_SLOT_WRITE        = "MEAL_SLOT_WRITE";

    /**                                    ← CETTE LIGNE, à rajouter
     * Ler o PARCOURS do dia de uma pessoa — todos os pontos, todas as horas.
     ...
     */
    public static final String PARCOURS_READ          = "PARCOURS_READ";
```

#### `js/utils/permissions.js` — objet `PERMISSIONS`, 8 entrées

```js
        REGIME_WRITE: 'REGIME_WRITE',
        MEAL_ENTITLEMENT_WRITE: 'MEAL_ENTITLEMENT_WRITE',
        EXIT_PERMISSION_WRITE: 'EXIT_PERMISSION_WRITE',
        ATTEMPTS_READ: 'ATTEMPTS_READ',
        PPMS_READ: 'PPMS_READ',
        CANTINE_REMOVAL_WRITE: 'CANTINE_REMOVAL_WRITE',
        MEAL_SLOT_WRITE: 'MEAL_SLOT_WRITE',
        PARCOURS_READ: 'PARCOURS_READ'
```

(virgule après `MEAL_SLOT_WRITE`, pas après `PARCOURS_READ`)

#### `tests/permissions.test.js` — le miroir, mêmes 8 entrées

Ce test **compare** l'objet ci-dessus à `Permissions.TODAS`. Si les trois
fichiers ne finissent pas avec exactement les mêmes 8 noms, il rougit — c'est
lui le filet de sécurité de cette résolution.

#### `js/utils/i18n.js` — deux hunks, un par dictionnaire (FR puis PT)

Garder les deux côtés. Les libellés à retrouver, dans **chaque** dictionnaire :

```
'operadores.permissao.MEAL_SLOT_WRITE'   (créneaux)
'operadores.permissao.PARCOURS_READ'     (recherche)
```

⚠️ Une permission sans libellé dans les **deux** langues fait rougir
`tests/permissions.test.js` : la case d'administration s'afficherait écrite
`operadores.permissao.PARCOURS_READ`, et l'admin conclurait que le système est
cassé au lieu de cocher la case.

### Résolution NON mécanique — deux fichiers à faire à la main

#### ⚠️ `js/api.js` — **ne pas résoudre hunk par hunk**

Git a aligné les deux blocs de méthodes sur des lignes communes (`{ headers:
authHeaders() });`), et **la frontière de conflit coupe une méthode en deux**.
Une union naïve produit un fichier qui *paraît* correct et ne parse pas —
vérifié pendant l'essai.

**Faire ceci :**

```bash
git checkout --ours js/api.js      # la version des créneaux, ENTIÈRE
```

puis recoller le bloc de la recherche, tel quel, juste **avant** l'ancre
`// ── Moniteur Cantine: retirar uma linha (V020)` :

```
    // ── Recherche globale / parcours du jour ──────────────────
    async searchParcours(q) { ... },
    async fetchParcours(userId) { ... },
```

Contrôle : `node -e "new Function(require('fs').readFileSync('js/api.js','utf8'))"`
doit être silencieux.

#### `js/components/AdminDashboard.js` — un hunk, deux moitiés à combiner

HEAD apporte la **signature** (avec `onNavigateToMealSlots`), la branche apporte
le **bloc d'état** des KPI masquables. Il faut les deux :

```js
function AdminDashboard({ onBack, onShowToast, activeTimers, onNavigateToReport,
      onNavigateToMeal, onNavigateToExit, onNavigateToRegime, onNavigateToMealSlots }) {

      const [kpisVisiveis, setKpisVisiveis] = React.useState(() => { ... });
      const alternarKpis = () => { ... };
```

⚠️ Garder la signature de la branche (sans `onNavigateToMealSlots`) casse le
bouton « Planning Cantine » du panneau — **sans erreur visible** : le `onClick`
reçoit `undefined` et le clic ne fait rien.

---

## Contrôle final, après les sept merges

```bash
cd backend && rm -rf target && mvn -o test     # 889 · 0 échec · exactement 2 @Disabled
cd .. && npm test                              # 648
```

⚠️ Un total **inférieur** à 889 / 648 veut dire qu'une résolution a mangé du
code. `tests/permissions.test.js`, `tests/i18nChavesUsadas.test.js` et
`ControllerAuthorizationGuardTest` sont les trois qui attrapent le plus vite une
union ratée.

⚠️ Et les migrations **V021 → V023** restent à appliquer à la main sur la VM,
avant de monter le backend. Voir `deploy/migrations/README.md`.
