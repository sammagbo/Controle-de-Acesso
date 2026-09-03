# Handoff — l'état réel du système

**Pour qui :** la personne qui reprend MAGBO Access Control après le départ de
Sam, ou Sam lui-même revenant après une longue absence.

**Date de coupe : 2026-09-03**, après les trois chantiers de cette date (voir
§2.3) : la correction de l'adresse de connexion, le livre imprimable, et cette
vérification de la documentation.

⚠️ **Cette page s'ancre sur des DATES, pas sur des SHA.** Les identifiants de
commit changent au moment où Sam fusionne ; une date, non. `fc4359c` désigne
correctement l'état d'`avant` les chantiers du 03/09, et rien d'autre.

Suites mesurées le 03/09/2026, **depuis zéro** (`rm -rf backend/target`), sur
l'arbre des trois chantiers réunis : backend **1055** tests (0 échec, exactement
2 `@Disabled`), npm **889** tests sur **42** fichiers. ⚠️ Ces totaux montent à
chaque livraison — ce qui se lit, c'est **0 échec, exactement 2 `@Disabled`**, et
un total **inférieur** à celui-ci veut dire que quelqu'un a supprimé un test.
Migrations **V001 → V027**, toutes appliquées en production.
Paquet portable : **96/96** fichiers obligatoires (voir §4 — ce nombre est
dérivé, il monte à chaque écran nouveau).

**La licence est DÉPLOYÉE et valide.** `/api/health` répond
`"etat":"VALIDE","expireLe":"2027-03-31","gestionOuverte":true`. Ce que ce
mécanisme fait — et surtout ce qu'il ne ferme **jamais** — est dans
[`ADR-006`](../architecture/decisoes/ADR-006-licence-degradation-par-couches.md) ;
la procédure d'émission et de dépôt est dans
[`procedimento-licence.md`](procedimento-licence.md).

Ce document décrit le système **tel qu'il tourne**, pas tel qu'il a été pensé.
Là où l'intention et la réalité divergent, c'est la réalité qui compte.

> **Aucun mot de passe, jeton ou secret ici.** Les secrets vivent dans le `setx`
> du PC et dans `deploy/.env` sur la VM, et ils n'en sortent pas. Si vous
> trouvez un secret dans ce fichier ou dans n'importe quel `.md` du dépôt,
> c'est un incident : faites tourner la valeur et retirez-la.

> **Note de langue.** Ce document était en portugais jusqu'au 05/08. Il est
> passé au français le 29/08, pour être cohérent avec le manuel, le guide
> d'installation, les rapports de nuit et le livre du système — tout ce qui
> sera lu à côté de lui. La version portugaise reste dans l'historique git :
> `git show 3ea4213:docs/operacional/handoff.md`.

---

# ⚠️ À LIRE EN PREMIER — le défaut ouvert le plus grave

**Depuis le 25/08/2026, le portail ne reconnaît plus qu'environ 46 élèves
distincts par jour, contre environ 500 jusqu'au 24/08.**

| Mesure | Jusqu'au 24/08 | Depuis le 25/08 |
|---|---|---|
| Élèves distincts reconnus / jour | ~500 | **~46** |
| Personnel reconnu / jour | ~40 | ~40 — **inchangé** |
| Personnes vues le 24/08 à 7h | 297 | — |
| Personnes vues le 25/08 à 7h | — | **35** |

La rupture est **nette entre le 24 et le 25** : ce n'est pas une dérive
progressive. **Le personnel n'est pas touché**, et c'est le fait le plus
instructif du tableau — quoi qu'il se passe, ça ne frappe pas tout le monde.

Sur environ **1160 visages non identifiés par jour**, seuls **22** atteignent la
comparaison de nom, avec des similarités de **0,13 à 0,46** — très en dessous du
seuil. Les autres n'arrivent même pas jusque-là.

> ## ⚠️ AUCUNE CAUSE N'EST ÉTABLIE
>
> Tout ce qui suit est **soit une mesure, soit une vérification à faire**. Rien
> ici n'est un diagnostic, et rien ici ne doit en devenir un par relecture.
>
> Ce paragraphe existe parce qu'une cause écrite dans un document finit par être
> crue, et qu'une réparation lancée sur une cause supposée coûte plus cher que
> la panne. **Mesurez avant de réparer.**

### Ce que le diagnostic du 27/08 a écarté — et avec quelle force

Le diagnostic du 27/08 a **écarté avec preuve** l'hypothèse la plus sérieuse : le
changement de parser multipart. Il a aussi établi que `CameraIdentityService` et
`PersonNameMatcher` n'ont reçu **aucun commit depuis le 20/08**, ce qui rend une
régression d'identification **très improbable**.

⚠️ **« Très improbable » n'est pas « écarté », et le diagnostic laisse un risque
de code explicitement OUVERT.** Certains firmwares Hikvision envoient
`Content-Disposition: form-data` **sans** `name=` ; le parser rend alors
`nome == null`, l'événement tombe dans le branchement générique et **la passage
meurt en silence**. La signature à chercher dans les journaux du backend est
`part=null`.

Le détail, les cinq requêtes SQL à lancer sur la VM et les `grep` de logs sont
dans [`diagnostic-portaria-2026-08-27.md`](diagnostic-portaria-2026-08-27.md).

### Le chemin qu'ont pris les photos des 25 et 26/08 — un fait, pas une explication

*(Répondu par Sam le 31/08/2026.)*

**Les imports des 25 et 26/08 ont été faits par HikCentral, pas par l'écran
Photos du MAGBO.** Les deux chemins ne touchent pas la même chose :

| Chemin | Ce qu'il touche | Rapport avec la reconnaissance |
|---|---|---|
| Écran Photos du MAGBO | la table `user_photos` | **aucun** — ce sont les portraits affichés dans l'application |
| **HikCentral** | **les bibliothèques faciales des caméras** | **direct** — c'est ce contre quoi la caméra compare |

⚠️ **Ce tableau dit où regarder, il ne dit pas ce qui s'est passé.** Que les
photos soient passées par le chemin qui touche les bibliothèques est un fait ;
que ce passage ait causé la chute n'est **pas mesuré**. Les deux se sont produits
les mêmes jours — c'est une raison d'aller voir, pas une conclusion.

### ⚠️ L'ordre des gestes — mesurer, puis constater, puis seulement toucher

**1. D'abord les cinq requêtes du diagnostic du 27/08**, sur la VM. Elles ne
changent rien et elles datent la rupture.

**La première de toutes, parce qu'elle discrimine :**

```sql
-- combien de personnes ont un camera_person_id ?
SELECT count(*) FROM app_users WHERE camera_person_id IS NOT NULL;
```

**2. Ensuite, constater l'état des bibliothèques depuis HikCentral** — en
lecture seule, sans rien appliquer :

1. **La bibliothèque des élèves existe-t-elle encore, et avec combien de
   personnes ?** Le personnel n'est pas touché : si les deux bibliothèques sont
   séparées, comparer leurs effectifs situe le problème immédiatement.
2. **Les images ont-elles été remplacées, et par lesquelles ?** Une photo de
   moins bonne qualité, recadrée autrement, ou une photo d'identité scannée à la
   place d'un portrait, dégrade la similarité — et les similarités mesurées sont
   effondrées (0,13 à 0,46).
3. **Le `certificateNumber` a-t-il changé de format ?** ⚠️ C'est déjà arrivé :
   depuis le 08/08 il porte la matricule complétée à 16 chiffres, *parce que les
   bibliothèques faciales avaient été repeuplées par le module de personnes du
   HCP* (`.claude/rules/hikvision.md`).
4. **Le `Apply to Device` a-t-il bien été fait ?** Une bibliothèque modifiée au
   HCP mais non appliquée aux appareils laisse les caméras avec l'ancienne — ou
   avec rien.

**3. Ne modifier quoi que ce soit qu'après.** « Corriger » ce qui n'est pas cassé
a déjà coûté cher ici, et une bibliothèque faciale repeuplée par erreur n'a pas
de retour arrière.

⚠️ **Le réglage à ne pas manquer** : lors de toute opération HikCentral,
« Restaurer les paramètres par défaut » doit rester **DÉCOCHÉ**. Coché, il
réinitialise des réglages de l'appareil — dont potentiellement le seuil de
similarité et l'*Écoute HTTP*. La procédure complète est dans
[`procedimento-hikcentral.md`](procedimento-hikcentral.md).

**[À COMPLÉTER — demandé à Sam le 31/08, non retrouvé]** Quels fichiers
exactement ont été versés, et pour combien de personnes ? Le détail aiderait à
cibler, mais **ne bloque pas** : les quatre vérifications ci-dessus montrent
l'état **actuel** des bibliothèques, sans avoir besoin de savoir ce qui y a été
versé.

### Note historique, à connaître avant de lire les chiffres d'avant

La caméra **.166 (SORTIE) était en panne jusqu'au 24/08**. Le portail produisait
donc environ **950 ENTRÉES et ZÉRO SORTIE par jour**.

⚠️ **Ces 950 n'étaient pas 950 personnes.** C'était la même population recomptée
à chaque retour : sans lecture de sortie, chaque rentrée dans l'école
ré-enregistrait une entrée. Toute comparaison « avant / après » qui prend 950
pour un effectif est fausse. Le nombre à comparer est celui des **personnes
distinctes**, colonne de gauche du tableau ci-dessus.

---

# ⚠️ LE RISQUE Nº 1 DE LA REPRISE — les accès

*(Répondu par Sam le 31/08/2026. Ce n'est pas une panne : c'est ce qui empêche
de réparer une panne.)*

**Les secrets d'application vivent dans `deploy/.env` sur la VM.** Ils sont donc
récupérables — **par qui possède le SSH de la VM**.

| Secret | Où il vit | Qui l'a |
|---|---|---|
| `POSTGRES_PASSWORD` | `deploy/.env` sur la VM | Sam + qui a le SSH |
| `MAGBO_JWT_SECRET` | idem | idem |
| `MAGBO_WEBHOOK_TOKEN` | idem | idem |
| `ADMIN_PIN` | idem | idem |
| `MAGBO_ADMIN_PASSWORD` | idem | idem |
| Compte `admin` de l'application | — | **Sam seul** |
| Accès web des terminaux Hikvision | — | **Sam seul** |
| HikCentral | — | **Sam seul** |
| **SSH de la VM** | — | **Sam seul** |

> ## ⚠️⚠️ La chaîne à comprendre avant tout le reste
>
> **Le SSH de la VM est la clé de toutes les autres.** Les cinq secrets
> d'application sont récupérables — mais seulement en se connectant à la VM.
> Et l'accès à la VM n'est détenu **que par Sam**.
>
> **Perdre le SSH, c'est perdre les cinq autres avec lui.** Ce n'est pas une
> panne : c'est l'impossibilité de réparer la prochaine.
>
> ### Ce que ça veut dire concrètement
>
> Tant que la VM tourne, tout va bien : le système fonctionne, personne n'a
> besoin des secrets. **Le jour où elle redémarre mal, où un conteneur refuse de
> monter, où il faut restaurer une sauvegarde — il faut le SSH.** Sans lui,
> personne ne peut relancer le système.
>
> ### À faire aujourd'hui, avant toute autre chose
>
> 1. **Obtenir le SSH de la VM** (`magbo@192.168.1.253`) et le ranger là où
>    l'établissement range ses accès — pas dans une tête, pas dans ce dépôt.
> 2. **Une fois connecté, sauvegarder `deploy/.env` hors de la VM.** C'est le
>    fichier qui contient les cinq secrets, et il n'est **pas** versionné —
>    délibérément, mais il n'existe donc qu'à un seul endroit.
> 3. **Récupérer les trois accès qui ne sont nulle part** : le compte `admin` de
>    l'application, l'accès web des terminaux, HikCentral.
> 4. **Décider qui d'autre les détient.** Une personne seule, c'est la situation
>    d'aujourd'hui — et c'est exactement pourquoi ce paragraphe existe.
>
> ⚠️ Ces quatre points valent d'être faits **avant** de comprendre le système :
> comprendre sans pouvoir agir ne sert à rien, et Sam est parti.

