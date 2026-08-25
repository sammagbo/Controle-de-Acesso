package com.magbo.access.controllers;

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
 * TODO ENDPOINT TEM DE TER UMA DECISAO DE AUTORIZACAO — ESCRITA OU LEITURA.
 *
 * ⚠️ POR QUE ISTO EXISTE. O `CantineRemovalAuthorizationGuardTest` so olhava
 * metodos de ESCRITA, e de UM controller. Consequencia medida: um endpoint de
 * LEITURA novo pode nascer guardado por permissao e ninguem repara se alguem
 * apagar a anotacao — o `@PreAuthorize` e inerte em teste unitario, o metodo
 * continua a devolver os dados, e a suite fica verde. Uma leitura mal guardada
 * nao estoura: ela entrega.
 *
 * ⚠️ E POR QUE UM INVENTARIO E NAO UMA HEURISTICA. Tentar adivinhar «este
 * metodo devolve dados de pessoas?» pelo tipo de retorno erra nos dois
 * sentidos, e um guarda que erra a favor deixa passar exatamente o caso que
 * interessa. Aqui a regra e mecanica: **todo** endpoint ou tem guarda propria
 * mais forte que `isAuthenticated()`, ou esta NOMEADO numa das tres listas
 * abaixo. Um endpoint novo que nao esteja em nenhuma faz este teste ficar
 * vermelho — e quem o escreveu tem de decidir, por escrito, em que caixa ele
 * cai. Essa e a unica parte que nao se pode esquecer de fazer.
 *
 * ⚠️ AS LISTAS SAO A DOCUMENTACAO. `DIVIDA_CONHECIDA` nao e uma excecao para
 * calar o teste: e o registo, com nome e motivo, do que esta sob-guardado hoje.
 * Estava assim antes deste teste; passa a estar assim VISIVELMENTE.
 */
@DisplayName("Autorizacao — todo endpoint tem uma decisao, e ela esta escrita")
class ControllerAuthorizationGuardTest {

    private static final Path DIR =
            Path.of("src/main/java/com/magbo/access/controllers");

    // ── 1. PUBLICOS POR DESENHO ─────────────────────────────────────────
    /** Sem autenticacao nenhuma, e com razao. `permitAll` no SecurityConfig. */
    private static final Map<String, String> PUBLICO_POR_DESENHO = Map.of(
            "AuthController.login", "e o proprio login: exigir token para obter token nao fecha",
            "AuthController.me", "identidade do portador do token; sem token nao ha resposta a dar",
            "HealthController.health", "sonda de saude, lida pelo deploy antes de existir sessao",
            "HikvisionWebhookController.receiveWebhook",
            "guardado por TOKEN no header/query, nao por sessao: quem chama e um aparelho",
            "HikvisionWebhookController.receiveWebhookPathToken",
            "idem, com o token no caminho (a DeepinView descarta a query string)",
            "HikvisionWebhookController.captureWebhook",
            "ferramenta de BANCADA; nunca apontar aparelho de producao para ela (escreve o corpo no log)",
            "PasswordResetRequestController.criar",
            "nasce de quem NAO consegue entrar; exigir sessao tornaria o pedido impossivel");

    // ── 2. AUTENTICADO POR DECISAO ──────────────────────────────────────
    /**
     * `isAuthenticated()` E o nivel pretendido, e ha uma razao escrita.
     * ⚠️ Distinto da divida: aqui alguem decidiu; ali alguem nao decidiu ainda.
     */
    private static final Map<String, String> AUTENTICADO_POR_DECISAO = Map.of(
            "UserPhotoController.photo",
            "decisao registada em .claude/rules/backend.md: a foto e lida por FETCH com token "
                    + "(nunca <img src>), com ETag e Cache-Control private. Fecha-la por area "
                    + "quebraria o PersonPhoto de todas as telas; abri-la publicaria um catalogo "
                    + "de rostos de criancas na rede da escola",
            "AccessController.reportConfig",
            "devolve NUMEROS de configuracao (piso de visita, horarios da cantina). Nenhum dado "
                    + "de pessoa nem de passagem",
            "TotvsLinkController.config",
            "devolve a URL-modelo do TOTVS. Nenhum dado de pessoa",
            "AccessController.countAllLogs",
            "devolve UMA contagem agregada, sem nome nem ponto nem hora");

