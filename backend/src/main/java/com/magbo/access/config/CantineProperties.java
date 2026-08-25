package com.magbo.access.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalTime;

/**
 * Os horarios e as duracoes DESTA cantina.
 *
 * ⚠️ Em properties e nao em `static final` pela mesma razao que
 * {@link RegimeProperties}: sao AFIRMACOES SOBRE ESTA ESCOLA, nao leis. O
 * Lycée Molière serve o almoco nestas horas e considera esta duracao razoavel;
 * outro estabelecimento decide outra coisa, e mudar isso nao pode exigir
 * recompilar e redistribuir um jar.
 *
 * Ate 24/08/2026 os cinco valores viviam como constantes no
 * AccessDecisionService — `LYCEE_START`, `LYCEE_END` e `MAX_CANTINA_TIME` —, e
 * o unico jeito de corrigir um horario era editar Java.
 *
 * ⚠️ ISTO NAO MUDA A LOGICA DE `validateEntryWindow`, e nao deve. A regra por
 * turma continua exatamente como estava, com a excecao das oito turmas do
 * liceu (LYCEE_CLASSES): so os NUMEROS sairam de dentro do codigo. Uma
 * mudanca de politica de janela e outra conversa, e e do Sam.
 */
@Component
@ConfigurationProperties(prefix = "magbo.cantine")
@Getter
@Setter
public class CantineProperties {

    /**
     * Abertura da cantina para as turmas do liceu.
     *
     * ⚠️ Serve TAMBEM de referencia para o alerta de "abriu mais cedo" no
     * Moniteur Cantine: uma passagem registada antes desta hora nao e um erro
     * do sistema, e a cantina a funcionar fora do previsto — e quem esta ao
     * balcao precisa de o saber, porque a fila que ele esta a ver nao e a que
     * o horario diz.
     */
    private LocalTime lyceeInicio = LocalTime.of(11, 0);

    /** Fecho da janela do liceu. */
    private LocalTime lyceeFim = LocalTime.of(15, 0);

    /**
     * Abaixo disto, a pessoa entrou mas provavelmente NAO COMEU.
     *
     * ⚠️ Nao e uma recusa nem uma acusacao: e um sinal. Um aluno que atravessa
     * o refeitorio em seis minutos ou foi buscar alguem, ou desistiu da fila,
     * ou o leitor da saida apanhou-o a passar. A linha aparece marcada em
     * SORTIS, sem coluna propria — quem quer saber ve; quem nao quer nao
     * tropeca nela.
     */
    private int duracaoCurtaMinutos = 15;

    /**
     * Acima disto, a permanencia e EXCESSIVA e a linha vai para DOIT SORTIR.
     *
     * Era uma hora (`MAX_CANTINA_TIME`) e passou a 30 minutos em 24/08/2026,
     * por decisao do Sam: uma hora e mais do que o servico inteiro de uma
     * turma, entao o alerta praticamente nunca disparava e a coluna DOIT SORTIR
     * so se enchia de quem sai sem ser lido.
     */
    private int duracaoMaximaMinutos = 30;

    /**
     * Quanto tempo uma linha fica VISIVEL na coluna DOIT SORTIR.
     *
     * ⚠️ DECANTACAO, e nao remocao: passado este tempo a linha sai da COLUNA e
     * vai para a pastilha do cabecalho, que continua a conta-la e abre a lista
     * inteira num clique. Nada e apagado.
     *
     * Existe porque a coluna e um instrumento de ACAO: ao fim de meia hora de
     * servico ela tinha trinta nomes, e um operador que ve trinta anomalias nao
     * age sobre nenhuma. O que decanta continua contado — some da vista, nao da
     * contabilidade.
     */
    private int decantacaoMinutos = 15;

    /** O teto de permanencia como Duration, que e o que a regra compara. */
    public Duration duracaoMaxima() {
        return Duration.ofMinutes(duracaoMaximaMinutos);
    }
}