⚠️ **Aucune valeur de secret n'est écrite dans ce dépôt, et aucune ne doit
l'être.** Ce document dit **où** ils vivent et **qui** les détient — jamais ce
qu'ils valent. Si vous trouvez une valeur de secret dans un `.md`, c'est un
incident : faites-la tourner et retirez-la.

---

# ⚠️ LE RISQUE Nº 2 — le système n'a plus de décideur

*(Répondu par Sam le 31/08/2026 : « en pratique, c'était moi ». Aucun
remplaçant n'a été désigné.)*

Ce n'est pas une question d'organigramme. **Toutes les questions ouvertes de ce
document n'ont plus de destinataire** — elles attendent quelqu'un qui n'existe
pas encore.

**Ce qui est en attente d'une décision, aujourd'hui :**

| Décision | Ce que ça coûte de ne pas la prendre | Où |
|---|---|---|
| **L'heure de fermeture de la cantine** | **72 sorties synthétiques par jour**, et les durées de repas faussées d'autant | §2.4 |
| **Les horaires de la maternelle et de l'élémentaire** | un créneau hérité à 11:00 qui ne correspond pas au service réel (11h54–12h37) | §2.6 |
| **Les six classes du mercredi 13h** | l'affiche est incomplète ; ces élèves passent hors de tout créneau | §2.6 |
| **`5E3` et `3E3`** | deux classes affichées qui n'ont aucun élève | §2.6 |
| **Qui détient les accès** | une seule personne — voir le risque nº 1 | ci-dessus |
| **La dispense de badge par classe** | préparée, désactivée ; l'activer ampute le décompte PPMS | §11 q.10 |
| **La copie de sauvegarde hors machine** | une panne de disque emporte la base et ses 14 sauvegardes | §6 |

> ### La première décision à prendre est de désigner qui prendra les suivantes
>
> Aucune de ces lignes n'est technique. Aucune ne peut être tranchée par la
> personne qui reprend le code — ce sont des choix d'établissement : des heures
> de service, des classes, des droits, un budget de temps.
>
> **Tant que personne n'est désigné, ce document est une liste de questions sans
> lecteur.** C'est pourquoi cette section est en tête plutôt qu'en annexe.

⚠️ **En attendant, rien ne casse.** Le système continue de tourner avec les
réglages actuels — c'est la vertu d'un système observationnel. Les décisions
ci-dessus améliorent la justesse des données ; elles n'empêchent pas le
fonctionnement. **Sauf le risque nº 1**, qui empêche la réparation.

---

## 1. À quoi sert le système, et qui s'en sert

MAGBO Access Control enregistre et donne à voir **qui est passé où, et quand**,
dans le Lycée Molière de Rio de Janeiro. Reconnaissance faciale sur des
terminaux Hikvision → webhook HTTP → Spring Boot → PostgreSQL → postes
Electron.

**Ce que le système fait :** il observe, il enregistre, il signale.

⚠️ **Ce que le système NE FAIT PAS : il n'ouvre et ne ferme aucune porte.** Le
webhook est **post-événement** — quand le MAGBO apprend qu'une personne est
passée, elle est déjà passée. C'est une décision d'architecture, pas une
limitation à corriger : [`ADR-003`](../architecture/decisoes/ADR-003-webhook-pos-evento.md).
Le blocage physique, quand il existe, appartient à HikCentral.

La seule exception est la cantine, et elle reste **un geste humain** : le
terminal valide l'identité, le MAGBO valide la règle, et **l'opérateur applique
l'exception** — [`ADR-004`](../architecture/decisoes/ADR-004-bloqueio-operacional-assistido.md).
Quand la documentation dit `DENY`, elle parle d'une décision **logique** écrite
dans `access_attempts`. Aucune porte ne se ferme.

**Qui s'en sert :**

| Profil | Ce qu'il fait avec |
|---|---|
| **Portaria** | voit les passages du portail en direct, enregistre un passage à la main quand la reconnaissance échoue |
| **Cantine** | Moniteur en direct : qui est dans le réfectoire, qui doit sortir, qui est sorti ; gère les droits repas |
| **CDI** | présence de la bibliothèque, pointage, mode urgence, capacité et exclusions |
| **Infirmerie** | visites, durées, sorties non enregistrées |
| **Vie Scolaire** | recherche d'une personne, parcours du jour, autorisations de sortie, régimes, rapports |
| **Direction** | rapports, KPI, PPMS |

### ⚠️ Qui l'a construit — et pourquoi ça compte pour vous

*(Répondu par Sam le 31/08/2026.)*

**Sam faisait partie de la Vie Scolaire.** Il n'était pas un prestataire à qui
l'école commandait un logiciel : il était **l'utilisateur du système qu'il
écrivait**. Il n'y avait donc pas d'interlocuteur métier tiers — le développeur,
le décideur et l'utilisateur quotidien étaient la même personne.

**Ce que ça explique.** La précision opérationnelle du système vient de là : les
règles ont été écrites par quelqu'un qui voyait ce qu'elles produisaient au
comptoir le lendemain. C'est pourquoi le code distingue si soigneusement « non »
de « je ne sais pas », et pourquoi chaque alerte porte une action.

**Ce que ça coûte aujourd'hui.** Les trois rôles sont partis en même temps, et
le troisième n'a laissé **aucune trace écrite** : le code dit ce que le système
fait, ce document dit comment il tourne, mais **ce que les règles *devraient*
être** vivait dans la tête de son utilisateur.

> **Ce qu'il faut faire, et ce n'est pas technique :** reconstruire la relation
> avec la Vie Scolaire. Les questions en attente (les horaires de la cantine,
> les classes du mercredi, `5E3`/`3E3`, la dispense de badge) ne se répondent
> pas en lisant le code — elles se répondent en parlant aux personnes qui
> servent les repas et surveillent les sorties.
>
> ⚠️ **Commencez par les écouter avant de leur proposer quoi que ce soit.** Le
> système marche aujourd'hui ; les questions ouvertes améliorent la justesse des
> données, elles n'arrêtent rien. Vous avez le temps de comprendre avant de
> changer.

---

## 2. Ce qui tourne aujourd'hui

### 2.1 Les terminaux

> ⚠️ Ces IP viennent de Sam (28/08) et **ne sont pas dans le dépôt**. La source
> de vérité en production est la table `door_mappings`.
> **[À VÉRIFIER]** Confirmer sur la VM :
> ```bash
> docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
>   "SELECT terminal_ip, point_id, action, label, ativo FROM door_mappings ORDER BY terminal_ip;"
> ```

| Point | IP | Rôle |
|---|---|---|
| Portail | `.167` | ENTRÉE (caméra DeepinView) |
| Portail | `.166` | SORTIE (caméra DeepinView) — en panne jusqu'au 24/08 |
| CDI | `.15`, `.16` | terminaux MinMoe |
| Cantine | `.10`, `.12`, `.13`, `.14` | terminaux MinMoe |

⚠️ **Sur le `.15`, le champ « Nom de la porte » affiche `CDI-SAIDA`.** Il ment.
**Fiez-vous à l'IP, jamais au nom affiché par l'appareil.**

⚠️ **Le chemin du webhook sur les terminaux :**
`Système et maintenance → Réseau → Service réseau → HTTP(S) → Écoute HTTP`.
**Ce n'est pas le menu « Événement »**, où l'on cherche naturellement.

⚠️ **Les IP dansent (DHCP), et ça casse en silence.** Ni erreur, ni alerte : les
événements cessent simplement d'arriver. Avant toute session sur le matériel :
vérifier l'IP du serveur, l'IP au dos de chaque terminal, l'URL de l'*Écoute
HTTP*, et la colonne `terminal_ip` de `door_mappings`.

> ### Les réservations DHCP ont-elles été faites ? — la réponse est dans les données
>
> Des réservations avaient été demandées au service informatique pour les
> terminaux et la VM (décision D7). **Sam ne se souvient pas de leur état
> (31/08)**, et la personne à qui demander reste à retrouver — voir la
> question 4 au §11.
>
> ⚠️ **Il n'est pas nécessaire d'attendre cette réponse pour connaître le
> risque.** Si les IP n'ont pas bougé depuis des mois, elles sont probablement
> réservées ; si elles ont bougé récemment, elles ne le sont sûrement pas :
>
> ```bash
> # Quand chaque mapping a-t-il été modifié pour la dernière fois ?
> docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
>   "SELECT terminal_ip, point_id, updated_at FROM door_mappings
>     WHERE ativo ORDER BY updated_at DESC;"
> ```
>
> **Comment lire le résultat :** un `updated_at` récent sur plusieurs lignes
> veut dire que quelqu'un a couru après des IP qui changeaient. Des dates
> anciennes et stables veulent dire que les adresses tiennent — par réservation,
> ou par chance. **Dans les deux cas, la parade est la même** : les quatre
> vérifications ci-dessus avant toute session sur le matériel.
>
> *(L'historique connu : le 16/07, le terminal `.12` est devenu `.10` et le
> serveur a changé d'adresse — sans une seule erreur affichée.)*

⚠️ **Les caméras du portail n'authentifient pas : elles COMPARENT.** L'identité
est résolue côté MAGBO par `CameraIdentityService`, avec trois pièges mesurés en
production, tous documentés dans [`.claude/rules/hikvision.md`](../../.claude/rules/hikvision.md) :
les accents arrivent translittérés (`LABB'E` pour LABBÉ), le nom est tronqué à
32 caractères, et les échelles de similarité sont mélangées (fraction d'un côté,
pourcentage de l'autre).

### 2.2 Les migrations

**V001 → V027, toutes appliquées sur la VM de production** (V001–V026 déclarées
par Sam le 28/08 ; V027 appliquée au déploiement de la licence le 01/09). Le
détail de chacune est dans
[`deploy/migrations/README.md`](../../deploy/migrations/README.md).

**[À VÉRIFIER]** Confirmer que les tables des dernières migrations existent :
```bash
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename IN ('meal_slots','system_settings','cdi_exclusions','cdi_alert_events','cantine_removals','licence_clock')
   ORDER BY 1;"
# → les six doivent répondre
```

⚠️ Pour `licence_clock` (V027), l'existence de la table **ne suffit pas** : ce
qui la distingue de celle qu'`ddl-auto` aurait créée, c'est son `CHECK`.

```bash
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT conname FROM pg_constraint
    WHERE conrelid='licence_clock'::regclass AND contype='c';"
# → ck_licence_clock_ligne_unique
```

### 2.3 Ce qui a changé depuis le 05/08

L'ancienne version de ce document s'arrêtait au 05/08. Voici, en une ligne
chacun, les chantiers postérieurs. Le détail vit dans les rapports de nuit.

| Quoi | Migrations | Où c'est raconté |
|---|---|---|
| **Créneaux cantine** — le planning devient une configuration ; `class_schedules` n'est plus lu par la cantine | V021–V023 | [`ADR-005-creneaux-cantine`](../architecture/decisoes/ADR-005-creneaux-cantine.md), [`revue-migrations-v021-v023.md`](revue-migrations-v021-v023.md) |
| **Régime de sortie** — le droit ANNUEL de sortir, cinq verdicts | V014, V015 | [`nuit-26-27-08-rapport.md`](nuit-26-27-08-rapport.md) |
| **PPMS** — qui est dans l'école, par zone, maintenant | — | idem |
| **Photos d'identité** — dans la base, jamais sur disque | V011 | [`.claude/rules/backend.md`](../../.claude/rules/backend.md) |
| **Capacité et exclusions du CDI** | V025 | [`nuit-26-27-08-rapport.md`](nuit-26-27-08-rapport.md) |
| **Registre des alertes du CDI** — chaque alerte laisse une trace, avec son auteur | V026 | [`nuit-27-28-08-rapport.md`](nuit-27-28-08-rapport.md) |
| **Retraits manuels du Moniteur** — un geste d'écran, jamais une suppression | V020 | idem |
| **Écran de configuration** — les réglages modifiables à l'écran | V024 | [`inventaire-configurabilite.md`](inventaire-configurabilite.md) |
| **Recherche centrale** sur l'écran d'accueil, avec autocomplétion | — | [`nuit-27-28-08-rapport.md`](nuit-27-28-08-rapport.md) |
| **L'affiche cantine** imprimable en couleur, fidèle au mur | — | [`controle-affiche-cantine.md`](controle-affiche-cantine.md) |
| **Licence** — dégradation par couches ; une licence expirée AVERTIT, ne supprime rien, et ne ferme **jamais** le webhook ni le PPMS nominatif | V027 | [`ADR-006`](../architecture/decisoes/ADR-006-licence-degradation-par-couches.md), [`procedimento-licence.md`](procedimento-licence.md) |
| **Configuration du poste** — l'application s'ouvre par son `.exe` ; un écran de premier lancement écrit `magbo-poste.json` à côté de l'exécutable ; un PC de bureau se déclare **poste administratif** et n'est donc pas un point de passage ; le `.bat` devient optionnel mais **garde la priorité** | — | [`ADR-007`](../architecture/decisoes/ADR-007-configuration-du-poste.md), [`guide-installation-postes.md`](guide-installation-postes.md) |

⚠️ **L'écran de configuration a déménagé le 28/08 :** il n'est plus dans le
Panneau Administratif, il est dans **l'engrenage du header**, visible avec
`ADMIN` ou la permission `CONFIG_WRITE`.

#### Les trois chantiers du 03/09/2026

Ils ne sont pas encore sur `main` au moment où ces lignes sont écrites : ils
attendent la fusion par Sam. C'est aussi pourquoi cette page ne cite **aucun
SHA** comme « état actuel » — les identifiants changeront à la fusion.

**a. L'adresse de connexion — le poste appelait `/api/api/auth/login`.**
Le symptôme était trompeur au point de coûter une matinée : le poste affichait
**« Identifiants invalides »** sur un mot de passe juste. Ce qui se passait :
l'URL construite portait `/api` **deux fois**, Spring Security répondait **403**
sur cette route inconnue, et l'écran de connexion traduisait **tout** non-2xx en
« Identifiants invalides » — un refus de route déguisé en refus de mot de passe.

⚠️ **La cause est une globale que l'on croyait absente.** `window.API_BASE_URL`
**existe bel et bien** : Babel transpile le `const` de `js/api.js` en `var`,
donc en propriété de `window`, et sa valeur **se termine déjà par `/api`**. Un
chantier précédent avait ajouté un second `+ '/api'` en croyant la globale
absente. Corrigé dans `js/utils/auth.js` et dans `js/utils/userCache.js`, qui
portait le **défaut jumeau** — `GET /api/api/users`, dont le **404 était avalé
en silence** : pas de message, juste une liste de personnes vide. Prouvé dans
l'Electron réel, pas seulement en test.

**b. Le livre imprimable.** Les chapitres du livre du système se composent
désormais en un document A4 de **109 pages**, table des matières numérotée et
marges de reliure comprises : `npm run livre:pdf`.
⚠️ **Ne pas régénérer `docs/livre/livre-complet.html` à la main** ni depuis une
branche qui n'a pas le générateur réécrit : la sortie remplacerait le nouveau
livre par l'ancien.

> ### ⚠️ APRÈS TOUTE FUSION QUI TOUCHE UN CHAPITRE, RELANCER `npm run livre:pdf`
>
> `docs/livre/pagination.json` porte une **empreinte** des chapitres et de la
> feuille de style. Dès qu'un chapitre change, elle ne correspond plus et
> `build-livre.js` **retire les numéros de page** en le disant fort — le sommaire
> garde ses liens, perd ses numéros, et c'est volontaire.
>
> C'est exactement ce qui s'est produit en fusionnant les trois chantiers du
> 03/09 : la vérification de documentation a corrigé cinq chapitres, donc
> l'empreinte est tombée. **Un livre sans numéros n'est pas un défaut ; un livre
> avec de FAUX numéros en est un**, et c'est ce que ce mécanisme empêche.
>
> ```bash
> node scripts/paginer-livre.js     # ~40 s, douze lancements de Chrome
> git add docs/livre/livre-complet.html docs/livre/livre-complet.pdf >         docs/livre/pagination.json
> ```
>
> Le script **refuse de finir** (code 2) si l'échelle n'est pas exactement
> `0.750000` ou si la table des matières a changé de hauteur en gagnant ses
> numéros. Les deux refus sont des mesures, pas des avis.

**c. Cette vérification de documentation.** Un balayage des chiffres, dates et
états affirmés dans la documentation, avec remesure. C'est ce qui a produit les
totaux et les nombres en tête de cette page — et la section 8.2.10 sur les
comptes ADMIN.

### 2.4 Les sept comportements à connaître avant de lire un chiffre

Ces règles décident **comment la donnée doit être lue**. Qui ne les connaît pas
interprétera les nombres à l'envers. Elles sont détaillées au chapitre 3 du
livre ([`docs/livre/03-regles-metier.md`](../livre/03-regles-metier.md)) ; voici
le strict nécessaire.

1. **Le timestamp est l'heure de l'ÉVÉNEMENT, pas celle de la réception.**
   Depuis le 03/08, `EventTimeResolver` lit le `dateTime` du payload. Trois
   gardes seulement font retomber sur l'heure de réception : `dateTime` absent
   ou illisible, horloge de l'appareil en avance de plus de **5 min**, ou date
   de plus de **30 jours** dans le passé. Chaque repli laisse une ligne INFO
   avec l'IP et le motif.
   ⚠️ **Les RÈGLES, elles, restent jugées à l'heure de la décision** — dette
   ouverte, §6.1.

2. **Trois couches de déduplication, et ce ne sont pas la même chose.**

   | Couche | Fenêtre | Ce qu'elle empêche | Clé |
   |---|---|---|---|
   | Ingestion | 60 s | l'appareil a **renvoyé le même paquet** | IP + `serialNo` |
   | Même passage | 30 s | le terminal a **reconnu deux fois la même personne** | personne + point + action |
   | Repas dupliqué | 90 s | **règle métier** : deuxième repas dans la journée | personne + point |

3. **Fermeture automatique de présence.** `PresenceAutoCloseService` tourne
   toutes les 5 minutes et ferme les points dont l'heure de fermeture est
   passée. La sortie synthétique est déclarée, jamais déguisée :
   `flag=FECHAMENTO_AUTO`, `created_by_user=system`, et elle porte **l'heure de
   fermeture**, pas celle où le job a tourné.

   ⚠️ **Deux points sont configurés en production, pas un :** `BIBLIO` à 17:00
   **et `REFEI1` à 15:00** (`application-prod.properties`). Le commentaire du
   fichier dit que REFEI1 était « inerte jusqu'au pilote — aucun mouvement,
   rien à fermer », et il porte un avertissement : *« CONFÉRER L'HEURE AVEC LA
   CANTINE avant le jour 1 — qui est encore dedans à 15:00 reçoit une SORTIE
   synthétique et disparaît du panneau de l'opérateur. »*

   ### ✅ 15:00 est la bonne heure — confirmé par Sam le 31/08/2026

   **L'avertissement est levé : l'heure configurée correspond au service réel.**
   Personne n'est coupé au milieu de son repas, et aucune sortie n'est écrite
   pour quelqu'un qui serait encore là. Le commentaire d'alerte dans
   `application-prod.properties` peut être remplacé par cette confirmation et sa
   date, à la prochaine occasion de toucher au fichier.

   ⚠️⚠️ **Mais cela ne rend pas ces sorties vraies, et c'est la distinction qui
   compte.** Le 25/08 : **72 sorties écrites à 15:00 pile, dans la même
   minute.** Ce ne sont pas 72 personnes qui sont sorties à 15:00 — ce sont
   72 personnes dont la sortie n'a **jamais été lue**, et que le système a
   fermées à la fin du service.

   **Ce que 15:00 garantit, et ce qu'il ne garantit pas :**

   | | |
   |---|---|
   | ✅ **Garanti** | l'heure est un **plafond juste** : à 15:00 le service est fini, donc plus personne n'est dans le réfectoire. La fermeture ne ment pas sur la présence. |
   | ❌ **Pas garanti** | l'heure de sortie **individuelle**. Quelqu'un entré à 11h50 et parti à 12h10 porte une sortie à 15:00. |

   **Conséquence à retenir : pour ces 72 lignes, la durée de repas est un
   MAXIMUM, pas une mesure.** Un déjeuner de vingt minutes peut apparaître à
   trois heures. Toute moyenne de durée à la cantine qui les inclut est fausse
   vers le haut — et le nombre de « sorties non enregistrées » est
   artificiellement bas, puisque le système a comblé le trou lui-même.

   ⚠️ **Ce sont des lignes reconnaissables**, pas une corruption : elles portent
   `flag=FECHAMENTO_AUTO` et `created_by_user=system`. Les compter :
   ```sql
   SELECT timestamp::date, count(*)
     FROM access_logs
    WHERE point_id = 'REFEI1' AND flag = 'FECHAMENTO_AUTO'
    GROUP BY 1 ORDER BY 1 DESC LIMIT 10;
   ```
   **Les exclure d'une mesure de durée** — c'est le geste à faire avant de citer
   une moyenne à qui que ce soit :
   ```sql
   -- durées de repas MESURÉES : seulement les sorties réellement lues
   ... WHERE point_id = 'REFEI1'
         AND (flag IS NULL OR flag <> 'FECHAMENTO_AUTO')
   ```
   ⚠️ Le `flag IS NULL OR` n'est pas un ornement : sans lui, `<>` vaut UNKNOWN
   pour NULL et **écarte en silence toutes les lignes normales** — c'est-à-dire
   exactement celles qu'on voulait garder.

   **La vraie question qui reste n'est donc plus l'heure, c'est le taux :**
   pourquoi 72 sorties ne sont-elles pas lues ? Terminal de sortie absent,
   mal placé, ou personne ne badge en partant ? La réponse change ce qu'on peut
   mesurer à la cantine — pas le réglage.

4. **Les rapports comptent les ÉLÈVES par défaut.** 152 fonctionnaires et 49
   professeurs polluaient les chiffres du CDI. C'est un filtre **d'affichage** :
   rien n'est effacé, le Journal montre tout.

5. **Un passage de moins de 60 s ne compte pas comme une visite.**
   `magbo.report.min-visit-seconds`, et l'appariement entrée/sortie se fait
   **par pile** (le positionnel produisait des durées négatives).

6. **Le plancher de visite a une source unique :**
   `GET /api/access/report-config`. Le JS avait une constante en miroir, et le
   même écran affichait deux nombres pour le même jour.

7. **Deux flags de RÉPÉTITION sortent des écrans standard :** `POSTO_FIXO` (qui
   travaille au point) et `JA_PRESENTE` (qui entre en étant déjà dedans). La
   liste vit **une seule fois**, dans `AccessLogRepository.REPETICOES`. Rien
   n'est effacé : le Journal les montre, avec une lentille pour les filtrer.

### 2.5 Signatures de lecture — d'où vient un enregistrement ?

Dans six mois, quelqu'un demandera « cet accès vient du visage ou du clavier ? ».

| Origine | `created_by_user` | Microsecondes du `timestamp` | `flag` |
|---|---|---|---|
| **Terminal** (visage/carte) | `NULL` | **zéro** (le `dateTime` du payload est à la seconde) | `NULL`, `FORA_HORARIO`, `EXCEDEU_TEMPO`… |
| **Saisie manuelle** | login de l'opérateur | **≠ zéro** (`LocalDateTime.now()`) | idem |
| **Fermeture automatique** | `system` | zéro (cachet `17:00:00`) | `FECHAMENTO_AUTO` |

**Microsecondes ≠ 0 ET `created_by_user` rempli = saisie manuelle.** Les deux
marques ensemble, parce qu'aucune seule n'est une preuve.

> **`access_logs` = accès effectif · `access_attempts` = tout ce qui a été tenté
> et refusé.** Séparation structurelle ([`ADR-001`](../architecture/decisoes/ADR-001-attempts-vs-logs.md)) :
> `access_logs` ne reçoit **jamais** un événement refusé. Si vous avez besoin
> des deux, faites un `UNION` **dans la requête** — jamais dans l'écriture.

### 2.6 Ce que la production dit du planning de la cantine

*(Mesures relevées par Sam sur les données réelles, écrites ici le 31/08/2026.)*

Le planning affiché au mur et la réalité mesurée **divergent sur quatre
points**. Aucun ne demande une mesure supplémentaire : ils demandent une
**décision de la Vie Scolaire**.

**a) La maternelle et l'élémentaire ne mangent pas à l'heure que le système leur
prête.** Service réel mesuré le 26/08 : **entre 11h54 et 12h37**, en flux
continu, à environ **4 personnes par minute**. Or le système leur a hérité un
créneau à **11:00**, repris de `class_schedules` par le seed V023 — parce que
l'affiche du mur ne les nomme pas.

⚠️ **Aucun horaire n'a été inventé pour elles, et c'est délibéré** : semer un
créneau faux aurait produit des alertes fausses dès le premier jour. Mais le
créneau hérité à 11:00 **est** faux, et il produit ces alertes. Il faut soit le
corriger avec l'heure réelle, soit le retirer pour que ces classes tombent
franchement dans « créneau non configuré ».

**b) Six classes de collège mangent le mercredi à 13h sans figurer sur
l'affiche de ce jour.** Ce ne sont pas des débordements :

| Classe | Passages | Remarque |
|---|---|---|
| `1E1` | 15 | |
| `1E2` | 6 | |
| `2E1` | 15 | |
| `2E2` | 14 | |
| `3E1` | 20 | passages **concentrés entre 13h08 et 13h32** |
| `3E2` | 19 (+1) | idem — horaire cohérent, pas un débordement |

⚠️ **La concentration horaire de `3E1` et `3E2` est l'argument** : des élèves qui
débordent d'un autre service arrivent dispersés. Vingt passages en vingt-quatre
minutes, c'est une classe qui vient à son heure. **L'affiche est incomplète, pas
les élèves en faute.**

**c) `5E3` et `3E3` figurent sur l'affiche et n'ont aucun élève en base.** Elles
ne changent le verdict de personne, mais elles signalent soit un code de classe
qui a changé, soit une classe qui n'existe plus. Détail dans
[`controle-affiche-cantine.md`](controle-affiche-cantine.md), section A.

