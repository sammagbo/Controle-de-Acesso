package com.magbo.access.controllers;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * GUARDA DE STRING SOBRE O @PreAuthorize DO ×.
 *
 * ⚠️ POR QUE UMA GUARDA DE TEXTO, e nao um teste que exercite a regra. O gate
 * do Spring so age dentro de um contexto com seguranca ligada; nos testes de
 * unidade o metodo do controller e chamado DIRETAMENTE e o @PreAuthorize e
 * inerte. Um teste de unidade verde nao prova autorizacao nenhuma — apagar a
 * anotacao inteira nao quebraria nada aqui, e o endpoint ficaria aberto a
 * qualquer conta autenticada sem nenhum sinal. Mesmo raciocinio do
 * `AccessLogRepositoryQueryGuardTest`, que inspeciona o SQL das consultas que
 * a suite nao executa.
 *
 * ⚠️ O QUE ESTA GUARDA PROTEGE, e a segunda metade e a que costuma cair:
 *
 *   1. a PERMISSAO — estar autenticado nao basta;
 *   2. o PONTO — `@areaSecurity.can(#pointId)`, avaliado sobre o ponto QUE VEM
 *      NO PEDIDO. A permissao granular e GLOBAL: quem a tivesse, sem esta
 *      metade, retiraria linhas de qualquer ponto do sistema. Um operador da
 *      cantina nao pode esconder uma linha do CDI nem da portaria.
 *
 * Uma guarda que so procurasse "CANTINE_REMOVAL_WRITE" no arquivo passaria com
 * a metade do ponto removida — por isso as duas sao exigidas na MESMA
 * expressao, e por isso o teste le a expressao de cada metodo de escrita em vez
 * de procurar texto solto no ficheiro.
 */
@DisplayName("CantineRemovalController — o gate de autorizacao nao pode encolher")
class CantineRemovalAuthorizationGuardTest {

    private static final Path FONTE = Path.of(
            "src/main/java/com/magbo/access/controllers/CantineRemovalController.java");

    private static String fonte() throws Exception {
        assertThat(Files.exists(FONTE))
                .as("o controller mudou de sitio — esta guarda deixou de proteger o que dizia proteger")
                .isTrue();
        return Files.readString(FONTE);
    }

    /**
     * As expressoes @PreAuthorize dos metodos de ESCRITA.
     *
     * ⚠️ Le por BLOCO DE ANOTACOES, e nao com um regex que salta do
     * @PreAuthorize ate ao `public`. A primeira versao fazia isso e devolveu
     * ZERO por duas razoes ao mesmo tempo: o @PostMapping vem ANTES do
     * @PreAuthorize no ficheiro, e o `([\s\S]*?)\)` nao-guloso fechava no
     * primeiro parentesis — o de `hasRole('ADMIN')` — em vez de no fim da
     * expressao. Quem apanhou foi o teste `cenario`, e e exatamente para isso
     * que ele existe: sem ele, um parser partido devolve lista vazia e todos os
     * `for` abaixo passam sem verificar nada.
     */
    private static List<String> gatesDeEscrita(String src) {
        List<String> achados = new java.util.ArrayList<>();
        // Cada bloco de anotacoes e o texto entre uma declaracao `public` e a
        // anterior. Assim a ordem das anotacoes deixa de importar.
        Matcher m = Pattern.compile("\\n    public ").matcher(src);
        int inicio = src.indexOf('{');
        while (m.find()) {
            String bloco = src.substring(inicio, m.start());
            inicio = m.end();
            if (!bloco.contains("@PostMapping") && !bloco.contains("@DeleteMapping")
                    && !bloco.contains("@PutMapping") && !bloco.contains("@PatchMapping")) continue;
            int i = bloco.indexOf("@PreAuthorize(");
            if (i < 0) {
                achados.add("");   // escrita SEM gate nenhum: falha nos testes abaixo
                continue;
            }
            // Do @PreAuthorize ao fim do bloco, sem a sintaxe de String do Java
            // (aspas e o `+` da concatenacao), para que uma expressao partida em
            // varias linhas seja lida como uma so.
            achados.add(bloco.substring(i + "@PreAuthorize(".length())
                    .replace("\"", "").replace("+", "")
                    .replaceAll("\\s+", " ").trim());
        }
        return achados;
    }

    @Test
    @DisplayName("o cenario faz sentido (ha metodos de escrita com gate)")
    void cenario() throws Exception {
        assertThat(gatesDeEscrita(fonte()))
                .as("nenhum metodo de escrita com @PreAuthorize encontrado — o parser quebrou, "
                        + "nao e que esteja tudo certo")
                .hasSizeGreaterThanOrEqualTo(2);
    }

    @Test
    @DisplayName("★★★ TODA escrita exige a PERMISSAO — autenticado nao basta")
    void todaEscritaExigeAPermissao() throws Exception {
        for (String gate : gatesDeEscrita(fonte())) {
            assertThat(gate)
                    .as("gate sem a permissao granular: %s", gate)
                    .contains("CANTINE_REMOVAL_WRITE");
            assertThat(gate)
                    .as("gate sem o escape do ADMIN: %s", gate)
                    .contains("hasRole('ADMIN')");
        }
    }

    @Test
    @DisplayName("★★★ TODA escrita exige o direito sobre O PONTO DO PEDIDO — e nao sobre uma area fixa")
    void todaEscritaExigeODireitoSobreOPonto() throws Exception {
        for (String gate : gatesDeEscrita(fonte())) {
            // `#pointId` e nao `'cantine'`: a area fixa autorizaria qualquer
            // ponto do sistema a quem tivesse a cantina, que e o contrario do
            // que se quer.
            assertThat(gate.replace(" ", ""))
                    .as("gate sem @areaSecurity.can(#pointId): %s", gate)
                    .contains("@areaSecurity.can(#pointId)");
        }
    }

    @Test
    @DisplayName("★★★ as duas metades sao um E, nunca um OU")
    void asDuasMetadesSaoUmE() throws Exception {
        for (String gate : gatesDeEscrita(fonte())) {
            String semEspaco = gate.replace(" ", "");
            // Um `or` no topo faria a permissao global sozinha autorizar
            // qualquer ponto — exatamente o defeito que a metade do ponto
            // existe para fechar. O `or` legitimo (ADMIN OU permissao) vive
            // DENTRO dos parenteses, e por isso o que se exige e o `and` a
            // ligar o grupo ao can(#pointId).
            assertThat(semEspaco)
                    .as("as duas metades precisam de estar ligadas por 'and': %s", gate)
                    .contains(")and@areaSecurity.can(#pointId)");
        }
    }

    @Test
    @DisplayName("★★ a LEITURA continua por area — quem ve o efeito precisa de ver a explicacao")
    void leituraContinuaPorArea() throws Exception {
        String src = fonte();
        assertThat(src.replaceAll("\\s+", " "))
                .as("o GET deixou de ser por area; esconder a explicacao de quem ve o efeito "
                        + "faz a retirada parecer um defeito do sistema")
                .contains("@PreAuthorize(\"@areaSecurity.can('cantine')\")");
    }
}
