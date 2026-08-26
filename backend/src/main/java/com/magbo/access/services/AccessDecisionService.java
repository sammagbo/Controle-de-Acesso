package com.magbo.access.services;

import com.magbo.access.config.PolicyProperties;
import com.magbo.access.dto.EntitlementDecision;
import com.magbo.access.dto.EventClassification;
import com.magbo.access.dto.ExitDecision;
import com.magbo.access.dto.RegimeDecision;
import com.magbo.access.dto.hikvision.HikvisionEventDto;
import com.magbo.access.models.RegimeVerdict;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.AuthMethod;
import com.magbo.access.models.AuthResult;
import com.magbo.access.models.AuthorizationResult;
import com.magbo.access.models.ClassSchedule;
import com.magbo.access.models.DenialReason;
import com.magbo.access.models.EntitlementStatus;
import com.magbo.access.models.PolicyMode;
import com.magbo.access.models.User;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.repositories.ClassScheduleRepository;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Optional;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Slf4j
public class AccessDecisionService {

    private final DoorMappingService doorMappingService;
    private final UserRepository userRepository;
    private final ClassScheduleRepository classScheduleRepository;
    private final AccessLogRepository accessLogRepository;
    private final HikvisionEventClassifier classifier;
    private final DeduplicationService dedupService;
    private final AccessAttemptService attemptService;
    private final PolicyProperties policyProperties;
    private final MealEntitlementService mealEntitlementService;
    private final ExitPermissionService exitPermissionService;
    private final SamePassageService samePassageService;
    private final PostoFixoService postoFixoService;
    private final PresencaAbertaService presencaAbertaService;
    private final RegimeSortieService regimeSortieService;
    private final com.magbo.access.config.CantineProperties cantineProperties;
    private final MealSlotService mealSlotService;

    // Turmas com prioridade total (entram 11h-15h sem restrição de horário de turma)
    private static final Set<String> LYCEE_CLASSES = Set.of(
            "T1", "T2",
            "1E1", "1E2", "1E3",
            "2E1", "2E2", "2E3"
    );

    // ⚠️ LYCEE_START, LYCEE_END e MAX_CANTINA_TIME saíram daqui para
    // CantineProperties em 24/08/2026. Eram `static final`: mudar o horário do
    // almoço desta escola exigia editar Java, recompilar e redistribuir o jar.
    // A LISTA de turmas fica — ela é a REGRA (quais turmas têm janela própria),
    // e regra não é o mesmo que número.
    private static final Duration LUNCH_WINDOW = Duration.ofHours(1);

