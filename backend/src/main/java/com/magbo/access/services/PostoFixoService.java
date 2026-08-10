package com.magbo.access.services;

import com.magbo.access.repositories.AccessLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * POSTO FIXO — quem TRABALHA no ponto, em vez de passar por ele.
 *
 * Producao, 10/08/2026: o porteiro e as pessoas da Vie Scolaire que ficam de pe
 * no portao sao reconhecidos pela camera dezenas de vezes por dia — entrada,
 * saida, entrada. A tela do Portail e os contadores enchiam de ruido, e o
 * numero de movimentos do dia deixou de significar alguma coisa.
 *
 * As tres camadas de dedup que ja existem NAO resolvem isto, e nenhuma delas
 * deveria:
 *   • {@link WebhookIngestionDedupService} — o aparelho reenviou o MESMO
 *     pacote. Aqui os pacotes sao diferentes.
 *   • {@link DeduplicationService} — segunda refeicao no mesmo dia. Outro
 *     assunto.
 *   • {@link SamePassageService} — a mesma face lida duas vezes em SEGUNDOS.
 *     Estas repeticoes estao a minutos umas das outras e sao passagens fisicas
 *     reais; alargar a janela dos 30s para alcanca-las apagaria a entrada e a
 *     saida legitimas de todo mundo.
 *
 * O que esta classe faz e diferente das tres: nao descarta nada. Toda passagem
 * continua GRAVADA. A primeira do dia naquele ponto fica normal; da segunda em
 * diante a linha recebe a flag POSTO_FIXO, que a tira das telas padrao e dos
 * contadores — e so isso. O Journal (auditoria) continua listando todas.
 *
 * ── Regra, em uma frase ─────────────────────────────────────────────
 * A pessoa tem um ponto de posto fixo; no ponto IGUAL a esse, a partir da
 * segunda passagem do dia, a linha e marcada. Em QUALQUER outro ponto nada
 * muda — o porteiro que vai ao CDI e contado como qualquer pessoa.
 *
 * ── Dia = dia do EVENTO ─────────────────────────────────────────────
 * A fronteira do dia sai de {@code eventTime}, o mesmo relogio que vai para
 * {@code access_logs.timestamp} desde 8d78f41. Usar a hora da DECISAO faria a
 * fila offline esvaziada de madrugada comparar a meia-noite errada e marcar (ou
 * deixar de marcar) por causa do horario em que o servidor voltou.
 *
 * ── Onde a regra NAO roda ───────────────────────────────────────────
 * Lancamento MANUAL (POST /api/access, com created_by_user) nao passa por
 * aqui: ele nao passa pelo webhook, e a convencao do projeto e que as regras
 * de janela vivem so no webhook (a mesma inconsistencia conhecida I1 do
 * FORA_HORARIO). Na pratica nao faz falta — o ruido vem da camera, que
 * reconhece sozinha; o operador nao registra o porteiro quarenta vezes a mao.
 * Se um dia registrar, a linha entra sem flag e conta, que e o comportamento
 * conservador certo: nao esconder o que alguem digitou de proposito.
 *
 * ⚠️ Consequencia aceita da chegada FORA DE ORDEM: se a fila entregar a
 * passagem das 14h antes da das 08h, a das 14h e que fica sem flag e a das 08h
 * recebe. Continua valendo o que a regra promete — UMA passagem do dia sem
 * flag, e nenhuma perdida —, mas nao ha garantia de que a nao-marcada seja a
 * cronologicamente primeira. Corrigir isso exigiria reescrever uma linha ja
 * gravada, e este sistema nao reescreve registro de passagem.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PostoFixoService {

    /**
     * Marca da repeticao de quem esta de servico no ponto.
     *
     * Mesmo campo {@code access_logs.flag} de FORA_HORARIO, EXCEDEU_TEMPO e
     * FECHAMENTO_AUTO: String livre de ate 32 caracteres, aditiva, UPPER_SNAKE.
     */
    public static final String FLAG_POSTO_FIXO = "POSTO_FIXO";

    private final AccessLogRepository accessLogRepository;

    /**
     * Esta passagem e uma repeticao no posto fixo da pessoa?
     *
     * @param userId          pessoa ja identificada
     * @param postoFixoPointId ponto onde ela fica postada (null = ninguem tem
     *                         posto fixo por padrao, e o metodo sai na hora)
     * @param pointId         ponto DESTA passagem
     * @param eventTime       hora do EVENTO — define o dia
     * @return {@link #FLAG_POSTO_FIXO} quando ja existe passagem da pessoa
     *         naquele ponto no mesmo dia; {@code null} em todo o resto (e
     *         {@code null} e o valor historico da coluna, entao nao marcar e
     *         literalmente nao mudar nada)
     */
    public String flagDaRepeticao(String userId, String postoFixoPointId,
                                  String pointId, LocalDateTime eventTime) {
        if (!ehPostoFixoDaPessoa(postoFixoPointId, pointId)) return null;
        if (userId == null || userId.isBlank() || eventTime == null) return null;

        LocalDate dia = eventTime.toLocalDate();
        boolean jaPassouHoje = accessLogRepository.existsByUserIdAndPointIdAndTimestampBetween(
                userId, pointId, dia.atStartOfDay(), dia.atTime(LocalTime.MAX));

        if (!jaPassouHoje) return null;

        log.debug("Posto fixo: repeticao de {} em {} no dia {} — gravada com flag {}",
                userId, pointId, dia, FLAG_POSTO_FIXO);
        return FLAG_POSTO_FIXO;
    }

    /**
     * O ponto desta passagem e exatamente o posto da pessoa?
     *
     * Comparacao por igualdade, sem prefixo: PORT1 e PORT2 sao portoes
     * diferentes, e quem esta postado no principal continua sendo uma passagem
     * normal quando aparece no lateral. Sem espacos e sem caixa para tolerar o
     * que veio do formulario; o resto e literal.
     */
    private boolean ehPostoFixoDaPessoa(String postoFixoPointId, String pointId) {
        if (postoFixoPointId == null || postoFixoPointId.isBlank()) return false;
        if (pointId == null || pointId.isBlank()) return false;
        return postoFixoPointId.trim().equalsIgnoreCase(pointId.trim());
    }
}