**d) ✅ Le badge masqué par l'aimant est résolu.** Confirmé le 27/08 sur la photo
du mur réimprimé : c'est bien **`4E2`**, mercredi 13h. La marque `a_confirmar` a
été retirée de la V023, de la base et du document de contrôle.

---

## 3. Déployer — le rite complet

Le déploiement **initial** (conteneurs, base, migrations) est dans
[`deploy/README.md`](../../deploy/README.md) et
[`reconstruir-do-zero.md`](reconstruir-do-zero.md). Ce qui suit est la **mise à
jour** d'un système déjà en service.

### 3.1 L'accès à la VM

*(Répondu par Sam le 31/08/2026.)*

```bash
ssh magbo@192.168.1.253
```

| Quoi | Où |
|---|---|
| Dépôt sur la VM | `~/Controle-de-Acesso` (soit `/home/magbo/Controle-de-Acesso`) |
| Compose | `~/Controle-de-Acesso/deploy/docker-compose.yml` |
| JAR déployé | `~/Controle-de-Acesso/backend/target/access-control-1.0.0.jar` |

> ## ⚠️⚠️ LE DÉPÔT DE LA VM N'EST PAS `origin/main`
>
> **Le dépôt git de la VM DIVERGE.** Il porte des commits qui n'existent nulle
> part ailleurs, et un `docker-compose.yml` **modifié et non commité** — c'est
> lui qui porte `TZ: America/Sao_Paulo` sur les deux conteneurs, plus
> `MAGBO_ADMIN_PASSWORD` et `ADMIN_PIN`.
>
> ### ⚠️ Depuis le 01/09/2026, ce même fichier porte aussi le volume de la licence
>
> La ligne `- ./licence:/licence:ro` dans le service `backend`. Elle **n'est pas
> davantage dans le dépôt**. Sans elle, le backend ne trouve pas
> `/licence/licence.magbo`, et `/api/health` répond
> `"etat":"EXPIREE","motif":"ABSENTE"`.
>
> **Cela RESSEMBLE à une échéance et n'en est pas une.** La réparation est
> d'ajouter le volume et de recréer le conteneur — **pas** de renouveler la
> licence. Procédure : [`procedimento-licence.md`](procedimento-licence.md).
>
> ⚠️ **Ce défaut s'est réellement produit**, au déploiement de la licence du
> 01/09. Et c'est le **log du backend** qui l'a nommé, pas la sonde :
>
> ```
> aucun fichier a /licence/licence.magbo
> ```
>
> `/api/health` disait seulement `ABSENTE` — le motif, pas la cause. **Le log dit
> OÙ, le health dit QUOI.** Retenez l'ordre du diagnostic : la sonde vous
> apprend qu'il y a un problème de licence ; c'est `docker logs magbo-backend`
> qui vous dit lequel, et il donne le chemin exact que le backend a cherché.
>
> **Qui ferait `git pull` sur la VM en s'attendant à y trouver le code de
> production se tromperait** — et écraserait peut-être la configuration qui fait
> tourner le système. Avant tout `git` sur la VM : `git status` et
> `git stash list`, et lire ce qui n'est pas commité.
>
> ⚠️ **Le JAR vient TOUJOURS du PC de Sam par `scp`. Jamais d'un build sur la
> VM.** La VM n'a pas Maven et n'a pas à l'avoir. La conséquence est qu'un
> `git pull` sur la VM ne change **rien** à ce qui tourne : le backend en
> service est le fichier `.jar` copié, pas le code du dépôt local.