    /**
     * @param eventTime hora em que o evento ACONTECEU (dateTime do payload, ja
     *                  convertido para America/Sao_Paulo pelo
     *                  EventTimeResolver; a hora de recepcao entra como
     *                  fallback la). E o que vai para access_logs.timestamp e
     *                  access_attempts.timestamp.
     *
     *                  ESCOPO DELIBERADO: eventTime e a hora do REGISTRO. As
     *                  regras (janela da cantina, dedup de refeicao, permissao
     *                  de saida, tempo dentro da cantina) continuam avaliadas
     *                  contra `now`, a hora em que o MAGBO decide — mudar o
     *                  relogio das regras alteraria decisoes DENY/ALLOW em
     *                  producao e e uma decisao a parte, do Sam.
     */
    @Transactional
    public void process(HikvisionEventDto.AccessControllerEvent event, String terminalIp,
                        LocalDateTime eventTime) {
        Integer subType = event.getSubEventType();
        EventClassification classification = classifier.classify(subType);

        String employeeNoRaw = event.getEmployeeNoString();
        String nomeSnapshot = event.getName();

        DoorMappingService.ResolvedMapping resolved = doorMappingService.resolve(event.getDoorNo(), event.getReaderNo(), terminalIp);

        if (resolved.isFallback() && "ATTEMPT".equals(policyProperties.getPolicy().getMissingDoorMapping())) {
            attemptService.record(
                    null, // sem userId, falha rapida
                    employeeNoRaw, nomeSnapshot,
                    resolved.pointId(), resolved.action(), terminalIp,
                    classification.method(), classification.result(),
                    AuthorizationResult.DENIED, DenialReason.MISSING_DOOR_MAPPING,
                    subType, true, eventTime
            );
            return;
        }

        if (classification.result() == AuthResult.DENIED) {
            Optional<User> userOpt = userRepository.findByHikvisionEmployeeId(employeeNoRaw);
            String userId = userOpt.map(User::getId).orElse(null);
            attemptService.record(
                    userId, employeeNoRaw, nomeSnapshot,
                    resolved.pointId(), resolved.action(), terminalIp,
                    classification.method(), AuthResult.DENIED,
                    AuthorizationResult.DENIED, DenialReason.DEVICE_DENIED,
                    subType, resolved.isFallback(), eventTime
            );
            return;
        }

        if (!classification.isAccessCandidate()) {
            attemptService.record(
                    null, employeeNoRaw, nomeSnapshot,
                    resolved.pointId(), resolved.action(), terminalIp,
                    classification.method(), AuthResult.UNKNOWN,
                    AuthorizationResult.NOT_APPLICABLE, DenialReason.DEVICE_DENIED,
                    subType, resolved.isFallback(), eventTime
            );
            return;
        }

        Optional<User> userOpt = userRepository.findByHikvisionEmployeeId(employeeNoRaw);
        if (userOpt.isEmpty()) {
            attemptService.record(
                    null, employeeNoRaw, nomeSnapshot,
                    resolved.pointId(), resolved.action(), terminalIp,
                    classification.method(), classification.result(),
                    AuthorizationResult.DENIED, DenialReason.UNKNOWN_USER,
                    subType, resolved.isFallback(), eventTime
            );
            return;
        }

        User user = userOpt.get();
        String userId = user.getId();

        if (Boolean.FALSE.equals(user.getAtivo())) {
            PolicyMode mode = policyProperties.getPolicy().getUserInactive();
            if (mode == PolicyMode.DENY) {
                attemptService.record(
                        userId, employeeNoRaw, nomeSnapshot,
                        resolved.pointId(), resolved.action(), terminalIp,
                        classification.method(), classification.result(),
                        AuthorizationResult.DENIED, DenialReason.USER_INACTIVE,
                        subType, resolved.isFallback(), eventTime
                );
                return;
            } else if (mode == PolicyMode.OBSERVATION) {
                attemptService.record(
                        userId, employeeNoRaw, nomeSnapshot,
                        resolved.pointId(), resolved.action(), terminalIp,
                        classification.method(), classification.result(),
                        AuthorizationResult.OBSERVATION, DenialReason.USER_INACTIVE,
                        subType, resolved.isFallback(), eventTime
                );
            }
        }

        // Relogio das REGRAS — deliberadamente separado de eventTime, que e o
        // relogio do REGISTRO (ver o javadoc de process). Trocar este `now`
        // por eventTime mudaria decisoes DENY/ALLOW e nao e mudanca de
        // timestamp: e mudanca de politica.
        LocalDateTime now = LocalDateTime.now();
        String pid = resolved.pointId() == null ? "" : resolved.pointId().toUpperCase();
        boolean isRefectory = pid.startsWith("REFEI") || pid.startsWith("CANTINA");
        String flag = null;

        if (isRefectory) {
            if (resolved.action() == AccessAction.ENTRADA) {
                if (dedupService.isDuplicate(userId, pid, AccessAction.ENTRADA, now)) {
                    PolicyMode mode = policyProperties.getPolicy().getDuplicateMeal();
                    if (mode == PolicyMode.DENY) {
                        attemptService.record(
                                userId, employeeNoRaw, nomeSnapshot,
                                resolved.pointId(), resolved.action(), terminalIp,
                                classification.method(), classification.result(),
                                AuthorizationResult.DENIED, DenialReason.DUPLICATE_MEAL,
                                subType, resolved.isFallback(), eventTime
                        );
                        return;
                    } else if (mode == PolicyMode.OBSERVATION) {
                        attemptService.record(
                                userId, employeeNoRaw, nomeSnapshot,
                                resolved.pointId(), resolved.action(), terminalIp,
                                classification.method(), classification.result(),
                                AuthorizationResult.OBSERVATION, DenialReason.DUPLICATE_MEAL,
                                subType, resolved.isFallback(), eventTime
                        );
                    }
                }
                
                // FASE C:
                EntitlementDecision decision = mealEntitlementService.evaluate(userId, now.toLocalDate());

                if (decision.effectiveStatus() == EntitlementStatus.NOT_AUTHORIZED
                        || (decision.effectiveStatus() == EntitlementStatus.AUTHORIZED && !decision.entitled())) {
                    PolicyMode mode = policyProperties.getPolicy().getMealNotEntitled();
                    if (mode == PolicyMode.DENY) {
                        attemptService.record(
                                userId, employeeNoRaw, nomeSnapshot,
                                resolved.pointId(), resolved.action(), terminalIp,
                                classification.method(), classification.result(),
                                AuthorizationResult.DENIED, DenialReason.MEAL_NOT_ENTITLED,
                                subType, resolved.isFallback(), eventTime
                        );
                        return;
                    } else if (mode == PolicyMode.OBSERVATION) {
                        attemptService.record(
                                userId, employeeNoRaw, nomeSnapshot,
                                resolved.pointId(), resolved.action(), terminalIp,
                                classification.method(), classification.result(),
                                AuthorizationResult.OBSERVATION, DenialReason.MEAL_NOT_ENTITLED,
                                subType, resolved.isFallback(), eventTime
                        );
                    }
                } else if (decision.effectiveStatus() == EntitlementStatus.PENDING) {
                    PolicyMode mode = policyProperties.getPolicy().getMealPending();
                    if (mode == PolicyMode.DENY) {
                        attemptService.record(
                                userId, employeeNoRaw, nomeSnapshot,
                                resolved.pointId(), resolved.action(), terminalIp,
                                classification.method(), classification.result(),
                                AuthorizationResult.DENIED, DenialReason.MEAL_NOT_ENTITLED,
                                subType, resolved.isFallback(), eventTime
                        );
                        return;
                    } else if (mode == PolicyMode.OBSERVATION) {
                        attemptService.record(
                                userId, employeeNoRaw, nomeSnapshot,
                                resolved.pointId(), resolved.action(), terminalIp,
                                classification.method(), classification.result(),
                                AuthorizationResult.OBSERVATION, DenialReason.MEAL_NOT_ENTITLED,
                                subType, resolved.isFallback(), eventTime
                        );
                    }
                }
                // ⚠️⚠️ eventTime, NAO `now` — e esta troca e deliberada.
                //
                // A regra geral do projeto e «as REGRAS usam o relogio da
                // DECISAO», para que uma fila offline nao mude DENY/ALLOW
                // retroativamente. Esta janela e a excecao, e pela mesma razao
                // que a duracao da cantina ja e: julgada por `now`, uma fila
                // de 33 eventos esvaziada as 18h marcaria TODAS as passagens
                // do meio-dia como fora do horario — inventando dezenas de
                // alertas sobre criancas que chegaram na hora certa. E o
                // incidente de 03/08/2026 outra vez, agora a acusar em vez de
                // medir. Travado por `MealSlotWiringTest`.
                MealSlotService.Resultado janela = mealSlotService.resolver(user, eventTime);
                if (janela.naoAplicavel()) {
                    // Nao e aluno, ou nao tem turma: a grade de turmas nunca
                    // falou desta pessoa. Nem flag, nem registo — nao ha
                    // pergunta a fazer a ninguem.
                    flag = null;
                } else if (janela.naoConfigurado()) {
                    // ⚠️ NAO E RECUSA. Ninguem disse a que horas esta pessoa
                    // come; a passagem passa, e fica a pergunta para o adulto
                    // que mantem o planning. Nenhum flag em `access_logs`: o
                    // registo da passagem nao carrega uma acusacao que o
                    // sistema nao pode sustentar.
                    PolicyMode semCreneau = policyProperties.getPolicy().getMealSlotNotConfigured();
                    if (semCreneau == PolicyMode.OBSERVATION) {
                        attemptService.record(
                                userId, employeeNoRaw, nomeSnapshot,
                                resolved.pointId(), resolved.action(), terminalIp,
                                classification.method(), classification.result(),
                                AuthorizationResult.OBSERVATION,
                                DenialReason.MEAL_SLOT_NOT_CONFIGURED,
                                subType, resolved.isFallback(), eventTime
                        );
                    }
                    flag = null;
                } else {
                    flag = janela.dentro() ? null : "FORA_HORARIO";
                }
                if ("FORA_HORARIO".equals(flag)) {
                    PolicyMode mode = policyProperties.getPolicy().getOutsideMealTime();
                    if (mode == PolicyMode.DENY) {
                        attemptService.record(
                                userId, employeeNoRaw, nomeSnapshot,
                                resolved.pointId(), resolved.action(), terminalIp,
                                classification.method(), classification.result(),
                                AuthorizationResult.DENIED, DenialReason.OUTSIDE_MEAL_TIME,
                                subType, resolved.isFallback(), eventTime
                        );
                        return;
                    } else if (mode == PolicyMode.OBSERVATION) {
                        attemptService.record(
                                userId, employeeNoRaw, nomeSnapshot,
                                resolved.pointId(), resolved.action(), terminalIp,
                                classification.method(), classification.result(),
                                AuthorizationResult.OBSERVATION, DenialReason.OUTSIDE_MEAL_TIME,
                                subType, resolved.isFallback(), eventTime
                        );
                    }
                }
            } else if (resolved.action() == AccessAction.SAIDA) {
                // eventTime, e NAO `now`: aqui se MEDE uma duracao, nao se
                // decide um acesso. Ver o javadoc de validateExitTime.
                flag = validateExitTime(userId, pid, eventTime);
            }
        }
        
        registrarPassagem(new Passagem(
                userId, employeeNoRaw, nomeSnapshot, resolved, terminalIp,
                classification.method(), classification.result(), subType,
                eventTime, now, flag, user.getPostoFixoPointId(), true));
    }

