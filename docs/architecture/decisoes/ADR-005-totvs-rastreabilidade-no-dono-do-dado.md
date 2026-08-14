# ADR-005 — TOTVS: a rastreabilidade fica com quem é dono do dado

**Data:** 14/08/2026 · **Decisão do:** Sam · **Estado:** aceita

## Contexto

A enfermaria precisa alcançar o prontuário de um aluno. O prontuário vive no **TOTVS**,
sistema externo. O MAGBO monta a **URL** e abre; a enfermeira autentica no TOTVS com a
credencial dela (ver `docs/integracao/totvs.md`).

Ao revisar essa integração, a **enfermeira do painel de revisão** apontou uma contradição
real e bem-posta:

> «Recuso-me a aceitar em silêncio que o PPMS seja `isAuthenticated()` enquanto o
> `TotvsLinkController`, na mesma leva, se recusa a logar quem abriu qual ficha porque
> "revela que aquela criança esteve na enfermaria": são dois princípios opostos sobre
> exatamente o mesmo fato.»

Ela está certa quanto à forma: dois princípios opostos não podem coexistir sem explicação.
Este ADR dá a explicação, e a parte do PPMS foi resolvida à parte — a lista deixou de ser
`isAuthenticated()` e passou a exigir `PPMS_READ`.

O que fica para decidir aqui é uma coisa só: **o MAGBO registra quem abriu qual
prontuário?**

## Decisão

**Não. O TOTVS registra quem abriu qual prontuário; o MAGBO não.**

O MAGBO **não guarda nenhum registro que ligue um aluno a uma consulta de saúde**.

A rastreabilidade **existe** — e existe no sistema que é dono do dado. Quem abre uma ficha
no TOTVS está autenticado no TOTVS, e é o TOTVS que sabe quem abriu, quando e qual. Duplicar
esse registro aqui não acrescentaria rastreabilidade nenhuma: acrescentaria uma **segunda
cópia**, num sistema com outra base legal, outro prazo de retenção e outro nível de proteção.

## O argumento

Uma linha de log dizendo «a enfermeira abriu o prontuário do aluno 0003535 às 14h20» **é ela
própria um dado de saúde por adjacência**. Ela não contém diagnóstico nenhum, e mesmo assim
revela que aquela criança esteve na enfermaria por algo que exigiu consultar o histórico —
que é exatamente a inferência que o resto deste sistema se recusa a permitir.

O MAGBO não guarda dado de saúde. Um log de acesso ao prontuário seria o **primeiro** dado
de saúde a entrar aqui, e entraria pela porta dos fundos: não como uma decisão de guardar
saúde, mas como um efeito colateral de querer auditoria. O caminho para o primeiro dado de
saúde num sistema que não os guarda costuma ser esse.

⚠️ **O que o MAGBO continua registrando, e é suficiente para a escola:** que a pessoa
**passou** pela enfermaria (`access_logs`, ponto `ENFERM`, com hora). É o mesmo fato — a
criança esteve lá — sem a inferência sobre o que aconteceu lá dentro. Uma direção que precise
reconstituir uma tarde tem a passagem; uma auditoria de acesso a prontuário tem o TOTVS.

## Alternativas consideradas

- **(A) O MAGBO registra cada abertura de ficha.** Rejeitada. Cria dado de saúde por
  adjacência num sistema que declara não guardar nenhum, e a auditoria que ela entrega já
  existe no TOTVS. Ganha-se conveniência (um lugar só para olhar) e paga-se com uma base de
  dados nova que precisaria de base legal, prazo e proteção próprios.
- **(B) O MAGBO registra a abertura sem o aluno** (só «alguém abriu uma ficha às 14h20»).
  Rejeitada por inútil: sem o aluno não serve para auditar nada, e com o `access_logs` de
  `ENFERM` na mesma hora a associação é trivial de refazer — o anonimato seria aparente.
- **(C) Nenhum registro em lugar nenhum.** Rejeitada, e nunca esteve em jogo: é o TOTVS que
  cobre isso, e se ele **não** cobrir, isso é uma pergunta para a DSI, não uma licença para o
  MAGBO cobrir no lugar dele. Ver a pergunta 5, acrescentada a `docs/integracao/totvs.md`.

## O que o MAGBO teria de se tornar para a escolha oposta ser a certa

Esta parte importa mais que a decisão, porque é o gatilho para revisá-la.

Registrar acesso a prontuário só seria correto se o MAGBO já fosse — declaradamente, e não
por acidente — **um sistema que trata dado de saúde**. Concretamente, seria preciso que:

1. **Houvesse base legal e finalidade declaradas** para tratamento de dado de saúde de menor
   (LGPD art. 11 / RGPD art. 9), com o consentimento ou a hipótese legal correspondente
   documentada — hoje o MAGBO se apoia em legítimo interesse para controle de acesso, que não
   alcança saúde.
2. **Houvesse prazo de retenção e expurgo** para essa categoria, com rotina de apagamento —
   hoje o único dado com prazo declarado é o retrato do PPMS em `localStorage`, e as tabelas
   deste sistema não têm política de expurgo nenhuma.
3. **O acesso a esse log fosse mais restrito que o resto**, com trilha própria (quem leu o
   log de quem leu a ficha), sob pena de o log ser mais exposto que o dado que ele protege.
4. **O TOTVS não oferecesse a auditoria** — e isso é uma pergunta de fato, não de arquitetura:
   se a DSI responder que o TOTVS não registra acesso a fichas, a lacuna existe e alguém tem
   de fechá-la; a resposta certa ainda não seria «o MAGBO passa a guardar saúde», e sim
   «o TOTVS precisa registrar».

Enquanto os quatro não forem verdade **ao mesmo tempo**, guardar esse log aqui troca uma
auditoria que já existe por um risco novo.

## Consequências

- `TotvsLinkController` **não loga** userId em acesso a ficha, e o javadoc diz por quê.
- O `docs/integracao/totvs.md` ganha uma quinta pergunta para a DSI: **o TOTVS registra quem
  abriu qual ficha, e por quanto tempo guarda esse registro?** Se a resposta for não, a
  pendência é do TOTVS.
- O PPMS, que motivou a contradição, resolveu-se por outro caminho: a lista continua
  nominativa (numa evacuação é o nome que acha a criança) e passou a exigir `PPMS_READ`.
  **Restringir, não fechar.**
- Este ADR é o gatilho de revisão: se algum dia o MAGBO passar a tratar saúde, esta decisão
  volta à mesa com os quatro critérios acima como lista de conferência.