```bash
# ── 1. Sur le PC : construire ────────────────────────────────────────
mvn -f backend/pom.xml clean package
# → backend/target/access-control-1.0.0.jar

# ── 2. Les deux suites, AVANT de copier quoi que ce soit ─────────────
cd backend && rm -rf target/test-classes && mvn -o test    # 1055, 0 échec, 2 @Disabled
cd .. && npx vitest run                                     # 889, 0 échec
```

⚠️ **Mesurer depuis zéro.** `mvn test` incrémental a déjà donné un
`BUILD SUCCESS` faux : quand seule la signature d'un constructeur change,
Lombok + un `target/test-classes` périmé laissent passer trois tests cassés.

⚠️ **Le `pom.xml` doit contenir `<include>**/*IT.java`** dans le Surefire. Sans
lui, les tests d'intégration sont **sautés en silence** et le total baisse sans
que rien n'échoue. Le critère n'est pas un total fixe : c'est **0 échec et
exactement 2 `@Disabled`**.

```bash
# ── 3. Copier le jar sur la VM ───────────────────────────────────────
scp backend/target/access-control-1.0.0.jar \
    magbo@192.168.1.253:~/Controle-de-Acesso/backend/target/

# ── 4. Les migrations À LA MAIN, AVANT de remonter le backend ────────
#     (voir §5 — ddl-auto ne les fera pas)

# ── 5. Redémarrer ────────────────────────────────────────────────────
ssh magbo@192.168.1.253
cd ~/Controle-de-Acesso/deploy && docker compose restart backend
# `sudo` n'est plus nécessaire : l'utilisateur de déploiement est dans le
# groupe `docker`. S'il demande un mot de passe, la permission a régressé.

# ── 6. Vérifier la santé, TOUJOURS, avant de partir ──────────────────
curl -s http://localhost:8080/api/health
# → doit contenir "database":"CONNECTED"
```

**7. Smoke avec des CLICS, pas seulement des `curl`.** C'est la leçon la plus
chère du projet : le 17/07, **trois espèces différentes** de bug de câblage
d'interface ont passé toute la batterie de `curl` et ne sont apparues que
lorsque quelqu'un a parcouru les écrans. Le parcours est dans
[`docs/frontend-smoke-checklist.md`](../frontend-smoke-checklist.md).

---

## 4. Distribuer le portable

Procédure complète, poste par poste :
[`guide-installation-postes.md`](guide-installation-postes.md).
Construction du paquet : [`release-portable.md`](release-portable.md).

Les trois choses qui comptent :

1. **Avant de construire, vérifier qu'aucun CDN n'est revenu :**
   ```bash
   grep -cE 'src="https?://|cdn\.|unpkg|jsdelivr' index.html   # doit rendre 0
   ```
   Un `<script src="https://…">` nouveau **ne produit aucune erreur** : l'écran
   ne s'affiche simplement pas sur un poste hors ligne.

2. **Vérifier le paquet** avec `node scripts/verify-package.js`. Le script
   **dérive** la liste des fichiers obligatoires depuis `index.html` — il ne
   maintient pas une liste en double qui vieillirait toute seule.
   Mesuré le 03/09/2026 : **96/96 fichiers obligatoires**. ⚠️ **Ce nombre ne se
   recopie pas de mémoire** — il est dérivé d'`index.html` et **il monte à chaque
   écran ajouté**. Pour le connaître à tout instant :
   ```bash
   node -e "console.log(require('./scripts/indexAssets.js').requiredPackageFiles().length)"
   ```

3. **Distribuer = remplacer le `.exe` seulement**, et **ouvrir par le `.exe`**.
   Depuis les PR #89 et #90
   ([`ADR-007`](../architecture/decisoes/ADR-007-configuration-du-poste.md)), un
   poste non configuré affiche un **écran de premier lancement** qui demande
   l'adresse du serveur et le lieu, puis écrit `magbo-poste.json` à côté de
   l'exécutable. L'ordre de résolution est : variables d'environnement →
   `magbo-poste.json` → défaut (`http://192.168.1.253:8080`,
   `js/utils/posteConfig.js`).
   ⚠️ **Un `Abrir-MAGBO.bat` encore présent garde la priorité** et grise l'écran
   de réglage : migrer un poste qui en a un est décrit dans
   [`guide-installation-postes.md`](guide-installation-postes.md).

⚠️ **`build:portable` peut être bloqué par un handle sur `app.asar`** alors
qu'aucun processus n'est visible. Seul un redémarrage du poste le libère.
*(Rapporté par Sam ; non reproductible depuis le dépôt.)*

---

## 5. Les migrations et leur ordre

⚠️ **`ddl-auto=update` ne les fera pas.** Il ajoute des colonnes ; il ne crée
jamais une contrainte `CHECK` sur une table existante et **n'altère jamais** un
`CHECK` déjà posé. Une valeur nouvelle dans un enum Java passe les tests (H2
recrée tout) et échoue **uniquement sur la VM**. Ce piège a mordu trois fois :
V009, V015, V022.

