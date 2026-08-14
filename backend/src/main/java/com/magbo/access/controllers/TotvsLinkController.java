package com.magbo.access.controllers;

import com.magbo.access.config.TotvsProperties;
import com.magbo.access.models.User;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;

/**
 * "Abrir o prontuário desta aluna" — montando um LINK, nunca copiando o dado.
 *
 * ⚠️ Esta rota não devolve nada de saúde. Ela devolve uma URL. O prontuário vive
 * no TOTVS, a enfermeira autentica lá com a credencial dela, e o MAGBO nunca vê
 * o conteúdo — que é a única configuração em que o MAGBO não precisa de base
 * legal para dado de saúde.
 *
 * ⚠️ Nada é registrado sobre QUEM abriu QUAL ficha — decisão registrada na
 * ADR-005 (docs/architecture/decisoes/). Resumo do argumento: essa linha seria,
 * ela propria, dado de saude por adjacencia, e a rastreabilidade ja existe no
 * TOTVS, que e o dono do dado. Duplica-la aqui nao acrescentaria auditoria:
 * acrescentaria uma segunda copia, num sistema com outra base legal e outro
 * prazo de retencao. A ADR tambem diz o que o MAGBO teria de se tornar para a
 * escolha oposta ser a certa — sao quatro condicoes, e nenhuma vale hoje.
 *
 * ⚠️ Nada é registrado sobre POR QUE se abriu a ficha. Um log dizendo "fulana
 * abriu o prontuário do aluno X" é, ele próprio, um dado sensível: revela que
 * aquela criança esteve na enfermaria. Fica-se com o registro de passagem que o
 * sistema já tem (access_logs em ENFERM), que é o mesmo fato sem a inferência.
 */
@RestController
@RequestMapping("/api/totvs")
@RequiredArgsConstructor
@Slf4j
public class TotvsLinkController {

    private final TotvsProperties props;
    private final UserRepository userRepository;

    /** A configuração está preenchida? A tela usa isto para nem mostrar o botão. */
    @GetMapping("/config")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> config() {
        return ResponseEntity.ok(Map.of(
                "configurado", props.configurado(),
                "rotulo", props.getRotulo() == null ? "TOTVS" : props.getRotulo()));
    }

    /**
     * A URL da ficha de uma pessoa.
     *
     * Leitura por área 'infirmerie': quem abre prontuário é a enfermaria. Um
     * operador da cantina não tem por que alcançar esta rota, mesmo que ela só
     * devolva uma URL — a URL contém a matrícula, e a existência do link já diz
     * que aquela pessoa tem ficha.
     */
    @GetMapping("/link/{userId}")
    @PreAuthorize("@areaSecurity.can('infirmerie')")
    public ResponseEntity<?> link(@PathVariable String userId) {
        if (!props.configurado()) {
            // 501 e não 404: a diferença entre "esta pessoa não existe" e "esta
            // escola ainda não ligou a integração" importa para quem depura.
            return ResponseEntity.status(501)
                    .body(Map.of("status", "error", "message", "totvs.nao.configurado"));
        }
        Optional<User> u = userRepository.findById(userId);
        if (u.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        User user = u.get();

        String url = props.getUrlPattern()
                // ⚠️ TEXTO, com os zeros à esquerda. Cortar o zero abriria a
                // ficha de outra criança — é o mesmo defeito que o Excel produz
                // na exportação para o HikCentral.
                .replace("{matricula}", user.getId() == null ? "" : user.getId())
                .replace("{hikvision}", user.getHikvisionEmployeeId() == null ? "" : user.getHikvisionEmployeeId())
                .replace("{nome}", user.getNome() == null ? ""
                        : URLEncoder.encode(user.getNome(), StandardCharsets.UTF_8));

        return ResponseEntity.ok(Map.of("url", url));
    }
}