    /**
     * Dados de UMA passagem ja identificada, prontos para a decisao final.
     *
     * Existe para que os dois ramos de entrada — o dos terminais MinMoe
     * (employeeNo + subtipo) e o das cameras da portaria (rosto + nome) —
     * cheguem a {@link #registrarPassagem} pelo MESMO caminho. Sem isto, a
     * ordem das regras estaria escrita em dois lugares, e a segunda copia
     * envelheceria em silencio na primeira mudanca de politica.
     */
    private record Passagem(
            String userId,
            String employeeNoRaw,
            String nomeSnapshot,
            DoorMappingService.ResolvedMapping resolved,
            String terminalIp,
            AuthMethod method,
            AuthResult authResult,
            Integer subType,
            /** Hora do EVENTO — vai para o registro. */
            LocalDateTime eventTime,
            /** Hora da DECISAO — governa as regras. */
            LocalDateTime now,
            String flag,
            /**
             * Ponto onde esta pessoa fica POSTADA o dia inteiro, ou null.
             *
             * Copiado do cadastro no momento em que a pessoa e resolvida, e nao
             * relido depois: o valor entra na decisao desta passagem, e uma
             * mudanca de cadastro no meio do processamento nao pode mudar o que
             * ja esta sendo gravado.
             */
            String postoFixoPointId,
            /**
             * Avaliar a permissao de saida neste ponto?
             *
             * true nos TERMINAIS — comportamento historico, intocado.
             *
             * false nas CAMERAS da portaria, e a escolha e deliberada:
             * ExitPermissionService.evaluate() nega toda pessoa SEM permissao
             * ativa e nao olha o tipo do usuario. As cameras sao os primeiros
             * aparelhos a alimentar um ponto PORT de verdade, entao liga-lo
             * agora faria TODA saida de servidor virar EXIT_NOT_AUTHORIZED no
             * primeiro dia — centenas por dia, sem que ninguem tenha decidido
             * isso. Ligar a portaria a regra de saida e decisao de POLITICA (e
             * provavelmente precisa antes restringir a regra a ALUNO, ja que a
             * entidade se chama StudentExitPermission): fica para o Sam, num
             * passo proprio. Ate la a camera REGISTRA a passagem, que e o que
             * esta entrega promete.
             */
            boolean aplicarPermissaoDeSaida) {
    }