⚠️ **Appliquer À LA MAIN, AVANT de monter le backend.** Celui qui crée la table
en écrit le schéma : si le backend démarre d'abord, Hibernate crée la table
*sans* les `CHECK`, et la migration ne les posera plus.

```bash
cd /opt/magbo

for f in V001__access_attempts V002__meal_entitlements V003__meal_entitlement_events \
         V004__student_exit_permissions V005__system_users_permissoes V006__indexes \
         V007__app_users_departamento V008__app_users_camera_person_id \
         V009__denial_reason_camera V010__app_users_posto_fixo V011__user_photos \
         V012__exit_permission_two_authorities V013__password_reset_requests \
         V014__student_regimes V015__denial_reason_regime \
         V016__access_logs_indice_ponto_hora V017__student_regimes_enum_checks \
         V018__access_logs_indice_hora V019__access_logs_indice_user_id \
         V020__cantine_removals V021__meal_slots V022__denial_reason_meal_slot \
         V023__meal_slots_seed V024__system_settings V025__cdi_exclusions \
         V026__cdi_alert_events V027__licence_clock; do
  echo "== $f"
  docker exec -i magbo-postgres psql -v ON_ERROR_STOP=1 -U magbo -d magbodb \
    < deploy/migrations/$f.sql || { echo "ÉCHEC sur $f — NE PAS monter le backend"; break; }
done
```

⚠️⚠️ **`ON_ERROR_STOP=1` n'est pas décoratif.** Sans lui, `psql` continue après
l'erreur **et sort avec le code 0** : le script annonce le succès, le backend
démarre, et le défaut se découvre en production des semaines plus tard.

Toutes les migrations sont idempotentes (`IF NOT EXISTS`, blocs `DO $$`) : les
rejouer sur une base à jour ne fait rien.

⚠️ **Mais `CREATE TABLE IF NOT EXISTS` ignore la FORME de la table existante.**
Si une table préexiste avec un schéma différent, l'instruction ne fait rien
**et ne dit rien**. C'est pourquoi V021, V025, V026 et V027 portent une clause
de garde qui lève une exception explicite dans ce cas.

⚠️ **V027 va plus loin, et il faut savoir pourquoi.** Sa garde ne suffisait pas :
si le backend avait déjà créé `licence_clock`, la table existait avec les bons
noms de colonnes, la garde passait, `CREATE TABLE IF NOT EXISTS` ne faisait
rien — et le `CHECK (id = 1)`, qui est la seule chose que cette migration
apporte, n'était **jamais posé**, `psql` sortant avec le code 0. Le fichier pose
donc désormais la contrainte séparément, dans un bloc idempotent. C'est le seul
cas du dépôt où une migration devait réparer une table déjà créée par Hibernate.

**Rollbacks :** `deploy/migrations/rollback/`, un par migration sauf V006, V008,
V009 et V023 (V023 est un *seed* : ses lignes partent avec `R021`). Chaque
absence est justifiée dans le README des migrations, et
`tests/migrations.test.js` échoue si une migration nouvelle arrive sans plan de
retour.

⚠️ **`R011`, `R025` et `R026` effacent des données irremplaçables** : les photos
d'identité, les exclusions du CDI, le registre des signalements. Un `pg_dump`
**avant**, toujours.

---

## 6. Sauvegarde et restauration

**Restauration :** procédure complète, avec les pièges, dans
[`reconstruir-do-zero.md`](reconstruir-do-zero.md).

**Sauvegarde manuelle** (celle en laquelle on peut avoir confiance) :

```bash
docker exec magbo-postgres pg_dump -U magbo -d magbodb -F c -f /tmp/magbo.dump
docker cp magbo-postgres:/tmp/magbo.dump ./backups/magbo-$(date +%Y%m%d-%H%M).dump
```

Les dumps vont dans `backups/`, **ignoré par git**. Ne jamais committer un dump :
il contient 923 élèves réels, et depuis la V011 **leurs photos**.

### ✅ La sauvegarde automatique tourne — vérifiée en production le 31/08/2026

