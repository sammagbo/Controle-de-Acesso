package com.magbo.access.dto;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * QUEM ESTA DENTRO, AGORA — a resposta que o PPMS exige em minutos.
 *
 * O Plan Particulier de Mise en Sûreté é obrigatório e hoje a contagem é feita
 * em papel ("fiches des effectifs" no kit de confinamento). Numa evacuação real
 * a pergunta "quem ainda está lá dentro?" precisa de resposta antes de alguém
 * voltar para procurar.
 *
 * ⚠️ ISTO NAO E A CHAMADA. E a presença SEGUNDO OS LEITORES, e a diferença
 * importa numa emergência: quem entrou por um portão que não leu o rosto não
 * está aqui, e quem saiu sem passar o crachá continua aqui. A tela diz isso com
 * todas as letras (avisos), porque numa evacuação um número que parece completo
 * e não é vale menos que nenhum número.
 */
@Data
@Builder
public class PpmsSnapshot {

    /** Hora em que ESTE retrato foi tirado. A tela mostra e envelhece à vista. */
    private LocalDateTime geradoEm;

    /** Total de pessoas consideradas dentro da escola. */
    private int totalDentro;

    private List<Zona> zonas;

    /**
     * O que este número NAO cobre. Chaves i18n, nunca frases prontas — a tela é
     * bilíngue e uma frase montada aqui chegaria numa língua só.
     */
    private List<String> avisos;

    @Data
    @Builder
    public static class Zona {
        /** 'portail', 'cdi', 'cantine', 'infirmerie' — ou 'escola' para quem só passou no portão. */
        private String area;
        private String pointId;
        private int total;

        /**
         * Contagem POR TIPO, feita no SERVIDOR.
         *
         * ⚠️ EXISTE PARA QUE A TELA NAO CONTE O COMPRIMENTO DE UMA LISTA.
         * Hoje `total` e `pessoas.size()` sao iguais por construcao — nada e
         * truncado. Mas "hoje sao iguais" e uma coincidencia, nao um contrato:
         * no dia em que alguem paginar `pessoas` para nao mandar 300 nomes de
         * uma vez, uma tela que contasse `pessoas.filter(...).length` passaria a
         * dizer "12 eleves" quando ha 200, sem erro nenhum, numa evacuacao.
         * O numero vem daqui; a lista serve para LER NOMES.
         *
         * Vazio quando a zona esta vazia — e a zona vazia e emitida de proposito
         * (ver PpmsService).
         */
        private List<Grupo> grupos;

        private List<Pessoa> pessoas;
    }

    /**
     * Quantas pessoas de UM tipo estao nesta zona.
     *
     * ⚠️ `tipo` e o nome do enum UserType (ALUNO, PROFESSOR, FUNCIONARIO) ou a
     * constante {@link #TIPO_OUTRO} — NUNCA uma frase. A tela e bilingue e um
     * rotulo montado aqui chegaria numa lingua so, que e a mesma razao pela qual
     * os `avisos` sao chaves i18n.
     */
    @Data
    @Builder
    public static class Grupo {
        private String tipo;
        private int total;
    }

    /**
     * Tipo de quem esta dentro e o sistema NAO consegue nomear.
     *
     * ⚠️ Medido em producao em 21/08/2026: ZERO ocorrencias — nenhuma linha de
     * `access_logs` sem ficha em `app_users`. O grupo existe mesmo assim, e a
     * razao e o proprio PPMS: se um dia ele aparecer, e alguem dentro do predio
     * que a escola nao sabe identificar, e essa e a linha mais urgente da tela.
     * Um grupo que so nasce quando ja e tarde nao teria onde aparecer.
     */
    public static final String TIPO_OUTRO = "OUTRO";

    @Data
    @Builder
    public static class Pessoa {
        private String id;
        private String nome;
        private String turma;
        private String tipo;
        /** Onde foi vista pela última vez. */
        private String ultimoPonto;
        private LocalDateTime ultimaHora;
        /** Quando entrou na escola (evento de portão), se houve. */
        private LocalDateTime entrouAs;
    }
}
