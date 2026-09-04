package com.magbo.access.controllers;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.magbo.access.dto.auth.LoginRequest;
import com.magbo.access.models.SystemUser;
import com.magbo.access.repositories.SystemUserRepository;
import com.magbo.access.security.JwtService;
import com.magbo.access.security.Role;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * LA FIAÇÃO do diagnóstico de login — e a promessa de que PERGUNTAR o motivo
 * nunca muda a resposta.
 *
 * <p>⚠️ ESTE ARQUIVO EXISTE PORQUE OS DOIS TESTES DO CHANTIER NÃO TOCAVAM NO
 * PRODUTO DELE. {@code RaisonEchecLoginTest} chama {@code classer()} com
 * argumentos fabricados à mão; {@code LoginReponseUniformeIT} garante que a
 * RESPOSTA não diz nada. Entre os dois sobrava o essencial: a linha de journal
 * — a única coisa que este chantier entrega — não era lida por ninguém, e os
 * ARGUMENTOS passados a {@code classer()} não eram capturados por ninguém.
 * Apagar a chamada inteira do {@code AuthController} deixava a suíte verde.
 *
 * <p>É a mesma disciplina de {@code RegimeGateWiringTest#regimeUsaAHoraDaPassagem}:
 * capturar o <b>argumento</b>, não o veredicto. Um teste que só confere o
 * veredicto de uma função pura não prova que alguém a chama, nem com o quê.
 *
 * <p>Sem Spring de propósito: {@code AbstractIT} avisa que anotação ou
 * {@code @MockBean} em subclasse forka o cache de contexto e faz os ITs
 * reiniciarem. Aqui o controller é construído à mão — é o que permite simular
 * um banco que não responde, coisa que nenhum IT consegue.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("Login — fiação do diagnóstico e garde do banco fora do ar")
class AuthControllerDiagnosticGuardTest {

    @Mock AuthenticationManager authManager;
    @Mock SystemUserRepository userRepo;
    @Mock JwtService jwtService;

    private AuthController controleur;
    private Logger logger;
    private ListAppender<ILoggingEvent> journal;

    @BeforeEach
    void setUp() {
        controleur = new AuthController(authManager, userRepo, jwtService);
        // Todo cenário deste arquivo é um login RECUSADO.
        when(authManager.authenticate(any()))
                .thenThrow(new BadCredentialsException("Bad credentials"));

        logger = (Logger) LoggerFactory.getLogger(AuthController.class);
        logger.setLevel(Level.DEBUG);
        journal = new ListAppender<>();
        journal.start();
        logger.addAppender(journal);
    }

    @AfterEach
    void tearDown() {
        logger.detachAppender(journal);
        journal.stop();
    }

    private static LoginRequest requete(String username, String senha) {
        LoginRequest r = new LoginRequest();
        r.setUsername(username);
        r.setPassword(senha);
        return r;
    }

    private static SystemUser compte(String username, boolean ativo) {
        return SystemUser.builder()
                .username(username)
                .passwordHash("$2a$10$peu.importe")
                .nomeCompleto("Compte " + username)
                .role(Role.OPERATOR)
                .ativo(ativo)
                .build();
    }

    /** A única linha WARN emitida — o teste falha se houver zero ou várias. */
    private String ligneDeJournal() {
        List<ILoggingEvent> warns = journal.list.stream()
                .filter(e -> e.getLevel() == Level.WARN)
                .toList();
        assertThat(warns).hasSize(1);
        return warns.get(0).getFormattedMessage();
    }

    private static void assertRecusadoSemVazar(ResponseEntity<?> reponse) {
        assertThat(reponse.getStatusCode().value()).isEqualTo(401);
        assertThat(((Map<?, ?>) reponse.getBody()).get("error")).isEqualTo("Credenciais inválidas");
    }

    @Test
    @DisplayName("★★★ o banco fora do ar NÃO transforma o 401 em 500 — e o journal ainda diz algo")
    void bancoForaDoArNaoDerrubaAResposta() {
        // ⚠️ O DEFEITO QUE ESTE TESTE CONGELA. Classer é consultar o banco, e a
        // consulta acontece DENTRO do catch. Se a pane É o banco, ela estoura de
        // novo, de um lugar onde nada a pega: o projeto não tem
        // @ControllerAdvice. Sem a garde, a resposta viraria 500 — e só para
        // alguns nomes, que é exatamente o oráculo de existência de conta que
        // LoginReponseUniformeIT proíbe.
        when(userRepo.findByUsernameFlexivel(any()))
                .thenThrow(new DataAccessResourceFailureException("connexion a la base perdue"));

        ResponseEntity<?> reponse = controleur.login(requete("qui-que-ce-soit", "peu-importe"));

        assertRecusadoSemVazar(reponse);
        // e o silêncio de antes do chantier não volta: a linha existe e se nomeia
        assertThat(ligneDeJournal())
                .contains("raison=INDETERMINABLE")
                .contains("DataAccessResourceFailureException");
    }

    @Test
    @DisplayName("★★★ o contador de homônimos recebe o nome APARADO — sem isso os gêmeos de caixa somem")
    void oContadorDeHomonimosRecebeONomeAparado() {
        // ⚠️ CAPTURA DE ARGUMENTO, NÃO DE VEREDICTO. findByUsernameFlexivel apara
        // por dentro; o contador de homônimos precisa aparar TAMBÉM. Quem achar o
        // .trim() redundante e o apagar faz `  Vs  ` contar 0 homônimos: o journal
        // passa a dizer UTILISATEUR_INCONNU sobre um nome que existe em dobro, e
        // manda o exploitant procurar uma conta inexistente. É a noite de 3/09
        // reconstituída pelo próprio conserto.
        when(userRepo.findByUsernameFlexivel(any())).thenReturn(Optional.empty());
        when(userRepo.findAllByUsernameIgnoreCase(any()))
                .thenReturn(List.of(compte("VS", true), compte("vs", true)));

        ResponseEntity<?> reponse = controleur.login(requete("  Vs  ", "peu-importe"));

        assertRecusadoSemVazar(reponse);
        ArgumentCaptor<String> nome = ArgumentCaptor.forClass(String.class);
        verify(userRepo).findAllByUsernameIgnoreCase(nome.capture());
        assertThat(nome.getValue()).isEqualTo("Vs");
        assertThat(ligneDeJournal()).contains("raison=HOMONYMES_AMBIGUS");
    }

    @Test
    @DisplayName("★★ conta DESATIVADA é nomeada no journal — o caso que se conserta sem senha nenhuma")
    void contaDesativadaEhNomeada() {
        when(userRepo.findByUsernameFlexivel(any())).thenReturn(Optional.of(compte("FERME", false)));

        assertRecusadoSemVazar(controleur.login(requete("FERME", "a-senha-certa")));

        assertThat(ligneDeJournal())
                .contains("raison=COMPTE_DESACTIVE")
                .contains("AUCUN mot de passe");
    }

    @Test
    @DisplayName("★★ conta ativa que falha: o journal diz senha, e diz só isso")
    void contaAtivaEhSenha() {
        when(userRepo.findByUsernameFlexivel(any())).thenReturn(Optional.of(compte("OUVERT", true)));

        assertRecusadoSemVazar(controleur.login(requete("OUVERT", "senha-errada")));

        assertThat(ligneDeJournal()).contains("raison=MOT_DE_PASSE_INCORRECT");
    }

    @Test
    @DisplayName("★★★ um nome com quebra de linha NÃO consegue forjar uma segunda linha de journal")
    void nomeComQuebraDeLinhaNaoForjaLinha() {
        // ⚠️ O JOURNAL VIROU O INSTRUMENTO DE DIAGNÓSTICO — logo, forjá-lo passa a
        // valer a pena. Quem digita este nome no campo de usuário escreveria, no
        // arquivo de log, uma linha indistinguível de uma verdadeira, acusando
        // outra conta. Quem lesse o log na manhã seguinte não teria como saber.
        String forge = "pirate\nWARN Tentativa de login inválida: username=admin raison=COMPTE_DESACTIVE";

        assertRecusadoSemVazar(controleur.login(requete(forge, "peu-importe")));

        String ligne = ligneDeJournal();
        assertThat(ligne).doesNotContain("\n").doesNotContain("\r");
        // o nome continua legível — neutralizar não é apagar
        assertThat(ligne).contains("username=pirate?WARN");
        // e a raison é a do NOME INTEIRO, que não existe: nenhuma conta foi acusada
        assertThat(ligne).contains("raison=UTILISATEUR_INCONNU");
    }

    @Test
    @DisplayName("★ nome interminável é limitado, e a truncatura é ANUNCIADA")
    void nomeInterminavelEhLimitado() {
        // username tem no máximo 50 caracteres em base: acima de 64 nenhuma conta
        // real está em jogo, e um log ilimitado é um log que alguém enche.
        assertRecusadoSemVazar(controleur.login(requete("z".repeat(300), "peu-importe")));

        String ligne = ligneDeJournal();
        assertThat(ligne).contains("[tronque]");
        assertThat(ligne).doesNotContain("z".repeat(65));
    }
}
