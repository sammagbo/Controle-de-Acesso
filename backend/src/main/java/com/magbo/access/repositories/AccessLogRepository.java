package com.magbo.access.repositories;

import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import org.springframework.data.domain.Pageable;
import java.util.List;
import java.util.Optional;
import java.time.LocalDateTime;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * ⚠️ AS FLAGS DE REPETICAO E AS CONSULTAS DAQUI.
 *
 * Duas flags marcam linhas que EXISTEM mas nao abrem visita nova:
 *
 *   • {@code POSTO_FIXO} — a repeticao do dia de quem TRABALHA naquele ponto
 *     (ver {@link com.magbo.access.services.PostoFixoService});
 *   • {@code JA_PRESENTE} — a ENTRADA de quem ja estava dentro
 *     (ver {@link com.magbo.access.services.PresencaAbertaService}).
 *
 * As linhas ficam no banco para sempre — nada e apagado. O que muda e quem as
 * conta:
 *
 *   • telas padrao e contadores  -> NAO contam (o ruido e justamente o problema);
 *   • Journal / auditoria        -> contam TUDO, sempre;
 *   • contagens de pessoas DISTINTAS -> intocadas de proposito: a primeira
 *     passagem do dia nunca e marcada, entao a pessoa ja entra no DISTINCT por
 *     ela e o resultado seria numericamente identico. Mexer ali seria churn
 *     sem efeito.
 *
 * A LISTA vive em {@link #REPETICOES}, UMA vez, porque dez consultas repetindo
 * literais e como uma flag nova entra em nove delas e some da decima.
 *
 * O {@code IS NULL} nao e enfeite: a esmagadora maioria das linhas tem flag
 * nula, e {@code flag NOT IN (...)} sozinho e UNKNOWN para NULL em SQL —
 * descartaria a base inteira em silencio.
 *
 *   simetrico  : (flag IS NULL OR flag NOT IN ('POSTO_FIXO','JA_PRESENTE'))
 *   assimetrico: o acima + " OR action <> 'ENTRADA'"
 */
@Repository
public interface AccessLogRepository extends JpaRepository<AccessLog, Long> {

    /**
     * As flags cuja linha e REPETICAO — existe, mas nao abre visita nova.
     *
     * Constante de compilacao (String final) para poder ser concatenada dentro
     * de {@code @Query}. Flag nova de repeticao entra AQUI e alcanca todas as
     * consultas de uma vez; era esse o defeito que uma lista por consulta
     * convidava.
     *
     * ⚠️ Nao inclui FECHAMENTO_AUTO nem FORA_HORARIO/EXCEDEU_TEMPO: aquelas
     * marcam passagens que CONTAM (a saida sintetica fecha uma visita de
     * verdade; os alertas nomeiam um problema que alguem precisa ver).
     */
    String REPETICOES = "('POSTO_FIXO','JA_PRESENTE')";

    List<AccessLog> findTop500ByPointIdAndTimestampGreaterThanEqualOrderByTimestampDesc(String pointId, LocalDateTime timestamp);

    /**
     * Fonte das telas de setor (portaria, enfermaria, cantina) e do CDI.
     *
     * Substitui a derivada acima porque a exclusao do posto fixo tem que
     * acontecer NO BANCO, antes do teto de 500. Filtrar depois de carregar
     * devolveria menos de 500 linhas com passagens reais sobrando fora da
     * pagina — o mesmo defeito que fez o filtro de aluno do Journal migrar para
     * a consulta.
     *
     * @param incluirRepeticoes o que o botao da tela liga. false (padrao)
     *                          esconde as linhas de REPETICAO — a do dia de
     *                          quem esta de servico (POSTO_FIXO) e a entrada de
     *                          quem ja estava dentro (JA_PRESENTE); true mostra
     *                          tudo, sem esconder nada de ninguem.
     *                          ⚠️ O nome fala do CONJUNTO, e nao de uma das
     *                          flags, porque e o conjunto que ele governa — um
     *                          parametro chamado "incluirPostoFixo" que
     *                          tambem revelasse JA_PRESENTE seria a proxima
     *                          pessoa a descobrir a diferenca por acidente.
     */
    @Query("""
        SELECT a FROM AccessLog a
        WHERE a.pointId = :pointId
          AND a.timestamp >= :desde
          AND (:incluirRepeticoes = true
               OR a.flag IS NULL OR a.flag NOT IN ('POSTO_FIXO','JA_PRESENTE'))
        ORDER BY a.timestamp DESC
    """)
    List<AccessLog> findRecentesDoPonto(
            @Param("pointId") String pointId,
            @Param("desde") LocalDateTime desde,
            @Param("incluirRepeticoes") boolean incluirRepeticoes,
            Pageable pageable);

    /**
     * PRESENCA ABERTA: o ULTIMO evento desta pessoa neste ponto, ate a hora
     * informada, dentro do dia.
     *
     * Se for ENTRADA, a pessoa esta dentro e uma nova ENTRADA e repeticao.
     *
     * ⚠️ "ate a hora informada", e nao "o ultimo de todos": uma fila offline
     * esvaziada entrega evento fora de ordem, e perguntar pelo ultimo absoluto
     * faria a resposta depender de quem chegou primeiro ao banco em vez de do
     * que aconteceu antes na vida real.
     */
    Optional<AccessLog> findTopByUserIdAndPointIdAndTimestampBetweenOrderByTimestampDesc(
            String userId, String pointId, LocalDateTime from, LocalDateTime to);

    /**
     * POSTO FIXO: esta pessoa ja passou por este ponto no dia?
     *
     * A janela vem fechada dos dois lados (00:00:00 a 23:59:59.999999999) pelo
     * chamador, porque o dia sai da hora do EVENTO — e uma fila offline
     * esvaziada entrega evento de ontem hoje.
     */
    boolean existsByUserIdAndPointIdAndTimestampBetween(
            String userId, String pointId, LocalDateTime from, LocalDateTime to);

    List<AccessLog> findTop500ByUserIdAndTimestampBetweenOrderByTimestampDesc(String userId, LocalDateTime from, LocalDateTime to);

    List<AccessLog> findAllByOrderByTimestampDesc(Pageable pageable);

    Optional<AccessLog> findTopByUserIdAndPointIdAndActionOrderByTimestampDesc(
            String userId, String pointId, AccessAction action);

    /**
     * O parcours do DIA de uma pessoa, em ordem.
     *
     * ⚠️ Consulta indexada, NAO um findAll() filtrado em Java. A tabela tem
     * ~440 mil linhas e o indice (user_id) da V019 existe exatamente para
     * isto — a primeira versao deste ecra varria a tabela inteira a cada
     * pesquisa. Medido na V019: 3 buffers com indice contra ~3.685 sem ele.
     *
     * ⚠️ SEM filtro de flag: um parcours mostra TUDO o que a pessoa fez,
     * incluindo as repeticoes (POSTO_FIXO, JA_PRESENTE). A tela marca-as; a
     * consulta nao as esconde. Esconder aqui faria o parcours de um porteiro
     * parecer o de alguem que passou uma vez e desapareceu.
     */
    List<AccessLog> findByUserIdAndTimestampGreaterThanEqualOrderByTimestampAsc(
            String userId, java.time.LocalDateTime desde);

    List<AccessLog> findByUserIdAndPointIdAndActionAndTimestampAfter(
            String userId, String pointId, AccessAction action, LocalDateTime after);

    /**
     * MESMA PASSAGEM: ja existe acesso aceito desta pessoa, neste ponto, nesta
     * acao, dentro da janela? Intervalo fechado dos dois lados de proposito —
     * a fila offline entrega evento fora de ordem, e o repetido pode chegar com
     * hora ANTERIOR a do que ja esta gravado.
     */
    boolean existsByUserIdAndPointIdAndActionAndTimestampBetween(
            String userId, String pointId, AccessAction action,
            LocalDateTime from, LocalDateTime to);

    /**
     * FECHAMENTO AUTOMATICO: ultimo evento do usuario naquele ponto dentro do
     * dia. Se for ENTRADA, a pessoa ficou "dentro" e precisa da SAIDA sintetica.
     */
    List<AccessLog> findByPointIdAndTimestampBetweenOrderByTimestampAsc(
            String pointId, LocalDateTime from, LocalDateTime to);

    /**
     * Consulta do Journal (Rapport General).
     *
     * O filtro de ELEVE roda AQUI, no banco, e nao sobre as linhas ja
     * carregadas na tela: com o teto de 500 linhas por carga, um aluno que
     * passou cedo num dia cheio simplesmente nao estaria entre as linhas
     * filtraveis no cliente, e a busca devolveria zero sem explicar por que.
     *
     * Casa por MATRICULA (o proprio user_id do log, que e o id do Pronote com
     * zeros a esquerda) OU por NOME do aluno em app_users. Os dois porque o
     * operador usa os dois: o nome quando conhece o aluno, a matricula quando
     * esta lendo de uma lista. O EXISTS, e nao um JOIN: movimento de matricula
     * sem cadastro em app_users (aluno removido, id fora do Pronote) nao pode
     * sumir do Journal — some do JOIN, sobrevive ao EXISTS.
     *
     * @param eleve termo JA em minusculas e JA entre '%' (o controller monta);
     *              null quando o filtro esta vazio
     * @param somenteRepeticoes lente das REPETICOES, e uma lente so — o padrao
     *              nao esconde nada. {@code null} = mostra TUDO, que e como o
     *              Journal abre e como ele tem que continuar abrindo (e a visao
     *              de auditoria). {@code TRUE} = so as linhas marcadas
     *              (POSTO_FIXO ou JA_PRESENTE), para conferir quanto ruido as
     *              regras estao absorvendo. {@code FALSE} = tudo menos elas,
     *              que e o que as outras telas ja mostram.
     */
    @Query("""
        SELECT a FROM AccessLog a
        WHERE (:#{#dateFrom == null} = true OR a.timestamp >= :dateFrom)
          AND (:#{#dateTo == null} = true OR a.timestamp <= :dateTo)
          AND (:#{#pointId == null} = true OR a.pointId = :pointId)
          AND (:#{#action == null} = true OR a.action = :action)
          AND (:#{#eleve == null} = true
               OR LOWER(a.userId) LIKE :eleve
               OR EXISTS (SELECT 1 FROM User u
                          WHERE u.id = a.userId AND LOWER(u.nome) LIKE :eleve))
          AND (:#{#somenteRepeticoes == null} = true
               OR (:#{#somenteRepeticoes == true} = true
                   AND a.flag IN ('POSTO_FIXO','JA_PRESENTE'))
               OR (:#{#somenteRepeticoes == false} = true
                   AND (a.flag IS NULL OR a.flag NOT IN ('POSTO_FIXO','JA_PRESENTE'))))
        ORDER BY a.timestamp DESC
    """)
    List<AccessLog> findFilteredLogs(
        @Param("dateFrom") LocalDateTime dateFrom,
        @Param("dateTo") LocalDateTime dateTo,
        @Param("pointId") String pointId,
        @Param("action") com.magbo.access.models.AccessAction action,
        @Param("eleve") String eleve,
        @Param("somenteRepeticoes") Boolean somenteRepeticoes,
        Pageable pageable
    );

    /**
     * O TOTAL da consulta do Journal — o gemeo de COUNT de findFilteredLogs.
     *
     * Existe porque contar as linhas de uma lista paginada NAO conta o banco:
     * medido em producao em 12/08/2026, o banco tinha 612 movimentos do dia e
     * a tela dizia 500 — o comprimento do teto, nao o total. O numero esteve
     * "certo" por meses, ate o trafego passar do teto; e a classe de defeito
     * que so aparece quando a escola cresce.
     *
     * ⚠️ MESMAS CLAUSULAS de findFilteredLogs, na mesma ordem — quem alterar
     * uma consulta ALTERA A OUTRA JUNTO, senao a tela volta a mostrar um total
     * que nao corresponde a lista. Unica diferenca alem do COUNT: o filtro de
     * TIPO, que na listagem roda em memoria (filtrarPorTipo, que preserva a
     * ordem e o teto), aqui entra como EXISTS — em memoria nao ha como contar
     * o que o teto ja cortou. Id sem cadastro e descartado pelos DOIS caminhos
     * quando ha filtro de tipo (mesma semantica; o EXISTS nao acha a linha).
     */
    @Query("""
        SELECT COUNT(a) FROM AccessLog a
        WHERE (:#{#dateFrom == null} = true OR a.timestamp >= :dateFrom)
          AND (:#{#dateTo == null} = true OR a.timestamp <= :dateTo)
          AND (:#{#pointId == null} = true OR a.pointId = :pointId)
          AND (:#{#action == null} = true OR a.action = :action)
          AND (:#{#eleve == null} = true
               OR LOWER(a.userId) LIKE :eleve
               OR EXISTS (SELECT 1 FROM User u
                          WHERE u.id = a.userId AND LOWER(u.nome) LIKE :eleve))
          AND (:#{#somenteRepeticoes == null} = true
               OR (:#{#somenteRepeticoes == true} = true
                   AND a.flag IN ('POSTO_FIXO','JA_PRESENTE'))
               OR (:#{#somenteRepeticoes == false} = true
                   AND (a.flag IS NULL OR a.flag NOT IN ('POSTO_FIXO','JA_PRESENTE'))))
          AND (:#{#tipo == null} = true
               OR EXISTS (SELECT 1 FROM User u2
                          WHERE u2.id = a.userId AND u2.tipo = :tipo))
    """)
    long countFilteredLogs(
        @Param("dateFrom") LocalDateTime dateFrom,
        @Param("dateTo") LocalDateTime dateTo,
        @Param("pointId") String pointId,
        @Param("action") com.magbo.access.models.AccessAction action,
        @Param("eleve") String eleve,
        @Param("somenteRepeticoes") Boolean somenteRepeticoes,
        @Param("tipo") com.magbo.access.models.UserType tipo
    );

    /**
     * Conta TODOS os eventos de acesso a partir de um instante — inclusive as
     * repeticoes de posto fixo.
     *
     * Deliberadamente CRUA e deliberadamente mantida. E a contagem que prova
     * que nada foi apagado: se ela e {@link #countRelevantesSince} divergem, a
     * diferenca sao exatamente as linhas marcadas, que continuam la.
     * Os contadores de tela usam a outra.
     */
    long countByTimestampGreaterThanEqual(LocalDateTime start);

    /**
     * O mesmo periodo, sem a repeticao de quem esta de servico no ponto.
     *
     * Este e o numero que vai para a tela ("mouvements aujourd'hui"): o
     * porteiro reconhecido 40 vezes pela camera nao pode valer 40 movimentos da
     * escola.
     */
    @Query("""
        SELECT COUNT(a) FROM AccessLog a
        WHERE a.timestamp >= :start
          AND (a.flag IS NULL OR a.flag NOT IN ('POSTO_FIXO','JA_PRESENTE'))
    """)
    long countRelevantesSince(@Param("start") LocalDateTime start);

    /** Histórico de uma pessoa — decide se um cadastro pode ser apagado ou só inativado. */
    long countByUserId(String userId);

    /**
     * Contagem de passagens de VARIAS pessoas de uma vez.
     *
     * A aba de servidores mostra o numero de passagens em cada linha, e o
     * caminho anterior perguntava uma vez POR SERVIDOR: ~194 SELECTs, cada um
     * varrendo access_logs inteira. MEDIDO em 20/08/2026 contra os 439.993
     * registros reais:
     *
     *     194 contagens separadas ... 3.775 ms de relogio, ~715.000 buffers
     *     1 consulta agrupada ......... 359 ms (30 ms no servidor), 3.707 buffers
     *     idem, com o indice da V019 ... 16,6 ms (12,9 ms), 660 buffers
     *
     * ⚠️ CRUA de proposito, exatamente como {@link #countByUserId}: conta
     * POSTO_FIXO e JA_PRESENTE tambem. Este numero decide se o cadastro PODE
     * SER APAGADO — filtrar as repeticoes faria um porteiro, cujas linhas sao
     * quase todas marcadas, aparecer com zero passagens e virar apagavel,
     * deixando essas linhas orfas. E a contagem de "existe historico?", nao a
     * de tela. Por isso ela NAO cai na doutrina das REPETICOES, e o
     * AccessLogRepositoryQueryGuardTest so inspeciona consultas cujo SQL
     * contem "flag" — esta fica de fora com razao.
     *
     * Quem nao tem passagem nenhuma NAO volta na lista; o chamador completa
     * com zero.
     */
    @Query("SELECT a.userId, COUNT(a) FROM AccessLog a WHERE a.userId IN :ids GROUP BY a.userId")
    List<Object[]> countByUserIdIn(@Param("ids") java.util.Collection<String> ids);

    // Conta acessos barrados hoje (com flag definida)
    //
    // ⚠️ POSTO_FIXO fica de fora, e esta e a exclusao mais importante de todas:
    // o card conta "linha com flag", e sem isto a marca criada para SILENCIAR
    // ruido viraria ela propria um alerta — a repeticao do porteiro apareceria
    // na tela da direcao como dezenas de "alertas hoje". A flag nomeia uma
    // passagem NORMAL de quem esta de servico; alerta ela nao e.
    @Query("""
        SELECT COUNT(a) FROM AccessLog a
        WHERE a.timestamp >= :start
          AND a.flag IS NOT NULL AND a.flag <> ''
          AND a.flag NOT IN ('POSTO_FIXO','JA_PRESENTE')
    """)
    long countBlockedSince(@Param("start") LocalDateTime start);

    // Conta pessoas "dentro" de pontos especiais: usuarios com ENTRADA hoje sem SAIDA correspondente posterior
    // Simplificação: conta IDs distintos de usuários cuja última ação hoje foi ENTRADA
    //
    // ⚠️ As ENTRADAs de posto fixo saem da contagem, mas as SAIDAs marcadas
    // continuam FECHANDO no NOT EXISTS: uma saida real fecha a presenca tenha
    // ela flag ou nao. Excluir dos dois lados deixaria de pe quem ja saiu.
    //
    // ⚠️ O `b.timestamp >= :start` do NOT EXISTS NAO MUDA O RESULTADO — e essa e
    // exatamente a razao de ele existir. Por transitividade
    // (b.timestamp > a.timestamp >= :start) ele ja era verdade para toda linha
    // que o NOT EXISTS poderia encontrar; nenhuma linha entra nem sai da
    // contagem. Mas o planejador NAO deriva transitividade atraves de uma
    // subconsulta correlacionada: sem o predicado constante ele materializava
    // TODAS as SAIDAs da tabela — 216 mil linhas em hash — para casar contra as
    // poucas ENTRADAs do dia.
    //
    // Medido num Postgres local com os 439.993 registros reais (15/08/2026):
    //   sem esta linha   Parallel Hash Anti Join · 7529 paginas · 44,4 ms
    //   com esta linha   Merge Anti Join         · 1584 paginas ·  3,3 ms
    //   + indice V018 (timestamp)                ·   11 paginas ·  0,134 ms
    // Esta consulta roda a cada 5 segundos, por painel administrativo aberto.
    //
    // ⚠️ NAO acrescente `b.pointId = a.pointId` aqui achando que corrige um
    // esquecimento: uma SAIDA em QUALQUER ponto fechar uma ENTRADA de outro e
    // decisao declarada acima ("Simplificacao"), nao acidente. Mudar isso muda
    // o NUMERO que a direcao le, e e outra conversa.
    @Query("""
        SELECT COUNT(DISTINCT a.userId) FROM AccessLog a
        WHERE a.timestamp >= :start
          AND a.action = com.magbo.access.models.AccessAction.ENTRADA
          AND (a.flag IS NULL OR a.flag NOT IN ('POSTO_FIXO','JA_PRESENTE'))
          AND NOT EXISTS (
              SELECT 1 FROM AccessLog b
              WHERE b.userId = a.userId
                AND b.timestamp > a.timestamp
                AND b.timestamp >= :start
                AND b.action = com.magbo.access.models.AccessAction.SAIDA
          )
    """)
    long countActiveUsersSince(@Param("start") LocalDateTime start);

    List<AccessLog> findByPointIdInAndTimestampAfterOrderByTimestampDesc(
            List<String> pointIds, LocalDateTime after);

    /**
     * TODA passagem da janela, de TODO ponto — sem lista branca.
     *
     * ⚠️ Existe para o PPMS, e a ausencia de filtro de ponto E o requisito.
     * A primeira versao daquele servico filtrava por AreaMapping.pointToArea(),
     * um Map.of de sete pontos escritos a mao; CANTINA1, que outros controllers
     * ja tratam como ponto de primeira classe, ficava de fora — e um aluno na
     * cantina DESAPARECIA da lista de evacuacao, em silencio. Numa lista onde um
     * nome que falta e uma crianca que ninguem procura, nao ha filtro seguro
     * senao nenhum.
     */
    List<AccessLog> findByTimestampBetweenOrderByTimestampAsc(
            LocalDateTime from, LocalDateTime to);

    List<AccessLog> findByPointIdInAndTimestampBetweenOrderByTimestampDesc(
            List<String> pointIds, LocalDateTime from, LocalDateTime to);

    // Total de movimentos no período (excluindo portões e a repetição de posto fixo)
    @Query(value = "SELECT COUNT(*) FROM access_logs WHERE timestamp BETWEEN :from AND :to AND point_id NOT IN ('PORT1','PORT2','PORT3') AND (flag IS NULL OR flag NOT IN ('POSTO_FIXO','JA_PRESENTE'))", nativeQuery = true)
    long countMovementsInternal(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Total de movimentos no período — CRU, inclusive posto fixo.
    // Contraparte de countMovementsInternal e a prova de que nada é apagado.
    @Query(value = "SELECT COUNT(*) FROM access_logs WHERE timestamp BETWEEN :from AND :to", nativeQuery = true)
    long countMovements(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Alunos únicos no período.
    // Sem exclusão de posto fixo de propósito: a PRIMEIRA passagem do dia nunca
    // é marcada, então a pessoa já entra no DISTINCT por ela — o resultado
    // seria idêntico e o filtro, ruído no código.
    @Query(value = "SELECT COUNT(DISTINCT user_id) FROM access_logs WHERE timestamp BETWEEN :from AND :to", nativeQuery = true)
    long countUniqueStudents(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Movimentos por hora (0-23)
    @Query(value = "SELECT CAST(EXTRACT(HOUR FROM timestamp) AS int) AS hour, COUNT(*) AS cnt FROM access_logs WHERE timestamp BETWEEN :from AND :to AND point_id NOT IN ('PORT1','PORT2','PORT3') AND (flag IS NULL OR flag NOT IN ('POSTO_FIXO','JA_PRESENTE')) GROUP BY hour ORDER BY hour", nativeQuery = true)
    java.util.List<Object[]> countByHour(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Movimentos, únicos e entradas por point_id no período
    @Query(value = "SELECT point_id, COUNT(*) AS mov, COUNT(DISTINCT user_id) AS uniq, COUNT(*) FILTER (WHERE action='ENTRADA') AS entries FROM access_logs WHERE timestamp BETWEEN :from AND :to AND (flag IS NULL OR flag NOT IN ('POSTO_FIXO','JA_PRESENTE')) GROUP BY point_id", nativeQuery = true)
    java.util.List<Object[]> statsByPoint(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Refeições fora do horário (flag)
    @Query(value = "SELECT COUNT(*) FROM access_logs WHERE action='ENTRADA' AND flag='FORA_HORARIO' AND timestamp BETWEEN :from AND :to", nativeQuery = true)
    long countOffScheduleMeals(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Alunos distintos que entraram por um portão hoje
    @Query(value = "SELECT COUNT(DISTINCT user_id) FROM access_logs " +
           "WHERE action='ENTRADA' AND point_id IN ('PORT1','PORT2','PORT3') " +
           "AND timestamp >= :dayStart", nativeQuery = true)
    long countPresentToday(@Param("dayStart") java.time.LocalDateTime dayStart);

    // Séjours prolongés na enfermaria no período (entrada + saída pareadas, dur > 30min)
    //
    // ⚠️ A exclusão de posto fixo vai só na ENTRADA (a linha externa). A
    // subconsulta que procura a SAÍDA vê TODAS as linhas de propósito: a saída
    // aconteceu, tenha ela flag ou não, e escondê-la inventaria um séjour que
    // nunca terminou. Sem isto, a enfermeira postada em ENFERM produziria um
    // "séjour prolongé" por reconhecimento.
    @Query(value = "SELECT COUNT(*) FROM (" +
           "  SELECT e.user_id, e.timestamp AS ent, " +
           "    (SELECT MIN(s.timestamp) FROM access_logs s WHERE s.user_id=e.user_id AND s.point_id='ENFERM' AND s.action='SAIDA' AND s.timestamp > e.timestamp) AS sai " +
           "  FROM access_logs e WHERE e.point_id='ENFERM' AND e.action='ENTRADA' AND e.timestamp BETWEEN :from AND :to" +
           "    AND (e.flag IS NULL OR e.flag NOT IN ('POSTO_FIXO','JA_PRESENTE'))" +
           ") t WHERE t.sai IS NOT NULL AND EXTRACT(EPOCH FROM (t.sai - t.ent))/60 > 30", nativeQuery = true)
    long countLongInfirmaryStays(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Entradas sem saída correspondente (cantina + enfermaria) no período
    //
    // ⚠️ Mesma assimetria da consulta acima, e pelo mesmo motivo: exclui a
    // ENTRADA marcada, nunca a SAÍDA que a fecha.
    /**
     * ⚠️ A CARÊNCIA DE 4 HORAS, e por que ela entrou nas TRÊS consultas.
     *
     * Uma ENTRADA feita ha dez minutos ainda nao tem saida — e nao deveria ter.
     * Sem exigir que a janela de pareamento JA TENHA PASSADO, "entrada sem
     * saida registrada" inclui todo mundo que esta la dentro AGORA.
     *
     * Medido em 15/08/2026 sobre as 439.993 passagens reais, no dia de maior
     * movimento (29/01), consultando o proprio dia:
     *
     *       hora da consulta   sem carencia   com carencia
     *              12:30             1              0
     *              13:00            33              0     <-- almocando
     *              18:00            41             39
     *
     * As 33 do meio-dia sao criancas sentadas no refeitorio. Como NUMERO isso
     * passou tres semanas sem incomodar ninguem; como LISTA DE NOMES seria uma
     * acusacao contra 33 alunos que nao fizeram nada — e o brief e' explicito:
     * na segunda vez que alguem for nomeado errado, ninguem abre a tela de novo.
     * As 18:00 a diferenca some (41 contra 39), que e' como tem de ser: o defeito
     * so' existe ENQUANTO o dia corre.
     *
     * ⚠️⚠️ O `CAST(:to AS timestamp)` NAO E ENFEITE — sem ele o endpoint QUEBRA.
     * O PostgreSQL nao infere o tipo de um bind: `? - interval '4 hours'` resolve
     * `unknown - interval` como INTERVAL, e a comparacao vira
     * `timestamp < interval`, que nao existe. Erro real, medido em 20/08/2026:
     *
     *     ERROR: operator does not exist: timestamp without time zone < interval
     *
     * ⚠️ E foi por isso que a medicao de 15/08 passou e a producao quebrou: eu
     * medi no psql com LITERAL ('2026-01-29 13:00'::timestamp - interval '4
     * hours' -> 106683 linhas), e o app chama com PARAMETRO. As duas formas nao
     * sao equivalentes, e a diferenca so aparece com bind. Provado nos dois
     * sentidos:
     *     literal   ... '2026-01-29 13:00'::timestamp - interval '4 hours'  OK
     *     parametro ... $1 - interval '4 hours'                             ERRO
     *
     * ⚠️ O sintoma nao parecia um erro de SQL: o /error do Spring nao esta no
     * permitAll, entao o 500 chegava ao front como 403 de corpo vazio, o
     * fetchOverview engolia e devolvia null, e o Rapport mostrava os cinco KPIs
     * em ZERO com o farol "Serveur hors ligne" — sistema funcionando com cara de
     * fora do ar. Medir com literal o que a aplicacao chama com parametro e o
     * erro que este bloco existe para nao deixar repetir.
     *
     * ⚠️ ISTO MUDA O NUMERO DO CARD durante o dia — e' uma mudanca de
     * comportamento, deliberada, e o dono pode reverte-la. A alternativa era
     * pior das duas formas: uma lista que nomeia quem esta almocando, ou uma
     * lista que discorda do card. O numero de fim de dia, que e' o que entra em
     * relatorio, praticamente nao muda.
     */
    @Query(value = "SELECT COUNT(*) FROM access_logs e " +
           "WHERE e.action='ENTRADA' AND e.point_id IN ('REFEI1','REFEI2','ENFERM') " +
           "AND e.timestamp BETWEEN :from AND :to " +
           "AND e.timestamp < CAST(:to AS timestamp) - interval '4 hours' " +
           "AND (e.flag IS NULL OR e.flag NOT IN ('POSTO_FIXO','JA_PRESENTE')) " +
           "AND NOT EXISTS (SELECT 1 FROM access_logs s WHERE s.user_id=e.user_id AND s.point_id=e.point_id AND s.action='SAIDA' AND s.timestamp > e.timestamp AND s.timestamp < e.timestamp + interval '4 hours')", nativeQuery = true)
    long countUnregisteredExits(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    /**
     * AS LINHAS que `countUnregisteredExits` conta — o "quais" do "quantos".
     *
     * ⚠️ O CORPO DO WHERE E' COPIA LITERAL da consulta acima, e tem de continuar
     * sendo. Se as duas divergirem, a tela mostra "7" num card e cinco nomes na
     * lista logo abaixo — e a Vie Scolaire para de acreditar nas duas. Ha um
     * teste que semeia dados e compara `count` com `size` (LegacyRegressionIT).
     * Mudou uma? Mude a outra na mesma entrega.
     *
     * PostgreSQL-only pelo `interval '4 hours'` (o H2 exige `INTERVAL '4' HOUR`),
     * como a irma dela.
     */
    @Query(value = "SELECT e.* FROM access_logs e " +
           "WHERE e.action='ENTRADA' AND e.point_id IN ('REFEI1','REFEI2','ENFERM') " +
           "AND e.timestamp BETWEEN :from AND :to " +
           "AND e.timestamp < CAST(:to AS timestamp) - interval '4 hours' " +
           "AND (e.flag IS NULL OR e.flag NOT IN ('POSTO_FIXO','JA_PRESENTE')) " +
           "AND NOT EXISTS (SELECT 1 FROM access_logs s WHERE s.user_id=e.user_id AND s.point_id=e.point_id AND s.action='SAIDA' AND s.timestamp > e.timestamp AND s.timestamp < e.timestamp + interval '4 hours') " +
           "ORDER BY e.timestamp DESC", nativeQuery = true)
    List<AccessLog> findUnregisteredExits(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    /**
     * SAIDA sem ENTRADA anterior — a especie que NUNCA foi mostrada.
     *
     * ⚠️ Isto nao entra no contador `countUnregisteredExits` e nao muda o numero
     * do card. E' a mesma pergunta pelo outro lado: uma saida sem entrada e'
     * quase sempre a prova de que a ENTRADA e' que se perdeu. Ate 15/08/2026 ela
     * era descartada em silencio nos dois endpoints de lista
     * (`if (entrada == null) continue;`), entao ninguem nunca a viu.
     *
     * Mesma janela de 4 horas, para o outro lado, e a mesma assimetria de flag
     * das consultas vizinhas: exclui a SAIDA marcada (e' repeticao, nao
     * movimento), nunca a ENTRADA que a abriria.
     */
    @Query(value = "SELECT s.* FROM access_logs s " +
           "WHERE s.action='SAIDA' AND s.point_id IN ('REFEI1','REFEI2','ENFERM') " +
           "AND s.timestamp BETWEEN :from AND :to " +
           "AND s.timestamp < CAST(:to AS timestamp) - interval '4 hours' " +
           "AND (s.flag IS NULL OR s.flag NOT IN ('POSTO_FIXO','JA_PRESENTE')) " +
           "AND NOT EXISTS (SELECT 1 FROM access_logs e WHERE e.user_id=s.user_id AND e.point_id=s.point_id AND e.action='ENTRADA' AND e.timestamp < s.timestamp AND e.timestamp > s.timestamp - interval '4 hours') " +
           "ORDER BY s.timestamp DESC", nativeQuery = true)
    List<AccessLog> findOrphanExits(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Ocupação atual por setor: última ação de cada user em cada ponto = ENTRADA
    //
    // ⚠️ A exclusão é ASSIMÉTRICA — tira a ENTRADA marcada, NUNCA a SAÍDA.
    // Mesma assimetria de countLongInfirmaryStays e countUnregisteredExits, e
    // aqui ela foi aprendida do jeito caro (conferência manual em PostgreSQL
    // real, 10/08/2026).
    //
    // A primeira versão excluía TODA linha marcada. O DISTINCT ON escolhe a
    // última linha de cada (user, ponto); tirando também a saída, quem tem
    // posto fixo ficava preso na primeira entrada do dia e aparecia como
    // "dentro" ATÉ A MEIA-NOITE, mesmo tendo ido embora — a bibliotecária que
    // saiu às 17:00 constava no CDI às 23:00. Medido: BIBLIO 1->2, REFEI1 1->2,
    // PORT1 0->1, com as três pessoas fora do prédio.
    // E o fechamento automático não corrige: ele olha o último evento CRU, vê
    // uma SAIDA e corretamente não faz nada.
    //
    // Com a assimetria: a repetição não reabre presença (a oscilação, que era o
    // objetivo, some) e a saída real continua fechando.
    //
    // O `flag IS NULL OR` não é enfeite: quase toda linha tem flag nula, e
    // `flag <> 'POSTO_FIXO'` sozinho é UNKNOWN para NULL. A forma equivalente
    // `NOT (flag = 'POSTO_FIXO' AND action = 'ENTRADA')` devolve ZERO linhas
    // pelo mesmo motivo — foi verificada, e falha assim.
    //
    // ⚠️ PostgreSQL-only (DISTINCT ON): @Disabled no H2, a suíte NÃO protege
    // esta consulta. Roteiro de conferência manual em
    // docs/frontend-smoke-checklist.md, seção "Ocupação atual com posto fixo".
    @Query(value = "SELECT point_id, COUNT(*) FROM (" +
           "  SELECT DISTINCT ON (user_id, point_id) user_id, point_id, action " +
           "  FROM access_logs WHERE timestamp >= :dayStart " +
           "    AND (flag IS NULL OR flag NOT IN ('POSTO_FIXO','JA_PRESENTE') OR action <> 'ENTRADA') " +
           "  ORDER BY user_id, point_id, timestamp DESC" +
           ") last WHERE action='ENTRADA' GROUP BY point_id", nativeQuery = true)
    java.util.List<Object[]> currentOccupancyByPoint(@Param("dayStart") java.time.LocalDateTime dayStart);

    // Élèves únicos no período para um conjunto de pontos (uma área)
    @Query(value = "SELECT COUNT(DISTINCT user_id) FROM access_logs " +
           "WHERE timestamp BETWEEN :from AND :to AND point_id IN (:points)", nativeQuery = true)
    long countUniqueStudentsByPoints(@Param("from") java.time.LocalDateTime from,
                                     @Param("to") java.time.LocalDateTime to,
                                     @Param("points") java.util.Collection<String> points);

    // Permanência média (min): pares ENTRADA→SAIDA do mesmo user/ponto/dia via LAG
    //
    // ⚠️ Aqui a exclusão é simétrica (dentro do WINDOW, dos dois lados) — ao
    // contrário das duas consultas de "entrada sem saída". A diferença: ali
    // esconder a saída inventaria um problema; aqui o LAG emparelha vizinhos, e
    // deixar as repetições de quem está de serviço no meio produziria pares
    // ENTRADA→SAIDA de segundos que puxariam a permanência média para baixo.
    // ⚠️ Duas exclusões a mais desde 12/08/2026, e cada uma tem um porquê:
    //
    // FECHAMENTO_AUTO sai do WINDOW (não só do resultado): a SAIDA das 17:00
    // é sintética — carimbada na hora do fechamento, não na hora em que
    // alguém saiu — e formava par ENTRADA→17:00 de dia inteiro. Era ela que
    // fazia a "Durée moyenne" CRESCER com o período: "hoje" antes das 17h
    // ainda não tem fechamentos (visita aberta não tem par), e cada dia
    // completo da janela carregava os seus. Medido: o mesmo padrão de
    // visitas dava 35 min como "hoje" e 203 min como dia completo. Tirar do
    // WINDOW (e não filtrar depois) também acerta o caso raro da pessoa que
    // badgeia a saída real DEPOIS do fechamento: o par volta a ser
    // ENTRADA→saída real, que é o que aconteceu.
    //
    // O piso :minVisitSeconds e a MESMA régua do Rapport CDI
    // (magbo.report.min-visit-seconds, via VisitStatsService): passagem
    // rápida não é permanência. Antes desta linha, o card do CDI no MESMO
    // painel aplicava as duas regras e cantina/enfermaria não aplicavam
    // nenhuma — dois números com réguas diferentes lado a lado.
    @Query(value = "SELECT AVG(EXTRACT(EPOCH FROM (ts - prev_ts)) / 60.0) FROM (" +
           "  SELECT action, timestamp AS ts, " +
           "    LAG(action) OVER w AS prev_action, " +
           "    LAG(timestamp) OVER w AS prev_ts " +
           "  FROM access_logs " +
           "  WHERE timestamp BETWEEN :from AND :to AND point_id IN (:points) " +
           "    AND (flag IS NULL OR flag NOT IN ('POSTO_FIXO','JA_PRESENTE')) " +
           // Predicado PROPRIO, fora da lista de repeticoes — o guarda de
           // queries reprovou a versao que os misturava, e com razao:
           // FECHAMENTO_AUTO nao e repeticao (linha que nao abre visita), e
           // uma SAIDA sintetica; a lista canonica REPETICOES e espelhada em
           // postoFixo.js e nao pode ganhar um terceiro membro por acidente.
           "    AND (flag IS NULL OR flag <> 'FECHAMENTO_AUTO') " +
           "  WINDOW w AS (PARTITION BY user_id, point_id, CAST(timestamp AS date) ORDER BY timestamp)" +
           ") t WHERE t.action = 'SAIDA' AND t.prev_action = 'ENTRADA' " +
           // Piso e TETO: passagem rapida nao e permanencia, e par acima do
           // teto e SAIDA PERDIDA (o leitor facial perde saidas; com a
           // reentrada tirada da janela pelo JA_PRESENTE, o par vai da
           // entrada original ate a saida de horas depois). Nenhuma linha e
           // apagada — so a media deixa de ler o que nao e evidencia.
           "  AND EXTRACT(EPOCH FROM (ts - prev_ts)) >= :minVisitSeconds " +
           "  AND EXTRACT(EPOCH FROM (ts - prev_ts)) <= :maxVisitSeconds", nativeQuery = true)
    Double avgStayMinutesByPoints(@Param("from") java.time.LocalDateTime from,
                                  @Param("to") java.time.LocalDateTime to,
                                  @Param("points") java.util.Collection<String> points,
                                  @Param("minVisitSeconds") long minVisitSeconds,
                                  @Param("maxVisitSeconds") long maxVisitSeconds);
}
