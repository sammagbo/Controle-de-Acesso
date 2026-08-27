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
    @DisplayName("★★★ nenhum default escrito a mao no catalogo — TEXTO incluido")
    void defaultsVemDaFonte() throws IOException {
        String fonte = Files.readString(RAIZ.resolve("services/SettingsCatalog.java"));
        // ⚠️ A PRIMEIRA VERSAO SO OLHAVA PARA DIGITOS e por isso deixou passar
        // `() -> "OUVERT"` — uma copia do default que vive em `CdiController`.
        // O painel de 27/08 encontrou-a no proprio ficheiro que proibe a regra.
        // Um guarda que apanha metade dos casos ensina que a regra vale metade.
        //
        // A UNICA excecao e a string VAZIA: `""` nao e a copia de um default,
        // ela E o default («este campo nao tem valor de fabrica»).
        Matcher m = Pattern.compile("\\(\\)\\s*->\\s*\"([^\"]*)\"").matcher(fonte);
        List<String> literais = new ArrayList<>();
        while (m.find()) {
            if (!m.group(1).isEmpty()) literais.add(m.group(1));
        }
        assertThat(literais)
                .as("default escrito a mao no catalogo: tem de vir da MESMA fonte "
                        + "que o codigo que le a chave, senao o ecra mente sobre o valor de fabrica")
                .isEmpty();
    }

    @Test
    @DisplayName("★★★ toda chave `magbo.` declarada em codigo chama-se CHAVE_*")
    void convencaoDoNome() throws IOException {
        // ⚠️ O GUARDA DE CIMA ASSENTA NESTA CONVENCAO: ele resolve constantes
        // pelo padrao `CHAVE_[A-Z0-9_]+`. Uma constante chamada `K_TETO`
        // passaria despercebida e o reglage ficaria invisivel no ecra de
        // configuracao — exatamente o defeito que este ficheiro existe para
        // apanhar. Ponto cego apontado pelo painel de 27/08, fechado pela raiz.
        Pattern qualquerChave = Pattern.compile(
                "static\\s+final\\s+String\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*\"(magbo\\.[^\"]+)\"");
        List<String> foraDaConvencao = new ArrayList<>();
        for (Path p : fontes()) {
            Matcher m = qualquerChave.matcher(Files.readString(p));
            while (m.find()) {
                if (!m.group(1).startsWith("CHAVE_")) {
                    foraDaConvencao.add(p.getFileName() + ": " + m.group(1) + " = " + m.group(2));
                }
            }
        }
        assertThat(foraDaConvencao)
                .as("uma constante de chave que nao se chama CHAVE_* escapa ao guarda do "
                        + "catalogo, e o reglage torna-se invisivel no ecra de configuracao")
                .isEmpty();
    }
}
