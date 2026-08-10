package com.magbo.access.services;

import com.magbo.access.config.AreaMapping;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.repositories.AccessLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;

/**
 * ENTRADA DE QUEM JA ESTA DENTRO — a repeticao que nao abre visita nova.
 *
 * Producao, 10/08/2026: o aluno 0003053 entrou no CDI QUATRO vezes em cinco
 * minutos — 12:49, 12:51, 12:51, 12:54 — sem uma saida entre elas. Depois da
 * primeira ele ja estava dentro; as outras tres nao sao visitas, sao a mesma
 * visita lida de novo.
 *
 * ── Por que as camadas existentes nao pegam ─────────────────────────
 * A regra de MESMA PASSAGEM olha uma janela de 30 s: 12:49 e 12:51 estao a dois
 * minutos, entao ela deixa passar — e faz certo, porque duas passagens
 * separadas por minutos podem ser reais. O que distingue este caso nao e o
 * TEMPO entre os eventos, e o ESTADO da pessoa: ela ja estava dentro.
 *
 * Nao e caso de posto fixo tampouco. O aluno nao trabalha no CDI; ele entrou,
 * ficou, e o leitor o viu de novo.
 *
 * ── O que a regra faz, e o que ela nao faz ──────────────────────────
 * NADA e descartado. A linha e GRAVADA como sempre, com flag JA_PRESENTE, e
 * sai das contagens de visita e das telas padrao. O Journal — a visao de
 * auditoria — continua listando todas. Mesmo padrao da passagem rapida e do
 * posto fixo: marcar, nunca apagar.
 *
 * ── "Ja esta dentro" = ULTIMO evento do dia naquele ponto e ENTRADA ─
 * O dia sai de {@code eventTime}, o mesmo relogio de
 * {@code access_logs.timestamp}. Escopo de DIA, e nao "desde sempre", porque
 * fora do CDI nao ha fechamento automatico: uma ENTRADA de ontem que ninguem
 * fechou ficaria pendurada e marcaria, erradamente, a primeira entrada de hoje.
 *
 * ⚠️ Compara com o ultimo evento ATE a hora deste, nao com o ultimo de todos.
 * Uma fila offline esvaziada entrega evento fora de ordem, e perguntar "qual
 * foi o ultimo ate agora" e a unica forma de a resposta nao depender de quem
 * chegou primeiro no banco.
 *
 * ── SO EM PONTO COM PRESENCA CONFIAVEL ──────────────────────────────
 * A regra NAO roda no portao, e a decisao e do Sam (10/08/2026). No portao a
 * saida escapa com frequencia — sai-se por fora do campo da camera, junto com
 * outra pessoa, por outro portao — entao "ja esta dentro" ali e um palpite,
 * nao um fato. Marcar uma reentrada com base nesse palpite esconderia uma
 * ENTRADA REAL dos contadores, e perder entrada no portao e perder a
 * informacao de quem esta na escola.
 *
 * O ruido do portao ja tem dono, e e outro: POSTO_FIXO, marcado POR PESSOA e
 * por decisao explicita de um operador — nunca inferido de um estado que ali
 * nao e confiavel.
 *
 * Quem responde a pergunta e {@link AreaMapping#temPresencaConfiavel}, pela
 * AREA do ponto: cantina e enfermaria entram sozinhas quando forem
 * comissionadas, sem ninguem lembrar de mexer aqui.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PresencaAbertaService {

    /**
     * Marca da ENTRADA de quem ja estava dentro.
     *
     * Mesmo campo {@code access_logs.flag} de FORA_HORARIO, EXCEDEU_TEMPO,
     * FECHAMENTO_AUTO e POSTO_FIXO: String livre de ate 32 caracteres, aditiva,
     * UPPER_SNAKE. A coluna NAO tem CHECK (verificado em PostgreSQL real em
     * 10/08/2026: so `action` e `auth_method` tem, por serem @Enumerated), entao
     * o valor novo nao precisa de migracao.
     */
    public static final String FLAG_JA_PRESENTE = "JA_PRESENTE";

    private final AccessLogRepository accessLogRepository;

    /**
     * Esta ENTRADA e de alguem que ja estava dentro deste ponto?
     *
     * @param userId    pessoa ja identificada
     * @param pointId   ponto desta passagem
     * @param action    so ENTRADA e avaliada — uma SAIDA nunca e "repeticao";
     *                  ela FECHA a presenca, e marca-la seria justamente o
     *                  defeito de ocupacao de 10/08 (a saida sumia das telas e
     *                  a pessoa constava dentro depois de ter ido embora)
     * @param eventTime hora do EVENTO — define o dia e o corte do "ultimo ate aqui"
     * @return {@link #FLAG_JA_PRESENTE} quando ja havia presenca aberta;
     *         {@code null} em todo o resto (e null e o valor historico da
     *         coluna, entao nao marcar e literalmente nao mudar nada)
     */
    public String flagDeEntradaRepetida(String userId, String pointId,
                                        AccessAction action, LocalDateTime eventTime) {
        if (action != AccessAction.ENTRADA) return null;
        if (userId == null || userId.isBlank()) return null;
        if (pointId == null || pointId.isBlank()) return null;
        if (eventTime == null) return null;

        // O PORTAO fica de fora — ver o javadoc da classe. Ali a saida escapa,
        // "ja esta dentro" e palpite, e marcar uma reentrada esconderia uma
        // entrada real. A pergunta e feita pela AREA do ponto, entao cantina e
        // enfermaria entram sozinhas quando forem comissionadas.
        if (!AreaMapping.temPresencaConfiavel(pointId)) return null;

        LocalDate dia = eventTime.toLocalDate();
        Optional<AccessLog> anterior = accessLogRepository
                .findTopByUserIdAndPointIdAndTimestampBetweenOrderByTimestampDesc(
                        userId, pointId, dia.atStartOfDay(), eventTime);

        if (anterior.isEmpty()) return null;
        if (anterior.get().getAction() != AccessAction.ENTRADA) return null;

        log.info("Presenca ja aberta: ENTRADA de {} em {} as {} sem saida desde {} — "
                        + "gravada com flag {} (fora das contagens, dentro do Journal)",
                userId, pointId, eventTime, anterior.get().getTimestamp(), FLAG_JA_PRESENTE);
        return FLAG_JA_PRESENTE;
    }
}
