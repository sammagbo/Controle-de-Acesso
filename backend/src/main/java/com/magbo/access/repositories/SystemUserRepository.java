package com.magbo.access.repositories;

import com.magbo.access.models.SystemUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SystemUserRepository extends JpaRepository<SystemUser, Long> {
    Optional<SystemUser> findByUsername(String username);
    boolean existsByUsername(String username);

    List<SystemUser> findAllByUsernameIgnoreCase(String username);
    boolean existsByUsernameIgnoreCase(String username);

    /**
     * Resolve o username SEM diferenciar caixa — do jeito que gente digita.
     *
     * Pedido do uso real (12/08/2026): "viescolaire" digitado em minúsculas
     * não entrava porque o cadastro dizia "VIESCOLAIRE". A comparação vive no
     * BACKEND de propósito: uma tela que força maiúsculas esconderia o
     * defeito e o deixaria vivo para quem usa a API direto.
     *
     * A regra, na ordem:
     *   1. casamento EXATO vence sempre — quem entrava antes continua
     *      entrando igual, inclusive se existirem "Sam" e "SAM";
     *   2. sem exato, UM único case-insensitive serve — é o caso do operador
     *      digitando minúsculas;
     *   3. sem exato e com MAIS DE UM candidato, ninguém entra por este nome
     *      — escolher seria autenticar alguém como outra pessoa. (Cadastros
     *      novos que só diferem pela caixa passaram a ser recusados na
     *      criação; este ramo cobre o legado.)
     *
     * A senha continua case-sensitive — isto é sobre o NOME, nunca sobre o
     * segredo.
     */
    default Optional<SystemUser> findByUsernameFlexivel(String username) {
        if (username == null || username.isBlank()) return Optional.empty();
        List<SystemUser> candidatos = findAllByUsernameIgnoreCase(username.trim());
        Optional<SystemUser> exato = candidatos.stream()
                .filter(u -> u.getUsername().equals(username.trim()))
                .findFirst();
        if (exato.isPresent()) return exato;
        return candidatos.size() == 1 ? Optional.of(candidatos.get(0)) : Optional.empty();
    }
}
