package com.magbo.access.services;

import com.magbo.access.config.AreaMapping;
import com.magbo.access.models.CantineRemoval;
import com.magbo.access.repositories.CantineRemovalRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * RETIRAR E DEVOLVER UMA LINHA DO MONITEUR CANTINE.
 *
 * Ver {@link CantineRemoval} para o que esta tabela e (um gesto de ecra) e para
 * o que ela deliberadamente NAO faz (tocar em `access_logs`, fechar presenca do
 * PPMS, mexer em relatorios).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CantineRemovalService {

    private final CantineRemovalRepository repository;

    /**
     * O relogio DA ESCOLA — e o fuso NAO e detalhe, e a regra outra vez.
     *
     * ⚠️ `Clock.systemDefaultZone()` ESTAVA ERRADO AQUI, e foi medido: o
     * container do backend sobe SEM `TZ` no `deploy/docker-compose.yml`, logo
     * em UTC. Com ele, uma retirada feita as 14h26 de Brasilia ficava gravada
     * como 17h26 — TRES HORAS NO FUTURO em relacao as passagens, que
     * `EventTimeResolver` grava em America/Sao_Paulo.
     *
     * O estrago nao seria um carimbo torto num relatorio: `removidoEm` decide
     * O QUE FICA ESCONDIDO (so as passagens ANTERIORES a ele). Adiantado tres
     * horas, o × deixava de esconder uma linha e passava a calar a pessoa pelas
     * tres horas seguintes — inclusive entradas que ainda nao tinham
     * acontecido. Era exatamente a regra que este servico existe para NAO
     * quebrar, quebrada pelo fuso do container.
     *
     * E o `dia` tem o mesmo problema com outra cara: das 21h a meia-noite de
     * Brasilia o UTC ja e o dia seguinte, e a retirada nasceria carimbada
     * amanha. A cantina nao serve a essa hora, mas correcao nao pode depender
     * do horario de funcionamento.
     *
     * ⚠️ NAO e `final`: um `final` com inicializador fica de fora do construtor
     * gerado pelo Lombok E resiste a reflexao no Java 17, entao o teste nao
     * teria como o trocar. Sem isso, uma suite que corresse perto da meia-noite
     * passaria a falhar sozinha — e um teste cujo resultado depende da hora a
     * que alguem o roda nao prova nada (licao do `RegimeGateWiringTest`).
     */
    private Clock clock = Clock.system(EventTimeResolver.ZONA_ESCOLA);

    /** So pontos da cantina. Ver {@link #exigirPontoDaCantina}. */
    public static boolean ehPontoDaCantina(String pointId) {
        return pointId != null && "cantine".equals(AreaMapping.areaForPoint(pointId.trim().toUpperCase()));
    }

    /**
     * Retira a linha, ou reativa a retirada que ja existia.
     *
     * ⚠️ O INSTANTE E DE AGORA, NAO DA PASSAGEM. Aqui nao se mede duracao
     * nenhuma nem se julga uma passagem: regista-se o momento em que uma pessoa
     * carregou num botao. E esse instante que decide o que fica escondido —
     * so o que ja tinha acontecido quando ela decidiu. (E a excecao inversa a
     * do regime, que usa a hora do EVENTO justamente por julgar a passagem.)
     */
    @Transactional
    public CantineRemoval retirar(String userId, String pointId, String motivo, String removidoPor) {
        String pessoa = exigirTexto(userId, "userId");
        String ponto = exigirPontoDaCantina(pointId);
        String autor = exigirTexto(removidoPor, "removidoPor");

        LocalDate dia = LocalDate.now(clock);
        LocalDateTime agora = LocalDateTime.now(clock);

        CantineRemoval linha = repository.findByUserIdAndPointIdAndDia(pessoa, ponto, dia)
                .orElseGet(() -> CantineRemoval.builder()
                        .userId(pessoa).pointId(ponto).dia(dia).build());

        linha.setRemovidoEm(agora);
        linha.setRemovidoPor(autor);
        linha.setMotivo(vazioViraNulo(motivo));
        // Retirar de novo REABRE a linha: um «desfazer» antigo nao pode deixar
        // a retirada nova nascer ja desfeita.
        linha.setDesfeitoEm(null);
        linha.setDesfeitoPor(null);

        CantineRemoval salvo = repository.save(linha);
        // Matricula e ponto, nunca o nome: o log nao tem a protecao do banco.
        log.info("Cantine: linha retirada do monitor — pessoa={} ponto={} por={}", pessoa, ponto, autor);
        return salvo;
    }

    /**
     * Desfaz a retirada. Idempotente: desfazer o que ja estava desfeito nao e
     * erro — dois operadores podem carregar no mesmo botao.
     */
    @Transactional
    public Optional<CantineRemoval> desfazer(String userId, String pointId, String desfeitoPor) {
        String pessoa = exigirTexto(userId, "userId");
        String ponto = exigirPontoDaCantina(pointId);
        String autor = exigirTexto(desfeitoPor, "desfeitoPor");

        Optional<CantineRemoval> achado =
                repository.findByUserIdAndPointIdAndDia(pessoa, ponto, LocalDate.now(clock));
        achado.ifPresent(linha -> {
            if (linha.isAtiva()) {
                linha.setDesfeitoEm(LocalDateTime.now(clock));
                linha.setDesfeitoPor(autor);
                repository.save(linha);
                log.info("Cantine: retirada desfeita — pessoa={} ponto={} por={}", pessoa, ponto, autor);
            }
        });
        return achado;
    }

    /** As retiradas ATIVAS de hoje, que e o que a tela consome. */
    @Transactional(readOnly = true)
    public List<CantineRemoval> ativasDeHoje() {
        return repository.findByDiaAndDesfeitoEmIsNull(LocalDate.now(clock));
    }

    /**
     * ⚠️ A SEGUNDA METADE DA AUTORIZACAO, e ela vive aqui e nao so no
     * @PreAuthorize.
     *
     * O gate do controller ja exige a permissao E o direito sobre o ponto
     * (`@areaSecurity.can(#pointId)`). Isto recusa um ponto que nao seja da
     * cantina de todo: sem esta guarda, um ADMIN — que passa em qualquer
     * verificacao de area — poderia registar a retirada de uma linha do CDI ou
     * da portaria numa tabela que nenhuma dessas telas le, e a linha ficaria
     * escondida em lado nenhum. Um registo que nao produz efeito e um registo
     * que engana quem o for ler.
     */
    private static String exigirPontoDaCantina(String pointId) {
        String ponto = exigirTexto(pointId, "pointId").toUpperCase();
        if (!ehPontoDaCantina(ponto)) {
            throw new IllegalArgumentException(
                    "ponto fora da cantina: " + ponto + " (esta tela so retira linhas de REFEI*/CANTINA*)");
        }
        return ponto;
    }

    private static String exigirTexto(String valor, String campo) {
        if (valor == null || valor.isBlank()) {
            throw new IllegalArgumentException(campo + " obrigatorio");
        }
        return valor.trim();
    }

    private static String vazioViraNulo(String s) {
        if (s == null) return null;
        String t = s.trim();
        if (t.isEmpty()) return null;
        return t.length() > 255 ? t.substring(0, 255) : t;
    }
}
