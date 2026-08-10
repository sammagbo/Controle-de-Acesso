package com.magbo.access.config;

/**
 * Fonte única do mapeamento ponto→área no backend.
 * Usado por SystemUser.canOperateSector e pelo /overview.
 * (O frontend mantém sua própria lista em js/data/constants.js.)
 */
public final class AreaMapping {

    private static final java.util.Map<String, String> POINT_TO_AREA = java.util.Map.of(
            "REFEI1", "cantine", "REFEI2", "cantine",
            "ENFERM", "infirmerie",
            "BIBLIO", "cdi",
            "PORT1", "portail", "PORT2", "portail", "PORT3", "portail");

    private AreaMapping() {}

    /** Área macro de um ponto; aceita prefixos (REFEI*, CANTINA*, ENFERM*, PORT*) e pontos virtuais. */
    public static String areaForPoint(String pointId) {
        if (pointId == null) return null;
        String p = pointId.trim().toUpperCase();
        String direct = POINT_TO_AREA.get(p);
        if (direct != null) return direct;
        if (p.startsWith("PORT")) return "portail";
        if (p.equals("BIBLIO")) return "cdi";
        if (p.startsWith("ENFERM") || p.equals("INFIRMARY_REPORT")) return "infirmerie";
        if (p.startsWith("REFEI") || p.startsWith("CANTINA")) return "cantine";
        return null;
    }

    /** Mapa imutável ponto→área dos pontos físicos conhecidos. */
    public static java.util.Map<String, String> pointToArea() {
        return POINT_TO_AREA;
    }

    /**
     * Área do PORTÃO — a fronteira da escola, e o único lugar onde "estar
     * dentro" não é uma afirmação confiável.
     */
    public static final String AREA_PORTAO = "portail";

    /**
     * Este ponto tem PRESENÇA CONFIÁVEL — dá para afirmar que alguém está lá
     * dentro a partir do último evento dele?
     *
     * ── Por que a pergunta existe ───────────────────────────────────────
     * Duas regras dependem de saber se alguém "já está dentro". Num ponto
     * interno (CDI, enfermaria, cantina) o par entrada/saída é fechado: há um
     * leitor na porta e quem sai passa por ele. No PORTÃO não é assim — a
     * saída escapa com frequência, porque se sai por fora do campo da câmera,
     * junto com outra pessoa, ou por outro portão. Ali o sistema acha que a
     * pessoa continua dentro quando ela já foi embora.
     *
     * A consequência de ignorar isto seria séria e SILENCIOSA: marcar a
     * reentrada de quem "já estava dentro" no portão esconderia uma ENTRADA
     * REAL — a pessoa voltou de verdade, e a linha sairia dos contadores.
     * Perder entrada no portão é perder a informação de quem está na escola.
     *
     * O ruído do portão já tem dono, e é outro: {@code POSTO_FIXO}, que é
     * marcado POR PESSOA e por decisão explícita de um operador, não inferido
     * de um estado que ali não é confiável.
     *
     * ── Por que derivado da ÁREA, e não uma lista de pontos ─────────────
     * Cantina e enfermaria entram sozinhas no dia em que forem comissionadas:
     * basta o ponto ter área aqui, o que já é obrigatório para ele aparecer em
     * qualquer tela. Uma lista literal de pontos internos seria uma segunda
     * cópia do mapeamento, e a que envelhece.
     *
     * Ponto DESCONHECIDO devolve false, e é conservador de propósito: não se
     * infere presença num lugar cuja natureza o sistema não conhece.
     */
    public static boolean temPresencaConfiavel(String pointId) {
        String area = areaForPoint(pointId);
        return area != null && !AREA_PORTAO.equals(area);
    }
}
