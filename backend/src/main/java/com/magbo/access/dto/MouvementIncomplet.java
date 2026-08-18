package com.magbo.access.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * UMA LINHA da lista de movimentos incompletos — a resposta a "QUAIS sete?".
 *
 * O painel da direção já dizia quantos eram (`unregisteredExits`, o card
 * "Sorties non enregistrées"). Um número não permite ir procurar ninguém: a Vie
 * Scolaire precisa do NOME, da HORA e do PONTO. Isto e' essa linha.
 *
 * ⚠️ O QUE ESTA LISTA NAO E', e a tela tem de dizer isso com todas as letras:
 * ela nao acusa ninguem. "Nao vi" e' NAO SEI, nunca "nao esteve". Um aluno cuja
 * saida nao foi capturada nao e' um aluno que fugiu — o terminal pode ter
 * perdido a leitura, a fila offline pode ter engolido o evento, a pessoa pode
 * ter saido junto com outra pela mesma porta. Na segunda vez que alguem for
 * nomeado errado, ninguem abre esta tela de novo, e ai ela deixa de servir para
 * o dia em que importa.
 *
 * ⚠️ SAO DUAS ESPECIES, e misturar as duas num numero so' seria repetir o
 * problema que esta lista existe para resolver:
 *
 *   ENTREE_SANS_SORTIE — entrou e a saida nunca foi registrada. E' exatamente o
 *       que `countUnregisteredExits` conta, com a MESMA janela de 4 horas e os
 *       MESMOS pontos: a contagem de linhas deste tipo tem de bater com o card,
 *       e ha um teste que quebra se divergirem.
 *
 *   SORTIE_SANS_ENTREE — saiu sem que houvesse entrada registrada antes. Isto
 *       NUNCA foi mostrado em lugar nenhum: os dois endpoints de lista
 *       (infirmary/visits, refectory/meals) descartam a saida solta em silencio
 *       (`if (entrada == null) continue;`). Nao entra no contador e nao muda o
 *       numero do card — aparece nesta lista porque e' a mesma pergunta pelo
 *       outro lado, e porque uma saida sem entrada e' quase sempre a prova de
 *       que a ENTRADA e' que se perdeu.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MouvementIncomplet {

    /** Matricula. Pode ser null se o log legado nao a tiver. */
    private String userId;

    /** Nome resolvido do cadastro, ou null quando a matricula nao existe mais. */
    private String nome;

    private String turma;

    /** Ponto onde o movimento incompleto foi observado (REFEI1, ENFERM...). */
    private String pointId;

    /** ENTREE_SANS_SORTIE | SORTIE_SANS_ENTREE — ver o javadoc da classe. */
    private String tipo;

    /** yyyy-MM-dd do movimento observado. */
    private String date;

    /** HH:mm do movimento observado — a hora da ENTRADA ou a da SAIDA, conforme o tipo. */
    private String hora;

    /**
     * Chave i18n do que a tela deve dizer sobre ESTA linha.
     *
     * ⚠️ Chave, nunca prosa: a mensagem e' a parte que impede a lista de ser
     * lida como acusacao, e ela precisa existir nas duas linguas. O backend
     * escolhe QUAL das duas frases cabe; quem as escreve e' o dicionario.
     */
    private String explicacao;
}
