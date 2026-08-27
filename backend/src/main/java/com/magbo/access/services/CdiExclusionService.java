package com.magbo.access.services;

import com.magbo.access.models.CdiExclusion;
import com.magbo.access.models.User;
import com.magbo.access.repositories.CdiExclusionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * ESTA PESSOA ESTA EXCLUIDA DO CDI HOJE?
 *
 * ⚠️ A RESPOSTA NUNCA FECHA UMA PORTA. O terminal ja abriu (ADR-003); isto
 * serve para AVISAR o adulto presente. O que ele faz a seguir e com ele.
 *
 * ⚠️ O RELOGIO E O DA PASSAGEM. Uma fila offline esvaziada as 18h contem
 * passagens do meio-dia: julgadas por `now`, uma exclusao que terminou hoje
 * as 14h faria a passagem das 12h parecer permitida — e uma que comeca hoje
 * marcaria passagens de ontem. Quarto defeito de relogio evitado por escrito
 * (os tres primeiros estao no historico do projeto).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CdiExclusionService {

    private final CdiExclusionRepository repository;

    /** Trocavel em teste, como no CantineRemovalService. */
    private Clock clock = Clock.system(EventTimeResolver.ZONA_ESCOLA);

    /** O que o CDI mostra quando alguem excluido passa. */
    public record Veredicto(boolean excluido, CdiExclusion exclusao, boolean porTurma) {
        public static Veredicto livre() { return new Veredicto(false, null, false); }
    }

    /**
     * @param quando ⚠️ a hora do EVENTO, nunca `LocalDateTime.now()`
     */
    @Transactional(readOnly = true)
    public Veredicto avaliar(User user, LocalDateTime quando) {
        if (user == null) return Veredicto.livre();
        LocalDate dia = (quando == null ? LocalDate.now(clock) : quando.toLocalDate());

        List<CdiExclusion> vivas = repository.findByRevogadoEmIsNull();
        String turma = user.getTurma() == null ? null : user.getTurma().trim().toUpperCase();

        // ⚠️ A exclusao INDIVIDUAL vence a da turma, e a ordem importa para a
        // MENSAGEM, nao para o veredicto: as duas dizem «excluido», mas o
        // adulto precisa de saber se e esta crianca ou a turma inteira — a
        // conversa que ele vai ter nao e a mesma.
        Optional<CdiExclusion> individual = vivas.stream()
                .filter(e -> e.getUserId() != null && e.getUserId().equals(user.getId()))
                .filter(e -> e.ativaEm(dia))
                .findFirst();
        if (individual.isPresent()) return new Veredicto(true, individual.get(), false);

        if (turma != null && !turma.isEmpty()) {
            Optional<CdiExclusion> daTurma = vivas.stream()
                    .filter(e -> e.getTurma() != null && e.getTurma().trim().toUpperCase().equals(turma))
                    .filter(e -> e.ativaEm(dia))
                    .findFirst();
            if (daTurma.isPresent()) return new Veredicto(true, daTurma.get(), true);
        }
        return Veredicto.livre();
    }

    @Transactional(readOnly = true)
    public List<CdiExclusion> todas() {
        return repository.findAllByOrderByCriadoEmDesc();
    }

    /** As que valem HOJE — o que o ecra do CDI carrega para avisar. */
    @Transactional(readOnly = true)
    public List<CdiExclusion> ativas() {
        LocalDate hoje = LocalDate.now(clock);
        return repository.findByRevogadoEmIsNull().stream().filter(e -> e.ativaEm(hoje)).toList();
    }

    /**
     * Cria uma exclusao — de um ALUNO ou de uma TURMA, nunca das duas.
     *
     * ⚠️ `ate` nulo e legitimo e frequente: «ate segunda ordem». Nao se inventa
     * um prazo por comodidade — um prazo inventado expira sozinho sem ninguem
     * ter decidido que a situacao acabou.
     */
    @Transactional
    public CdiExclusion criar(String userId, String turma, String motivo, LocalDate ate, String quem) {
        String u = vazioViraNulo(userId);
        String t = vazioViraNulo(turma);
        if ((u == null) == (t == null)) {
            throw new IllegalArgumentException(
                    "informe UM aluno OU UMA turma — nunca os dois, nunca nenhum");
        }
        if (quem == null || quem.isBlank()) throw new IllegalArgumentException("autor obrigatorio");
        if (ate != null && ate.isBefore(LocalDate.now(clock))) {
            // Uma exclusao que ja nasce expirada nunca avisaria ninguem: e
            // quase de certeza um engano de digitacao, e recusa-la e mais util
            // do que grava-la inerte.
            throw new IllegalArgumentException("a data de fim ja passou: " + ate);
        }
        CdiExclusion nova = CdiExclusion.builder()
                .userId(u).turma(t == null ? null : t.trim().toUpperCase())
                .motivo(corta(motivo)).ate(ate)
                .criadoPor(quem.trim()).criadoEm(LocalDateTime.now(clock))
                .build();
        CdiExclusion salva = repository.save(nova);
        // Matricula ou turma, nunca o nome nem o motivo: o log nao tem a
        // protecao do banco, e o motivo conta uma sancao.
        log.info("CDI: exclusao criada — alvo={} por={}", u != null ? u : ("turma " + t), quem);
        return salva;
    }

    /** Levanta uma exclusao. SOFT: a linha fica, o historico fica. */
    @Transactional
    public Optional<CdiExclusion> levantar(Long id, String quem) {
        if (quem == null || quem.isBlank()) throw new IllegalArgumentException("autor obrigatorio");
        Optional<CdiExclusion> achada = repository.findById(id);
        achada.ifPresent(e -> {
            if (e.getRevogadoEm() == null) {
                e.setRevogadoEm(LocalDateTime.now(clock));
                e.setRevogadoPor(quem.trim());
                repository.save(e);
                log.info("CDI: exclusao {} levantada por {}", id, quem);
            }
        });
        return achada;
    }

    private static String vazioViraNulo(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static String corta(String s) {
        String t = vazioViraNulo(s);
        return t == null ? null : (t.length() > 255 ? t.substring(0, 255) : t);
    }
}
