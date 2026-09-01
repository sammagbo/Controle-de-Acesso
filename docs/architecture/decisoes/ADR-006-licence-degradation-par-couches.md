# ADR-006 — Licence : dégradation par couches, et le PPMS intouchable

**Date :** 2026-08-31 · **Statut :** accepté · **Branche :** `feat/licence`
**Auteur de la décision :** Sam (MAGBO STUDIO)

---

## Contexte

Sam quitte l'établissement. Le logiciel a une suite commerciale à négocier. Il
installe une version dont la période d'utilisation est limitée dans le temps ;
selon l'issue de la négociation, il émettra une clé plus longue ou laissera
celle-ci arriver à son terme.

Le système n'est pas un tableur. Il enregistre les passages de **923 élèves
mineurs** aux portails, à la cantine, au CDI et à l'infirmerie, et il sert de
**liste nominative du PPMS** — le document qu'on ouvre pendant une évacuation
pour savoir qui est encore à l'intérieur. Une limitation d'usage devait donc
être conçue en partant d'une question qui n'est pas commerciale : **qu'est-ce
qui ne peut jamais s'arrêter ?**

---

## Décision

**Une licence expirée AVERTIT. Elle ne supprime rien et ne met personne en
danger.** Ce qui se ferme, ce sont les **écrans de gestion**. Quatre états,
soixante jours de préavis visible avant que quoi que ce soit ne se ferme.

| État | Quand | Ce qui se passe |
|---|---|---|
| **1. VALIDE** | > 30 jours avant | Rien ne change, aucun bandeau |
| **2. ALERTE** | 30 derniers jours | Bandeau pour ADMIN et direction, avec le décompte. **Les opérateurs ne le voient pas.** Rien n'est fermé |
| **3. COURTOISIE** | 30 jours **après** | Bandeau plus visible. **Rien n'est fermé** |
| **4. EXPIRÉE** | au-delà | Les écrans de **gestion** se ferment. Le reste continue |

### Ce qui continue, dans les QUATRE états, licence absente comprise

- **L'enregistrement des passages** venant des terminaux (le webhook).
- **Les écrans des postes** — portail, CDI, cantine, infirmerie.
- **Le PPMS avec la liste NOMINATIVE**, et son impression.
- **La connexion des opérateurs.**

### Ce qui se ferme en état 4

Configuration du système · planning cantine · gestion des opérateurs · droits
repas · toutes les importations · rapports et exports · régimes de sortie ·
autorisations de sortie · exclusions CDI.

L'inventaire exact, route par route et **avec la raison de chacune**, vit dans
[`LicencePortee.java`](../../../backend/src/main/java/com/magbo/access/services/licence/LicencePortee.java).

---

## Pourquoi la dégradation par couches plutôt que l'arrêt

**Un interrupteur « valide / expiré » place toute la conséquence sur un seul
jour de calendrier.** Ce jour-là, Sam peut être injoignable — vacances,
changement de numéro, négociation en cours, avion. Une école ne peut pas
dépendre de la disponibilité téléphonique d'une personne pour continuer à
enregistrer les entrées et sorties de ses élèves.

Les deux états du milieu existent pour cela :

- **ALERTE** prévient pendant un mois **avant** ;
- **COURTOISIE** ne ferme rien pendant un mois **après**.

Soixante jours de préavis visible. C'est la moitié du dispositif qui protège
l'utilisateur plutôt que l'éditeur, et elle est délibérée.

**Et même en état 4, l'arrêt n'est pas une option.** Un système d'accès qui
s'éteint ne redevient pas « du papier » : il devient une porte que personne ne
surveille et un registre avec un trou. Les alternatives ont été écartées :

- **Tout arrêter.** Rejeté : ferait perdre des passages d'enfants, et rendrait
  le PPMS muet. Une évacuation pendant une semaine d'expiration serait un
  désaccord commercial transformé en risque pour des mineurs.
