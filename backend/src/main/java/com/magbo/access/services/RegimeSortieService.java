package com.magbo.access.services;

import com.magbo.access.config.RegimeProperties;
import com.magbo.access.dto.ExitDecision;
import com.magbo.access.dto.GateVerdict;
import com.magbo.access.dto.RegimeDecision;
import com.magbo.access.models.*;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.repositories.StudentExitPermissionRepository;
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
import java.util.ArrayList;
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
    private final AccessLogRepository accessLogRepository;
    private final RegimeProperties props;
    private final StudentExitPermissionRepository permissionRepository;

    /**
     * Folga entre a hora da passagem e o `usedAt` da permissao consumida.
     *
     * Dois minutos porque sao dois relogios diferentes: a passagem carrega a
     * hora do EVENTO (dateTime do aparelho) e o consumo carrega a hora da
     * GRAVACAO. Numa fila offline esvaziada a distancia pode ser maior, e ai a
     * permissao nao e reencontrada — o veredicto volta a ser o do regime, que e
     * conservador e nao inventa autorizacao nenhuma.
     */
    private static final int JANELA_CONSUMO_MIN = 2;

    /** Janela da tela do portao. Ver veredictosNoPortao. */
    private static final int JANELA_PORTAO_HORAS = 2;

    /** Teto de linhas examinadas por consulta — duas queries por linha. */
    private static final int TETO_LINHAS_EXAMINADAS = 200;

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

        // ⚠️ 2-bis. A PERMISSAO QUE ESTA SAIDA JA CONSUMIU.
        //
        // Uma permissao SINGLE e consumida no instante da passagem
        // (AccessDecisionService -> consumeIfSingle: ACTIVE -> USED). Tres
        // segundos depois, a tela do portao pede o veredicto DAQUELA passagem e
        // o evaluate() acima nao encontra mais nada ativo — o aluno que saiu com
        // autorizacao assinada aparecia em VERMELHO, "ne doit pas sortir seul",
        // depois de ter saido legitimamente. Apanhado pelo chef d'etablissement
        // no painel de 14/08/2026.
        //
        // Uma permissao consumida NO MOMENTO desta passagem e a prova de que ela
        // estava valida: procura-se por ela, com folga para o intervalo entre o
        // evento e a gravacao.
        Optional<StudentExitPermission> consumidaAgora =
                permissionRepository.findByUserIdAndStatus(userId, ExitPermissionStatus.USED)
                        .stream()
                        .filter(pp -> pp.getUsedAt() != null
                                && !pp.getUsedAt().isBefore(agora.minusMinutes(JANELA_CONSUMO_MIN))
                                && !pp.getUsedAt().isAfter(agora.plusMinutes(JANELA_CONSUMO_MIN)))
                        .findFirst();
        if (consumidaAgora.isPresent()) {
            return new RegimeDecision(RegimeVerdict.AUTORISE,
                    "regime.motivo.permissao.pontual", null, null,
                    consumidaAgora.get().getId(), false);
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
        int folga = props.getToleranciaMinutos();

        // Depois do fim do dia, a jornada de todo mundo acabou.
        if (!agora.isBefore(props.getFimDia().minusMinutes(folga))) return true;

        // ⚠️ O EXTERNE so esta liberado DENTRO da janela do meio-dia — entre o
        // fim da manha e a retomada da tarde. A primeira versao perguntava
        // apenas "e depois do fim da manha?", e por isso respondia
        // "fim de jornada — saida normal" as 14h30, as 16h e ate a meia-noite:
        // o aluno de regime 1 que se mandava depois do almoco recebia VERDE, e
        // com uma afirmacao de que aquela saida tinha sido normal. Apanhado pelo
        // painel de revisao (CPE) em 14/08/2026.
        if (geral == RegimeGeneral.EXTERNE) {
            return !agora.isBefore(props.getFimManha().minusMinutes(folga))
                    && agora.isBefore(props.getRetomadaTarde().minusMinutes(folga));
        }

        // Demi-pensionnaire e interne almocam aqui: so o fim do dia encerra.
        return false;
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
                .oldAuthorizedBy(anterior == null ? null : anterior.getAuthorizedByFamily())
                .newAuthorizedBy(autorizadoPelaFamilia.trim())
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
                .oldAuthorizedBy(vigente.getAuthorizedByFamily())
                .newAuthorizedBy(null)
                .changedBy(quem)
                .note(vazioVira(note))
                .source("UI")
                .build());

        log.info("Regime encerrado: user={}, por={}", userId, quem);
    }

    /**
     * Os veredictos das ULTIMAS saidas de alunos num portao — para a tela.
     *
     * ⚠️ Cada uma avaliada na hora da PASSAGEM. Consultar "agora" faria a linha
     * das 10h ser julgada as 16h: ela mudaria de cor sozinha ao longo do dia,
     * inclusive de vermelha para verde quando o fim da jornada chegasse, e o
     * AED veria o historico do portao se reescrever sob os olhos dele.
     *
     * ⚠️ TETO OBRIGATORIO no numero de linhas. Sao duas consultas por linha
     * (permissao pontual + regime vigente) e isto roda no ciclo de polling da
     * tela do portao, a cada poucos segundos. Sem teto, uma manha movimentada
     * transformaria a tela de apoio numa carga permanente no banco.
     *
     * SAIDA e ALUNO apenas: o regime nao fala de entrada nem de servidor, e uma
     * linha NON_APPLICABLE na tela seria ruido no lugar onde ruido custa caro.
     *
     * ⚠️ DIVERGENCIA CONHECIDA E NAO RESOLVIDA (painel, arquiteto, 14/08/2026).
     *
     * Ha DUAS respostas para o mesmo fato: a que foi GRAVADA em access_attempts
     * no momento da ingestao, e a que este metodo RECALCULA. Elas coincidem
     * enquanto nada mudar; divergem se alguem editar o regime do aluno depois da
     * passagem — a tela passa a mostrar o veredicto novo para uma passagem
     * julgada com o antigo.
     *
     * Nao foi resolvido aqui, e a razao e que as duas correcoes possiveis sao
     * decisoes maiores que esta entrega: (a) gravar o veredicto na propria linha
     * de access_logs, que e mudanca de schema numa tabela que o projeto trata
     * como intocavel; ou (b) a tela ler os attempts em vez de recalcular, o que
     * nao funciona porque o veredicto VERDE nao gera linha nenhuma — e o verde e
     * a maioria.
     *
     * O que se sabe hoje: o REGISTRO (access_attempts) e a versao autoritativa
     * para auditoria, porque foi julgado no instante e nao muda; a TELA e apoio
     * a decisao do momento. Quem investigar um incidente le o registro.
     */
    public List<GateVerdict> veredictosNoPortao(String pointId, int limite) {
        int teto = Math.max(1, Math.min(limite, 50));
        LocalDateTime agora = LocalDateTime.now();

        // ⚠️ JANELA CURTA, e nao o dia inteiro.
        //
        // A primeira versao carregava todas as passagens do ponto desde a
        // meia-noite e so depois cortava em 50. `access_logs` NAO TEM indice
        // alem da PK — a V006 diz por escrito que nao se indexa aquela tabela
        // nesta fase (~440k registros) —, entao o teto limitava a lista de
        // saida, nao a varredura, e isso passou a rodar no laco de 3 s da tela
        // do portao. Apanhado pelo arquiteto no painel de 14/08/2026.
        //
        // Duas horas cobrem qualquer fila de portao com folga; o que sai da
        // janela ja nao e "a passagem que acabou de acontecer", que e o que esta
        // tela mostra. O historico completo continua no Journal.
        LocalDateTime desde = agora.minusHours(JANELA_PORTAO_HORAS);

        List<AccessLog> logs = accessLogRepository
                .findByPointIdInAndTimestampBetweenOrderByTimestampDesc(
                        List.of(pointId), desde, agora);

        List<GateVerdict> out = new ArrayList<>();
        int examinadas = 0;
        for (AccessLog l : logs) {
            if (out.size() >= teto) break;
            // Teto tambem no que se EXAMINA: sem ele, um ponto com muito
            // movimento de servidor faria centenas de consultas para devolver
            // as poucas saidas de aluno que existem.
            if (++examinadas > TETO_LINHAS_EXAMINADAS) break;
            if (l.getAction() != AccessAction.SAIDA || l.getUserId() == null) continue;

            User u = userRepository.findById(l.getUserId()).orElse(null);
            if (u == null || u.getTipo() != UserType.ALUNO) continue;

            RegimeDecision d = avaliar(l.getUserId(), l.getTimestamp());
            if (d.verdict() == RegimeVerdict.NON_APPLICABLE) continue;

            out.add(new GateVerdict(
                    l.getId(), u.getId(), u.getNome(), u.getTurma(), l.getTimestamp(),
                    d.verdict(), d.motivo(), d.regimeSortie(), d.regimeGeneral(),
                    d.dependeDeGrade()));
        }
        return out;
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