    /**
     * FASE D + mesma passagem + gravacao. Ultimo trecho comum a TODA passagem
     * identificada, venha de terminal ou de camera.
     *
     * A ordem aqui e a regra e nao muda por origem: permissao de saida ->
     * mesma passagem -> grava -> consome a permissao SINGLE.
     */
    private void registrarPassagem(Passagem p) {
        String pid = p.resolved().pointId() == null ? "" : p.resolved().pointId().toUpperCase();
        boolean isGate = pid.startsWith("PORT");
        Long consumedPermissionId = null;

        if (p.aplicarPermissaoDeSaida() && isGate && p.resolved().action() == AccessAction.SAIDA) {
            ExitDecision exitDecision = exitPermissionService.evaluate(p.userId(), p.now());
            if (!exitDecision.allowed()) {
                PolicyMode mode = policyProperties.getPolicy().getExitNotAuthorized();
                if (mode == PolicyMode.DENY) {
                    attemptService.record(
                            p.userId(), p.employeeNoRaw(), p.nomeSnapshot(),
                            p.resolved().pointId(), p.resolved().action(), p.terminalIp(),
                            p.method(), p.authResult(),
                            AuthorizationResult.DENIED, exitDecision.reason(),
                            p.subType(), p.resolved().isFallback(), p.eventTime()
                    );
                    return;
                } else if (mode == PolicyMode.OBSERVATION) {
                    attemptService.record(
                            p.userId(), p.employeeNoRaw(), p.nomeSnapshot(),
                            p.resolved().pointId(), p.resolved().action(), p.terminalIp(),
                            p.method(), p.authResult(),
                            AuthorizationResult.OBSERVATION, exitDecision.reason(),
                            p.subType(), p.resolved().isFallback(), p.eventTime()
                    );
                }
            } else {
                consumedPermissionId = exitDecision.permissionId();
            }
        }

        // MESMA PASSAGEM: o aparelho leu a mesma face duas vezes em segundos
        // (evento novo, serialNo novo — o dedup de ingestao deixa passar e faz
        // certo). Nada e gravado e o webhook responde 200: para o aparelho a
        // passagem foi aceita, que e a verdade — ela ja foi, uma vez.
        // Antes do save E antes do consumeIfSingle: uma leitura repetida nao
        // pode consumir uma permissao de saida SINGLE pela segunda vez.
        //
        // Vale ainda mais na portaria: a camera nao espera ninguem encostar
        // nela, entao quem para em frente ao portao gera evento atras de evento.
        // ⚠️ DUAS PERGUNTAS, E AS DUAS SAO PRECISAS.
        // A do BANCO cobre o que ja esta gravado (inclusive depois de um
        // reinicio). A RESERVA cobre o que ainda esta em voo: com quatro
        // aparelhos na cantina, dois leem a mesma pessoa com ~300 ms de
        // intervalo e a segunda transacao consulta ANTES de a primeira
        // commitar — as duas leem "nao existe" e as duas gravam (medido em
        // producao, 24/08/2026, FUNC-001 e FUNC-042).
        if (samePassageService.alreadyRegistered(p.userId(), p.resolved().pointId(),
                p.resolved().action(), p.eventTime())
                || samePassageService.alreadyClaimed(SamePassageService.Escopo.ACESSO,
                p.userId(), p.resolved().pointId(),
                p.resolved().action(), p.eventTime())) {
            log.debug("Mesma passagem ignorada (user={}, point={}, action={}, janela={}s)",
                    p.userId(), p.resolved().pointId(), p.resolved().action(),
                    samePassageService.windowSeconds());
            return;
        }

        // POSTO FIXO: quem TRABALHA neste ponto passa por ele o dia inteiro.
        // A primeira passagem do dia fica normal; da segunda em diante a linha
        // e gravada com flag e sai das telas padrao e dos contadores.
        //
        // DEPOIS da regra de mesma passagem, de proposito: leitura repetida em
        // segundos nem chega aqui, e nao vale gastar uma consulta com ela.
        //
        // O flag de NEGOCIO vence quando ja existe. FORA_HORARIO e
        // EXCEDEU_TEMPO nomeiam um problema que alguem precisa ver; POSTO_FIXO
        // so diz "isto e rotina". Silenciar um alerta porque a pessoa esta de
        // servico ali seria trocar informacao por sossego. O campo e um so
        // (access_logs.flag, String de 32) e nao ha empilhamento.
        String flag = p.flag();
        if (flag == null) {
            flag = postoFixoService.flagDaRepeticao(
                    p.userId(), p.postoFixoPointId(), p.resolved().pointId(), p.eventTime());
        }

        // PRESENCA JA ABERTA: uma ENTRADA de quem ja esta dentro nao abre visita
        // nova. Producao 10/08/2026: o aluno 0003053 entrou no CDI quatro vezes
        // em cinco minutos, sem saida entre elas — a regra de mesma passagem
        // (30 s) nao alcanca porque o que se repete nao e a LEITURA, e a
        // presenca.
        //
        // DEPOIS do posto fixo, de proposito: para quem esta POSTADO ali, a
        // explicacao verdadeira da repeticao e o posto, nao a presenca aberta.
        // Ambas saem das contagens do mesmo jeito, entao a ordem so decide qual
        // palavra o Journal mostra — e ela deve ser a mais informativa.
        if (flag == null) {
            flag = presencaAbertaService.flagDeEntradaRepetida(
                    p.userId(), p.resolved().pointId(), p.resolved().action(), p.eventTime());
        }

        // ── RÉGIME DE SORTIE (V014) ──────────────────────────────────────
        // A regra ANUAL assinada pelos responsaveis. Roda no portao, na SAIDA,
        // para os DOIS ramos — terminal e camera — porque e no portao que a
        // crianca sai, e a camera e o aparelho que enxerga esse portao.
        //
        // ⚠️ SO OBSERVA. Nunca retorna, nunca impede a gravacao, nunca nega:
        // o MAGBO e observacional (ADR-003) e quem decide e o adulto que esta
        // ali. O que esta linha faz e deixar registrado que o sistema avisou —
        // e e isso que a direcao vai procurar depois de um incidente.
        //
        // ⚠️ Custo aceito: nos terminais, exitPermissionService.evaluate() roda
        // duas vezes (aqui dentro do RegimeSortieService, e no bloco de
        // permissao acima). A alternativa seria a ordem das regras de saida
        // existir em dois lugares, e a segunda copia envelheceria na primeira
        // mudanca de politica. Uma consulta indexada a mais vale menos que isso.
        //
        // DEPOIS da regra de mesma passagem, de proposito: leitura repetida em
        // segundos nao gera aviso repetido no feed da Vie Scolaire.
        //
        // ⚠️ eventTime, e NAO `now` — excecao consciente a regra "regras usam o
        // relogio da DECISAO". Aquela regra existe para que uma fila offline
        // esvaziada nao mude DENY/ALLOW retroativamente. Esta regra NUNCA nega:
        // ela descreve se, no instante em que a crianca cruzou o portao, o
        // regime dela autorizava aquilo. Julgar isso pelo relogio do
        // processamento seria dizer que uma saida das 10h foi "a saida normal do
        // fim do dia" so porque o servidor a processou as 18h — a mesma troca de
        // relogios que produziu as duracoes negativas de 03/08/2026. Apanhado
        // por RegimeGateWiringTest, que rodava depois das 17h e passava verde.
        if (isGate && p.resolved().action() == AccessAction.SAIDA) {
            RegimeDecision regime = regimeSortieService.avaliar(p.userId(), p.eventTime());
            // ⚠️ TRES veredictos deixam rastro, nao um.
            //
            // A primeira versao so gravava NON_AUTORISE, e o resultado foi que
            // A_VERIFIER — o valor que o javadoc do proprio RegimeVerdict chama
            // de "o mais importante do enum" — nao existia em lugar nenhum:
            // nem em access_attempts, nem em feed, nem em relatorio. Um
            // veredicto que ninguem consegue contar depois nao pode ser
            // melhorado, e era justamente o do regime 2, metade dos casos
            // duvidosos (painel de revisao, AED, 14/08/2026).
            //
            // ⚠️ A_VERIFIER NAO E OBJECAO. Vai como OBSERVATION com motivo
            // proprio (REGIME_TO_VERIFY) porque o MAGBO nao discorda da saida:
            // ele nao sabe, e o registro diz exatamente isso. Ler estas linhas
            // como recusas seria contar contra o aluno uma limitacao do sistema.
            //
            // INCONNU continua SEM rastro de proposito: no dia 1 sao 923 alunos
            // sem regime, e 923 linhas por dia afogariam o feed e as duas
            // familias que importam. Quando a property `desconhecido` virar
            // DENY, o veredicto passa a ser NON_AUTORISE e cai no primeiro ramo.
            DenialReason motivoRegistro = null;
            if (regime.verdict() == RegimeVerdict.NON_AUTORISE) {
                // Dois motivos distintos: "regime 1 saindo no meio da jornada" e
                // "ninguem preencheu o papel deste aluno" pedem acoes diferentes
                // da Vie Scolaire.
                motivoRegistro = "regime.motivo.sem.regime".equals(regime.motivo())
                        ? DenialReason.REGIME_UNKNOWN
                        : DenialReason.REGIME_NOT_ALLOWED;
            } else if (regime.verdict() == RegimeVerdict.A_VERIFIER) {
                motivoRegistro = DenialReason.REGIME_TO_VERIFY;
            }

            if (motivoRegistro != null) {
                // ⚠️ ISOLADA: transacao propria (REQUIRES_NEW) E catch AQUI, no
                // chamador. Os dois juntos, porque o try/catch DENTRO do metodo
                // nao alcanca as duas falhas que importam: o interceptador do
                // Spring lanca ANTES do corpo quando o pool nao tem segunda
                // conexao (CannotCreateTransactionException) e DEPOIS do corpo
                // quando o INSERT falhou e marcou a transacao interna como
                // rollback-only — o catch interno engole o erro do save, mas o
                // COMMIT dela estoura em seguida (UnexpectedRollbackException),
                // ja fora de qualquer try do metodo. Sem este catch, esse
                // estouro atravessa a transacao DESTA passagem e apaga o
                // access_log — exatamente o defeito que o metodo existe para
                // impedir (painel de revisao, leitor adversario, 14/08).
                try {
                    attemptService.recordObservacaoIsolada(
                            p.userId(), p.employeeNoRaw(), p.nomeSnapshot(),
                            p.resolved().pointId(), p.resolved().action(), p.terminalIp(),
                            p.method(), p.authResult(),
                            AuthorizationResult.OBSERVATION, motivoRegistro,
                            p.subType(), p.resolved().isFallback(), p.eventTime()
                    );
                } catch (RuntimeException e) {
                    // O aviso se perde; a passagem fica. Sem a observacao a Vie
                    // Scolaire nao ve um alerta; sem o access_log ninguem sabe
                    // que a crianca saiu.
                    log.error("Observação de regime NÃO gravada (a passagem foi preservada): user={}, motivo={}, erro={}",
                            p.userId(), motivoRegistro, e.toString());
                }
                log.info("Régime de sortie: user={}, veredicto={}, motivo={}, regime={}",
                        p.userId(), regime.verdict(), regime.motivo(), regime.regimeSortie());
            }
        }

        AccessLog accessLog = AccessLog.builder()
                .userId(p.userId())
                .pointId(p.resolved().pointId())
                .action(p.resolved().action())
                // Hora do EVENTO, nao a da recepcao: e daqui que saem os
                // relatorios de horario e duracao (incidente da fila offline
                // de 03/08/2026).
                .timestamp(p.eventTime())
                .flag(flag)
                .authMethod(p.method())
                .hikvisionSubEventType(p.subType())
                .build();

        accessLogRepository.save(accessLog);

        if (consumedPermissionId != null) {
            exitPermissionService.consumeIfSingle(consumedPermissionId);
        }

        // `flag` e nao `p.flag()`: e o valor EFETIVAMENTE gravado, ja incluindo
        // o POSTO_FIXO decidido aqui. Uma linha de log que nao corresponde ao
        // que foi para o banco e pior que nenhuma.
        log.info("Access Log: user={}, point={}, action={}, flag={}, method={}, subType={}, fallback={}",
                p.userId(), p.resolved().pointId(), p.resolved().action(), flag,
                p.method(), p.subType(), p.resolved().isFallback());
    }