- **Dégrader les données** (anonymiser, tronquer, cesser d'écrire). Rejeté :
  la donnée appartient à l'établissement, pas à l'éditeur. Une licence qui
  détériore des données déjà collectées dépasse largement ce qu'un désaccord
  commercial autorise.
- **Nag-screen sans rien fermer.** Rejeté dans l'autre sens : une limitation
  qui ne limite rien n'est pas une limitation, et la négociation n'aurait plus
  d'objet.

---

## Pourquoi le PPMS est intouchable

**Dans une évacuation, c'est le NOM qui permet de retrouver un enfant.** Un
comptage anonyme ne sert à chercher personne : il dit qu'il manque quelqu'un,
pas qui, donc il ne dit rien d'actionnable à l'équipe qui fait le tour du
bâtiment.

Aucun désaccord commercial ne justifie de retirer cela. C'est pourquoi
`/api/ppms/**` figure **explicitement** dans la liste OUVERT de
`LicencePortee`, avec sa raison écrite, au lieu de bénéficier du défaut : un
défaut se change par distraction, une ligne nommée se change par décision.

Et c'est pourquoi `LicenceExpireeIT` vérifie non seulement que la route répond
`200` sous licence expirée, mais que **la réponse contient encore des noms**.
Une route qui répondrait 200 avec un comptage anonyme aurait tout perdu en
passant le test.

Le même raisonnement protège le webhook : les terminaux réessaient un temps
puis abandonnent. Une passage refusée par la licence est une passage **perdue
pour toujours** — un trou dans le registre d'un mineur, créé par une question
d'argent.

---

## Pourquoi la vérification est côté serveur

**Un poste dont on remplacerait le `.exe` par une version antérieure
contournerait n'importe quelle vérification embarquée dans le client** — et sur
ces postes, remplacer un exécutable est une manipulation ordinaire, pas une
attaque. Le portable Electron ne vérifie donc rien : il reçoit un **état** à
afficher et ne peut pas le contredire, parce que c'est l'intercepteur du
serveur qui refuse les requêtes.

Il n'y a **pas de grille miroir** dans le front, et c'est une décision, pas un
oubli : une liste de routes fermées côté client divergerait de `LicencePortee`
au premier écran ajouté, et une tuile grisée à tort est indiscernable d'une
panne. Les écrans de gestion restent **navigables** ; le serveur répond `402`
avec un message français que la couche HTTP du front affiche tel quel.

**`402 Payment Required` et pas `403`.** Le front traite `403` comme « session
expirée » et déconnecte : un refus de licence en 403 dirait « Reconnectez-vous »
à quelqu'un dont la session est parfaitement valide. C'est la classe de défaut
la plus chère déjà payée dans ce projet — l'importation de repas qui accusait la
session pour une erreur de format de date, et faisait reconnecter la même
personne en boucle sans jamais lui montrer la vraie cause.

**Hors ligne, aucun appel réseau.** Pas de serveur de licence à joindre, pas de
DNS, pas de certificat à renouveler. Le serveur de l'école ne doit dépendre de
rien d'extérieur : le jour où internet tombe, la licence ne doit pas être un
deuxième problème.

---

## Signature, pas mot de passe

Paire **Ed25519**. La clé **privée** reste chez Sam et n'entre jamais dans le
dépôt ni dans le JAR ; seule la clé **publique** est compilée dans le backend,
et une clé publique ne permet que de *vérifier*. Toute altération d'un champ du
fichier invalide la signature — c'est le seul point du mécanisme qui repose sur
des mathématiques et non sur de la discipline.

**Ed25519 et pas RSA-2048** : le JDK 17 le fournit nativement (JEP 339, depuis
Java 15), donc **zéro dépendance ajoutée au `pom.xml`** — zéro bibliothèque de
plus à auditer et à mettre à jour sur une VM que personne n'administrera après
le départ de Sam. Et l'outil d'émission tourne sur le même fournisseur
cryptographique : encodages identiques des deux côtés, ce qui supprime la classe
de bug qu'on ne découvrirait que le jour du renouvellement à distance.

**Aucune propriété ne peut remplacer la clé publique.** Il n'existe
volontairement ni `magbo.licence.public-key`, ni variable d'environnement, ni
fichier de ressource : ce serait une porte dérobée d'une seule ligne dans un
`.env`. Même chose pour `magbo.licence.gate.enabled`, qui n'agit que **sous le
harnais de test** — elle n'existe que pour que les ~1000 tests existants
tournent sans déposer de licence.

⚠️ La première version la conditionnait au profil `prod`, et c'était faux : le
profil est lui-même une variable d'environnement (`SPRING_PROFILES_ACTIVE` est
une ligne de `docker-compose.yml`). La condition porte désormais sur la présence
de `spring-boot-starter-test`, en portée `test` dans le pom, donc jamais
empaqueté dans le fat jar — la faire apparaître demanderait de modifier le
`pom.xml` et de reconstruire, c'est-à-dire exactement le contournement déjà
assumé. `LicenceOutilContratTest` vérifie que ces portes n'apparaissent pas, et
qu'aucun `acceptsProfiles` ne revient gouverner la grille.

