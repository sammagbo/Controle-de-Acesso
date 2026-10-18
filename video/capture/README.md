# Vídeo do portfólio: as telas reais, com dados fictícios

A composição `Portfolio` (`video/src/Portfolio.tsx`) é o vídeo do cartão do MAGBO Access Control em sammagbo.com.
Ela mostra as telas reais do sistema, rodando numa instância demo local com os alunos fictícios de
`backend/src/test/resources/demo/`. Nenhum dado real, nenhuma produção.

## O que é preciso

- Docker com o Compose.
- Node 22 ou mais, e o Chrome ou o Chromium (`CHROME=/caminho` se não estiver em `/usr/bin/google-chrome`).
- Uma licença de demonstração em `~/magbo-demo-licence/licence.magbo`, fora do repositório. Sem ela a licença
  fica EXPIREE: as telas de gestão fecham e o aviso aparece. Os scripts param se `/api/licence` não disser VALIDE.

## Os comandos

Na raiz do repositório:

```bash
export MAGBO_DEMO_WEBHOOK_TOKEN=$(head -c 18 /dev/urandom | base64 | tr -d '/+=')   # um valor local qualquer
docker compose -p magbo-demo -f docker-compose.yml -f video/capture/docker-compose.demo.yml up -d --build
until curl -s http://localhost:8080/api/health | grep -q '"UP"'; do sleep 3; done

cd video/capture && npm ci
node seed.mjs      # importa os alunos, os direitos à refeição, o créneau e o terminal simulado
node capture.mjs   # faz as passagens e grava as capturas em video/public/portfolio/

cd .. && npm ci && npm run render:portfolio   # out/magbo-access-control.mp4, .webm e -poster.webp

cd .. && docker compose -p magbo-demo -f docker-compose.yml -f video/capture/docker-compose.demo.yml down -v
```

- `seed.mjs` e `capture.mjs` rodam numa instância nova, uma vez cada: a captura faz as passagens ela mesma.
  Para recomeçar, `down -v` e `up -d` de novo.
- O PIN de administração é o do `docker-compose.yml` da raiz; a janela em que ele é digitado nunca é capturada.
- Antes de cada captura, `capture.mjs` para se a tela mostra um aviso de licença, um endereço IP, um nome de
  máquina ou uma pessoa que não está no arquivo de demo.
- As capturas e os vídeos não entram no git (`video/public/portfolio/`, `video/out/`).

## Le jour entier

O vídeo do dia inteiro, do login ao fechamento do dia, em três sessões num dia útil, na mesma instância: ela fica
ligada o dia todo, e o computador não pode suspender entre as sessões. A instância roda no fuso `Europe/Paris`
(`TZ` em `docker-compose.demo.yml` e `SCHOOL_ZONE` em `demo.mjs`), e as passagens são enviadas na hora local da
demo, sem offset.

| Sessão | Quando (hora de Paris) | Capturas |
|---|---|---|
| `midi` | entre 11:55 e 12:20 | `login-*`, `dashboard`, `portail`, `cdi`, `cantine-*`, `droits-*`, `ppms-*` |
| `soir` | entre 16:15 e 16:40 | `panneau`, `sorties-*`, `portail-sortie`, `recherche-*`, `rapport-*` |
| `cloture` | entre 17:05 e 17:40 de São Paulo: 22:05 até 25/10, 21:05 a partir de 26/10 | `fin-0`, `fin-1`, `cdi-stats`, `logout` |

O fechamento automático do servidor segue sempre `America/Sao_Paulo` (`PresenceAutoCloseService`): o CDI fecha
«às 17:00» às 17:00 de São Paulo. Por isso a sessão `cloture` confere o relógio de São Paulo e para sem capturar se
a janela «Encore à l'intérieur» não disser «Déjà clos aujourd'hui» com Inès Démo, Léo Fictif e Zoé Fictif.

As telas de visão geral (`overviews.mjs`: `ppms-*`, `panneau`, `rapport-2` e `cdi-stats`) são opcionais: se uma
falhar, o log diz `SKIPPED` e a sessão segue sem ela. As da semana, `rapport-2` e `cdi-stats`, contam também as duas
semanas de aula antes do dia, que o `seed-history.mjs` cria: o portão de manhã, o CDI, a cantina e a enfermaria,
sempre com entrada e saída, num sorteio de semente fixa.