    /**
     * Entrada das CAMERAS da portaria: a pessoa ja foi identificada pelo
     * {@link CameraIdentityService}; aqui se decide e se grava.
     *
     * Difere do ramo dos terminais so na origem da identidade. Tudo o que vem
     * depois — usuario inativo, permissao de saida, mesma passagem, hora do
     * evento no registro — passa pelo mesmo codigo, de proposito: se um dia a
     * politica de saida mudar, ela muda para os dois ramos ao mesmo tempo.
     *
     * NAO ha subtipo Hikvision aqui: a camera nao classifica autenticacao, ela
     * compara rostos. O campo fica null em access_logs, e e assim que se
     * distingue uma passagem de camera de uma de terminal.
     *
     * @param user       pessoa ja resolvida (nunca criada por evento de camera)
     * @param employeeNoRaw identificador bruto para auditoria (documento/pId)
     * @param terminalIp IP da camera — e o que resolve o ponto e o sentido
     */
    @Transactional
    public void processCameraRecognition(User user, String employeeNoRaw, String terminalIp,
                                         LocalDateTime eventTime) {
        DoorMappingService.ResolvedMapping resolved = doorMappingService.resolve(null, null, terminalIp);

        if (resolved.isFallback() && "ATTEMPT".equals(policyProperties.getPolicy().getMissingDoorMapping())) {
            attemptService.record(
                    user.getId(), employeeNoRaw, user.getNome(),
                    resolved.pointId(), resolved.action(), terminalIp,
                    AuthMethod.FACE, AuthResult.SUCCESS,
                    AuthorizationResult.DENIED, DenialReason.MISSING_DOOR_MAPPING,
                    null, true, eventTime
            );
            return;
        }

        LocalDateTime now = LocalDateTime.now();

        if (Boolean.FALSE.equals(user.getAtivo())) {
            PolicyMode mode = policyProperties.getPolicy().getUserInactive();
            if (mode == PolicyMode.DENY) {
                attemptService.record(
                        user.getId(), employeeNoRaw, user.getNome(),
                        resolved.pointId(), resolved.action(), terminalIp,
                        AuthMethod.FACE, AuthResult.SUCCESS,
                        AuthorizationResult.DENIED, DenialReason.USER_INACTIVE,
                        null, resolved.isFallback(), eventTime
                );
                return;
            } else if (mode == PolicyMode.OBSERVATION) {
                attemptService.record(
                        user.getId(), employeeNoRaw, user.getNome(),
                        resolved.pointId(), resolved.action(), terminalIp,
                        AuthMethod.FACE, AuthResult.SUCCESS,
                        AuthorizationResult.OBSERVATION, DenialReason.USER_INACTIVE,
                        null, resolved.isFallback(), eventTime
                );
            }
        }

        registrarPassagem(new Passagem(
                user.getId(), employeeNoRaw, user.getNome(), resolved, terminalIp,
                // A camera SEMPRE reconhece por rosto, e ela ja "aprovou" a
                // comparacao — o que o MAGBO decide vem depois.
                AuthMethod.FACE, AuthResult.SUCCESS, null,
                eventTime, now, null, user.getPostoFixoPointId(),
                // Permissao de saida NAO avaliada aqui — ver o javadoc do campo
                // em Passagem. Ligar isso e decisao de politica, nao efeito
                // colateral de a portaria passar a enxergar.
                false));
    }