**Absence, illisibilité et falsification ont exactement le même effet** :
`EXPIREE`, sans période de grâce. La courtoisie s'applique à une licence *vraie*
qui vient d'échoir, pas à l'absence de licence — si « pas de fichier » ouvrait
30 jours, supprimer le fichier tous les 29 jours serait la licence perpétuelle.
Et si falsifier était plus permissif que ne rien mettre, ce serait la porte à
emprunter. Seul le **message** diffère, parce que « fichier absent » envoie
vérifier un montage de volume et « signature invalide » envoie chercher qui a
édité le fichier.

---

## ⚠️ Le cinquième piège d'horloge

Une licence qui n'existe que par comparaison de dates est défaite par une
horloge qu'on recule. Sur une VM, `date -s` ou un BIOS suffisent. D'où le
**témoin d'horloge** (`licence_clock`, V027) : la date la plus récente jamais
observée est persistée, et si l'horloge revient de plus de **deux jours** en
deçà, la licence est traitée comme expirée et l'anomalie est journalisée.

**C'est le cinquième piège d'horloge de ce projet, et le premier traité avant
d'avoir mordu.** Les quatre autres ont tous été découverts en production :

1. **L'heure de RÉCEPTION au lieu de l'heure de l'ÉVÉNEMENT** (03/08/2026).
   Une file hors-ligne de 33 passages vidée d'un coup à 14:51 a inscrit tous
   ces passages à 14:51 — durées de visite **négatives**. Corrigé par
   `EventTimeResolver` : on grave l'heure du `dateTime` de l'appareil.
2. **Le conteneur en UTC** (25/08/2026). `eclipse-temurin:17-jre-alpine` monte
   en UTC ; tout `LocalDateTime.now()` partait trois heures dans le futur, à
   côté de colonnes écrites en heure locale. Mesuré : 17:27 local enregistré
   20:27. Corrigé par `TZ` dans `docker-compose.yml`.
3. **Le régime de sortie jugé à `now`.** Une sortie de 10h évaluée à 18h
   devenait « fin de journée — sortie normale », et l'alerte que la Vie
   Scolaire devait voir n'avait jamais existé. Corrigé : le régime est évalué
   contre l'heure de la **passage**, verrouillé par
   `RegimeGateWiringTest#regimeUsaAHoraDaPassagem`.
4. **`cantine_removals.removido_em`** écrit avec un `now()` décalé : « retirer
   cette ligne » devenait « taire cette personne pendant trois heures », entrées
   futures comprises.

**Pourquoi deux jours de tolérance.** Un recul *légitime* se compte en secondes
(NTP) ou au pire en heures (fuseau mal réglé — 26 h dans le cas extrême, et le
`TZ` du compose ferme déjà cette porte). Un recul *utile à un fraudeur* se
compte en semaines : reculer d'un jour ne prolonge rien. Deux jours avalent tout
ce qui est honnête et n'offrent rien qui vaille la peine.