    // ── 3. DIVIDA CONHECIDA ─────────────────────────────────────────────
    /**
     * ⚠️ ENDPOINTS SENSIVEIS SOB-GUARDADOS. Devolvem dados de PESSOAS ou de
     * PASSAGENS a qualquer conta autenticada — incluindo um operador de setor
     * que so deveria ver o setor dele.
     *
     * ⚠️ NAO MEXER SEM DECISAO DO SAM. Apertar qualquer um destes quebra telas
     * hoje em producao (o `userCache` de todas as vistas passa pelo
     * `/api/users`, e o Journal pelo `/api/access/logs/*`). Este teste NAO os
     * conserta: ele impede que o estado deles volte a ser um esquecimento em
     * vez de uma escolha.
     *
     * Ordem de dor, se um dia se apertar: primeiro os logs (passagens de
     * criancas por ponto e hora), depois a busca de pessoas.
     */
    private static final Map<String, String> DIVIDA_CONHECIDA = Map.of(
            "AccessController.getLogsByPoint",
            "SEM anotacao nenhuma: cai no anyRequest().authenticated(). Devolve as passagens de "
                    + "um ponto — quem passou, a que horas. Usado pelo SectorView e pelo Journal",
            "AccessController.getAllRecentLogs",
            "SEM anotacao: passagens de TODOS os pontos. E o alimento do Journal",
            "AccessController.registerAccess",
            "SEM anotacao, e e ESCRITA: lancamento manual de passagem. Fica `created_by_user` no "
                    + "registo, que diz quem fez mas nao impede ninguem",
            "UserController.searchStudents",
            "busca de alunos por nome, a qualquer conta autenticada",
            "UserController.getUserById",
            "ficha de uma pessoa por id, a qualquer conta autenticada",
            "UserController.searchUsers",
            "busca de pessoas (todos os tipos), a qualquer conta autenticada",
            "UserController.listActiveUsers",
            "lista de pessoas ativas: e a fonte do userCache de todas as telas");

    // ── o parser ────────────────────────────────────────────────────────

    private record Endpoint(String classe, String metodo, String guarda) {
        String chave() { return classe + "." + metodo; }
    }

    private static String semComentarios(String t) {
        return t.replaceAll("(?s)/\\*.*?\\*/", "").replaceAll("(?m)//.*$", "");
    }

    /** A expressao de um @PreAuthorize, sem a sintaxe de String do Java. */
    private static String preAuthorizeDe(String bloco) {
        int i = bloco.indexOf("@PreAuthorize(");
        if (i < 0) return null;
        String resto = bloco.substring(i + "@PreAuthorize(".length());
        int prof = 1, fim = -1;
        for (int j = 0; j < resto.length(); j++) {
            char c = resto.charAt(j);
            if (c == '(') prof++;
            else if (c == ')') { prof--; if (prof == 0) { fim = j; break; } }
        }
        if (fim < 0) return null;
        return resto.substring(0, fim).replace("\"", "").replace("+", "")
                .replaceAll("\\s+", " ").trim();
    }

