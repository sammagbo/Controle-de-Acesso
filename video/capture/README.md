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
