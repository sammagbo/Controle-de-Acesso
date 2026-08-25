package com.magbo.access.repositories;

import com.magbo.access.models.CantineRemoval;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface CantineRemovalRepository extends JpaRepository<CantineRemoval, Long> {

    /**
     * As retiradas ATIVAS de um dia — o que o Moniteur Cantine consome.
     *
     * ⚠️ Filtra `desfeitoEm IS NULL` na CONSULTA e nao em Java. Uma retirada
     * desfeita que chegasse a tela e fosse filtrada depois seria uma linha
     * escondida por engano se alguem esquecesse o filtro num unico ponto de
     * uso — e o sintoma seria uma crianca ausente do ecra que diz quem esta no
     * refeitorio.
     */
    List<CantineRemoval> findByDiaAndDesfeitoEmIsNull(LocalDate dia);

    /** A linha desta pessoa, neste ponto, neste dia — desfeita ou nao. */
    Optional<CantineRemoval> findByUserIdAndPointIdAndDia(String userId, String pointId, LocalDate dia);
}