    private static List<Endpoint> inventario() throws IOException {
        List<Endpoint> out = new ArrayList<>();
        try (Stream<Path> fs = Files.list(DIR)) {
            for (Path p : fs.filter(x -> x.toString().endsWith(".java")).sorted().toList()) {
                String src = semComentarios(Files.readString(p));
                String classe = p.getFileName().toString().replace(".java", "");

                int iClasse = src.indexOf("public class");
                if (iClasse < 0) continue;
                String guardaClasse = preAuthorizeDe(src.substring(0, iClasse));

                String corpo = src.substring(iClasse);
                String[] pedacos = corpo.split("\\n    public ");
                for (int k = 1; k < pedacos.length; k++) {
                    String anotacoes = pedacos[k - 1];
                    int ult = anotacoes.lastIndexOf("\n\n");
                    String bloco = ult > 0 ? anotacoes.substring(ult) : anotacoes;
                    if (!Pattern.compile("@(Get|Post|Put|Delete|Patch)Mapping").matcher(bloco).find()) {
                        continue;
                    }
                    Matcher mn = Pattern.compile("([A-Za-z0-9_]+)\\s*\\(")
                            .matcher(pedacos[k].split("\\{")[0]);
                    String nome = mn.find() ? mn.group(1) : "?";
                    String guarda = preAuthorizeDe(bloco);
                    if (guarda == null) guarda = guardaClasse;
                    out.add(new Endpoint(classe, nome, guarda));
                }
            }
        }
        return out;
    }

    /** Uma guarda que decide ALGO alem de «tem token». */
    private static boolean guardaReal(String g) {
        if (g == null || g.isBlank()) return false;
        String s = g.replace(" ", "");
        return s.contains("hasRole(") || s.contains("@areaSecurity.");
    }

    // ── os testes ───────────────────────────────────────────────────────

    @Test
    @DisplayName("o cenario faz sentido (o parser ve os endpoints e as guardas)")
    void cenario() throws Exception {
        List<Endpoint> eps = inventario();
        assertThat(eps.size())
                .as("parser partido devolve pouco e todos os `for` abaixo passam sem verificar nada")
                .isGreaterThan(80);
        assertThat(eps.stream().filter(e -> guardaReal(e.guarda())).count())
                .as("nenhuma guarda reconhecida — o extrator do @PreAuthorize partiu")
                .isGreaterThan(60);
        // A guarda de CLASSE tem de ser vista: sem isso, seis controllers
        // inteiros pareceriam desprotegidos e as listas encheriam-se de ruido.
        assertThat(eps.stream().anyMatch(e -> e.classe().equals("SystemUserController")
                && guardaReal(e.guarda())))
                .as("guarda ao nivel da CLASSE nao foi lida")
                .isTrue();
    }

    @Test
    @DisplayName("★★★ TODO endpoint tem guarda propria OU esta nomeado numa das tres listas")
    void todoEndpointTemUmaDecisao() throws Exception {
        List<String> semDecisao = new ArrayList<>();
        for (Endpoint e : inventario()) {
            if (guardaReal(e.guarda())) continue;
            String k = e.chave();
            if (PUBLICO_POR_DESENHO.containsKey(k)) continue;
            if (AUTENTICADO_POR_DECISAO.containsKey(k)) continue;
            if (DIVIDA_CONHECIDA.containsKey(k)) continue;
            semDecisao.add(k + "  (guarda: " + (e.guarda() == null ? "NENHUMA" : e.guarda()) + ")");
        }
        assertThat(semDecisao)
                .as("Endpoints sem decisao de autorizacao escrita:%n  %s%n%nOu poe uma guarda "
                        + "(hasRole / @areaSecurity), ou acrescenta-o a UMA das tres listas no topo "
                        + "deste ficheiro, COM O MOTIVO. Uma leitura mal guardada nao estoura: "
                        + "ela entrega.", String.join("\n  ", semDecisao))
                .isEmpty();
    }

