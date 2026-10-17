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
| `midi` | entre 11:55 e 12:20 | `login-*`, `dashboard`, `portail`, `cdi`, `cantine-*`, `droits-*` |
| `soir` | entre 16:15 e 16:40 | `sorties-*`, `portail-sortie`, `recherche-*`, `rapport-*` |
| `cloture` | entre 17:05 e 17:40 de São Paulo: 22:05 até 25/10, 21:05 a partir de 26/10 | `fin-0`, `fin-1`, `logout` |

O fechamento automático do servidor segue sempre `America/Sao_Paulo` (`PresenceAutoCloseService`): o CDI fecha
«às 17:00» às 17:00 de São Paulo. Por isso a sessão `cloture` confere o relógio de São Paulo e para sem capturar se
a janela «Encore à l'intérieur» não disser «Déjà clos aujourd'hui» com Inès Démo, Léo Fictif e Zoé Fictif.

```bash
head -c 18 /dev/urandom | base64 | tr -d '/+=' > /tmp/magbo-demo-token   # o token fica num arquivo: cada comando roda num shell novo
MAGBO_DEMO_WEBHOOK_TOKEN=$(cat /tmp/magbo-demo-token) docker compose -p magbo-demo -f docker-compose.yml -f video/capture/docker-compose.demo.yml up -d --build
until curl -s http://localhost:8080/api/health | grep -q '"UP"'; do sleep 3; done

cd video/capture && npm ci
MAGBO_DEMO_WEBHOOK_TOKEN=$(cat /tmp/magbo-demo-token) node seed-day.mjs                       # 30 alunos, direitos, «Service midi», o nome do admin

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
  com o relógio real. Na `soir`, a Emma sai da cantina às 12:40, para o parcours dela mostrar a refeição inteira.
- No ensaio fora do horário da escola, o fechamento automático roda a cada 5 min e fecha toda presença aberta: o
  `--ensaio` alinha o CDI e a cantina ao começo de um ciclo e abre um créneau extra na hora atual. O cartão
  «Sorties non enregistrées» só conta entradas de antes das 20:00, e a `cloture --ensaio` só mostra «Déjà clos»
  depois de um ciclo de fechamento passado as 17:00 de São Paulo.
- `manifest.json` guarda, por captura, as caixas do zoom em pixels CSS; nas capturas de página inteira
  (`dashboard`, `rapport-*`), também o tamanho da página.