O `run-day.sh` faz o dia inteiro de uma vez, num relógio simulado, em uns 35 minutos: antes de cada sessão ele põe
o relógio da demo na hora dela, e as conferências de horário passam. O relógio é um offset em segundos em
`/tmp/magbo-demo-clock/faketime.rc`: o libfaketime o soma ao relógio do backend (`Dockerfile.demo-backend`), o
`demo.mjs` o soma ao dos scripts, e o `capture-day.mjs` põe o navegador na mesma hora. O dia é a próxima
segunda-feira depois de hoje: o histórico termina na sexta antes dela, fora das últimas 24 horas que as telas do
Portail, do CDI e da cantina leem. O relógio só anda para a frente, porque a licença fecha a gestão quando a data
volta dois dias ou mais. O script para no primeiro erro e grava a saída em `~/magbo-dia-AAAA-MM-DD.log`; com
`--detach`, ele roda numa sessão própria, e fechar o terminal, ou o fim da sessão que o lançou, não o interrompe:

```bash
~/Controle-de-Acesso/video/capture/run-day.sh --plan     # só o dia, os horários e a conferência do repositório
~/Controle-de-Acesso/video/capture/run-day.sh --detach   # o dia inteiro, fora do terminal: ele mostra o log a seguir
~/Controle-de-Acesso/video/capture/run-day.sh            # o dia inteiro, neste terminal
```

No fim, a pasta de downloads recebe a folha de contato, `magbo-dia.png`, e `magbo-dia-capturas.tar.gz`, as
capturas em WebP com o `manifest.json` (`review-copy.mjs`), para mandar ao revisor; os PNG ficam em
`video/public/portfolio-day/` para o render. Um dia com `--detach` para com `pkill -f '[r]un-day.sh'`.

As mesmas etapas, à mão, no relógio real:

```bash
mkdir -p /tmp/magbo-demo-clock   # antes do up: sem a pasta, o Docker a cria como root
head -c 18 /dev/urandom | base64 | tr -d '/+=' > /tmp/magbo-demo-token   # o token fica num arquivo: cada comando roda num shell novo
MAGBO_DEMO_WEBHOOK_TOKEN=$(cat /tmp/magbo-demo-token) docker compose -p magbo-demo -f docker-compose.yml -f video/capture/docker-compose.demo.yml up -d --build
until curl -s http://localhost:8080/api/health | grep -q '"UP"'; do sleep 3; done

cd video/capture && npm ci
MAGBO_DEMO_WEBHOOK_TOKEN=$(cat /tmp/magbo-demo-token) node seed-day.mjs       # 30 alunos, direitos, «Service midi» de segunda a sexta, o nome do admin
MAGBO_DEMO_WEBHOOK_TOKEN=$(cat /tmp/magbo-demo-token) node seed-history.mjs   # as duas semanas antes; numa segunda, para ficarem fora das últimas 24 h

# o ensaio: qualquer dia, a `midi` depois das 11:00; grava em video/public/portfolio-day-ensaio/
MAGBO_DEMO_WEBHOOK_TOKEN=$(cat /tmp/magbo-demo-token) node capture-day.mjs --session midi --ensaio
MAGBO_DEMO_WEBHOOK_TOKEN=$(cat /tmp/magbo-demo-token) node capture-day.mjs --session soir --ensaio
MAGBO_DEMO_WEBHOOK_TOKEN=$(cat /tmp/magbo-demo-token) node capture-day.mjs --session cloture --ensaio

# as capturas de verdade, num dia útil, numa instância nova: grava em video/public/portfolio-day/
MAGBO_DEMO_WEBHOOK_TOKEN=$(cat /tmp/magbo-demo-token) node capture-day.mjs --session midi      # 11:55 a 12:20
MAGBO_DEMO_WEBHOOK_TOKEN=$(cat /tmp/magbo-demo-token) node capture-day.mjs --session soir      # 16:15 a 16:40
MAGBO_DEMO_WEBHOOK_TOKEN=$(cat /tmp/magbo-demo-token) node capture-day.mjs --session cloture   # 17:05 a 17:40 de São Paulo

node contact-sheet.mjs ../public/portfolio-day            # contact-sheet.png: todas as capturas numa folha
```

- O ensaio e as capturas de verdade precisam de instâncias diferentes (`down -v` entre os dois): as duas fazem
  as mesmas passagens.
- A sessão `midi` fotografa a manhã com o relógio do navegador na hora de cada cena (07:27 a 10:06) e a cantina
  com o relógio da demo, andando. Na `soir`, a Emma sai da cantina às 12:40, para o parcours dela mostrar a
  refeição inteira.
- No ensaio fora do horário da escola, o fechamento automático roda a cada 5 min e fecha toda presença aberta: o
  `--ensaio` alinha o CDI e a cantina ao começo de um ciclo e abre um créneau extra na hora atual. O cartão
  «Sorties non enregistrées» só conta entradas de antes das 20:00, e a `cloture --ensaio` só mostra «Déjà clos»
  depois de um ciclo de fechamento passado as 17:00 de São Paulo.
- `manifest.json` guarda, por captura, as caixas do zoom em pixels CSS; nas capturas de página inteira
  (`dashboard`, `ppms-*`, `rapport-*`), também o tamanho da página.
