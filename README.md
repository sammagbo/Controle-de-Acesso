<div align="center">

# 🏫 MAGBO Access Control

**Système de contrôle d'accès multi-secteur pour le Lycée Molière**

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/sammagbo/Controle-de-Acesso)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](./LICENSE)
[![Java](https://img.shields.io/badge/Java-17%2B-orange.svg)](#prérequis)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.2-green.svg)](#stack-technique)
[![MAGBO STUDIO](https://img.shields.io/badge/MAGBO%20STUDIO-sammagbo.com-00234b.svg)](https://www.sammagbo.com)

*Une réalisation [MAGBO STUDIO](https://www.sammagbo.com)*

</div>

---

> 🌐 Ce document est rédigé en **français** (langue principale) et en **portugais** (traduction). Voir [versão em português](#-magbo-access-control--português) plus bas.

---

## 📋 Sommaire

- [Présentation](#-présentation)
- [Fonctionnalités](#-fonctionnalités)
- [Stack technique](#️-stack-technique)
- [Architecture](#️-architecture)
- [Prérequis](#-prérequis)
- [Installation et démarrage](#-installation-et-démarrage)
- [Règles métier](#-règles-métier)
- [Endpoints API](#-endpoints-api)
- [Synchronisation Pronote](#-synchronisation-pronote)
- [Document de planification](#-document-de-planification)
- [Statut de développement](#-statut-de-développement)
- [Crédits](#-crédits)
- [Licence](#-licence)

---

## 🎯 Présentation

**MAGBO Access Control** est un système institutionnel destiné à gérer le contrôle d'accès des élèves, des enseignants et du personnel au sein du **Lycée Molière** (Rio de Janeiro). Il a été conçu pour la **Vie Scolaire** afin de tracer en temps réel les entrées et sorties à chaque point d'accès de l'établissement.

Le système couvre cinq types de points d'accès :

| Type de point | Exemples | Logique métier |
|---|---|---|
| **Portails (`GATE`)** | Portail Principal, Portail 2, Portail 3 | Vérification du lien élève / responsable légal lors de la sortie |
| **Bibliothèque (`SPECIAL`)** | CDI Axelle Beurel | Suivi du temps de présence (limite de 2h) |
| **Infirmerie (`SPECIAL`)** | Infirmerie | Suivi du temps de présence (limite de 30 min) |
| **Réfectoires (`REFECTORY`)** | Réfectoire 1, Réfectoire 2 | Comptage des repas avec alerte de doublon |

L'interface est fournie sous forme d'application **desktop Electron**, le backend en **Java / Spring Boot** expose une API REST, et la base de données utilise **H2 en mémoire** (développement) ou **PostgreSQL** (production).

---

## ✨ Fonctionnalités

### Côté agent à la portière (Vie Scolaire)
- Lecture rapide d'un identifiant (carte ou saisie manuelle) avec recherche progressive
- Modale de validation **double** (élève + responsable) aux portails
- Modale simple avec photo et statut pour les autres secteurs
- Bandeau d'alerte rouge en cas de blocage (temps minimum non atteint, repas dupliqué, etc.)
- Liste « Activité en temps réel » par point d'accès
- Compteurs de temps actifs pour la bibliothèque et l'infirmerie

### Côté administration
- Tableau de bord avec **KPIs en temps réel** (entrées du jour, utilisateurs actifs, total enregistrés)
- Tableau global des derniers logs avec filtres
- Export CSV pour reporting
- Bouton de **synchronisation Pronote** avec rapport détaillé (créés / mis à jour / désactivés / erreurs)

### Robustesse
- Profil de développement avec base **H2 en mémoire** + jeu de données seed (`data.sql`)
- **Soft delete** des utilisateurs : champ `ativo` (boolean) au lieu de suppression physique — préserve l'historique des logs
- CORS configuré pour permettre la communication Electron ↔ Spring Boot
- Gestion des dates « safe parse » côté frontend pour éviter les crashs
- Toast d'alerte « Serveur Hors Ligne » en cas de coupure du backend

---

## 🛠️ Stack technique

| Couche | Technologie |
|---|---|
| **Frontend** | React 18 (via Babel Standalone), Tailwind CSS (CDN), Lucide Icons |
| **Conteneur desktop** | Electron 33 |
| **Backend** | Java 17+, Spring Boot 3.2, Spring Data JPA, Lombok |
| **Base de données** | PostgreSQL (production) / H2 in-memory (développement) |
| **Build backend** | Maven 3.6+ |
| **Intégration matérielle prévue** | Lecteurs de reconnaissance faciale Hikvision via le protocole ISAPI |
| **Intégration logicielle** | Pronote (synchronisation des élèves, enseignants et personnel via CSV) |

> ⚠️ **Note technique** — En l'état actuel, les balises `<script src="...">` chargent React, Babel et Tailwind via CDN. Pour un déploiement de production, ces ressources devront être pré-compilées localement.

---

## 🏗️ Architecture

```
magbo-access-control/
├── backend/                        # API Java / Spring Boot
│   ├── pom.xml
│   ├── ftp_drop/                   # Dossier de drop des CSV Pronote
│   └── src/main/
│       ├── java/com/magbo/access/
│       │   ├── MagboAccessApplication.java
│       │   ├── config/             # CORS, etc.
│       │   ├── controllers/        # REST endpoints (Access, User, Stats, Pronote, Health)
│       │   ├── dto/                # GlobalStats, SyncReport, AccessRequest
│       │   ├── models/             # User (avec champ ativo), Responsavel, AccessLog
│       │   ├── repositories/       # Spring Data JPA
│       │   └── services/           # PronoteSyncService (cron + trigger manuel)
│       └── resources/
│           ├── application.properties        # Profil par défaut (PostgreSQL)
│           ├── application-dev.properties    # Profil développement (H2)
│           └── data.sql                      # Jeu de données seed
│
├── js/                             # Frontend React
│   ├── App.js                      # Composant racine
│   ├── api.js                      # Client HTTP brut (window.api)
│   ├── components/                 # Header, Dashboard, SectorView, AccessModals…
│   ├── cdi/                        # Module bibliothèque (CDI Axelle Beurel)
│   ├── data/                       # Données mock (fallback)
│   └── utils/
│       ├── api.js                  # Client API normalisé (camelCase ↔ snake_case)
│       └── helpers.js
│
├── css/styles.css                  # Variables CSS personnalisées
├── libs/xlsx.min.js                # Lecture de fichiers Excel (CDI)
├── index.html                      # Point d'entrée Electron
├── main.js                         # Bootstrap Electron
├── package.json
├── LICENSE                         # Licence MAGBO STUDIO
└── README.md
```

---

## 📦 Prérequis

| Outil | Version minimum | Vérification |
|---|---|---|
| **Java JDK** | 17 | `java -version` |
| **Maven** | 3.6 | `mvn -version` |
| **Node.js** | 18 | `node -v` |
| **npm** | 9 | `npm -v` |
| **Git** | 2.30+ | `git --version` |

---

## 🚀 Installation et démarrage

### 1. Cloner le projet

```bash
git clone https://github.com/sammagbo/Controle-de-Acesso.git
cd Controle-de-Acesso
```

### 2. Lancer le backend (Spring Boot, profil `dev` — H2 en mémoire)

```bash
cd backend
mvn spring-boot:run
```

Le serveur démarre sur **http://localhost:8080**. Le profil `dev` est activé par défaut, la base H2 est créée en mémoire et le fichier `data.sql` peuple automatiquement les tables avec un jeu de données de test (5 responsables, 8 élèves, 2 enseignants, 1 personnel).

Vérification rapide :
```bash
curl http://localhost:8080/api/health
# → {"status":"UP"}
```

Console H2 (inspection de la base) : **http://localhost:8080/h2-console**
- JDBC URL : `jdbc:h2:mem:magbo_access`
- User : `sa` (sans mot de passe)

### 3. Lancer le frontend (Electron)

Dans un **second terminal**, à la racine du projet :

```bash
npm install        # Première fois uniquement
npm start
```

La fenêtre **MAGBO Access Control — Lycée Molière** s'ouvre alors (1200×800 px).

### 4. Test de bout en bout

1. Cliquer sur **Portail Principal**
2. Saisir `A001` ou `Lucas` dans le champ « Lire la carte »
3. Cliquer sur le résultat **Lucas Dupont**
4. La modale double doit s'afficher avec **Lucas Dupont (élève)** et **Marie Dupont (Mère)**
5. Cliquer sur **CONFIRMER SORTIE** : l'événement est enregistré dans la base et apparaît dans « Activité en temps réel »

---

## 📐 Règles métier

### Portails (`GATE`)
- À la sortie d'un élève, un **responsable légal** doit être identifié et confirmé
- La modale double affiche photo + nom de l'élève **et** photo + nom + parenté du responsable
- Pour les enseignants et le personnel, une modale simple suffit (pas de responsable requis)

### Bibliothèque et Infirmerie (`SPECIAL`)
- Un compteur démarre à l'**entrée** et s'arrête à la **sortie**
- **Bibliothèque** : durée maximale recommandée — 2h (alerte si dépassée)
- **Infirmerie** : durée maximale recommandée — 30 min
- Les compteurs actifs sont affichés en temps réel dans le panneau latéral

### Réfectoires (`REFECTORY`)
- **Tentative de double repas le même jour** : bandeau rouge « AVIS REPAS DUPLIQUÉ »
- **Temps minimum (10 min)** : si l'élève tente de sortir avant 10 min, l'accès est bloqué et un message le redirige vers la cantine

### Cycle de vie d'un utilisateur (soft delete)
- Le champ `ativo` (boolean) sur chaque utilisateur indique s'il est actuellement membre de l'établissement
- Lorsqu'un élève / enseignant / personnel disparaît du CSV Pronote lors d'une synchronisation, son enregistrement n'est **pas supprimé physiquement** : il passe à `ativo=false`
- Cela préserve l'intégralité de l'historique de ses logs d'accès et permet une réactivation si la personne réapparaît dans un CSV ultérieur
- L'historique d'audit est ainsi protégé même après le départ de la personne

---

## 🔌 Endpoints API

> Base URL : `http://localhost:8080/api`

| Méthode | Chemin | Description | Statut |
|---|---|---|---|
| `GET` | `/health` | Vérification de l'état du serveur | ✅ Implémenté |
| `GET` | `/users/{id}` | Récupère un utilisateur **et** son responsable | ✅ Implémenté |
| `POST` | `/access` | Enregistre une entrée ou sortie | ✅ Implémenté |
| `GET` | `/access/logs/{pointId}` | Logs d'un point d'accès donné | ✅ Implémenté |
| `GET` | `/access/logs/all?limit=50` | Tous les logs récents (pour Admin) | ✅ Implémenté |
| `GET` | `/stats/global` | KPIs globaux (Admin Dashboard) | ✅ Implémenté |
| `POST` | `/pronote/sync` | Force la synchronisation Pronote | ✅ Implémenté |
| `POST` | `/hikvision/event` | Webhook ISAPI Hikvision | 🔜 Phase 7 |

### Exemple : récupérer un utilisateur

```bash
curl http://localhost:8080/api/users/A001
```

Réponse :
```json
{
  "user": {
    "id": "A001",
    "nome": "Lucas Dupont",
    "tipo": "ALUNO",
    "turma": "6ème A",
    "responsavelId": "R001",
    "fotoUrl": "https://api.dicebear.com/7.x/initials/svg?seed=LD",
    "ativo": true
  },
  "responsavel": {
    "id": "R001",
    "nome": "Marie Dupont",
    "parentesco": "Mère",
    "telefone": "+33 6 12 34 56 78"
  }
}
```

### Exemple : KPIs globaux

```bash
curl http://localhost:8080/api/stats/global
```

Réponse :
```json
{
  "totalToday": 42,
  "activeUsers": 7,
  "totalUsers": 11
}
```

| Champ | Signification |
|---|---|
| `totalToday` | Nombre total d'événements (entrées + sorties) depuis 00h00 |
| `activeUsers` | Nombre de personnes actuellement « à l'intérieur » d'un secteur (ENTRÉE sans SORTIE postérieure) |
| `totalUsers` | Nombre total d'utilisateurs enregistrés en base |

---

## 🔄 Synchronisation Pronote

Cette fonctionnalité importe la liste des élèves, enseignants et personnel depuis un export CSV de **Pronote** vers la base de données du système.

### Modes de déclenchement

| Mode | Quand | Comment |
|---|---|---|
| **Automatique** | Tous les jours à 03h00 | Cron interne (Spring `@Scheduled`) |
| **Manuel** | À la demande | Bouton « Synchroniser Maintenant » dans le Tableau de Bord Admin, ou `POST /api/pronote/sync` |

### Format du fichier CSV

Chemin attendu : `backend/ftp_drop/export_pronote.csv` (configurable via la propriété `pronote.sync.filepath`)

Encodage : **UTF-8**, séparateur : **point-virgule** (`;`)

Colonnes (8, dans cet ordre) :
```
userId;nome;tipo;turma;responsavelId;responsavelNome;responsavelParentesco;responsavelTelefone
```

| Colonne | Obligatoire | Notes |
|---|---|---|
| `userId` | Oui | Identifiant unique (clé primaire en base) |
| `nome` | Oui | Nom complet |
| `tipo` | Oui | `ALUNO`, `PROFESSOR` ou `FUNCIONARIO` |
| `turma` | Pour les élèves | Classe de l'élève (vide pour enseignant/personnel) |
| `responsavelId` | Pour les élèves | Identifiant du responsable légal |
| `responsavelNome` | Pour les élèves | Nom du responsable |
| `responsavelParentesco` | Pour les élèves | Lien (Mère, Père, Tuteur…) |
| `responsavelTelefone` | Pour les élèves | Téléphone du responsable |

### Exemple complet de CSV

```csv
userId;nome;tipo;turma;responsavelId;responsavelNome;responsavelParentesco;responsavelTelefone
A001;Lucas Dupont;ALUNO;6ème A;R001;Marie Dupont;Mère;+33 6 12 34 56 78
A099;Aluno Novo Teste;ALUNO;6ème C;R099;Pai Novo;Père;+33 6 99 99 99 99
P001;Prof. Catherine Blanc;PROFESSOR;Mathématiques;;;;
```

### Comportement de la synchronisation

Pour chaque ligne du CSV :
- Si `userId` **existe déjà** → mise à jour (et `ativo` repassé à `true` s'il avait été désactivé)
- Si `userId` **n'existe pas** → création
- Pour les utilisateurs **présents en base mais absents du CSV** → soft delete (`ativo=false`)
- Le responsable lié à un élève est créé/mis à jour de la même manière

### Idempotence

Après une synchronisation **sans erreur**, le fichier CSV est renommé en `export_pronote_AAAAMMJJ.csv.processed`. Un second appel à `/sync` ne reprocessera **pas** les mêmes données.

### Format de la réponse

```bash
curl -X POST http://localhost:8080/api/pronote/sync
```

```json
{
  "created": 1,
  "updated": 2,
  "deactivated": 9,
  "errors": 0,
  "errorMessages": [],
  "syncedAt": "2026-04-30T15:09:19.861664692",
  "filePath": "./ftp_drop/export_pronote.csv"
}
```

| Champ | Signification |
|---|---|
| `created` | Nouveaux utilisateurs insérés |
| `updated` | Utilisateurs existants mis à jour |
| `deactivated` | Utilisateurs absents du CSV → `ativo=false` |
| `errors` | Lignes du CSV ayant échoué |
| `errorMessages` | Détails des erreurs (jusqu'à 10 messages) |
| `syncedAt` | Horodatage de la fin de synchronisation |
| `filePath` | Chemin du fichier traité |

> 💡 **Évolution prévue** — Lorsque l'API REST de Pronote sera disponible, la couche `PronoteSyncService` sera adaptée pour consommer cette API au lieu du CSV. Le contrat HTTP du système (endpoint `/api/pronote/sync`) restera identique.

---

## 📚 Document de planification

Le fichier [`_Desenvolvimento_de_Sistemas_Institucionais_Robustos_.md`](./_Desenvolvimento_de_Sistemas_Institucionais_Robustos_.md) décrit en détail :

- les **7 phases** de construction du système (Fondation → Hikvision)
- les contraintes techniques et règles métier détaillées
- les décisions d'architecture
- les contrats des entités et endpoints

Il sert de **référence vivante** lorsque le code évolue et permet à un nouveau développeur de comprendre l'intégralité du système en une lecture.

---

## 📊 Statut de développement

| Phase | Description | Statut |
|---|---|---|
| **Phase 1** | Fondation React + navigation multi-secteur | ✅ Terminée |
| **Phase 2** | Règles métier + alertes (compteurs, doublons) | ✅ Terminée |
| **Phase 3** | Backend Java / Spring Boot + PostgreSQL | ✅ Terminée |
| **Phase 4** | Intégration Frontend ↔ Backend (API réelle) | ✅ Terminée |
| **Phase 4.1 / 4.2** | Audit + stabilisation (null safety, parsing dates) | ✅ Terminée |
| **Phase 6** | Tableau de bord administratif + synchronisation Pronote | ✅ Terminée |
| **Phase 7** | Intégration Hikvision (webhook ISAPI) | 🔜 À démarrer |

---

## 👥 Crédits

### Conception, direction technique et propriété
**MAGBO STUDIO** — Sammy Kabagambe Magbo
*Vie Scolaire, Lycée Molière (Rio de Janeiro)*

🌐 Site officiel : **[www.sammagbo.com](https://www.sammagbo.com)**

### Outils d'IA utilisés en pair-programming
Le développement a été réalisé en collaboration avec deux assistants IA. La direction technique, les décisions d'architecture, les tests et la validation finale relèvent de MAGBO STUDIO ; les IA ont contribué à la génération de code, à la résolution de problèmes ponctuels et à la documentation.

- **Antigravity** (Google) — IDE basé sur VS Code avec agents intégrés, utilisé pour la génération initiale du code et les itérations
- **Claude** (Anthropic) — Assistant utilisé pour le débogage approfondi, les revues de code, les décisions d'architecture et la rédaction technique

### Données de test
Les utilisateurs présents dans `data.sql` (Lucas Dupont, Marie Dupont, Emma Martin, etc.) sont **fictifs** et utilisés à des fins de démonstration uniquement.

---

## 📜 Licence

**Copyright © 2026 MAGBO STUDIO. Tous droits réservés.**

Ce logiciel est distribué sous une **licence propriétaire**. Le code source est rendu public à des fins de portfolio et de démonstration ; **aucune utilisation, copie, modification, redistribution ou exploitation commerciale n'est autorisée sans accord écrit préalable de MAGBO STUDIO.**

Le déploiement au **Lycée Molière** (Rio de Janeiro) est régi par un accord direct distinct entre MAGBO STUDIO et l'établissement.

Voir le fichier [`LICENSE`](./LICENSE) pour le texte intégral.

---

<br>

# 🇧🇷 MAGBO Access Control — Português

> Tradução resumida da seção francesa acima.

## 🎯 Apresentação

**MAGBO Access Control** é um sistema institucional para gestão do controle de acesso de alunos, professores e funcionários do **Lycée Molière** (Rio de Janeiro). Foi concebido para a **Vie Scolaire** com o objetivo de rastrear em tempo real as entradas e saídas em cada ponto de acesso da escola.

O sistema cobre cinco tipos de pontos:

| Tipo | Exemplos | Lógica de negócio |
|---|---|---|
| **Portarias (`GATE`)** | Portaria Principal, Portaria 2, Portaria 3 | Verificação do vínculo aluno / responsável na saída |
| **Biblioteca (`SPECIAL`)** | CDI Axelle Beurel | Controle de tempo (limite 2h) |
| **Enfermaria (`SPECIAL`)** | Enfermaria | Controle de tempo (limite 30min) |
| **Refeitórios (`REFECTORY`)** | Refeitório 1, Refeitório 2 | Contagem de refeições com alerta de duplicidade |

A interface é entregue como aplicativo **desktop Electron**, o backend em **Java / Spring Boot** expõe uma API REST, e o banco de dados utiliza **H2 em memória** (desenvolvimento) ou **PostgreSQL** (produção).

## 🛠️ Stack

| Camada | Tecnologia |
|---|---|
| **Frontend** | React 18, Tailwind CSS, Lucide Icons |
| **Container desktop** | Electron 33 |
| **Backend** | Java 17+, Spring Boot 3.2, Spring Data JPA, Lombok |
| **Banco** | PostgreSQL (produção) / H2 in-memory (desenvolvimento) |
| **Hardware** | Leitores faciais Hikvision via ISAPI (Fase 7) |
| **Integração** | Pronote (sincronização de alunos, professores e funcionários via CSV) |

## 🚀 Como rodar localmente

### 1. Backend (terminal 1)
```bash
cd backend
mvn spring-boot:run
```
Servidor sobe em `http://localhost:8080` com perfil `dev` (H2 em memória + seed automático).

### 2. Frontend (terminal 2)
```bash
npm install      # primeira vez
npm start
```
Abre a janela do Electron 1200×800.

### 3. Teste rápido
1. Click em **Portaria Principal**
2. Digita `A001` ou `Lucas` → click no resultado
3. Modal duplo deve aparecer com **Lucas Dupont** + **Marie Dupont (Mãe)**
4. Click em **CONFIRMAR SAÍDA**

## 📐 Regras de negócio

- **Portarias** — saída de aluno só com responsável identificado e confirmado na tela
- **Biblioteca / Enfermaria** — cronômetro inicia na entrada, alerta se exceder o limite (2h / 30min)
- **Refeitórios** — bloqueia segundo registro de refeição no mesmo dia + tempo mínimo de 10min antes da saída
- **Soft delete** — usuários removidos do Pronote ficam com `ativo=false`, preservando o histórico de logs

## 🔄 Sincronização Pronote

Importa a lista de alunos, professores e funcionários a partir de um CSV exportado do **Pronote**.

### Quando roda
- **Automaticamente:** todo dia às 03h00 (cron `@Scheduled` do Spring)
- **Manualmente:** botão "Sincronizar Agora" no Painel Admin, ou `POST /api/pronote/sync`

### Formato do CSV

Caminho esperado: `backend/ftp_drop/export_pronote.csv` (configurável via `pronote.sync.filepath`)

Encoding **UTF-8**, separador **ponto-e-vírgula** (`;`), 8 colunas:

```
userId;nome;tipo;turma;responsavelId;responsavelNome;responsavelParentesco;responsavelTelefone
```

| Coluna | Obrigatória | Notas |
|---|---|---|
| `userId` | Sim | Identificador único (chave primária no banco) |
| `nome` | Sim | Nome completo |
| `tipo` | Sim | `ALUNO`, `PROFESSOR` ou `FUNCIONARIO` |
| `turma` | Para alunos | Classe (vazio para professor/funcionário) |
| `responsavelId` | Para alunos | Identificador do responsável legal |
| `responsavelNome` | Para alunos | Nome do responsável |
| `responsavelParentesco` | Para alunos | Vínculo (Mãe, Pai, Tutor…) |
| `responsavelTelefone` | Para alunos | Telefone do responsável |

### Exemplo completo de CSV

```csv
userId;nome;tipo;turma;responsavelId;responsavelNome;responsavelParentesco;responsavelTelefone
A001;Lucas Dupont;ALUNO;6ème A;R001;Marie Dupont;Mãe;+33 6 12 34 56 78
A099;Aluno Novo Teste;ALUNO;6ème C;R099;Pai Novo;Pai;+33 6 99 99 99 99
P001;Prof. Catherine Blanc;PROFESSOR;Mathématiques;;;;
```

### Comportamento

Para cada linha do CSV:
- Se `userId` **já existe** → atualização (e `ativo` volta a `true` se tinha sido desativado)
- Se `userId` **não existe** → criação
- Usuários **no banco mas ausentes do CSV** → soft delete (`ativo=false`)
- O responsável vinculado a um aluno é criado/atualizado da mesma forma

### Idempotência

Após sincronização **sem erros**, o arquivo CSV é renomeado para `export_pronote_AAAAMMDD.csv.processed`. Uma segunda chamada a `/sync` **não** reprocessa os mesmos dados.

### Formato da resposta

```bash
curl -X POST http://localhost:8080/api/pronote/sync
```

```json
{
  "created": 1,
  "updated": 2,
  "deactivated": 9,
  "errors": 0,
  "errorMessages": [],
  "syncedAt": "2026-04-30T15:09:19.861664692",
  "filePath": "./ftp_drop/export_pronote.csv"
}
```

| Campo | Significado |
|---|---|
| `created` | Novos usuários inseridos |
| `updated` | Usuários existentes atualizados |
| `deactivated` | Usuários ausentes do CSV → `ativo=false` |
| `errors` | Linhas que falharam |
| `errorMessages` | Detalhes dos erros (até 10 mensagens) |
| `syncedAt` | Timestamp da sincronização |
| `filePath` | Caminho do arquivo processado |

> 💡 **Evolução prevista** — Quando a API REST do Pronote estiver disponível, a camada `PronoteSyncService` será adaptada para consumir essa API ao invés do CSV. O contrato HTTP do sistema (endpoint `/api/pronote/sync`) permanecerá idêntico.

## 📊 Status atual

- ✅ Fases 1 a 4 concluídas (frontend, backend, integração, estabilização)
- ✅ Fase 6 concluída (Painel Admin + 3 endpoints + sincronização Pronote com soft delete)
- 🔜 Fase 7 — integração com leitores Hikvision

## 👥 Créditos

- **Direção técnica e propriedade:** MAGBO STUDIO — Sammy Kabagambe Magbo (Vie Scolaire, Lycée Molière)
- 🌐 **Site oficial:** [www.sammagbo.com](https://www.sammagbo.com)
- **Pair-programming com IA:** Antigravity (Google) e Claude (Anthropic)

## 📜 Licença

**Copyright © 2026 MAGBO STUDIO. Todos os direitos reservados.**
Licença proprietária — uso, cópia, modificação, redistribuição ou exploração comercial requer acordo prévio por escrito da MAGBO STUDIO. Implantação no Lycée Molière regida por acordo separado.

Ver [`LICENSE`](./LICENSE) para o texto integral.

---

<div align="center">

*MAGBO Access Control v1.1 · Lycée Molière · 2026*

[🌐 www.sammagbo.com](https://www.sammagbo.com)

</div>