    /**
     * Tentativa NEGADA vinda de camera: rosto sem dono, ou nome ambiguo.
     *
     * Nao ha userId para atribuir — e exatamente esse o ponto. O nome que a
     * camera leu vai para nome_snapshot, que e a unica pista de quem passou.
     *
     * Aplica a regra de MESMA PASSAGEM tambem aqui: quem fica parado diante da
     * camera sem estar cadastrado geraria uma tentativa por evento, e o feed da
     * portaria viraria uma coluna com a mesma pessoa cem vezes.
     *
     * ⚠️ COMPROMISSO ASSUMIDO, e ele tem um custo real.
     *
     * A chave do colapso e `employeeNoRaw` (ver CameraAlarmDto#identificadorBruto).
     * Quando a camera RECONHECEU alguem — ainda que o MAGBO recuse — ha numero
     * de documento ou human_id, e o colapso e por PESSOA: exato, sem juntar
     * gente diferente.
     *
     * Quando a comparacao FALHOU (contrastFailed) o payload nao traz nada que
     * distinga um estranho de outro: o pId e unico por deteccao e o faceId se
     * repete entre pessoas. Sobra o rotulo constante, e o colapso passa a ser
     * por PONTO + ACAO + MOTIVO + janela de 30s.
     *
     * O que isso custa: duas pessoas DIFERENTES e nao reconhecidas passando no
     * mesmo portao dentro de 30s viram UMA linha em access_attempts. Num
     * portao de escola as 07:30 isso acontece. Portanto a contagem de
     * "nao reconhecidos" deixa de ser "quantos estranhos passaram" e vira
     * "em quantos momentos passou pelo menos um estranho" — serve para o
     * operador olhar o portao, NAO serve como estatistica de quantas pessoas
     * entraram sem ser reconhecidas.
     *
     * A alternativa seria nao colapsar nada e deixar o feed encher: quem fica
     * parado gera um evento a cada poucos segundos, e uma tela cheia da mesma
     * pessoa e uma tela que ninguem le. Entre perder a contagem exata de
     * estranhos e perder a tela, escolhe-se perder a contagem.
     *
     * Nada disso afeta access_logs: quem foi reconhecido colapsa por userId,
     * que e exato.
     */
    @Transactional
    public void processCameraDenied(String employeeNoRaw, String nomeSnapshot, String terminalIp,
                                    DenialReason reason, LocalDateTime eventTime) {
        DoorMappingService.ResolvedMapping resolved = doorMappingService.resolve(null, null, terminalIp);

        if (samePassageService.alreadyAttempted(employeeNoRaw, resolved.pointId(), resolved.action(),
                AuthorizationResult.DENIED, reason, eventTime)) {
            log.debug("Mesma tentativa de camera ignorada (raw={}, point={}, motivo={}, janela={}s)",
                    employeeNoRaw, resolved.pointId(), reason, samePassageService.windowSeconds());
            return;
        }

        attemptService.record(
                null, employeeNoRaw, nomeSnapshot,
                resolved.pointId(), resolved.action(), terminalIp,
                AuthMethod.FACE, AuthResult.SUCCESS,
                AuthorizationResult.DENIED, reason,
                null, resolved.isFallback(), eventTime
        );
    }

