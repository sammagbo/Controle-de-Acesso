package com.magbo.access.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * UMA PESSOA que está dentro e cuja jornada acabou (ou vai acabar).
 *
 * O fechamento automático das 17:00 grava uma SAIDA sintética para quem ficou
 * com a presença aberta no CDI, e faz isso EM SILÊNCIO — ninguém nunca viu a
 * lista, nem antes nem depois. Esta é a lista.
 *
 * ⚠️ POR QUE UMA TELA CONSULTÁVEL A QUALQUER HORA, e não um aviso de fim de dia.
 * O trabalho roda a cada 5 minutos e fecha assim que a hora passa. Um aviso de
 * fim de dia chegaria quando não há mais nada a fazer: a criança já foi
 * carimbada como tendo saído às 17:00, e quem lê o aviso só pode concordar. Uma
 * tela que a Vie Scolaire abre às 16h40 ainda permite ir ao CDI ver se a pessoa
 * está lá — que é o único momento em que esta informação muda alguma coisa.
 *
 * A tela mostra as DUAS metades, porque a pergunta muda de tempo ao longo do
 * dia e continua valendo depois:
 *   • {@code jaFechado=false} — ainda está aberto. Vai ser fechado às {@code horaFechamento}.
 *   • {@code jaFechado=true}  — já foi fechado hoje. Responde "quem fechamos?", no dia seguinte.
 *
 * ⚠️ E ELA NÃO ACUSA NINGUÉM. Uma presença aberta é quase sempre uma SAÍDA que
 * o terminal não viu, não uma pessoa que ficou trancada na biblioteca. O
 * fechamento automático existe exatamente porque isso é comum. A tela diz isso
 * com todas as letras — "não vi" é NÃO SEI, nunca "não saiu".
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FinDeJournee {

    private String userId;

    /** Nome do cadastro, ou null quando a matrícula não existe mais. */
    private String nome;

    private String turma;

    /**
     * Tipo da pessoa (ALUNO, PROFESSOR, FUNCIONARIO), ou null.
     *
     * ⚠️ A tela precisa disto porque o fechamento NÃO filtra por tipo: o
     * handoff registra ~15 `FUNC-###` fechados num único dia. Um servidor que
     * entra no CDI por trinta segundos e sai sem passar o rosto aparece aqui
     * junto com os alunos, e quem lê tem de poder distinguir num relance quem
     * é criança de quem é colega.
     */
    private String tipo;

    private String pointId;

    /** HH:mm da ENTRADA que ficou aberta. */
    private String horaEntrada;

    /** HH:mm em que o fechamento acontece (a hora configurada, não a do job). */
    private String horaFechamento;

    /** true = a SAIDA sintética já foi gravada hoje. */
    private boolean jaFechado;
}
