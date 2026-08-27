package com.magbo.access.services;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * GARDE — toda chave lida pelo SettingsService esta no catalogo.
 *
 * O defeito que isto apanha: alguem acrescenta um reglage novo, le-o com
 * `settingsService.efetivoInt("magbo.qualquer.coisa", ...)`, e nao o declara.
 * O comportamento do sistema passa a depender de uma linha que NENHUM ecra
 * mostra e que ninguem consegue repor ao default — descobre-se meses depois,
 * a tentar perceber porque e que a VM se porta de maneira diferente do PC.
 *
 * ⚠️ Isto varre CODIGO-FONTE, como o `AccessLogRepositoryQueryGuardTest` varre
 * as consultas que o H2 nao executa. Nao prova que o ecra funciona; prova que
 * ninguem acrescentou um reglage invisivel.
 */
class SettingsCatalogGuardTest {

    /** `efetivo("chave", ...)` / `efetivoInt(...)` / `efetivoBool(...)` / `efetivoCsv(...)`. */
    private static final Pattern LITERAL = Pattern.compile(
            "efetivo(?:Int|Bool|Csv)?\\(\\s*\"([^\"]+)\"");
    /** A forma com constante: `efetivoInt(CHAVE_CAPACIDADE, ...)`. */
    private static final Pattern CONSTANTE = Pattern.compile(
            "efetivo(?:Int|Bool|Csv)?\\(\\s*([A-Za-z_][A-Za-z0-9_.]*\\.)?(CHAVE_[A-Z0-9_]+)");
    /** `public static final String CHAVE_X = "magbo...."` */
    private static final Pattern DECLARACAO = Pattern.compile(
            "String\\s+(CHAVE_[A-Z0-9_]+)\\s*=\\s*\"([^\"]+)\"");

    private static final Path RAIZ = Paths.get("src/main/java/com/magbo/access");

    private List<Path> fontes() throws IOException {
        try (Stream<Path> s = Files.walk(RAIZ)) {
            return s.filter(p -> p.toString().endsWith(".java"))
                    // o proprio servico e o catalogo nao contam
                    .filter(p -> !p.getFileName().toString().equals("SettingsService.java"))
                    .filter(p -> !p.getFileName().toString().equals("SettingsCatalog.java"))
                    .toList();
        }
    }

    @Test
    @DisplayName("★★★ toda chave lida em codigo esta declarada no catalogo")
    void nenhumReglageInvisivel() throws IOException {
        Map<String, String> constantes = new HashMap<>();
        List<String> lidas = new ArrayList<>();
        StringBuilder catalogoFonte = new StringBuilder(
                Files.readString(RAIZ.resolve("services/SettingsCatalog.java")));

        for (Path p : fontes()) {
            String txt = Files.readString(p);
            Matcher d = DECLARACAO.matcher(txt);
            while (d.find()) constantes.put(d.group(1), d.group(2));
            Matcher l = LITERAL.matcher(txt);
            while (l.find()) lidas.add(l.group(1));
            Matcher c = CONSTANTE.matcher(txt);
            while (c.find()) lidas.add("@" + c.group(2));   // resolvida abaixo
        }

        // resolve as constantes para o seu valor
        Set<String> chaves = new TreeSet<>();
        for (String bruta : lidas) {
            if (bruta.startsWith("@")) {
                String valor = constantes.get(bruta.substring(1));
                assertThat(valor)
                        .as("constante %s usada mas nao declarada — o teste nao a soube resolver", bruta)
                        .isNotNull();
                chaves.add(valor);
            } else {
                chaves.add(bruta);
            }
        }

        assertThat(chaves)
                .as("o teste deve ter encontrado chaves; zero significa que a varredura partiu")
                .isNotEmpty();

        List<String> ausentes = chaves.stream()
                // ⚠️ Pelo NOME da chave no ficheiro do catalogo: a lista e
                // construida com constantes (`CdiController.CHAVE_CAPACIDADE`),
                // logo procuramos a chave OU a constante que a nomeia.
                .filter(k -> {
                    if (catalogoFonte.indexOf("\"" + k + "\"") >= 0) return false;
                    for (var e : constantes.entrySet()) {
                        if (e.getValue().equals(k) && catalogoFonte.indexOf(e.getKey()) >= 0) return false;
                    }
                    return true;
                })
                .toList();

        assertThat(ausentes)
                .as("estas chaves sao lidas pelo codigo mas NAO estao no SettingsCatalog: "
                        + "mudam o comportamento do sistema e nenhum ecra as mostra nem as repoe")
                .isEmpty();
    }

    @Test
    @DisplayName("★★ nenhum default escrito a mao no catalogo")
    void defaultsVemDaFonte() throws IOException {
        String fonte = Files.readString(RAIZ.resolve("services/SettingsCatalog.java"));
        // Um default numerico escrito como literal (`() -> "50"`) e a segunda
        // verdade que este ficheiro existe para nao criar. As strings vazias e
        // os valores de CHOIX sao legitimos: sao o default, nao uma copia dele.
        Matcher m = Pattern.compile("\\(\\)\\s*->\\s*\"(\\d+)\"").matcher(fonte);
        List<String> literais = new ArrayList<>();
        while (m.find()) literais.add(m.group(1));
        assertThat(literais)
                .as("default numerico escrito a mao no catalogo: tem de vir da MESMA fonte "
                        + "que o codigo que le a chave, senao o ecra mente sobre o valor de fabrica")
                .isEmpty();
    }
}
