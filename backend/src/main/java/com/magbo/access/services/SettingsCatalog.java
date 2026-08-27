package com.magbo.access.services;

import com.magbo.access.config.CantineProperties;
import com.magbo.access.controllers.CdiController;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * O CATALOGO DOS REGLAGES — a lista do que se pode mudar a ecra, agrupada por
 * dominio, com o valor de agora, o valor de fabrica e quem o mudou pela ultima
 * vez.
 *
 * ⚠️⚠️ O DEFAULT NAO E ESCRITO AQUI. Cada entrada vai buscar o seu default a
 * MESMA fonte que o codigo que le a chave — o bean de properties, a constante
 * do controlador. Escrever «50» nesta lista criaria um segundo sitio onde o
 * default vive, e no dia em que alguem mudasse a property, o ecra de
 * configuracao continuaria a dizer «defaut: 50» com toda a confianca. E
 * exatamente o defeito que o painel de 27/08 encontrou no CDI (duas
 * capacidades no mesmo ecra) e que `f442db9` ja tinha corrigido no piso de
 * visita. Um valor mostrado ao lado da palavra «defaut» tem de SER o default,
 * nao uma copia dele.
 *
 * ⚠️ ESTA LISTA E A UNICA DECLARACAO. Uma chave lida pelo `SettingsService`
 * que nao esteja aqui e uma chave que ninguem consegue ver nem repor — existe
 * na base, muda o comportamento do sistema, e nao aparece em ecra nenhum.
 * `SettingsCatalogGuardTest` reprova quando isso acontece.
 *
 * ⚠️ NENHUM SEGREDO. Nem token, nem senha, nem chave JWT: eles vivem no
 * ambiente (`.env` da VM, `setx` do PC) e nao passam por aqui — o V024
 * documenta porque. Esta lista e o mapa do COMPORTAMENTO do sistema, e ja e
 * material de administracao por si so: e por isso que a leitura esta atras da
 * mesma permissao que a escrita.
 */
@Service
@RequiredArgsConstructor
public class SettingsCatalog {

    private final CantineProperties cantineProperties;
    private final SettingsService settingsService;

    /** Os dominios, na ordem em que aparecem no ecra. */
    public static final String CANTINE = "cantine";
    public static final String CDI = "cdi";
    // ⚠️ Pas de domaine «rapports» : le plancher et le plafond de visite sont
    // des `@Value` lus au demarrage, pas des reglages de `SettingsService`. Une
    // constante declaree sans entree aurait promis un groupe qui n'existe pas.

    /**
     * Uma entrada do catalogo.
     *
     * @param chave   a chave exata de `system_settings`
     * @param dominio o grupo no ecra
     * @param tipo    INT | TEXTE | HEURE | CSV | CHOIX — decide o campo mostrado
     * @param opcoes  para CHOIX, os valores aceites; vazio para o resto
     * @param padrao  ⚠️ FORNECEDOR, nao valor: le a fonte real do default
     */
    public record Entrada(String chave, String dominio, String tipo,
                          List<String> opcoes, Supplier<String> padrao) {
    }

    /**
     * ⚠️ Construido a cada chamada, de proposito: os `padrao` sao lidos AGORA.
     * Guardar a lista numa constante estatica congelaria o default no arranque
     * e voltaria a haver duas verdades assim que uma property mudasse.
     */
    public List<Entrada> entradas() {
        List<Entrada> e = new ArrayList<>();

        // ── Cantine ──────────────────────────────────────────────────────
        e.add(new Entrada("magbo.cantine.duracao-curta-minutos", CANTINE, "INT", List.of(),
                () -> String.valueOf(cantineProperties.getDuracaoCurtaMinutos())));
        e.add(new Entrada("magbo.cantine.duracao-maxima-minutos", CANTINE, "INT", List.of(),
                () -> String.valueOf(cantineProperties.getDuracaoMaximaMinutos())));
        e.add(new Entrada("magbo.cantine.decantacao-minutos", CANTINE, "INT", List.of(),
                () -> String.valueOf(cantineProperties.getDecantacaoMinutos())));
        e.add(new Entrada("magbo.cantine.sortis-visiveis-minutos", CANTINE, "INT", List.of(),
                () -> String.valueOf(cantineProperties.getSortisVisiveisMinutos())));
        // ⚠️ Vazio E o default, e e o default que importa: uma turma nesta
        // lista deixa de aparecer no Moniteur e deixa de contar para o PPMS.
        e.add(new Entrada(MealSlotService.CHAVE_DISPENSEES, CANTINE, "CSV", List.of(),
                () -> ""));

        // ── CDI ──────────────────────────────────────────────────────────
        e.add(new Entrada(CdiController.CHAVE_CAPACIDADE, CDI, "INT", List.of(),
                () -> String.valueOf(CdiController.CAPACIDADE_PADRAO)));
        // ⚠️ NI le defaut NI la liste des valeurs ne sont ecrits ici : les deux
        // viennent de `CdiController`, qui est ce que le code LIT vraiment.
        e.add(new Entrada(CdiController.CHAVE_ESTADO, CDI, "CHOIX",
                CdiController.ESTADOS, () -> CdiController.ESTADO_PADRAO));
        e.add(new Entrada(CdiController.CHAVE_ESTADO_DE, CDI, "HEURE", List.of(), () -> ""));
        e.add(new Entrada(CdiController.CHAVE_ESTADO_ATE, CDI, "HEURE", List.of(), () -> ""));
        e.add(new Entrada(CdiController.CHAVE_ESTADO_NOTA, CDI, "TEXTE", List.of(), () -> ""));

        return e;
    }

