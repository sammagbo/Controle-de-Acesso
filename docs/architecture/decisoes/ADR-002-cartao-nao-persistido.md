# ADR-002 — O MAGBO não armazena número de cartão

## Contexto
O terminal Hikvision DS-K1T344MX aceita dois métodos de autenticação: **face** e **cartão**.
Era preciso decidir se o MAGBO guardaria o número do cartão (`cardNo`) — para vincular
cartão↔pessoa, importar credenciais, distinguir método etc.

## Decisão
**Nenhuma** coluna de cartão, **nenhuma** tabela de credenciais, **nenhuma** importação de
cartão. O vínculo cartão↔pessoa vive **no terminal / HikCentral**, não no MAGBO. O backend
identifica a pessoa sempre pelo `employeeNoString` (= `app_users.id` = matrícula Pronote).

## Alternativas consideradas
- **(A) Persistir `cardNo`** em `app_users` ou numa tabela de credenciais, e importar cartões.
  **Rejeitada** — além de duplicar um vínculo que o HikCentral já mantém, é **tecnicamente
  impossível** com o payload atual: o `cardNo` **não chega ao backend** (ver Evidência).
- **(B) Não persistir cartão; identidade só por `employeeNoString`.** **Escolhida.**

## Consequências
- Face e cartão identificam **a mesma pessoa** sem nenhum código adicional — o terminal já
  entrega o mesmo `employeeNoString` para os dois.
- A distinção do método é feita **somente** pelo `subEventType` (75 = face, 1 = cartão),
  gravado em `access_logs.auth_method` (`FACE`/`CARD`). **Não há** outro campo no payload que
  permita distinguir — se um dia for necessário mais que isso, exigirá outra fonte.
- Zero superfície de dados sensíveis de credencial no repositório (que é **público**).
- A distribuição de credenciais faciais/cartão para os 923 alunos é responsabilidade do
  **HikCentral** (procedimento operacional — ver `docs/operacional/procedimento-hikcentral.md`),
  não do MAGBO.

## Evidência
Testes com **hardware real em 2026-07-14** (Testes 1–5):
- **Face** → `employeeNoString=9999999`, `subEventType=75`.
- **Cartão** físico `3478915054` → `employeeNoString=9999999`, `subEventType=1`. **O terminal
  traduz o cartão para o Employee ID internamente; o `cardNo` (`3478915054`) NUNCA é enviado no
  payload.**
- Confirmado também com `0001764` (Luis) e `0003906` (Xande): **zeros à esquerda preservados**
  no `employeeNoString`.

Coberto por testes: `WebhookCardIT` (subtipo 1 → `auth_method=CARD`) e `ZeroPaddingIT`
(zeros à esquerda preservados em log e attempt).

## Status
**Aceita** — 2026-07-14. Reflete `§9.2` da especificação técnica.
