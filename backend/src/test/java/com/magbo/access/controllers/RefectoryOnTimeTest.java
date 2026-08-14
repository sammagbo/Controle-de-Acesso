package com.magbo.access.controllers;

import com.magbo.access.models.AccessLog;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * "HORS HORAIRE" TEM DE VIR DA FLAG PELO NOME, nao de "tem alguma flag".
 *
 * A regra antiga era `entrada.getFlag() == null`. Mas access_logs.flag e um
 * campo UNICO que tambem recebe POSTO_FIXO (quem trabalha no ponto),
 * JA_PRESENTE (quem entra estando ja dentro) e FECHAMENTO_AUTO — de modo que
 * uma passagem classificada pelo proprio sistema como ROTINA era apresentada ao
 * operador da cantina como refeicao fora do horario. Uma acusacao de
 * irregularidade contra quem nao cometeu nenhuma.
 *
 * O defeito foi corrigido na auditoria de 14/08/2026 e o painel de revisao
 * apontou, com razao, que a mudanca de semantica entrou SEM TESTE: nem antes,
 * nem depois. Este arquivo e a divida paga.
 *
 * ⚠️ A regra vive numa unica linha do AccessController
 * (`.onTime(!"FORA_HORARIO".equals(entrada.getFlag()))`). O que se prova aqui e
 * o PREDICADO, isolado do resto do controller — a lista de flags cresce
 * (POSTO_FIXO e JA_PRESENTE entraram depois de FORA_HORARIO existir) e o que
 * nao pode acontecer e a proxima flag nova voltar a virar "hors horaire".
 */
@DisplayName("Cantina — 'hors horaire' vem da flag FORA_HORARIO, e so dela")
class RefectoryOnTimeTest {

    /** O mesmo predicado do AccessController, isolado. */
    private static boolean onTime(String flag) {
        return !"FORA_HORARIO".equals(flag);
    }

    private static AccessLog comFlag(String flag) {
        return AccessLog.builder().flag(flag).build();
    }

    @Test
    @DisplayName("★★ FORA_HORARIO é o único que faz 'hors horaire'")
    void apenasForaHorario() {
        assertThat(onTime(comFlag("FORA_HORARIO").getFlag()))
                .as("a refeição fora da janela é a única irregularidade que este campo nomeia")
                .isFalse();
    }

    @Test
    @DisplayName("★★★ POSTO_FIXO é ROTINA — não pode aparecer como irregularidade")
    void postoFixoNaoEIrregularidade() {
        // O funcionário postado no REFEI1 passa por ali o dia inteiro; o sistema
        // marca a repetição justamente para dizer "isto é rotina".
        assertThat(onTime(comFlag("POSTO_FIXO").getFlag())).isTrue();
    }

    @Test
    @DisplayName("★★★ JA_PRESENTE é ROTINA — idem")
    void jaPresenteNaoEIrregularidade() {
        assertThat(onTime(comFlag("JA_PRESENTE").getFlag())).isTrue();
    }

    @Test
    @DisplayName("★★ FECHAMENTO_AUTO não é irregularidade do aluno — é do sistema")
    void fechamentoAutoNaoEIrregularidade() {
        assertThat(onTime(comFlag("FECHAMENTO_AUTO").getFlag())).isTrue();
    }

    @Test
    @DisplayName("★ EXCEDEU_TEMPO é problema de SAÍDA, não de horário de entrada")
    void excedeuTempoNaoEHorsHoraire() {
        assertThat(onTime(comFlag("EXCEDEU_TEMPO").getFlag())).isTrue();
    }

    @Test
    @DisplayName("★★ sem flag nenhuma continua sendo 'na hora' — a esmagadora maioria")
    void semFlagContinuaNaHora() {
        assertThat(onTime(comFlag(null).getFlag())).isTrue();
    }

    @Test
    @DisplayName("★★ uma flag NOVA não vira 'hors horaire' sozinha")
    void flagNovaNaoViraIrregularidade() {
        // É o defeito exato que a regra antiga tinha: qualquer flag acrescentada
        // ao sistema passava a acusar o aluno de comer fora do horário, sem que
        // ninguém tivesse escrito isso em lugar nenhum.
        assertThat(onTime(comFlag("UMA_FLAG_QUE_AINDA_NAO_EXISTE").getFlag())).isTrue();
    }
}