**Ce que cette règle fait le jour où la pile RTC meurt** : l'horloge repart en
1970, le recul est énorme, les écrans de gestion se ferment. C'est le
comportement voulu et il est **borné** — le webhook continue d'enregistrer, le
PPMS reste nominatif, les postes travaillent. C'est exactement à cela que sert
la dégradation par couches : un incident d'infrastructure ne peut pas mettre
l'école en danger, il ne peut que fermer des écrans d'administration.

**Le piège que cette table crée, et il est réel.** La borne ne recule jamais.
Si quelqu'un *avance* l'horloge de la VM puis la remet à l'heure, le recul est
détecté en permanence et la gestion ne se rouvre pas seule. La sortie est un
`UPDATE` en base, documenté dans `procedimento-licence.md` et volontairement
manuel : elle demande le même accès que remplacer le JAR. En faire un bouton
dans l'écran d'administration aurait fait de l'anti-recul une décoration.

---

## Le système ne se verrouille pas hors de sa propre réparation

`/api/admin/licence/recharger` (ADMIN) reste ouvert sous licence expirée : sans
cela, renouveler depuis la France exigerait un redémarrage de conteneur par
quelqu'un sur place. Ce n'est pas un contournement — la relecture repasse par la
signature, et un fichier falsifié reste falsifié.

### ⚠️ En revanche, un opérateur qui oublie son mot de passe ne peut plus être débloqué

**Une version antérieure de cet ADR affirmait le contraire**, et c'était faux.
`/api/admin/password-reset-requests/**` est bien ouvert — mais `tratar` ne fait
que marquer la demande comme traitée : la redéfinition du mot de passe passe par
`PUT /api/system-users/{id}`, qui est **fermé**, « gestion des opérateurs »
figurant nommément dans la liste de ce qui se suspend. Le panel de revue (Vie
Scolaire) a montré que la justification la plus longue du fichier promettait
quelque chose qui n'arrivait pas.

**C'est désormais une limite écrite, pas une promesse creuse.** La parade est
opérationnelle : le compte ADMIN se connecte toujours (`/api/auth/**` est ouvert
dans les quatre états), et la direction doit en détenir le mot de passe avant la
date. La correction propre — ouvrir une route étroite
`POST /api/system-users/{id}/password` — est une décision du propriétaire, pas
un effet de bord à décider dans un inventaire de routes.

Deux autres limites du même ordre sont consignées au § 8-bis de
`procedimento-licence.md` : la consultation des autorisations de sortie avant un
passage, et la réparation des `door_mappings` après un changement d'IP DHCP.
Cette dernière est la seule qui touche indirectement au PPMS (une passage
retombée sur le point par défaut fausse la zone affichée), et sa parade — la
réservation DHCP demandée au SI — était de toute façon la bonne pratique.

---

## ⚠️ Ce que ce mécanisme NE protège PAS

**Quelqu'un qui recompile le backend depuis les sources peut le retirer.** Le
dépôt est public ; supprimer l'intercepteur est l'affaire de quelques lignes.