*(Répondu par Sam. Le doute de la version précédente de ce document est levé :
elle fonctionne, et elle n'est pas là où le dépôt le laissait croire.)*

| Quoi | Où / quand |
|---|---|
| Script | `/home/magbo/backup-magbo.sh` |
| Dumps | `/home/magbo/backups/` |
| Journal | `/home/magbo/backups/backup.log` |
| Fréquence | **tous les jours à 19:00**, samedi et dimanche compris |
| Taille | ~109 Mo par fichier |
| Format | dumps PostgreSQL **16.14** valides (en-tête `PostgreSQL database dump` confirmé) |
| Rétention | **14 jours** |

> ⚠️ **`deploy/backup.sh` n'est PAS le script qui tourne.** Celui du dépôt
> garde 30 jours, écrit dans `/var/backups/magbo/` et appelle `pg_dump`
> directement sur l'hôte — ce qui échouerait, PostgreSQL étant en conteneur.
> **C'est `/home/magbo/backup-magbo.sh` qui fait le travail, et il n'est pas
> versionné.** Ne pas « réparer » celui du dépôt en croyant réparer la
> sauvegarde ; et ne pas remplacer celui de la VM par celui du dépôt.
>
> **[ACTION — pour qui a le SSH, souhaitable et pas bloquant]** Verser
> `/home/magbo/backup-magbo.sh` dans le dépôt (par exemple sous
> `deploy/backup-vm.sh`) pour qu'il survive à la VM. ⚠️ **Ce n'est pas une
> question pour Sam :** le fichier est lisible par quiconque peut se connecter,
> il suffit de le copier. Tant qu'il n'existe qu'à un seul endroit, **le script
> qui fabrique les sauvegardes n'est lui-même pas sauvegardé.**

**Pour vérifier, à tout moment :**
```bash
ssh magbo@192.168.1.253
crontab -l | grep -i backup
ls -lht ~/backups/ | head -5        # le plus récent doit dater d'hier 19:00
tail -20 ~/backups/backup.log
```

### 🔴 La dette qui reste : les sauvegardes vivent sur la machine sauvegardée

⚠️ **Les dumps sont dans `/home/magbo/backups/`, c'est-à-dire sur la VM
elle-même.** Une panne de disque, une VM supprimée, un chiffrement malveillant :
la base **et** ses quatorze sauvegardes partent ensemble.

**Une copie hors machine n'a jamais été mise en place.** C'est la dette la plus
sérieuse de cette section : la sauvegarde fonctionne parfaitement contre
l'erreur humaine et le mauvais déploiement, et pas du tout contre la perte de
la machine.

Ce qu'il faudrait, par ordre de simplicité : un `rsync` nocturne vers un autre
hôte, ou une copie hebdomadaire sur un disque externe, ou un dépôt distant.
**Toute solution vaut mieux que la situation actuelle.** Le contenu justifie
l'effort : 923 élèves réels et, depuis la V011, **leurs photos**.

**Avant toute batterie de tests ou toute migration : sauvegarder d'abord.**
Sans exception.

---

## 7. Les cinq gestes d'urgence

Le tableau qu'on lit à 7h du matin quand rien ne marche.

### 7.1 Les événements ne rentrent plus (aucune erreur)

**Cause la plus probable :** une IP a changé par DHCP. Ni erreur, ni alerte.

**Geste :**
```bash
# le mapping que le backend utilise
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT terminal_ip, point_id, ativo FROM door_mappings ORDER BY terminal_ip;"
# le dernier passage reçu, par point
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT point_id, max(timestamp) FROM access_logs GROUP BY 1 ORDER BY 2 DESC;"
```
Puis, sur chaque terminal : relever l'IP au dos de l'appareil, et vérifier que
l'URL de l'*Écoute HTTP* (`Système et maintenance → Réseau → Service réseau →
HTTP(S)`) pointe bien vers l'IP actuelle du serveur. Corriger `door_mappings` si
l'IP du terminal a bougé.

### 7.2 Le backend ne démarre pas, ou se connecte à une base vide

**Sur la VM :** une variable manque dans `deploy/.env`. Les repères du profil
`prod` pointent ailleurs — le backend démarre et se connecte au mauvais endroit.
```bash
cd /opt/magbo/deploy && docker compose logs --tail=50 backend
```
`POSTGRES_PASSWORD`, `MAGBO_JWT_SECRET`, `MAGBO_WEBHOOK_TOKEN`, `ADMIN_PIN` et
`MAGBO_ADMIN_PASSWORD` doivent être remplis. Le modèle est
[`deploy/.env.example`](../../deploy/.env.example).

**Sur le PC :** le conteneur hérité `magbo-db` a démarré et occupe le port 5432.
```powershell
docker ps
docker stop magbo-db; docker start magbo-postgres
```

### 7.3 Les horaires sont décalés de trois heures

**Cause :** `TZ` manque sur un des conteneurs. L'image `eclipse-temurin` démarre
en **UTC** ; la JVM adopte le fuseau du conteneur, et tout `LocalDateTime.now()`
rend de l'heure UTC — le système horodate **trois heures dans le futur**.

**Geste :** `TZ: America/Sao_Paulo` doit être présent sur **les deux** services
de `deploy/docker-compose.yml` (le commentaire du fichier explique pourquoi les
deux). Puis `docker compose up -d` et vérifier :
```bash
docker exec magbo-backend date
docker exec magbo-postgres date
```

### 7.4 L'application s'ouvre vide, sans erreur

**Deux causes, dans cet ordre de probabilité :**

1. **Le poste pointe la mauvaise adresse.** Ouvrir le `.exe` ne fait plus tomber
   sur `localhost` : le défaut est désormais l'adresse de la VM
   (`DEFAUT_API_URL = 'http://192.168.1.253:8080'`, `js/utils/posteConfig.js:41`).
   Vérifier `magbo-poste.json` **à côté du `.exe`**, et l'ordre qui gouverne :
   variables d'environnement d'abord, puis ce fichier, puis le défaut. ⚠️ Si un
   `Abrir-MAGBO.bat` traîne encore, **c'est lui qui décide** — voir
   [`guide-installation-postes.md`](guide-installation-postes.md).
   *(Le `localhost` historique venait de deux lignes de la page, corrigées
   depuis ; il frappait les postes **même** lancés par le `.bat`. Voir
   l'[`ADR-007`](../architecture/decisoes/ADR-007-configuration-du-poste.md).)*
2. Un `<script src="https://…">` est revenu dans `index.html`. Sur un poste hors
   ligne, la page ne rend rien et **n'affiche aucune erreur**.
   `grep -cE 'src="https?://' index.html` → doit rendre `0`.

**Et si l'application s'ouvre mais refuse la connexion** en disant
« Identifiants invalides » sur un mot de passe juste : ce n'est pas le mot de
passe. C'est le défaut d'adresse corrigé le 03/09 (`/api/api/auth/login`, refusé
en 403 et traduit en refus d'identifiants) — §2.3, chantier **a**. Un poste
resté sur une version antérieure au 03/09 le présente encore.

### 7.5 Un écran affiche une clé i18n crue (`cdi.excl.titulo`)

**Cause :** une clé utilisée dans le code n'existe pas dans le dictionnaire.
`t()` rend la clé elle-même quand elle manque — c'est visible à l'écran et
invisible pour les tests qui ne rendent aucun composant.

**Geste :** `npx vitest run tests/i18nChavesUsadas.test.js` nomme la clé
manquante. L'ajouter dans `js/utils/i18n.js`, **bloc FR d'abord, bloc PT
ensuite** — les deux dictionnaires doivent avoir exactement les mêmes clés, et
un test l'exige.

---

## 8. Ce qui est cassé aujourd'hui, et ce qui reste

### 8.1 Cassé

1. **Le portail** — voir la section en tête. Priorité absolue.
2. **Les sauvegardes n'existent qu'à un seul endroit : sur la VM sauvegardée.**
   La sauvegarde automatique **fonctionne** (vérifiée le 31/08, tous les jours à
   19:00) — mais une panne de disque emporte la base et ses quatorze copies
   ensemble. Aucune copie hors machine. §6.
3. **Le terminal `.10` n'est pas enregistré au HikCentral** : erreur `SYS[904]`,
   numéro de série en conflit. **Un ticket est ouvert chez le fournisseur**
   (le revendeur des terminaux) — *réponse de Sam, 31/08*. ⚠️ **La référence du
   ticket n'a pas pu être retrouvée** : la chercher dans la messagerie de Sam ou
   auprès du service informatique, qui a traité la commande. À défaut, rouvrir
   une demande : l'erreur `SYS[904]` et le numéro de série du `.10` suffisent à
   la décrire.

   ⚠️ **Ce que ça change au quotidien, et ce que ça ne change pas.** HikCentral
   sert au **provisionnement** des personnes (le cycle des identités vers les
   appareils) — un terminal non enregistré n'en reçoit pas les mises à jour. En
   revanche, **il continue d'envoyer ses événements au MAGBO** : l'*Écoute HTTP*
   est un réglage local, indépendant de HikCentral.
   **[À VÉRIFIER]** Le `.10` produit-il bien des passages ?
   ```sql
   SELECT point_id, count(*), max(timestamp)
     FROM access_logs
    WHERE timestamp > now() - interval '7 days'
    GROUP BY 1 ORDER BY 3 DESC;
   ```
   Croiser avec `door_mappings` pour savoir quel `point_id` correspond au `.10`.
4. **Le terminal `.14` est en Wi-Fi — définitivement.** *(Réponse de Sam,
   31/08 : l'emplacement ne permet pas de tirer un câble.)* Ce n'est donc pas
   une action ouverte mais une **contrainte permanente**, et c'est le terminal
   le plus exposé aux coupures.

   ✅ **Le système sait déjà l'absorber.** Quand la liaison tombe, le terminal
   met ses événements en file et les renvoie d'un coup au retour. C'est le
   scénario exact qui a produit le premier défaut d'horloge du projet — 33
   événements arrivés à 14h51 le 03/08, tous enregistrés à 14h51, avec des
   durées moyennes négatives à la clé. Depuis, `EventTimeResolver` lit l'heure
   du **payload** : une file rejouée écrit les bonnes heures.

   ⚠️ **Ce qui reste vrai malgré ça** — et c'est la dette 8.2.1 : les **règles**
   sont jugées à l'heure de la **décision**. Une file du `.14` vidée à 15h30
   écrit les bonnes heures de passage, mais a été **jugée** à 15h30. Pour la
   cantine, ça peut faire tomber des passages de midi hors de leur créneau.

   **Comment détecter une file rejouée.** ⚠️ **Pas par la base :**
   `access_logs` ne garde **que** l'heure de l'événement (vérifié dans
   `AccessLog.java` — les colonnes sont `timestamp`, `created_by_user`, `flag`,
   `auth_method`, `hikvision_sub_event_type`, et rien qui date la réception).
   Une file rejouée est donc **invisible dans les données**, et c'est voulu :
   le but d'`EventTimeResolver` est précisément qu'elle ne laisse pas de trace
   dans les horaires.

   **La trace est dans les journaux du backend :**
   ```bash
   ssh magbo@192.168.1.253
   docker logs magbo-backend --since 24h | grep -i "Hora do evento nao utilizavel"
   ```
   Cette ligne `INFO` sort avec l'IP et le motif à **chaque** repli sur l'heure
   de réception. Elle ne se déclenche que si le `dateTime` est absent, illisible
   ou hors bornes — une file simplement en retard n'en produit pas. **Pour voir
   les coupures elles-mêmes**, chercher plutôt les trous dans les passages du
   `.14` : une matinée sans un seul événement à un point qui en produit
   d'habitude est le signe qui compte.

### 8.2 Dettes ouvertes — à NE PAS corriger sans décision

Elles sont gelées par des tests : les « corriger » ferait échouer une suite qui
protège une décision.

| # | Dette | Pourquoi elle est gelée |
|---|---|---|
| 8.2.1 | **Les règles sont évaluées à l'heure de la DÉCISION**, pas à celle de l'événement | Une file hors ligne ne doit pas pouvoir changer un `DENY` en `ALLOW` rétroactivement. Le régime de sortie est **l'exception assumée** : il ne refuse jamais, il décrit — et il juge à l'heure de la passage |
| 8.2.2 | ✅ **L'heure de fermeture de la cantine (15:00) est CONFIRMÉE** (Sam, 31/08) — cette ligne n'est plus une dette de réglage | Ce qui reste n'est pas l'heure mais le **taux** : ~72 sorties par jour ne sont jamais lues et sont fermées par le système. Ces lignes portent `FECHAMENTO_AUTO` : leur durée de repas est un **maximum**, pas une mesure — les exclure de toute moyenne (§2.4) |
| 8.2.3 | **`DEVICE_DENIED` est utilisé pour les sous-types inconnus** | Il manque `UNKNOWN_EVENT` dans l'enum. Ça gonfle `divergenciaHoje` |
| 8.2.4 | **Les endpoints protégés rendent 403, pas 401** | Seul le webhook rend 401 |
| 8.2.5 | **Deux couches HTTP dans le frontend** (`js/api.js` et `js/utils/api.js`) | Ne pas en créer une troisième ; consolider est un chantier à part |
| 8.2.6 | **`magbo.policy.meal-pending=DENY` en production** | Prérequis opérationnel : le bulk des autorisés **avant** le jour 1, sinon tout `PENDING` est refusé |
| 8.2.7 | **7 endpoints sans garde d'autorisation** | Nommés dans `ControllerAuthorizationGuardTest.DIVIDA_CONHECIDA`. ⚠️ L'un d'eux, `registerAccess`, est une **écriture**. Les garder casserait des écrans : c'est un chantier avec ses propres preuves |

### 🔴 8.2.9 NE PAS activer la dispense de badge en l'état — le PPMS

*(Répondu par Sam le 31/08/2026 : la conséquence PPMS **n'avait pas été
mesurée** au moment de préparer la fonctionnalité.)*

La dispense permet de retirer une classe entière de l'obligation de badger. Elle
est **préparée et désactivée par défaut**, et elle doit le rester tant que le
point ci-dessous n'est pas traité.

> ## ⚠️⚠️ Une classe dispensée disparaît AUSSI du décompte PPMS
>
> Le PPMS est le plan d'évacuation : il répond à « qui est encore dans
> l'établissement, et où ». **Une classe dispensée de badger n'a plus de
> passages — donc plus de présence — donc elle n'est pas comptée.**
>
> En évacuation, ces enfants **ne figureraient pas** parmi les personnes
> présentes. Et le pire n'est pas le nombre manquant : **c'est que l'écran ne
> le dirait pas.** Un décompte amputé qui a l'air complet est plus dangereux
> qu'un décompte dont on sait qu'il est partiel.

**Ce qui atténue, et ce qui n'atténue pas.** L'écran PPMS dit déjà, au-dessus du
nombre, qu'il **ne remplace pas l'appel** — c'est la vraie sécurité, et elle
tient. Mais l'écran de configuration est le seul endroit qui mentionne la
conséquence (« elles disparaissent du Moniteur **ET** du décompte PPMS ») :
**l'écran PPMS lui-même n'en dit rien.** Or c'est celui qu'on lit en urgence.

**Condition avant toute activation :**

1. **L'écran PPMS doit signaler les classes dispensées** — nommément, avec leur
   effectif, sous le nombre total. Tant que ce n'est pas fait, activer la
   dispense dégrade un outil de sécurité en silence.
2. **La direction doit trancher**, pas la personne qui reprend le code : c'est
   un arbitrage entre le confort d'exploitation et l'exhaustivité d'un décompte
   d'évacuation.

⚠️ **Le réglage est à un clic** (écran de configuration, `magbo.cantine.turmas-dispensees`).
C'est précisément ce qui rend cet avertissement nécessaire : rien dans
l'interface n'empêche de l'activer.

### ⚠️ 8.2.8 Le droit au repas est accordé en bloc, et « temporaire » n'a pas de fin

*(Répondu par Sam le 31/08/2026.)*

**874 élèves et 121 personnels — 995 personnes — ont un droit au repas accordé
en bloc, à titre temporaire**, en attendant une liste que la DAF devait fournir.

⚠️ **Cette demande n'a jamais été formalisée auprès de qui que ce soit.** Ce
n'est donc pas une relance à faire : c'est une **démarche à initier**.

**Ce que ça veut dire pour la règle.** `magbo.policy.meal-not-entitled=DENY` est
bien active — mais elle ne refuse jamais personne, puisque tout le monde est
autorisé. **La règle existe, elle ne protège rien.** C'est un choix conscient et
prudent (voir 8.2.6 : la sanction inverse, refuser tous les `PENDING`, aurait
peint l'école en rouge le jour 1) — mais un « temporaire » sans échéance ni
processus de sortie devient permanent par défaut.

**Pour voir l'état réel à tout moment :**
```sql
SELECT status, count(*) FROM meal_entitlements GROUP BY 1 ORDER BY 2 DESC;
```

**Ce qu'il faut décider, et ce n'est pas technique :**
1. **Qui, à la DAF, produit la liste des ayants droit ?**
2. **Sous quelle forme ?** Le système sait importer un `.xlsx` (écran Droits
   Repas). ⚠️ **Les matricules doivent rester du TEXTE** — Excel mange les zéros
   à gauche, et une matricule `0003535` devenue `3535` ne correspond à personne.
3. **À quelle échéance ?** Sans date, l'autorisation en bloc reste en place.

⚠️ **Ne pas retirer l'autorisation en bloc avant d'avoir la liste.** L'ordre
compte : sans liste chargée, la retirer refuserait 995 personnes à la cantine
le lendemain matin.

### ⚠️ 8.2.10 Neuf comptes ADMIN pour un seul OPERATOR

**Ce n'est pas une panne et rien n'est cassé.** C'est une **dette de sécurité** :
une surface d'administration bien plus large que ce que l'usage réel demande, et
qui s'est constituée sans que personne ne la décide.

**L'état des comptes**, relevé le 03/09/2026 :

| Compte | Rôle |
|---|---|
| `TI` | ADMIN |
| `VS` | ADMIN |
| `admin` | ADMIN |
| `alexandre` | ADMIN |
| `ccc` | ADMIN |
| `luciana` | ADMIN |
| `proviseur` | ADMIN |
| `rosantos` | ADMIN |
| `vs` | ADMIN |
| *(un seul compte, celui de la cantine)* | **OPERATOR** |

**Neuf ADMIN pour un OPERATOR.** Et deux doublons apparents : **`VS` / `vs`** et
**`TI` / `ccc`**. « Apparents » parce que rien dans la base ne dit qu'ils
désignent la même personne — c'est justement ce qu'il faut aller demander.

**Pour reconstituer la liste à tout moment** (aucun mot de passe n'y figure, et
aucun ne doit être lu) :

```sql
SELECT username, nome_completo, role, ativo, last_login
  FROM system_users
 ORDER BY role, last_login DESC NULLS LAST;
```

> ## ⚠️ AUCUN COMPTE N'EST À DÉSACTIVER SUR LA FOI DE CETTE SECTION
>
> **Qui garde ADMIN est une décision d'établissement, pas une correction
> technique.** Neuf comptes veulent peut-être dire neuf personnes qui en ont
> réellement besoin ; l'inventaire ne le dit pas, et le code encore moins.
>
> Désactiver le mauvais compte, c'est enlever à quelqu'un l'écran dont il se
> sert tous les matins — et personne, aujourd'hui, ne peut le lui rendre en cinq
> minutes s'il se trompe. Cette section **pose la question**, elle ne la tranche
> pas.

#### Pourquoi c'est une dette

**1. La surface.** Le rôle ADMIN n'est pas un cran de plus : c'est tout le
système. Le code n'a que **deux** rôles — `ADMIN` et `OPERATOR`
(`backend/src/main/java/com/magbo/access/security/Role.java`) — et il n'y a rien
entre les deux.

Mesuré le 03/09/2026 (`grep -rn "hasRole('ADMIN')" backend/src/main/java`) :
**62 gardes**, dont **39 annotations `@PreAuthorize` sans aucune alternative de
permission**. Ces 39-là ne sont accessibles qu'à un ADMIN, et à personne
d'autre :

| Ce qui n'est ouvert qu'à un ADMIN | Où | Gardes |
|---|---|---|
| Le registre des **personnels** (création, modification, suppression, import) | `StaffController` | 14 |
| Les **photos d'identité** (import, remplacement, suppression) | `UserPhotoController` | 6 |
| Le registre des **personnes** (écriture, import en lot) | `UserController` | 5 |
| L'import **Pronote** · les **demandes de réinitialisation de mot de passe** · deux écritures d'**accès** | `PronoteController`, `PasswordResetRequestController`, `AccessController` | 2 chacun |
| Les **comptes eux-mêmes** (créer un ADMIN, changer un rôle, redéfinir un mot de passe) | `SystemUserController` | garde au niveau **classe** |
| **Mappings de portes**, **planning de classes**, **mappings Hikvision**, **statistiques**, **fin de journée**, **relecture de la licence**, **PIN du Panneau Administratif** | sept contrôleurs | 1 chacun |

**2. Les écrans de gestion suivent le rôle, pas le besoin.** L'engrenage du
header s'ouvre pour un ADMIN **ou** pour qui porte `CONFIG_WRITE`
(`js/components/Header.js`) ; à l'intérieur, un ADMIN voit **tous** les onglets
— importations, personnels, photos, cadastre —, l'autre en voit **un**. Neuf
ADMIN, c'est donc neuf personnes qui peuvent importer un lot de personnes,
remplacer la photo d'un enfant ou effacer un cadastre, que ce soit leur métier
ou non.

**3. La traçabilité tient sur les gestes, pas sur les comptes.** Et c'est là que
la dette mord.

| Ce qui est tracé | Comment |
|---|---|
| Droits repas | `meal_entitlement_events.changed_by` |
| Régimes de sortie | `student_regime_events.changed_by` |
| Autorisations de sortie | `created_by` / `revoked_by` |
| Réglages du système | `updated_by` |
| Photos d'identité | `user_photos.updated_by` |
| Passages saisis à la main | `access_logs.created_by_user` |

Ces colonnes reçoivent le **nom d'utilisateur de la session**, pas une
constante : c'est vrai, et c'est solide.

> ### ⚠️ Deux trous, et il faut les nommer
>
> **a) Les comptes eux-mêmes ne sont tracés nulle part.** La table
> `system_users` porte bien un `created_at` — **quand** — mais **aucune colonne
> d'auteur et aucune table d'événements** : aucune migration n'en ajoute (seules
> `V005` et `V013` touchent à cette table, pour la colonne `permissoes` et pour
> les demandes de réinitialisation), et `SystemUserController` n'écrit **aucune
> ligne de journal** (`grep -c "log\." → 0`, mesuré le 03/09). **Créer un compte
> ADMIN, changer un rôle ou redéfinir un mot de passe ne laisse aucune trace de
> qui l'a fait.** C'est aussi pourquoi l'origine des neuf comptes est
> aujourd'hui irrécupérable : elle n'a jamais été écrite.
>
> **b) Un compte partagé annule la traçabilité qui existe.** Le compte `admin`
> est générique. Si deux personnes s'en servent, `changed_by = 'admin'` ne
> désigne plus personne, et toutes les colonnes du tableau ci-dessus perdent
> leur sens **rétroactivement** — on ne peut pas réattribuer après coup.
>
> **c) L'ouverture du Panneau Administratif n'est pas nominative non plus :**
> `AdminController` journalise l'accès **sans le nom d'utilisateur**, et le PIN
> qu'il vérifie est **un seul PIN pour tout le monde** (`ADMIN_PIN`). Neuf ADMIN
> partagent le même PIN.

**4. Une conséquence qui joue dans l'autre sens.** Sous licence expirée,
`/api/system-users/**` est **fermé** (`LicencePortee`, ADR-006) : aucun compte
ne peut alors être créé ni débloqué, et un opérateur qui oublie son mot de passe
reste dehors — seuls les comptes **existants** se connectent encore. Aujourd'hui
les neuf ADMIN sont, de fait, le plan de secours de cette situation. **Ce n'est
pas un argument pour les garder tous ; c'est un argument pour ne pas descendre à
un.**

#### La question à poser — et elle n'est pas technique

> ## Qui a encore besoin d'ADMIN ?

Elle se pose personne par personne, et elle a trois branches :

1. **Qui est derrière chaque login ?** `TI`, `VS`, `ccc`, `vs` ne nomment
   personne. **Commencer par là** : une liste de comptes dont on ignore le
   titulaire ne se nettoie pas, elle se devine — et on se trompe.
2. **Qui s'en sert encore ?** `last_login` est écrit à **chaque** connexion
   (`AuthController`) et répond sans avoir à demander :
   ```sql
   SELECT username, role, ativo, last_login
     FROM system_users
    WHERE role = 'ADMIN'
    ORDER BY last_login DESC NULLS LAST;
   ```
   ⚠️ **Un `last_login` ancien n'est pas une preuve d'inutilité** : un compte de
   direction peut ne servir que trois fois par an, et ce sont trois fois où il
   doit marcher.
3. **De quoi chaque personne a-t-elle réellement besoin ?** Pour dix gestes, une
   **permission granulaire** existe déjà et se donne à un OPERATOR sans lui
   donner le reste (`security/Permissions.java`) : `MEAL_ENTITLEMENT_WRITE`,
   `EXIT_PERMISSION_WRITE`, `ATTEMPTS_READ`, `REGIME_WRITE`, `PPMS_READ`,
   `CANTINE_REMOVAL_WRITE`, `MEAL_SLOT_WRITE`, `PARCOURS_READ`, `CONFIG_WRITE`,
   `CDI_EXCLUSION_WRITE`.

> ### ⚠️ Ce qu'une rétrogradation casse, et ce qu'elle ne casse pas
>
> **Elle ne casse rien** pour qui n'utilise que les dix gestes ci-dessus : la
> permission correspondante rend exactement le même écran, et le backend
> l'accepte à la place du rôle (`hasRole('ADMIN') or @areaSecurity.hasPermission(...)`
> — 22 des 62 gardes ont cette forme).
>
> **Elle casse tout** pour qui touche aux personnels, aux personnes, aux photos,
> aux mappings de portes, au planning de classes, à l'import Pronote, aux
> statistiques, aux comptes ou à la licence : **il n'existe aucune permission
> pour ces écrans-là**, donc aucun moyen de les rendre à un OPERATOR.
>
> ⚠️ **Et ça a déjà été mesuré, le 20/08/2026, avec un vrai compte OPERATOR :**
> l'onglet Personnels s'ouvrait **en entier** — titre, recherche, en-tête de
> tableau — et affichait **« 0 personnel(s) »**, le seul indice étant un message
> « Forbidden », en anglais. *Un écran qui répond « il n'y en a aucun » à un
> refus de permission ment.* Le correctif a été de **cacher** l'engrenage
> (commentaire conservé dans `js/components/Header.js`) — mais la leçon vaut
> pour toute rétrogradation future : **tester le poste de la personne après**,
> pas seulement l'API.

