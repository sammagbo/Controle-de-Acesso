package com.magbo.access.repositories;

import com.magbo.access.models.AccessAttempt;
import com.magbo.access.models.DenialReason;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface AccessAttemptRepository extends JpaRepository<AccessAttempt, Long> {

    long countByTimestampGreaterThanEqual(LocalDateTime start);

    /**
     * NEGADAS de verdade — tudo menos o que e' apenas OBSERVACAO de que o MAGBO
     * NAO SABE.
     *
     * ⚠️ REGIME_TO_VERIFY NAO E' RECUSA, e conta-la como tal conta contra o
     * aluno uma limitacao do sistema. Ela nasce do regime 2 (semi-libre), cuja
     * saida depende de ter havido ausencia de professor — informacao que vive
     * na grade do Pronote e nunca chegou aqui. O MAGBO nao DISCORDA daquela
     * saida: ele nao sabe, grava OBSERVATION (jamais DENIED) e diz isso na
     * tela. Somada ao numero chamado "tentativas negadas", ela transformava
     * "faltou-me um dado" em "esta crianca foi barrada" — e e' esse numero que
     * a direcao le.
     *
     * As demais OBSERVATION continuam contadas: elas registram algo que TERIA
     * sido negado se a politica estivesse em DENY, e e' isso que a direcao
     * precisa ver antes de virar a chave. A diferenca nao e' o
     * authorization_result: e' o motivo.
     */
    @Query("SELECT COUNT(a) FROM AccessAttempt a WHERE a.timestamp >= :start "
         + "AND a.denialReason <> com.magbo.access.models.DenialReason.REGIME_TO_VERIFY")
    long countNegadasSince(@Param("start") LocalDateTime start);

    /** Quantas vezes o MAGBO registrou "nao sei" no portao hoje (regime 2). */
    @Query("SELECT COUNT(a) FROM AccessAttempt a WHERE a.timestamp >= :start "
         + "AND a.denialReason = com.magbo.access.models.DenialReason.REGIME_TO_VERIFY")
    long countAVerificarSince(@Param("start") LocalDateTime start);

    long countByDenialReasonAndTimestampGreaterThanEqual(DenialReason reason, LocalDateTime start);

    List<AccessAttempt> findTop200ByPointIdInAndTimestampAfterOrderByTimestampDesc(List<String> pointIds, LocalDateTime after);

    List<AccessAttempt> findTop200ByUserIdOrderByTimestampDesc(String userId);

    /**
     * MESMA PASSAGEM, lado das negadas: mesma pessoa, ponto, acao e MESMO
     * resultado dentro da janela.
     *
     * A chave e o employeeNoRaw, nao o userId: tentativa de matricula
     * desconhecida tem userId null, e null nunca casaria — justo o caso em que
     * a leitura repetida mais aparece (rosto que o terminal aprova e o MAGBO
     * nao reconhece).
     *
     * Inclui o denialReason: dois eventos com o mesmo resultado mas MOTIVOS
     * diferentes sao fatos diferentes, e engolir o segundo apagaria informacao
     * de auditoria.
     */
    boolean existsByEmployeeNoRawAndPointIdAndActionAndAuthorizationResultAndDenialReasonAndTimestampBetween(
            String employeeNoRaw, String pointId, com.magbo.access.models.AccessAction action,
            com.magbo.access.models.AuthorizationResult authorizationResult,
            DenialReason denialReason,
            LocalDateTime from, LocalDateTime to);

    @org.springframework.data.jpa.repository.Query("""
        SELECT a FROM AccessAttempt a
        WHERE (:#{#from == null} = true OR a.timestamp >= :from)
          AND (:#{#to == null} = true OR a.timestamp <= :to)
          AND (:#{#pointId == null} = true OR a.pointId = :pointId)
          AND (:#{#userId == null} = true OR a.userId = :userId)
          AND (:#{#reason == null} = true OR a.denialReason = :reason)
          AND (:#{#method == null} = true OR a.authMethod = :method)
        ORDER BY a.timestamp DESC
    """)
    org.springframework.data.domain.Page<AccessAttempt> findFiltered(
        @org.springframework.data.repository.query.Param("from") java.time.LocalDateTime from,
        @org.springframework.data.repository.query.Param("to") java.time.LocalDateTime to,
        @org.springframework.data.repository.query.Param("pointId") String pointId,
        @org.springframework.data.repository.query.Param("userId") String userId,
        @org.springframework.data.repository.query.Param("reason") com.magbo.access.models.DenialReason reason,
        @org.springframework.data.repository.query.Param("method") com.magbo.access.models.AuthMethod method,
        org.springframework.data.domain.Pageable pageable
    );

    @org.springframework.data.jpa.repository.Query("SELECT a.denialReason, COUNT(a) FROM AccessAttempt a WHERE a.timestamp >= :start GROUP BY a.denialReason")
    List<Object[]> countByReasonSince(@org.springframework.data.repository.query.Param("start") java.time.LocalDateTime start);

    @org.springframework.data.jpa.repository.Query("SELECT a.pointId, COUNT(a) FROM AccessAttempt a WHERE a.timestamp >= :start GROUP BY a.pointId")
    List<Object[]> countByPointSince(@org.springframework.data.repository.query.Param("start") java.time.LocalDateTime start);

    @org.springframework.data.jpa.repository.Query("SELECT a.authMethod, COUNT(a) FROM AccessAttempt a WHERE a.timestamp >= :start GROUP BY a.authMethod")
    List<Object[]> countByMethodSince(@org.springframework.data.repository.query.Param("start") java.time.LocalDateTime start);

    @org.springframework.data.jpa.repository.Query(value = "SELECT u.turma, COUNT(a.id) FROM access_attempts a JOIN app_users u ON u.id = a.user_id WHERE a.timestamp >= :start GROUP BY u.turma", nativeQuery = true)
    List<Object[]> countByTurmaSince(@org.springframework.data.repository.query.Param("start") java.time.LocalDateTime start);

    @org.springframework.data.jpa.repository.Query("SELECT COUNT(a) FROM AccessAttempt a WHERE a.timestamp >= :start AND a.authResult = com.magbo.access.models.AuthResult.SUCCESS AND a.authorizationResult = com.magbo.access.models.AuthorizationResult.DENIED")
    long countDivergenceSince(@org.springframework.data.repository.query.Param("start") java.time.LocalDateTime start);

}