    /**
     * Valida janela de entrada na cantina.
     * Retorna null se OK, "FORA_HORARIO" se fora da janela.
     */
    /**
     * @deprecated NAO E MAIS A REGRA DA CANTINA (V021, ADR-005).
     *
     * ⚠️ A janela de acesso ao refeitorio vive agora em {@link MealSlotService},
     * sobre `meal_slots` / `meal_slot_classes` / `meal_slot_students`. Este
     * metodo continua aqui porque `EntryWindowRegressionTest` congela o
     * comportamento HISTORICO — o que a escola tinha antes do planning
     * configuravel — e apagar essa blindagem apagaria a unica descricao
     * executavel do que mudou.
     *
     * ⚠️ NAO O RELIGAR. Duas fontes de verdade para a mesma janela e
     * exatamente o que a V021 existiu para acabar: `class_schedules` guarda a
     * grade de 2025, e foi ela a origem dos 63 OUTSIDE_MEAL_TIME de 25/08/2026.
     * `class_schedules` continua a ser lido, mas so pelo `RegimeSortieService`,
     * e para outra pergunta (a hora em que a manha da turma acaba).
     */
    @Deprecated
    private String validateEntryWindow(User user, LocalDateTime now) {
        String turma = user.getTurma();
        if (turma == null) return null;

        LocalTime time = now.toLocalTime();

        // Lycée: janela fixa 11h-15h, qualquer dia
        if (LYCEE_CLASSES.contains(turma)) {
            if (time.isBefore(cantineProperties.getLyceeInicio())
                    || time.isAfter(cantineProperties.getLyceeFim())) {
                return "FORA_HORARIO";
            }
            return null;
        }

        // Outras turmas: usa horário da turma para o dia da semana
        Optional<ClassSchedule> schedOpt = classScheduleRepository.findById(turma);
        if (schedOpt.isEmpty()) return null; // sem horário definido = não alerta

        ClassSchedule sched = schedOpt.get();
        String dayHour = getLunchTimeForDay(sched, now.getDayOfWeek());

        if (dayHour == null || "N".equalsIgnoreCase(dayHour) || dayHour.isEmpty()) {
            return "FORA_HORARIO"; // dia sem refeição = alerta
        }

        LocalTime expected = parseHour(dayHour);
        if (expected == null) return null;

        LocalTime windowEnd = expected.plus(LUNCH_WINDOW);
        if (time.isBefore(expected) || time.isAfter(windowEnd)) {
            return "FORA_HORARIO";
        }
        return null;
    }

