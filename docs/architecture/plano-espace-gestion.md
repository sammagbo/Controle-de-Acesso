# Plano: "Espace de gestion" — a área administrativa de CADA operador

**Status: PROPOSTA, não implementada.** Escrita em 12/08/2026 a pedido do Sam
("é desenho novo demais para o tempo que resta — deixe o plano para quem
continuar"). Quem pegar isto: leia `.claude/rules/` antes, e trate este arquivo
como o *porquê* e o *por onde* — não como especificação fechada.

## O problema

Cada operador deveria ter **a sua própria área administrativa**, com o conteúdo
variando conforme as permissões — não um espaço pertencente a uma única conta.

Hoje:
- O **Painel Administrativo** é `hasRole('ADMIN')` + PIN cujo endpoint de
  verificação (`/api/admin/verify`) é admin-only. **Operador nunca entra**, por
  construção.
- As ferramentas que o operador TEM (Droits Repas com `MEAL_ENTITLEMENT_WRITE`,
  Sorties com `EXIT_PERMISSION_WRITE`) aparecem como **cards soltos no
  Dashboard** (`mostraAtalhoNoDashboard`, js/utils/permissions.js) — funciona,
  mas não é uma "área": é um atalho por ferramenta, sem lugar que as reúna.

## O que a camada de permissão JÁ suporta (verificado em 12/08/2026)

| peça | onde | estado |
|---|---|---|
| Papéis `ADMIN`/`OPERATOR` | `SystemUser.role` | ok |
| Áreas por operador (`setoresPermitidos`, `*` = todas) | `AreaSecurity.can(...)` no backend + `canAccessArea` no front | ok |
| Permissões granulares (CSV em `system_users.permissoes`, V005) | `@areaSecurity.hasPermission(...)` + `MagboPermissions` | ok, mas **só 3 valores existem**: `MEAL_ENTITLEMENT_WRITE`, `EXIT_PERMISSION_WRITE`, `ATTEMPTS_READ` |
| Leitura das permissões na UI | `js/utils/permissions.js` (testado) | ok |

## O que falta (é isto que o plano entrega)

1. **A tela.** Um componente `EspaceGestion` que lista as ferramentas
   CONCEDIDAS ao usuário logado — cada ferramenta é um card com nome, descrição
   e a permissão que a habilita. Dirigido por `MagboPermissions`: a tela não
   decide nada, só pergunta. Admin (`*`) vê tudo; operador vê o subconjunto.
   Os cards soltos do Dashboard passam a apontar para cá (ou somem — decisão de
   quem implementar, com o Sam).

2. **As constantes que não existem.** Cada ferramenta administrativa nova exige
   a tripla: constante em `Permissions` (backend) + anotação no endpoint +
   leitura em `MagboPermissions` (front). Candidatas óbvias, hoje admin-only:
   `REPORT_READ` (Rapport Général), `USER_PHOTO_WRITE` (fotos), `STAFF_WRITE`
   (servidores), `IMPORT_WRITE` (importações). ⚠️ Cada uma é decisão de
   segurança do Sam, não inferência — fotos de menores em particular.

3. **O PIN.** Hoje o PIN está amarrado ao PAPEL (admin), não ao conteúdo. Para
   a área do operador: ou não exige PIN (a sessão JWT já autentica — proposta
   padrão), ou ganha PIN próprio por operador (mudança de modelo, tabela nova).
   Decidir ANTES de construir; recomendo começar sem PIN e revisitar com uso.

4. **A navegação já está pronta.** O header tem voltar nomeado com origem
   rastreada (`origemAdmin` em App.js, 12/08/2026) — acrescentar uma origem
   `espaceGestion` é uma linha no mesmo padrão.

## Ordem sugerida (três entregas pequenas, não uma grande)

1. `EspaceGestion` só com as ferramentas que JÁ têm permissão (Droits Repas,
   Sorties, feed de negadas com `ATTEMPTS_READ`) — zero mudança de backend.
2. As constantes novas, uma por vez, cada uma com a anotação de endpoint e o
   teste de que o botão morto/403 não diverge (o padrão do
   `mostraAtalhoNoDashboard`).
3. Migrar o Painel Administrativo atual para ser o caso `*` da mesma tela —
   e aí o PIN vira decisão explícita, não herança.

## O que NÃO fazer

- Não esconder campos por permissão: a regra da casa é **desabilitar e
  mostrar** (leitura continua liberada por área).
- Não criar a 3ª camada HTTP (dívida D1).
- Não inventar permissão no front que o backend não conheça — o
  `SystemUserController.validatePermissoes` é a lista fechada, e ela recusa
  valores desconhecidos ao salvar o operador.
