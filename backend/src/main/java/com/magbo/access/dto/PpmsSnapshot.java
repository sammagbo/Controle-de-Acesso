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
        private List<Pessoa> pessoas;
    }

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
