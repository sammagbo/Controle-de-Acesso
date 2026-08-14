package com.magbo.access.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.time.LocalTime;

/**
 * Os limites da jornada desta escola, e o que fazer com quem nao tem regime.
 *
 * ⚠️ Em properties e nao em constantes porque sao AFIRMACOES SOBRE ESTA ESCOLA,
 * nao leis — mesma disciplina do teto de duracao de visita e do piso de visita
 * curta. O Lycée Molière encerra a manha e o dia nestes horarios; outro
 * estabelecimento encerra noutros, e trocar isso nao pode exigir recompilar.
 */
@Component
@ConfigurationProperties(prefix = "magbo.regime")
@Getter
@Setter
public class RegimeProperties {

    /**
     * Fim da meia-jornada da manha. A partir daqui, o aluno EXTERNE terminou o
     * seu dia letivo e pode ir embora mesmo em regime 1.
     *
     * Sem isto, todo aluno de regime 1 saindo ao meio-dia — que e a saida normal
     * de um externo — receberia vermelho. Uma tela que grita cem vezes por dia
     * naquilo que e rotina e uma tela que ninguem olha quando o alerta e real.
     */
    private LocalTime fimManha = LocalTime.of(12, 0);

    /**
     * Retomada da tarde: a hora em que a meia-jornada da tarde comeca.
     *
     * ⚠️ SEM ISTO O SISTEMA DA FALSO VERDE A TARDE INTEIRA, e foi assim que
     * nasceu (apanhado pelo painel de revisao em 14/08/2026). A regra do fim da
     * manha liberava o EXTERNE a partir das 11h45 — e continuava liberando as
     * 14h30, as 16h, ate a meia-noite, porque so olhava "e depois de fimManha?".
     * O aluno de regime 1 que se manda depois do almoco recebia AUTORISE com o
     * motivo "fim de jornada — saida normal": o sistema nao so deixava de
     * avisar como AFIRMAVA que a saida foi normal.
     *
     * A janela do meio-dia vai de fimManha ate aqui. Depois daqui, so fimDia
     * encerra a jornada de alguem.
     */
    private LocalTime retomadaTarde = LocalTime.of(14, 0);

    /**
     * Fim da jornada. A partir daqui todo aluno vai para casa, em qualquer
     * regime: a saida deixa de ser uma excecao a autorizar e passa a ser o fim
     * do dia.
     */
    private LocalTime fimDia = LocalTime.of(17, 0);

    /**
     * Tolerancia, em minutos, antes dos horarios acima.
     *
     * O sino nao toca no segundo exato e a fila do portao se forma antes. Sem
     * folga, o aluno que passa as 11h58 recebe vermelho e o que passa as 12h01
     * recebe verde — uma diferenca que nenhum adulto no portao consegue
     * explicar a um pai.
     */
    private int toleranciaMinutos = 15;

    /**
     * O que fazer quando o aluno NAO tem regime cadastrado.
     *
     * OBSERVATION (padrao): registra e mostra cinza; nao acusa ninguem.
     * DENY: trata ausencia de regime como proibicao.
     *
     * ⚠️ O padrao e OBSERVATION e mudar isso e decisao do Sam, com pre-requisito
     * operacional: no dia 1 nenhum dos 923 alunos tem regime. Ligar DENY antes
     * de carregar os regimes transformaria a escola inteira em vermelho, que e
     * exatamente o erro que ja foi documentado para meal-pending (D5/ADR-004).
     */
    private String desconhecido = "OBSERVATION";

    /**
     * Regra ligada? Desligada, o servico responde NON_APPLICABLE para todos.
     *
     * ⚠️ FALSE tambem no campo Java, e nao so no application.properties. O
     * comentario do docker-compose afirma "nasce FALSE"; com o default do campo
     * em true, quem construisse um RegimeProperties sem passar pelo Spring —
     * um teste, um binding parcial — teria a regra LIGADA sem que ninguem
     * tivesse pedido. Duas fontes para o mesmo padrao, e a que aparece na
     * documentacao era a que nao valia. (Painel de revisao, 14/08/2026.)
     */
    private boolean habilitado = false;

    public boolean negarDesconhecido() {
        return "DENY".equalsIgnoreCase(desconhecido);
    }
}
