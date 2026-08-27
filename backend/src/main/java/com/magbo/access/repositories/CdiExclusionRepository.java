package com.magbo.access.repositories;

import com.magbo.access.models.CdiExclusion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CdiExclusionRepository extends JpaRepository<CdiExclusion, Long> {

    /**
     * As exclusoes NAO levantadas.
     *
     * ⚠️ O filtro de DATA fica em Java (`ativaEm`), nao aqui: `ate` compara-se
     * com o dia da PASSAGEM, e uma consulta que filtrasse por `current_date`
     * julgaria pelo relogio do banco. A lista de exclusoes vivas e curta
     * (dezenas, nunca milhares) — nao ha custo em traze-la inteira.
     */
    List<CdiExclusion> findByRevogadoEmIsNull();

    List<CdiExclusion> findAllByOrderByCriadoEmDesc();
}
