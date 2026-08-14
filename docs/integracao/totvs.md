# Link para o prontuário no TOTVS — o que falta perguntar à DSI

Quando um aluno chega à enfermaria, a enfermeira precisa do prontuário dele. O
prontuário vive no **TOTVS**, sistema externo. O MAGBO monta o **link** e abre;
a enfermeira autentica no TOTVS com a credencial dela, como faz hoje.

## A regra que não se negocia

> Registrada como decisão em
> [ADR-005 — a rastreabilidade fica com quem é dono do dado](../architecture/decisoes/ADR-005-totvs-rastreabilidade-no-dono-do-dado.md).

**O MAGBO não guarda dado de saúde.** Nem copia, nem espelha, nem cacheia. Isso
não é preferência de arquitetura: guardar prontuário aqui exigiria outra base
legal, outro consentimento, outro regime de retenção e outro nível de proteção —
e transformaria um sistema de controle de acesso num sistema de saúde.

O que o MAGBO registra sobre a enfermaria continua sendo o que ele já registrava:
que a pessoa **passou** por `ENFERM`, e quando. Nada sobre o motivo.

⚠️ **Também não se registra quem abriu qual ficha.** Uma linha de log dizendo
"a enfermeira abriu o prontuário do aluno X" é, ela própria, dado sensível: revela
que aquela criança esteve na enfermaria por algo que exigiu consulta ao histórico.
O registro de passagem que já existe cobre o mesmo fato sem a inferência.

## Estado: DESLIGADO, e por quê

`magbo.totvs.url-pattern` nasce **vazio**. Com ele vazio:

- `GET /api/totvs/config` responde `configurado: false` e a tela não mostra botão;
- `GET /api/totvs/link/{userId}` responde **501**, não 404 — a diferença entre
  "esta pessoa não existe" e "esta escola ainda não ligou a integração" importa
  para quem for depurar isto em setembro.

Ligar é **uma linha de properties**. Não há nada a reescrever no dia em que as
respostas chegarem — que é exatamente o objetivo deste desenho.

## As perguntas para a DSI

São quatro, e a terceira é a que costuma custar caro:

1. **Qual é a URL de uma ficha de aluno?** Um exemplo real, copiado da barra de
   endereços, de uma ficha qualquer. Não a documentação: o endereço de verdade.

2. **Qual identificador o TOTVS espera nessa URL?** As opções que o MAGBO tem
   para oferecer são:
   - a **matrícula Pronote** (`app_users.id`, 7 dígitos **com zeros à esquerda**);
   - o **identificador Hikvision** (`hikvision_employee_id`, 10 dígitos);
   - o nome (péssimo identificador, listado só por completude).
   Se o TOTVS usa um código **próprio**, que não é nenhum destes, então falta uma
   correspondência entre os dois cadastros — e isso é um problema maior que um
   link, porque hoje **nada** no MAGBO guarda o código TOTVS de uma pessoa.
   Seria uma coluna nova, aditiva, e uma importação para preenchê-la.

3. **⚠️ Os zeros à esquerda entram ou não?** A matrícula `0001764` e o número
   `1764` são coisas diferentes e abrem fichas diferentes. O MAGBO substitui a
   ficha `{matricula}` como **TEXTO**, preservando os zeros. Se o TOTVS espera o
   número sem eles, isso precisa ser dito — e vira uma ficha nova e explícita no
   padrão, nunca um corte silencioso. Este é o mesmo defeito que o Excel produz
   na exportação para o HikCentral, e já custou uma correção em massa.

4. **A rede da escola alcança o TOTVS a partir da máquina da enfermaria?** O
   MAGBO roda em Electron no PC; abrir o link usa o navegador daquela máquina. Se
   o TOTVS estiver noutra VLAN ou exigir VPN, o link abre e falha — e falha na
   frente de uma criança doente.

5. **⚠️ O TOTVS registra quem abriu qual ficha, e por quanto tempo guarda esse
   registro?** Esta pergunta não é sobre a integração: é sobre onde mora a
   auditoria. O MAGBO **não** registra acesso a prontuário, e a razão está na
   [ADR-005](../architecture/decisoes/ADR-005-totvs-rastreabilidade-no-dono-do-dado.md):
   uma linha dizendo «fulana abriu a ficha do aluno X» é, ela própria, dado de
   saúde por adjacência, e a rastreabilidade já existe no sistema que é dono do
   dado. Se a resposta da DSI for **não**, a lacuna é real — e a resposta certa
   continua não sendo «o MAGBO passa a guardar», e sim «o TOTVS precisa
   registrar».

## Como configurar, quando as respostas chegarem

```properties
# Fichas aceitas no padrão, substituídas literalmente:
#   {matricula}  → app_users.id, TEXTO, com zeros à esquerda
#   {hikvision}  → app_users.hikvision_employee_id
#   {nome}       → app_users.nome, url-encoded
magbo.totvs.url-pattern=https://totvs.exemplo.local/rm/ficha?ra={matricula}
magbo.totvs.rotulo=TOTVS
```

Conferir depois de ligar: `GET /api/totvs/config` → `configurado: true`, e
`GET /api/totvs/link/0001764` → a URL **com** os quatro zeros.

## O que fica de fora deste passo, de propósito

- **Botão na tela da enfermaria.** A rota existe e está testada; a tela não foi
  construída porque o rótulo, o lugar e o comportamento de abertura (janela nova
  do Electron × navegador do sistema) dependem de ver a integração funcionando
  uma vez. Construir a tela contra um padrão de URL imaginário seria construí-la
  duas vezes.
- **Single sign-on.** A enfermeira autentica no TOTVS. Passar credencial do MAGBO
  para outro sistema é uma decisão de segurança que não se toma de passagem.
