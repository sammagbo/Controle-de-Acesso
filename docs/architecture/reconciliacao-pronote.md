# Reconciliação MAGBO ↔ Pronote — desenho, e a fronteira exata

> **Estado: DESENHO. Nada disto foi construído.** A API do Pronote não está
> disponível. Este documento existe para que, no dia em que estiver, ninguém
> precise redescobrir o que é possível e o que não é — e para deixar claro,
> desde já, o que **já dá para fazer sem ela**.

## A pergunta

O Pronote sabe quem **deveria** estar. O MAGBO sabe quem **está**.

> Um aluno que passou o portão às 8h e está marcado ausente em aula às 10h ou
> está perdido dentro do prédio, ou foi registrado errado — e nos dois casos
> alguém precisa saber **hoje**, não na semana que vem.

Nenhum dos dois sistemas responde isso sozinho. É a única coisa que o MAGBO pode
fazer e o Pronote estruturalmente não pode, porque o Pronote não vê o portão.

## O que separa os dois mundos

| | Pronote | MAGBO |
|---|---|---|
| Unidade | a **aula** (turma × horário × sala) | a **passagem** (pessoa × ponto × instante) |
| Verdade | o que foi **declarado** pelo professor | o que um leitor **mediu** |
| Granularidade | por hora de aula | por segundo |
| Cobertura | todo aluno, toda hora | só quem passa por um leitor |

⚠️ **A cobertura é o problema, não a integração.** Um aluno que entra atrás de
outro sem ser lido não existe para o MAGBO. Qualquer reconciliação tem de tratar
"não vi" como **não sei**, nunca como "não estava" — senão a lista de divergências
vira uma lista de acusações falsas, e a segunda vez que isso acontecer ninguém
mais abre a tela.

## O que exige o Pronote

Estritamente uma coisa, e é a que falta: **o emploi du temps** — que aula cada
turma tem em cada hora, e a **chamada** — quem o professor marcou presente.

Disso dependem:

1. **A divergência que dá título a este documento**: passou o portão × marcado
   ausente. Precisa da chamada.
2. **O regime de sortie completo.** Hoje o `RegimeSortieService` responde
   `A_VERIFIER` para regime 2 e marca `dependeDeGrade=true` no regime 3,
   justamente porque não sabe se agora é hora vaga nem se o professor faltou.
   Com a grade, esses dois casos viram veredicto de verdade.
3. **Retard com consequência.** Saber que alguém passou às 8h17 só vira "atraso"
   contra o horário de início da **primeira aula daquele aluno naquele dia**.
   Sem a grade, é uma hora comparada com um sino genérico.

## O que NÃO exige o Pronote — e já é útil

Estas quatro perguntas o MAGBO responde **hoje**, com o que já está em
`access_logs`. Nenhuma foi construída como tela; a três primeiras o backend já
tem quase tudo.

1. **Entrou e nunca mais foi visto.** Passou o portão de manhã e não tem nenhum
   evento interno no dia. Não prova nada sozinho (a maioria dos alunos não passa
   por leitor nenhum entre o portão e a saída), mas cruzado com a lista de quem a
   Vie Scolaire está procurando, é o primeiro lugar a olhar. Já existe o
   `PpmsService`, que calcula exatamente este estado.

2. **Está dentro e a jornada acabou.** Depois de `magbo.regime.fim-dia`, quem
   consta dentro ou esqueceu de passar na saída (o caso comum) ou está lá. O
   `PresenceAutoCloseService` já fecha o CDI às 17h por isso; a diferença é
   **mostrar a lista antes de fechar**, em vez de fechar em silêncio.

3. **Saiu sem ter entrado.** Uma SAÍDA sem ENTRADA correspondente no dia. Hoje
   isso já é contado (`countUnregisteredExits`) e aparece como "Mouvements
   incomplets" — o que falta é o **nome**, não o número. Um contador diz que há
   sete; a Vie Scolaire precisa saber **quais sete**.

4. **A divergência física × lógica que já existe.** `auth_result=SUCCESS` e
   `authorization_result=DENIED`: o terminal deixou passar e o MAGBO discordou.
   Já medida (`divergenciaHoje`) e já visível. Com o regime de sortie ligado,
   ela ganha uma família nova de linhas — as saídas que o regime não autorizava.

## Como eu construiria, no dia em que a API existir

**Não** sincronizando bases. O MAGBO não deve guardar cópia da grade nem da
chamada — seria uma segunda verdade sobre um dado que muda o dia inteiro e cujo
dono é outro sistema. O desenho é de **consulta ao vivo**:

```
GET /api/reconciliacao/hoje?hora=10:00
   → para cada aluno com passagem de portão hoje:
       pronoteClient.chamadaDe(turma, hora)   ← ao vivo, sem persistir
       cruzar com o último evento do MAGBO
   → devolve APENAS as divergências, com o motivo
```

Três decisões que eu já tomaria agora, porque são as que envelhecem mal se
ficarem para depois:

- **Um adaptador, não um acoplamento.** `PronoteClient` como interface, com uma
  implementação real e uma que devolve vazio. Sem a API, o sistema responde
  "reconciliação indisponível" e o resto continua funcionando — não é uma
  dependência que derruba a portaria quando o Pronote cai.
- **Nada é persistido.** A divergência é calculada e mostrada. Guardar "fulano
  estava ausente às 10h" criaria no MAGBO um registro de assiduidade, que é
  documento escolar com dono, prazo e recurso — e o dono é o Pronote.
- **A recevabilité continua do CPE.** O sistema mostra a divergência; **nunca**
  decide se a ausência é justificada. Isso não é limitação técnica: é a regra
  da Vie Scolaire, e uma máquina que a decidisse estaria decidindo sobre a
  escolaridade de uma criança sem competência para isso.

## O que perguntar antes de começar

1. Existe API do Pronote nesta instalação (versão, licença, módulo), ou o que há
   é exportação de arquivo? Se for arquivo, a reconciliação é **do dia anterior**,
   e todo o valor de "saber hoje" desaparece — mudaria o desenho inteiro.
2. A chave de aluno é a mesma? O MAGBO usa a matrícula Pronote de 7 dígitos como
   `app_users.id`, o que sugere que sim — confirmar com uma amostra real.
3. A chamada fica disponível **quando**? Se o professor lança no fim do dia, a
   divergência das 10h não existe às 10h.