    @Test
    @DisplayName("★★★ as LEITURAS guardadas por permissao continuam guardadas (o caso que faltava)")
    void leiturasPorPermissaoContinuamGuardadas() throws Exception {
        // ⚠️ O ponto cego que motivou este ficheiro: uma leitura atras de uma
        // permissao granular. Se alguem apagar o @PreAuthorize, o metodo
        // continua a devolver os dados e nada estoura. Nomeados um a um: uma
        // regra generica «leituras tem de ter guarda» nao apanharia a diferenca
        // entre uma guarda de AREA e uma de PERMISSAO, e e a segunda que estes
        // dados exigem — atravessam a escola inteira.
        Map<String, String> exigidas = Map.of(
                "PpmsController.quemEstaDentro", "PPMS_READ",
                "MealSlotController.grade", "cantine",
                "MealSlotController.doAluno", "cantine",
                "ParcoursController.buscar", "PARCOURS_READ",
                "ParcoursController.parcours", "PARCOURS_READ");

        Map<String, Endpoint> porChave = new HashMap<>();
        for (Endpoint e : inventario()) porChave.put(e.chave(), e);

        List<String> problemas = new ArrayList<>();
        int vistos = 0;
        for (var ex : exigidas.entrySet()) {
            Endpoint e = porChave.get(ex.getKey());
            // ⚠️ Ausente = ainda nao mergeado (MealSlot/Parcours chegam com as
            // branches da noite de 25/08). Nao e falha: e um lembrete que passa
            // a morder no minuto em que o ficheiro entrar na main.
            if (e == null) continue;
            vistos++;
            if (!guardaReal(e.guarda())) {
                problemas.add(ex.getKey() + " perdeu a guarda");
            } else if (!e.guarda().contains(ex.getValue())) {
                problemas.add(ex.getKey() + " deixou de exigir " + ex.getValue()
                        + " (guarda actual: " + e.guarda() + ")");
            }
        }
        assertThat(vistos)
                .as("nenhuma das leituras nomeadas existe neste checkout — se isto acontecer na "
                        + "main depois dos merges, o teste esta a proteger o vazio")
                .isGreaterThan(0);
        assertThat(problemas).isEmpty();
    }

    @Test
    @DisplayName("★★ a DIVIDA esta declarada com motivo, e nao cresceu em silencio")
    void dividaDeclaradaENaoCrescida() {
        // ⚠️ O tamanho da divida e uma asercao. Acrescentar uma linha aqui e
        // legitimo — mas obriga a mudar este numero, e portanto a olhar para
        // ela. Um mapa que so cresce e uma lista de desculpas.
        assertThat(DIVIDA_CONHECIDA)
                .as("a divida conhecida mudou de tamanho: foi uma decisao ou um descuido?")
                .hasSize(7);
        DIVIDA_CONHECIDA.forEach((k, motivo) ->
                assertThat(motivo).as("divida sem motivo escrito: %s", k).hasSizeGreaterThan(30));
        PUBLICO_POR_DESENHO.forEach((k, motivo) ->
                assertThat(motivo).as("publico sem motivo escrito: %s", k).hasSizeGreaterThan(20));
        AUTENTICADO_POR_DECISAO.forEach((k, motivo) ->
                assertThat(motivo).as("decisao sem motivo escrito: %s", k).hasSizeGreaterThan(30));
    }

    @Test
    @DisplayName("★★ nenhuma das tres listas nomeia um endpoint que ja nao existe")
    void listasNaoEnvelhecem() throws Exception {
        // Uma lista que nomeia metodos apagados da a impressao de cobrir mais
        // do que cobre — e esconde que a divida real e outra.
        Set<String> existentes = new HashSet<>();
        for (Endpoint e : inventario()) existentes.add(e.chave());

        List<String> fantasmas = new ArrayList<>();
        for (String k : PUBLICO_POR_DESENHO.keySet()) if (!existentes.contains(k)) fantasmas.add(k);
        for (String k : AUTENTICADO_POR_DECISAO.keySet()) if (!existentes.contains(k)) fantasmas.add(k);
        for (String k : DIVIDA_CONHECIDA.keySet()) if (!existentes.contains(k)) fantasmas.add(k);

        assertThat(fantasmas)
                .as("Nomeados nas listas mas inexistentes no codigo: %s. Ou o metodo mudou de nome "
                        + "(e a decisao deixou de valer), ou foi apagado (e a linha sobra).", fantasmas)
                .isEmpty();
    }
}