    /**
     * Valida tempo dentro da cantina (na SAIDA).
     * Retorna "EXCEDEU_TEMPO" se passou mais do que
     * `magbo.cantine.duracao-maxima-minutos` (30 min por omissão, era 1h fixa
     * até 24/08/2026) desde a ENTRADA mais recente.
     *
     * ⚠️ SÓ A CANTINA. Este método só é chamado dentro do ramo `isRefectory`
     * (pontos REFEI e CANTINA) — o CDI e a enfermaria nunca passam por aqui, e a
     * mudança de uma hora para trinta minutos não os alcança.
     *
     * ⚠️ `saidaEm` e a hora do EVENTO de saida, nao a hora da decisao.
     *
     * Aqui se MEDE uma duracao entre duas passagens reais, e nao se decide um
     * acesso — este metodo so carimba uma flag num log que vai ser gravado de
     * qualquer jeito. Por isso ele escapa da regra do `now` la em cima (o
     * relogio das REGRAS, que governa DENY/ALLOW): trocar aquele mudaria
     * politica; trocar este corrige uma medicao.
     *
     * O outro lado da subtracao (`lastEntry.getTimestamp()`) ja e hora de
     * EVENTO desde 8d78f41. Comparar hora de evento com hora de decisao era
     * misturar dois relogios: com uma fila offline esvaziada, uma entrada as
     * 12:00 e uma saida as 12:20 chegando juntas as 14:51 davam 2h51 de
     * permanencia e um EXCEDEU_TEMPO que nunca aconteceu. Com os dois lados em
     * hora de evento, da os 20 minutos que a pessoa realmente ficou.
     *
     * A LOGICA do metodo nao mudou — nem a consulta, nem o limite, nem a
     * comparacao estrita. Mudou o argumento que o chamador passa. Os testes de
     * blindagem (ExitTimeRegressionTest) continuam valendo sem alteracao.
     */
    private String validateExitTime(String userId, String pointId, LocalDateTime saidaEm) {
        Optional<AccessLog> lastEntry = accessLogRepository
                .findTopByUserIdAndPointIdAndActionOrderByTimestampDesc(userId, pointId, AccessAction.ENTRADA);

        if (lastEntry.isEmpty()) return null;

        Duration inside = Duration.between(lastEntry.get().getTimestamp(), saidaEm);
        if (inside.compareTo(cantineProperties.duracaoMaxima()) > 0) {
            return "EXCEDEU_TEMPO";
        }
        return null;
    }

    private String getLunchTimeForDay(ClassSchedule s, DayOfWeek day) {
        // O switch vive no modelo (ClassSchedule.midiDoDia) desde que o regime
        // de sortie passou a ler a mesma grade — fonte unica, logica identica.
        return s.midiDoDia(day);
    }

    private LocalTime parseHour(String h) {
        if (h == null || h.isEmpty()) return null;
        try {
            // Formato "11H00", "12H30", "13H00"
            String clean = h.toUpperCase().replace("H", ":");
            return LocalTime.parse(clean);
        } catch (Exception e) {
            log.warn("Could not parse lunch time: {}", h);
            return null;
        }
    }
}