**C'est une licence, pas une forteresse, et c'est assumé.** Le mécanisme rend la
limitation *explicite, honnête et difficile à contourner par accident* — pas
impossible à contourner par quelqu'un de déterminé qui a accès aux sources et à
un JDK. Les protections raisonnables ont été mises (la clé publique est
compilée, aucune propriété ne la remplace, l'anti-recul est persisté), et le
contournement assumé — recompiler — reste le moins cher, ce qui est le bon
ordre : rien de plus simple ne doit exister.

Plus précisément, **ce n'est pas non plus une frontière de sécurité**.
`/api/access/logs/refectory` (le rapport) est fermé et
`/api/access/logs/REFEI1` (l'écran du poste) est ouvert, alors qu'ils rendent
des données voisines. Les vraies frontières restent `@PreAuthorize` et
`AreaSecurity`, qui ne bougent pas d'un iota avec la licence.

**`emis_le` est signé mais n'est pas appliqué** : une licence datée du futur est
honorée aujourd'hui. Sans conséquence tant que Sam est seul émetteur ; à durcir
si des licences sont un jour préparées d'avance.

**Rien ne lie une licence à une installation.** Le nom d'établissement est signé
mais n'est comparé à rien : au deuxième client, le fichier de l'un ouvrirait
l'installation de l'autre. Avec un seul établissement, le risque est nul — mais
c'est la première chose à ajouter le jour où il y en a deux.

Enfin, **le mécanisme ne protège pas contre la perte de la clé privée**. Si
Sam la perd, plus aucune licence n'est émissible et il faut recompiler le
backend avec une nouvelle clé publique. La sauvegarde de ce fichier est la
seule chose qui n'a pas de solution technique ici.

---

## Ce que le panel de revue a corrigé (31/08/2026)

Trois relecteurs — sécurité, Vie Scolaire, qualité — ont relu le mécanisme avant
tout merge. Les défauts trouvés valent d'être écrits : ils disent où ce genre de
dispositif casse.

**Deux contournements moins chers que « recompiler ».** L'ADR affirme que
recompiler le backend est le seul contournement assumé ; il faut donc qu'aucun
autre ne soit plus cher :

- **Une lettre encodée dans l'URL.** Spring MVC route sur le chemin *décodé* ; la
  grille comparait le chemin *brut*. `curl .../api/admin/s%65ttings/catalogue`
  atteignait le contrôleur et recevait 200. Le tour marchait sur **toutes** les
  règles fermées. Corrigé : `UrlPathHelper.getPathWithinApplication`, verrouillé
  par `LicenceGateCheminTest`.
- **Le profil `prod` est lui-même une variable d'environnement.** La propriété
  `magbo.licence.gate.enabled` était ignorée « en profil prod » — mais
  `SPRING_PROFILES_ACTIVE` est une ligne de `docker-compose.yml` comme une autre.
  Deux lignes éditées sur la VM et la grille mourait, sans JDK, en trente
  secondes. La condition porte désormais sur la **présence du harnais de test**,
  que le fat jar ne contient jamais — et un test vérifie que
  `spring-boot-starter-test` reste en portée `test`.

**Un défaut qui pouvait faire perdre une passage d'enfant.** La grille demandait
le verdict de licence *avant* de regarder si la route était seulement fermable.
Le webhook, le PPMS et `/api/health` traversaient donc `LicenceService.etat()`,
qui ouvre une transaction (l'anti-recul) et est `synchronized`. Base injoignable
à minuit → webhook en 500, et toutes les requêtes empilées derrière le moniteur.
Corrigé : **la portée d'abord, le verdict ensuite** — une route ouverte ne
touche plus jamais au verdict.

**Un écran de poste éteint en silence.** `/api/access/logs/refectory` était
classé « rapport cantine ». C'est en réalité ce que le **Moniteur Cantine** relit
toutes les 3 secondes pendant le service : la salle serait apparue **vide à
11h50**, sans erreur, la couche HTTP rendant `[]` sur un refus. Le commentaire de
la règle affirmait même le contraire. Le garde d'inventaire avait fait son
travail — il prouve que chaque endpoint est *classé*, pas qu'il est *bien*
classé. **Avant de fermer une route, ouvrir le composant qui la consomme.**

**Le bandeau ne prévenait pas ceux qui allaient se cogner.** Les tuiles
« Rapport Cantine » et « Rapport Infirmerie » ne sont pas cachées : tout
opérateur de l'aire concernée les a sur son tableau de bord. Ces écrans
affichaient « aucune visite » sous licence expirée — c'est-à-dire « votre
registre est vide » — à des gens à qui le bandeau était masqué. En état EXPIRÉE,
**tout compte connecté** le voit désormais, et un refus 402 remonte son message
français au lieu d'un zéro.

**L'anti-recul se désarmait depuis la base.** `DELETE FROM licence_clock` puis
reculer l'horloge faisait renaître la borne sur la date falsifiée ; et une
horloge simplement *figée* ne déclenchait aucun recul. Un **second témoin** a été
ajouté : la date de la passage la plus récente (`MAX(access_logs.timestamp)`).
Elle avance toute seule des centaines de fois par jour et ne s'efface pas sans
toucher au registre — ce que la licence refuse de faire par principe.

**Enfin, deux choses que les tests eux-mêmes ont trouvées.** `getServletPath()`
est vide sous MockMvc, ce qui rendait tout `LicenceExpireeIT` *vacuous* : vert,
et ne prouvant rien. Et `Path.of` lève sur un caractère interdit — dans un
constructeur de bean, une faute de frappe dans `MAGBO_LICENCE_PATH` empêchait le
backend entier de démarrer. Les deux sont corrigés et verrouillés.

---

## Conséquences

- ⚠️ **Une licence ne se reproduit dans AUCUN document, et aucun exemple de
  format ne porte de date plausible.** Corollaire de « une licence ne vit pas
  dans git », appris à ses dépens le 01/09/2026 : la procédure d'exploitation
  reproduisait une licence entière, « à recopier si le fichier est perdu ». Une
  licence plus longue a été émise deux jours après, le document a continué
  d'afficher l'ancienne, et quiconque l'aurait suivie aurait déployé une licence
  **expirée en croyant réparer** — fermant les écrans de gestion par le geste
  censé les rouvrir. Un document dit **comment** obtenir une licence
  (réémission) et **où lire** celle en service (`/api/health`) ; il n'en contient
  jamais une. Les illustrations de format utilisent `AAAA-MM-JJ`, jamais une date
  qu'on pourrait prendre pour la vraie.
- **Nouvelle table** `licence_clock` (V027) — une ligne, `id = 1`. À appliquer
  **à la main avant** de monter le backend : `ddl-auto` saurait la créer, et
  c'est le problème (elle naîtrait sans le `CHECK (id = 1)`).
- **Nouveau volume** dans `deploy/docker-compose.yml` : `./licence:/licence:ro`,
  en **lecture seule**. Surtout pas sous `/app`, qui est la sortie de Maven que
  `mvn clean` efface — même raison qui a envoyé les photos dans PostgreSQL
  (V011).
- **`/api/health` porte l'état de la licence** : un déploiement se vérifie par
  un `curl`, sans ouvrir l'application ni se connecter.
- **Un contexte Spring de test supplémentaire** (`LicenceExpireeIT` monte avec
  la grille active). Coût assumé : c'est la seule suite qui exerce le mécanisme
  entier.
- **Un nouveau test d'inventaire** (`LicencePorteeGuardTest`) : tout endpoint
  nouveau rend la suite rouge tant que personne n'a écrit, dans une table à la
  main, s'il se ferme ou non. Le défaut reste OUVERT — dans le doute ça continue
  de fonctionner — et le test transforme ce défaut en décision.
- **L'outil d'émission** (`tools/licence/MagboLicence.java`) tourne sans Maven,
  sur un simple JDK. `LicenceOutilContratTest` compare sa forme canonique à
  celle du vérificateur : une divergence d'un caractère ne se découvrirait
  sinon que le jour du renouvellement, depuis la France, sans pouvoir corriger.

---

## Références

- Mécanisme : `backend/src/main/java/com/magbo/access/services/licence/`
- Inventaire des routes : `LicencePortee.java`
- Preuve dans les deux sens : `LicenceExpireeIT`
- Migration : `deploy/migrations/V027__licence_clock.sql`
- Procédure pour Sam : `docs/operacional/procedimento-licence.md`
- Note d'une page à imprimer pour les postes : `docs/operacional/licence-note-aux-postes.md`
- ADR-003 (le MAGBO est observationnel) et ADR-004 (blocage opérationnel
  assisté) — la licence ne change rien à ces deux décisions.