    /** A entrada de uma chave, se ela for declarada. */
    public java.util.Optional<Entrada> declarada(String chave) {
        return entradas().stream().filter(e -> e.chave().equals(chave)).findFirst();
    }

    /**
     * VALIDA um valor contra o TIPO declarado — e lanca se nao servir.
     *
     * ⚠️ EXISTE PORQUE O ECRA DE CONFIGURACAO E UM CAMINHO DE ESCRITA NOVO, e
     * um caminho de escrita novo que perde as guardas do antigo e uma porta
     * dos fundos. `PUT /api/admin/cdi/etat` recusa uma capacidade abaixo de 1;
     * sem isto, `PUT /api/admin/settings/magbo.cdi.capacidade` com «0» passava,
     * e o CDI declarava-se cheio para sempre. Releve pelo painel de 27/08.
     *
     * ⚠️ Vazio e SEMPRE valido: e «voltar ao default», que apaga a linha.
     */
    public void validar(Entrada e, String valor) {
        if (valor == null || valor.isBlank()) return;
        String v = valor.trim();
        switch (e.tipo()) {
            case "INT" -> {
                int n;
                try {
                    n = Integer.parseInt(v);
                } catch (NumberFormatException nfe) {
                    throw new IllegalArgumentException("valor nao numerico: " + v);
                }
                // Zero e negativo nao sao «desligado»: sao um teto impossivel.
                if (n < 1) throw new IllegalArgumentException("deve ser >= 1: " + v);
            }
            case "CHOIX" -> {
                if (!e.opcoes().contains(v)) {
                    throw new IllegalArgumentException("valor fora das opcoes: " + v);
                }
            }
            case "HEURE" -> {
                try {
                    java.time.LocalTime.parse(v);
                } catch (RuntimeException re) {
                    throw new IllegalArgumentException("hora invalida (HH:MM): " + v);
                }
            }
            default -> { /* TEXTE e CSV: texto livre, limitado pelo tamanho da coluna */ }
        }
    }

    /**
     * O catalogo COM os valores gravados — o que o ecra desenha.
     *
     * Cada linha traz `valor` (o que vale agora), `padrao` (o de fabrica),
     * `modificado` (ha linha gravada?), `updatedBy` e `updatedAt`. Sem linha
     * gravada, `valor` E `padrao` e os dois ultimos vem nulos: e o contrato
     * da V024 dito em JSON.
     */
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public List<Map<String, Object>> comValores() {
        // ⚠️ UMA leitura, nao duas. Duas `gravados()` em duas transacoes
        // separadas podiam divergir entre a primeira passagem e o laco dos
        // orfaos: uma chave gravada no intervalo aparecia «no default».
        var linhas = settingsService.gravados();
        Map<String, com.magbo.access.models.SystemSetting> gravados = new LinkedHashMap<>();
        linhas.forEach(s -> gravados.put(s.getChave(), s));

        List<Entrada> catalogo = entradas();
        java.util.Set<String> conhecidas = new java.util.HashSet<>();
        catalogo.forEach(x -> conhecidas.add(x.chave()));

        List<Map<String, Object>> out = new ArrayList<>();
        for (Entrada entrada : catalogo) {
            String padrao = entrada.padrao().get();
            var linha = gravados.get(entrada.chave());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("chave", entrada.chave());
            m.put("dominio", entrada.dominio());
            m.put("tipo", entrada.tipo());
            m.put("opcoes", entrada.opcoes());
            m.put("padrao", padrao);
            m.put("valor", linha == null ? padrao : linha.getValor());
            m.put("modificado", linha != null);
            m.put("updatedBy", linha == null ? null : linha.getUpdatedBy());
            m.put("updatedAt", linha == null ? null : String.valueOf(linha.getUpdatedAt()));
            out.add(m);
        }

        // ⚠️ E AS LINHAS ORFAS TAMBEM. Uma chave gravada que ja nao esta no
        // catalogo (property removida, chave mal escrita a mao na base) muda
        // ou nao muda nada, mas esta la: escondê-la seria deixar na base um
        // reglage que nenhum ecra consegue apagar.
        for (var s : linhas) {
            if (conhecidas.contains(s.getChave())) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("chave", s.getChave());
            m.put("dominio", "orphelins");
            m.put("tipo", "TEXTE");
            m.put("opcoes", List.of());
            m.put("padrao", null);
            m.put("valor", s.getValor());
            m.put("modificado", true);
            m.put("updatedBy", s.getUpdatedBy());
            m.put("updatedAt", String.valueOf(s.getUpdatedAt()));
            out.add(m);
        }
        return out;
    }
}
