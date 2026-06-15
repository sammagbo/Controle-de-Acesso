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
}