#### Ce qu'il est raisonnable de faire, dans cet ordre

1. **Écrire qui est derrière chaque login.** C'est un tableau à remplir en
   parlant aux gens, pas une requête. Sans lui, rien d'autre n'est décidable.
2. **Relever `last_login` pour les neuf**, et le poser à côté du tableau — comme
   information, pas comme verdict.
3. **Trancher les deux doublons** (`VS`/`vs`, `TI`/`ccc`) : deux personnes, ou
   deux comptes pour une seule ? C'est la seule question dont la réponse est
   probablement immédiate.
4. **Faire porter la décision par la direction**, avec les deux trous en tête :
   un compte partagé efface la traçabilité, et la gestion des comptes n'en
   laisse aucune.

⚠️ **Ne rien désactiver avant l'étape 1**, et de préférence pas seul.

### ⚠️ 8.2.11 Un disque plein casse les sauvegardes et les builds — en désignant autre chose

**Mesuré le 03/09/2026 sur le PC-TRAB : le disque `C:` était PLEIN — 0 octet
libre sur 236 Go.**

Ce qui rend ce point digne d'une section, ce n'est pas la panne : c'est **le
message**. La suite de tests s'arrêtait sur
`JavaScript heap out of memory` et `Fatal process out of memory: Zone`. Ces
phrases désignent la **mémoire vive** ; le vrai coupable était le **disque**, et
personne ne cherche un disque plein quand on lui parle de tas JavaScript.

**Ce qui a libéré la place :** ~1,5 Go de scratchs NSIS dans `%TEMP%` — les
fichiers `ns*.tmp` laissés derrière eux par les lancements du portable. Ils
s'accumulent silencieusement, un peu à chaque exécution.

```bat
REM à faire application fermée
del /q "%TEMP%\ns*.tmp"
```

> ⚠️ **Ce n'est pas une curiosité du PC de Sam, c'est un risque d'exploitation.**
> Une VM pleine ne dit pas « je suis pleine » : elle rend un `pg_dump` tronqué,
> un build qui échoue sur un message de mémoire, un conteneur qui refuse de
> démarrer pour une raison sans rapport. **Un disque saturé se manifeste toujours
> ailleurs que là où il est.**
>
> Le geste qui coûte le moins : regarder l'espace libre **avant** de croire un
> message d'erreur exotique — sur le PC (`Explorateur`, ou
> `wmic logicaldisk get size,freespace,caption`) comme sur la VM (`df -h`). Et
> se souvenir que la VM garde **14 jours de sauvegardes** sur son propre disque
> (§6) : c'est précisément le genre de répertoire qui remplit une machine sans
> que personne ne le remarque, jusqu'au jour où c'est la sauvegarde elle-même qui
> ne s'écrit plus.

### 8.3 Ce qui reste à faire

La liste datée et priorisée est au **chapitre 9 du livre** :
[`docs/livre/09-ce-qui-reste.md`](../livre/09-ce-qui-reste.md).

---

## 9. Où chercher le reste

| Question | Document |
|---|---|
| Le système en entier, pour quelqu'un qui arrive | [`docs/livre/`](../livre/) — neuf chapitres |
| Comment on se sert de chaque écran | [`docs/manual-utilisateur.md`](../manual-utilisateur.md) |
| Reconstruire de zéro / restaurer | [`reconstruir-do-zero.md`](reconstruir-do-zero.md) |
| Installer un poste | [`guide-installation-postes.md`](guide-installation-postes.md) |
| Les migrations, une par une | [`deploy/migrations/README.md`](../../deploy/migrations/README.md) |
| Pourquoi le système est comme il est | [`docs/architecture/decisoes/`](../architecture/decisoes/) (les ADR) |
| Les pièges par domaine | [`.claude/rules/`](../../.claude/rules/) |
| Ce qui s'est passé les dernières nuits | [`nuit-26-27-08-rapport.md`](nuit-26-27-08-rapport.md), [`nuit-27-28-08-rapport.md`](nuit-27-28-08-rapport.md) |
| Les réglages modifiables et ceux qui ne le sont pas | [`inventaire-configurabilite.md`](inventaire-configurabilite.md) |

