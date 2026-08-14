package com.magbo.access.services;

import com.magbo.access.config.RegimeProperties;
import com.magbo.access.dto.ExitDecision;
import com.magbo.access.dto.RegimeDecision;
import com.magbo.access.models.*;
import com.magbo.access.repositories.StudentRegimeEventRepository;
import com.magbo.access.repositories.StudentRegimeRepository;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

/**
 * "ESTE ALUNO PODE SAIR AGORA?" — e, quando a resposta honesta e "depende do que
 * eu nao sei", dizer isso em vez de inventar.
 *
 * A Academie de Paris descreve o dever diario do CPE em palavras que sao, na
 * pratica, a especificacao deste servico: «Chaque sortie doit faire l'objet
 * d'une grande attention pour s'assurer qu'aucun eleve ne sorte par erreur:
 * controle du carnet, des signatures, des regimes et des emplois du temps.»
 *
 * Sao QUATRO conferencias. Este servico assume DUAS com certeza — o regime e as
 * assinaturas, que estao no banco — e e explicito sobre a terceira: o EMPLOI DU
 * TEMPS vive no Pronote e nao chega aqui. O carnet fisico continua com o aluno.
 *
 * ⚠️ A ORDEM DAS REGRAS E A REGRA, e ela tem uma razao em cada degrau:
 *
 *   1. Nao e ALUNO           -> NON_APPLICABLE. Regime de sortie e instituto de
 *                               aluno; professor nao tem, e negar a saida de um
 *                               servidor as 17h e o defeito que hoje mantem a
 *                               avaliacao de saida DESLIGADA nas cameras.
 *   2. Permissao PONTUAL     -> AUTORISE. A excecao assinada vence a regra anual;
 *                               e para isso que ela existe. Vem ANTES do regime
 *                               de proposito: um aluno de regime 1 com consulta
 *                               medica hoje as 14h tem de sair, e nenhuma leitura
 *                               do regime pode impedir.
 *   3. Fim da jornada        -> AUTORISE. Depois do fim do dia (e, para o
 *                               externo, depois do fim da manha) toda saida e a
 *                               saida normal. Sem este degrau, centenas de
 *                               vermelhos por dia as 17h — e o alerta que
 *                               importa morreria afogado nos que nao importam.
 *   4. O regime              -> ver abaixo.
 *   5. Sem regime            -> INCONNU. Dado ausente nao e dado negativo.
 *
 * ⚠️ O QUE O VERDE SIGNIFICA, exatamente: "o regime anual deste aluno autoriza a
 * saida autonoma". NAO significa "conferi a grade e ele esta livre agora" — o
 * MAGBO nao tem a grade. A tela precisa dizer isso com as mesmas palavras
 * (chaves regime.motivo.*), porque uma afirmacao mais forte que o dado por tras
 * dela e o defeito que a direcao paga depois.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RegimeSortieService {

    private final StudentRegimeRepository regimeRepository;
    private final StudentRegimeEventRepository eventRepository;
    private final UserRepository userRepository;
    private final ExitPermissionService exitPermissionService;
    private final RegimeProperties props;

    // ─────────────────────────────────────────────────────────────
    // AVALIACAO
    // ─────────────────────────────────────────────────────────────

    /**
     * @param userId matricula de quem se apresenta para sair
     * @param quando ⚠️ A HORA DA PASSAGEM — o instante em que a crianca cruzou o
     *               portao —, NUNCA a hora em que o servidor processou o evento.
     *
     * ⚠️⚠️ ESTE PARAMETRO E UMA DECISAO, e ela contraria a regra geral da camada.
     *
     * O resto do AccessDecisionService avalia regras contra `now` (o relogio da
     * DECISAO), e por um bom motivo: uma fila offline esvaziada nao pode mudar
     * DENY/ALLOW retroativamente. Aqui e o contrario, por dois motivos:
     *
     *   1. Esta regra NUNCA nega. Ela nao muda o que a porta faz — descreve, para
     *      o registro, se o regime daquela crianca autorizava aquela saida.
     *   2. Logo, julga-la pelo relogio do processamento seria gravar uma
     *      afirmacao falsa: uma saida das 10h processada as 18h viraria "fim da
     *      jornada — saida normal", e o aviso que a Vie Scolaire precisava ver
     *      nunca teria existido.
     *
     * E a MESMA armadilha do incidente de 03/08/2026, quando uma fila de 33
     * eventos entrou toda as 14:51 e produziu duracoes negativas — so que agora
     * o que esta em jogo nao e uma media de permanencia: e se uma crianca podia
     * sair da escola.
     *
     * ⚠️ Apanhado por RegimeGateWiringTest#regimeUsaAHoraDaPassagem, que trava o
     * argumento explicitamente. A primeira versao usava `now` e passava verde
     * durante o dia — so quebrou porque a suite rodou as 18h45. Um teste que
     * depende da hora em que alguem o executa nao e prova de nada, e por isso a
     * trava de agora captura o argumento em vez de olhar o veredicto.
     */
    public RegimeDecision avaliar(String userId, LocalDateTime quando) {
        final LocalDateTime agora = quando;
        if (!props.isHabilitado()) {
            return new RegimeDecision(RegimeVerdict.NON_APPLICABLE,
                    "regime.motivo.desligado", null, null, null, false);
        }

        Optional<User> userOpt = userId == null ? Optional.empty() : userRepository.findById(userId);
        if (userOpt.isEmpty() || userOpt.get().getTipo() != UserType.ALUNO) {
            return new RegimeDecision(RegimeVerdict.NON_APPLICABLE,
                    "regime.motivo.nao.aluno", null, null, null, false);
        }

        // 2. A EXCECAO VENCE A REGRA. Avaliada primeiro, sempre.
        ExitDecision pontual = exitPermissionService.evaluate(userId, agora);
        if (pontual.allowed()) {
            return new RegimeDecision(RegimeVerdict.AUTORISE,
                    "regime.motivo.permissao.pontual", null, null,
                    pontual.permissionId(), false);
        }

        Optional<StudentRegime> vigenteOpt = regimeRepository.findVigente(userId, agora.toLocalDate());

        // 3. FIM DA JORNADA — vale mesmo sem regime cadastrado. Depois do fim do
        //    dia, a saida deixa de ser excecao a autorizar: e o fim do dia.
        RegimeGeneral geral = vigenteOpt.map(StudentRegime::getRegimeGeneral).orElse(null);
        if (fimDaJornada(agora.toLocalTime(), geral)) {
            return new RegimeDecision(RegimeVerdict.AUTORISE,
                    "regime.motivo.fim.jornada",
                    vigenteOpt.map(StudentRegime::getRegimeSortie).orElse(null),
                    geral, null, false);
        }

        // 5. SEM REGIME. Cinza, nunca vermelho — no dia 1 sao 923 alunos assim.
        if (vigenteOpt.isEmpty()) {
            RegimeVerdict v = props.negarDesconhecido()
                    ? RegimeVerdict.NON_AUTORISE : RegimeVerdict.INCONNU;
            return new RegimeDecision(v, "regime.motivo.sem.regime", null, null, null, false);
        }

        StudentRegime r = vigenteOpt.get();

        // 4. O REGIME.
        return switch (r.getRegimeSortie()) {
            // Surveille: fica no estabelecimento durante a meia-jornada. Ja
            // passamos pelo degrau do fim da jornada, entao estamos no meio dela.
            case REGIME_1 -> new RegimeDecision(RegimeVerdict.NON_AUTORISE,
                    "regime.motivo.regime1", r.getRegimeSortie(), r.getRegimeGeneral(), null, false);

            // Semi-libre: pode sair QUANDO HA AUSENCIA DE PROFESSOR. O MAGBO nao
            // sabe se houve — e amarelo, com o motivo dito, nao um chute.
            case REGIME_2 -> new RegimeDecision(RegimeVerdict.A_VERIFIER,
                    "regime.motivo.regime2", r.getRegimeSortie(), r.getRegimeGeneral(), null, true);

            // Libre: o regime anual autoriza a saida autonoma. Continua
            // dependendo da grade (dependeDeGrade=true) e a tela diz isso — o
            // verde responde "o regime autoriza", nao "conferi o horario".
            case REGIME_3 -> new RegimeDecision(RegimeVerdict.AUTORISE,
                    "regime.motivo.regime3", r.getRegimeSortie(), r.getRegimeGeneral(), null, true);
        };
    }

    /**
     * A jornada desta pessoa ja terminou?
     *
     * Para o EXTERNE, o fim da manha encerra o dia letivo (ele almoca fora).
     * Para o demi-pensionnaire e o interne, so o fim do dia — eles almocam aqui.
     * Sem regime geral conhecido, usa-se o criterio mais restritivo (fim do dia):
     * na duvida sobre o que a familia contratou, nao se antecipa uma liberacao.
     */
    private boolean fimDaJornada(LocalTime agora, RegimeGeneral geral) {
        LocalTime limite = (geral == RegimeGeneral.EXTERNE) ? props.getFimManha() : props.getFimDia();
        return !agora.isBefore(limite.minusMinutes(props.getToleranciaMinutos()));
    }

    // ─────────────────────────────────────────────────────────────
    // ESCRITA — sempre com historico, sempre na mesma transacao
    // ─────────────────────────────────────────────────────────────

    /**
     * Cadastra ou SUBSTITUI o regime de um aluno.
     *
     * Substituir nao apaga: o regime anterior recebe encerrado_em e continua na
     * tabela. Uma escola precisa poder dizer, seis meses depois, qual era a
     * autorizacao vigente naquela terca-feira.
     */
    @Transactional
    public StudentRegime definir(String userId, RegimeGeneral geral, RegimeSortie sortie,
                                 LocalDate validFrom, LocalDate validUntil,
                                 String autorizadoPelaFamilia, String documentoRef,
                                 LocalDate assinadoEm, String note,
                                 String quem, String source) {

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Aluno não encontrado: " + userId));

        // Regime de sortie so existe para ALUNO. Sem esta guarda, a tela de
        // servidores (ou um POST direto) criaria regime para um professor, e a
        // avaliacao passaria a negar a saida dele.
        if (user.getTipo() != UserType.ALUNO) {
            throw new IllegalArgumentException(
                    "Regime de sortie é um instituto de aluno; " + userId + " é " + user.getTipo());
        }
        if (geral == null || sortie == null) {
            throw new IllegalArgumentException("Regime geral e regime de sortie são obrigatórios");
        }
        if (autorizadoPelaFamilia == null || autorizadoPelaFamilia.isBlank()) {
            throw new IllegalArgumentException(
                    "Informe quem, na família, autorizou — um regime sem autor não é prova de nada");
        }
        if (validFrom == null) {
            throw new IllegalArgumentException("validFrom é obrigatório");
        }
        if (validUntil != null && validUntil.isBefore(validFrom)) {
            throw new IllegalArgumentException("validUntil não pode ser anterior a validFrom");
        }

        StudentRegime anterior = regimeRepository.findVigente(userId, validFrom).orElse(null);
        if (anterior != null) {
            anterior.setEncerradoEm(LocalDateTime.now());
            anterior.setEncerradoPor(quem);
            regimeRepository.save(anterior);
        }

        StudentRegime novo = regimeRepository.save(StudentRegime.builder()
                .userId(userId)
                .regimeGeneral(geral)
                .regimeSortie(sortie)
                .validFrom(validFrom)
                .validUntil(validUntil)
                .authorizedByFamily(autorizadoPelaFamilia.trim())
                .documentoRef(vazioVira(documentoRef))
                .assinadoEm(assinadoEm)
                .note(vazioVira(note))
                .createdBy(quem)
                .build());

        eventRepository.save(StudentRegimeEvent.builder()
                .userId(userId)
                .regimeId(novo.getId())
                .oldRegimeSortie(anterior == null ? null : anterior.getRegimeSortie())
                .newRegimeSortie(sortie)
                .oldRegimeGeneral(anterior == null ? null : anterior.getRegimeGeneral())
                .newRegimeGeneral(geral)
                .changedBy(quem)
                .note(vazioVira(note))
                .source(source == null ? "UI" : source)
                .build());

        log.info("Regime definido: user={}, geral={}, sortie={}, de={}, ate={}, por={}, origem={}",
                userId, geral, sortie, validFrom, validUntil, quem, source);
        return novo;
    }

    /** Encerra o regime vigente sem criar outro (o aluno saiu da escola, por ex.). */
    @Transactional
    public void encerrar(String userId, String quem, String note) {
        StudentRegime vigente = regimeRepository.findVigente(userId, LocalDate.now())
                .orElseThrow(() -> new IllegalArgumentException("Nenhum regime vigente para " + userId));

        vigente.setEncerradoEm(LocalDateTime.now());
        vigente.setEncerradoPor(quem);
        regimeRepository.save(vigente);

        eventRepository.save(StudentRegimeEvent.builder()
                .userId(userId)
                .regimeId(vigente.getId())
                .oldRegimeSortie(vigente.getRegimeSortie())
                .newRegimeSortie(null)
                .oldRegimeGeneral(vigente.getRegimeGeneral())
                .newRegimeGeneral(null)
                .changedBy(quem)
                .note(vazioVira(note))
                .source("UI")
                .build());

        log.info("Regime encerrado: user={}, por={}", userId, quem);
    }

    public Optional<StudentRegime> vigenteDe(String userId) {
        return regimeRepository.findVigente(userId, LocalDate.now());
    }

    public List<StudentRegime> historicoDe(String userId) {
        return regimeRepository.findByUserIdOrderByValidFromDescIdDesc(userId);
    }

    public List<StudentRegimeEvent> eventosDe(String userId) {
        return eventRepository.findByUserIdOrderByChangedAtDesc(userId);
    }

    private static String vazioVira(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }
}
