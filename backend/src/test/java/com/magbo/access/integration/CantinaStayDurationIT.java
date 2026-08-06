package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * TEMPO DENTRO DA CANTINA — medido entre duas passagens REAIS.
 *
 * A flag EXCEDEU_TEMPO respondia a uma subtracao com dois relogios diferentes:
 * a ENTRADA vinha do banco com hora de EVENTO (desde 8d78f41), e a SAIDA
 * entrava com a hora da DECISAO (`LocalDateTime.now()` do processamento).
 * Enquanto os eventos chegam ao vivo os dois relogios coincidem e ninguem
 * percebe. Quando um terminal esvazia a fila offline — comportamento NORMAL
 * dos MinMoe quando o destino cai, observado 2x em bancada e uma vez em
 * producao (03/08) — a diferenca vira a idade da fila, e nao a permanencia da
 * pessoa.
 *
 * Concretamente: entrou 12:00, saiu 12:20, a fila drena as 14:51. A conta
 * antiga dava 2h51 e carimbava EXCEDEU_TEMPO num aluno que ficou 20 minutos.
 *
 * A correcao passa a hora do EVENTO de saida em vez de `now`. Nao e mudanca de
 * politica: EXCEDEU_TEMPO e uma FLAG num log que vai ser gravado de qualquer
 * jeito, nao uma decisao de permitir ou negar — por isso escapa da regra de que
 * as decisoes usam o relogio da decisao.
 */
class CantinaStayDurationIT extends AbstractIT {

    private static final String EXCEDEU = "EXCEDEU_TEMPO";

    /**
     * Cravou a ENTRADA no banco com a hora de evento pedida, como o webhook
     * teria gravado. Direto no repositorio para o teste controlar a hora sem
     * depender de duas guardas de dedup em sequencia.
     */
    private void entradaNaCantinaHaMinutos(String userId, long minutosAtras) {
        accessLogRepository.save(AccessLog.builder()
                .userId(userId)
                .pointId("REFEI1")
                .action(AccessAction.ENTRADA)
                .timestamp(LocalDateTime.now().minusMinutes(minutosAtras))
                .build());
    }

    /** A SAIDA que o teste envia, com a hora do evento `minutosAtras` no passado. */
    private void saidaComEventoHaMinutos(long minutosAtras) throws Exception {
        mockMvc.perform(TestFixtures.multipartWebhookHaSegundos(
                        TestFixtures.payload("face-75.txt"),
                        TestFixtures.IP_CANTINA_SAIDA,
                        minutosAtras * 60))
                .andExpect(status().isOk());
    }

    private AccessLog saidaGravada() {
        return accessLogRepository.findAll().stream()
                .filter(l -> l.getAction() == AccessAction.SAIDA)
                .findFirst()
                .orElseThrow(() -> new AssertionError("nenhuma SAIDA gravada"));
    }

    /**
     * O CASO QUE MOTIVOU A CORRECAO.
     *
     * Entrada ha 95 min, saida cujo EVENTO foi ha 80 min: 15 minutos dentro.
     * Pela conta antiga (agora - entrada) seriam 95 min e a flag apareceria.
     */
    @Test
    @DisplayName("★ fila reentregue: 15 min reais dentro -> SEM EXCEDEU_TEMPO")
    void filaReentregueNaoInventaExcessoDeTempo() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        seedMapping(TestFixtures.IP_CANTINA_SAIDA, "REFEI1", AccessAction.SAIDA);
        entradaNaCantinaHaMinutos(TestFixtures.EMPLOYEE_PILOTO, 95);

        saidaComEventoHaMinutos(80);

        assertThat(saidaGravada().getFlag())
                .as("15 min entre as duas passagens — a fila estava atrasada, o aluno nao")
                .isNull();
    }

    /**
     * A outra ponta: a flag continua aparecendo quando a permanencia foi longa
     * DE VERDADE. Sem este teste, "nunca marcar nada" passaria pelo teste acima.
     */
    @Test
    @DisplayName("★ permanencia real de 2h -> EXCEDEU_TEMPO continua sendo marcado")
    void permanenciaLongaDeVerdadeAindaMarca() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        seedMapping(TestFixtures.IP_CANTINA_SAIDA, "REFEI1", AccessAction.SAIDA);
        entradaNaCantinaHaMinutos(TestFixtures.EMPLOYEE_PILOTO, 125);

        saidaComEventoHaMinutos(5);   // 2h dentro

        assertThat(saidaGravada().getFlag())
                .as("duas horas na cantina sao duas horas na cantina")
                .isEqualTo(EXCEDEU);
    }

    @Test
    @DisplayName("passagem ao vivo e curta -> sem flag (comportamento de todo dia)")
    void passagemNormalNaoMarca() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        seedMapping(TestFixtures.IP_CANTINA_SAIDA, "REFEI1", AccessAction.SAIDA);
        entradaNaCantinaHaMinutos(TestFixtures.EMPLOYEE_PILOTO, 25);

        saidaComEventoHaMinutos(1);

        assertThat(saidaGravada().getFlag()).isNull();
    }

    /**
     * A hora GRAVADA na saida continua sendo a do evento — a correcao mexeu em
     * qual hora ALIMENTA a regra, nao em qual hora vai para o banco.
     */
    @Test
    @DisplayName("o timestamp gravado continua sendo a hora do evento")
    void timestampGravadoContinuaSendoODoEvento() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        seedMapping(TestFixtures.IP_CANTINA_SAIDA, "REFEI1", AccessAction.SAIDA);
        entradaNaCantinaHaMinutos(TestFixtures.EMPLOYEE_PILOTO, 95);

        LocalDateTime antes = LocalDateTime.now();
        saidaComEventoHaMinutos(80);

        assertThat(saidaGravada().getTimestamp())
                .as("hora do evento (ha 80 min), nao a da recepcao")
                .isBefore(antes.minusMinutes(70))
                .isAfter(antes.minusMinutes(90));
    }

    /**
     * Saida sem entrada registrada nao e culpa do aluno: a regra devolve null e
     * o log e gravado sem flag. Congelado aqui porque a correcao passa perto.
     */
    @Test
    @DisplayName("saida sem ENTRADA anterior -> sem flag")
    void saidaSemEntradaNaoMarca() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        seedMapping(TestFixtures.IP_CANTINA_SAIDA, "REFEI1", AccessAction.SAIDA);

        saidaComEventoHaMinutos(5);

        assertThat(saidaGravada().getFlag()).isNull();
    }
}