---

## 10. Règles de travail héritées

Elles ont été écrites après avoir été payées. Elles sont dans
[`CLAUDE.md`](../../CLAUDE.md), et les trois qui coûtent le plus cher quand on
les oublie :

1. **Un pas → valider → committer → le suivant.** Une décision à la fois.
2. **Rien de simulé hors des tests.** Pas de données factices dans un écran :
   quelqu'un finira par les prendre pour vraies.
3. **Les changements de base sont additifs.** `ddl-auto=update` ajoute et ne
   retire jamais ; une colonne supprimée ne revient pas.

---

# 11. Les quinze questions pour Sam — ✅ posées et répondues le 31/08/2026

**Cette section n'est plus une liste d'attente : c'est le compte rendu de ce qui
a été demandé à Sam avant son départ, et de ce qu'il a répondu.** Tout ce que le
dépôt ne pouvait pas dire est ici. Chaque réponse est aussi écrite à sa place
dans le document, avec son détail.

| État | Combien | Lesquelles |
|---|---|---|
| ✅ **Répondu** | **12** | 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 13, 15 |
| ⚠️ **Répondu en partie** | **2** | **12** (le ticket existe, sa référence est perdue) · **14** (le chemin est connu, le détail des fichiers non) |
| ❌ **Sans réponse** | **1** | **4** — Sam n'a plus l'information ; à qui la demander est écrit ci-dessous |

> ⚠️ **« Répondu » ne veut pas dire « réglé ».** Cinq réponses ouvrent une
> action, et deux d'entre elles sont devenues les deux risques en tête de ce
> document : **Q2** (Sam est le seul détenteur des accès) et **Q5** (personne
> n'a été désigné pour décider). **Q10** est devenue une condition bloquante,
> **Q8** une démarche à lancer, **Q14** la piste nº 1 du défaut du portail.
>
> **La réponse la plus lourde est celle qui est un vide : Q5.** Une liste de
> questions résolues ne sert à rien si personne n'a le pouvoir de trancher ce
> qu'elles révèlent.

### Accès et infrastructure
1. ✅ **RÉPONDU (31/08) — l'accès à la VM.** `ssh magbo@192.168.1.253`, dépôt
   dans `~/Controle-de-Acesso`. ⚠️ **Le dépôt de la VM diverge d'`origin/main`**
   et son `docker-compose.yml` est modifié sans être commité : ne pas y faire
   `git pull` en croyant y trouver le code de production. Détail au §3.1.
2. ✅ **RÉPONDU (31/08) — et c'est le risque nº 1 de la reprise.** Les cinq
   secrets d'application vivent dans `deploy/.env` **sur la VM** ; le compte
   `admin`, l'accès aux terminaux, HikCentral et **le SSH de la VM** ne sont
   détenus que par **Sam**. ⚠️ **Le SSH est la clé des cinq autres :** le perdre,
   c'est perdre tout le reste avec. Les quatre gestes à faire aujourd'hui sont
   en tête de ce document, section « Le risque nº 1 de la reprise ».
3. ✅ **RÉPONDU (31/08) — la sauvegarde tourne.** Tous les jours à 19:00,
   ~109 Mo, dumps PostgreSQL 16.14 valides, rétention 14 jours — dans
   `/home/magbo/backups/`, **pas** dans `/var/backups/magbo/`, et par
   `/home/magbo/backup-magbo.sh`, **pas** par `deploy/backup.sh`. ⚠️ **Reste
   ouvert : aucune copie hors machine.** Détail au §6.

### Contacts
4. ⚠️ **[À COMPLÉTER — Sam n'a plus l'information (31/08)]** **Fabiano
   (informatique)** : nom complet, e-mail, téléphone. Sam ne se souvient pas de
   l'état des réservations DHCP demandées pour les terminaux et la VM.
   **À qui demander :** le secrétariat ou la direction de l'établissement
   connaissent le service informatique. **Ce qu'il faut lui demander :**
   « les adresses IP des six terminaux Hikvision et de la VM 192.168.1.253
   sont-elles réservées en DHCP, ou peuvent-elles encore changer ? »
   ⚠️ **Ne pas attendre la réponse pour se protéger** : la méthode empirique
   est au §2.1, et elle donne le risque réel en une requête.
5. ⚠️ **RÉPONDU (31/08) — et la réponse est un vide.** « En pratique, c'était
   moi. » **Aucun remplaçant n'a été désigné.** Toutes les questions de cette
   liste, et les sept décisions en attente, n'ont donc plus de destinataire.
   **Désigner qui décide est la première décision à prendre** — voir « Le risque
   nº 2 » en tête de ce document.
6. ✅ **RÉPONDU (31/08).** **Sam faisait lui-même partie de la Vie Scolaire** :
   il n'y avait pas d'interlocuteur métier tiers. Le développeur, le décideur et
   l'utilisateur quotidien étaient la même personne — et le savoir métier
   (« ce que les règles *devraient* être ») n'a pas de trace écrite. Ce qu'il
   faut faire, au §1.

### Engagements et décisions
7. ✅ **RÉPONDU (31/08) — rien de formel.** **Aucune promesse ferme n'a été
   faite à personne**, ni sur une fonctionnalité, ni sur une date. Personne dans
   l'établissement n'attend une livraison de la part du système.
   ⚠️ C'est une réponse **utile**, pas un vide : elle veut dire que la reprise
   commence sans dette envers qui que ce soit, et que le successeur peut
   prendre le temps de comprendre avant de produire. Le seul engagement en
   suspens reste **la liste DAF** (question 8), qui est une attente *du* système
   envers l'établissement, pas l'inverse.
8. ⚠️ **RÉPONDU (31/08) — la demande n'a jamais été lancée.** Elle n'a été
   formalisée auprès de personne : c'est une **démarche à initier**, pas une
   relance. En attendant, **995 personnes (874 élèves + 121 personnels)** ont un
   droit au repas accordé en bloc « temporairement », sans échéance ni processus
   de sortie. ⚠️ **Ne pas retirer ce droit avant d'avoir la liste** — l'ordre
   compte. Détail et requête de contrôle au §8.2.8.
9. ✅ **RÉPONDU (31/08) — les mesures sont faites, il manque les décisions.**
   Quatre points en suspens avec la Vie Scolaire, détaillés au §2.6. ⚠️ **Ils ne
   demandent aucune mesure supplémentaire** — la production a déjà répondu à ce
   qu'on peut lui demander. Ils demandent **quelqu'un qui tranche**, et la
   question 5 dit que ce quelqu'un n'existe pas encore.
10. 🔴 **RÉPONDU (31/08) — la conséquence PPMS n'avait PAS été mesurée.**
    Activer la dispense retirerait les classes concernées du **décompte
    d'évacuation**, sans que l'écran PPMS le signale. **Ne pas activer** tant
    que le PPMS ne nomme pas les classes dispensées ; et c'est la **direction**
    qui tranche, pas la personne qui reprend le code. Détail et condition au
    §8.2.9.
11. ✅ **RÉPONDU (31/08) — les deux sont partis.** L'e-mail à l'informatique a
    été envoyé et le PDF du guide d'installation a été remis. Rien à relancer.
    *(La source du guide reste à [`guide-installation-postes.md`](guide-installation-postes.md) :
    c'est elle qu'il faut mettre à jour, puis réexporter, si la procédure
    change.)*

### Matériel
12. ⚠️ **RÉPONDU EN PARTIE (31/08).** Un **ticket est ouvert chez le
    fournisseur** (le revendeur qui a livré les terminaux) pour le `.10`,
    erreur `SYS[904]`, numéro de série en conflit. **[À COMPLÉTER — la
    référence du ticket et le nom du contact n'ont pas pu être retrouvés.]**
    **Où chercher :** la messagerie de Sam, ou le service informatique de
    l'établissement, qui a traité la commande des terminaux. Sans la référence,
    rouvrir une demande auprès du fournisseur revient au même — l'erreur et le
    numéro de série suffisent à la décrire. Détail au §8.1.
13. ✅ **RÉPONDU (31/08) — définitif.** L'emplacement ne permet pas de tirer un
    câble : c'est une **contrainte permanente**, pas une action ouverte. Le
    système sait déjà absorber les files rejouées (`EventTimeResolver`) ; ce qui
    reste est la dette 8.2.1 (les règles jugées à l'heure de la décision). Ce
    qu'il faut surveiller, et pourquoi une file est invisible dans la base :
    §8.1.
14. ⚠️ **RÉPONDU (31/08) — par HikCentral.** C'est la réponse la plus utile de
    cette liste : les photos des 25 et 26/08 sont passées par **les
    bibliothèques faciales des caméras**, pas par la table `user_photos` du
    MAGBO. Le lien avec la chute du portail cesse d'être une simple coïncidence
    de dates — **il y a un mécanisme**. Les quatre vérifications à faire côté
    HikCentral sont en tête de ce document.
    **[À COMPLÉTER — non retrouvé le 31/08] :** quels fichiers exactement, et
    pour combien de personnes. **Pourquoi ça ne bloque pas :** les quatre
    vérifications se font depuis HikCentral, qui montre l'état actuel des
    bibliothèques sans avoir besoin de savoir ce qui y a été versé.

### Exploitation
15. ✅ **RÉPONDU (31/08) — 15:00 est la bonne heure**, confirmée par Sam contre
    le service réel. L'avertissement de `application-prod.properties` est levé :
    personne n'est coupé au milieu de son repas.
    ⚠️ **Mais les 72 sorties du 25/08 restent synthétiques** — ce sont
    72 personnes dont la sortie n'a jamais été *lue*. Pour elles, la durée de
    repas est un **maximum**, pas une mesure. Les exclure avant toute moyenne :
    §2.4.
    **La question qui reste n'est plus l'heure, c'est le taux : pourquoi
    72 sorties ne sont-elles pas lues ?** (terminal de sortie absent, mal placé,
    ou personne ne badge en partant). Elle est nouvelle et n'appartient plus à
    Sam — elle s'observe sur place, à la cantine, à 13h.

---

## Ce que ces quinze questions ont changé dans le document

Elles n'ont pas seulement rempli des trous : **elles ont corrigé des
affirmations fausses**, ce qui est plus important, parce qu'une documentation
fausse est crue.

| Ce que le document disait | Ce que la réponse a établi |
|---|---|
| La sauvegarde était présentée avec les chemins de `deploy/backup.sh` | Elle tourne, mais **ailleurs** : `/home/magbo/backups/`, par `/home/magbo/backup-magbo.sh`. Restaurer avec les anciens chemins n'aurait rien trouvé |
| « La cantine n'a pas de fermeture automatique » | **Faux** — `REFEI1` est fermé à 15:00, et ça produit 72 sorties synthétiques par jour |
| L'heure de 15:00 était une dette de réglage | **Elle est juste.** La dette était ailleurs : le taux de sorties non lues |
| Le dépôt de la VM était supposé refléter `main` | Il **diverge**, avec un `docker-compose.yml` modifié non commité |
| Les imports de photos étaient « une coïncidence de dates » | Ils sont passés par **HikCentral** : il y a un mécanisme, pas une coïncidence |
| La dispense de badge était une décision d'ergonomie | Elle touche le **décompte d'évacuation du PPMS** — condition bloquante, décision de la direction |

⚠️ **Et une correction faite en écrivant :** la question 13 était accompagnée
d'une requête SQL qui groupait sur une heure de réception. **Cette colonne
n'existe pas** — `access_logs` ne garde qu'un `timestamp`, celui de
l'événement. La requête a été remplacée par la lecture des journaux du backend,
et le document dit maintenant qu'une file rejouée est **invisible dans les
données par conception**.
