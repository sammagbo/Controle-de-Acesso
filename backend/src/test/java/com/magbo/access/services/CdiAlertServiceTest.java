package com.magbo.access.services;

import com.magbo.access.models.CdiAlertEvent;
import com.magbo.access.repositories.CdiAlertEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * O REGISTRO DAS ALERTAS DO CDI (V026).
 *
 * O que estes testes seguram: a validacao do tipo (o CHECK manual da V026 e a
 * ultima linha de defesa, nao a primeira), o relogio do EVENTO com a sua
 * borda de futuro, o REQUIRES_NEW que faz do registro um observador — e o
 * espelho TIPOS ↔ CHECK, porque a armadilha V009/V015 ja mordeu duas vezes e
 * a terceira seria por escolha.
 */
@ExtendWith(MockitoExtension.class)
class CdiAlertServiceTest {

    private static final LocalDateTime AGORA = LocalDateTime.of(2026, 8, 28, 10, 0);

    @Mock
    private CdiAlertEventRepository repository;

    private CdiAlertService service;

    @BeforeEach
    void setUp() {
        service = new CdiAlertService(repository);
        ReflectionTestUtils.setField(service, "clock", Clock.fixed(
                AGORA.atZone(ZoneId.of("America/Sao_Paulo")).toInstant(),
                ZoneId.of("America/Sao_Paulo")));
    }

    private CdiAlertEvent gravado() {
        ArgumentCaptor<CdiAlertEvent> captor = ArgumentCaptor.forClass(CdiAlertEvent.class);
        verify(repository).save(captor.capture());
        return captor.getValue();
    }

    @Nested
    @DisplayName("validation")
    class Validacao {

        @Test
        @DisplayName("★★★ un type inconnu est refusé — le CHECK de la V026 est la DERNIÈRE défense, pas la première")
        void tipoDesconhecido() {
            assertThatThrownBy(() -> service.registrar("AUTRE", null, null, "BIBLIO", AGORA, null, "cdi"))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("AUTRE");
            assertThatThrownBy(() -> service.registrar(null, null, null, "BIBLIO", AGORA, null, "cdi"))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("★★ sans point, pas de registre — une alerte de nulle part ne répond à personne")
        void pointObrigatorio() {
            assertThatThrownBy(() -> service.registrar("EXCLUSION", "0001", "X", null, AGORA, null, "cdi"))
                    .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> service.registrar("EXCLUSION", "0001", "X", "  ", AGORA, null, "cdi"))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("★★★ sans auteur, pas de ligne — un registre inattribuable n'est pas un registre")
        void autorObrigatorio() {
            assertThatThrownBy(() -> service.registrar("EXCLUSION", "0001", "X", "BIBLIO", AGORA, null, null))
                    .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> service.registrar("EXCLUSION", "0001", "X", "BIBLIO", AGORA, null, " "))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("★★ l'auteur enregistré est celui que le CHAMADOR affirme — le serveur, jamais le corps")
        void autorGravado() {
            when(repository.save(any())).thenAnswer(i -> i.getArgument(0));
            service.registrar("CAPACITE", null, null, "BIBLIO", AGORA, "12/10", "operateur-cdi");
            assertThat(gravado().getCriadoPor()).isEqualTo("operateur-cdi");
        }

        @Test
        @DisplayName("★ un détail trop long est coupé, jamais refusé — le registre vaut plus que la phrase entière")
        void detalheCortado() {
            when(repository.save(any())).thenAnswer(i -> i.getArgument(0));
            service.registrar("CAPACITE", null, null, "BIBLIO", AGORA, "x".repeat(300), "cdi");
            assertThat(gravado().getDetalhe()).hasSize(255);
        }
    }

    @Nested
    @DisplayName("l'horloge de l'ÉVÉNEMENT")
    class Relogio {

        @Test
        @DisplayName("★★★ l'heure du badge est GARDÉE telle quelle — même vieille de plusieurs heures")
        void horaDoBadgeMantida() {
            // File offline vidée à 18h : l'alerte d'un badge de 10h reste à 10h.
            // Jugée par l'horloge du traitement, la question « quand mon enfant
            // a-t-il été signalé » recevrait une réponse fausse — le défaut de
            // 03/08, sur la seule table qui existe pour répondre à une famille.
            when(repository.save(any())).thenAnswer(i -> i.getArgument(0));
            LocalDateTime badge = AGORA.minusHours(7);
            service.registrar("EXCLUSION", "0001", "Enfant X", "BIBLIO", badge, null, "cdi");
            assertThat(gravado().getEventTime()).isEqualTo(badge);
        }

        @Test
        @DisplayName("★★ heure absente ou du futur → heure actuelle, jamais un refus ni un registre du futur")
        void bordaDeFuturo() {
            when(repository.save(any())).thenAnswer(i -> i.getArgument(0));
            service.registrar("CAPACITE", null, null, "BIBLIO", null, null, "cdi");
            assertThat(gravado().getEventTime()).isEqualTo(AGORA);

            org.mockito.Mockito.clearInvocations(repository);
            service.registrar("CAPACITE", null, null, "BIBLIO", AGORA.plusHours(2), null, "cdi");
            assertThat(gravado().getEventTime())
                    .as("un registre daté du futur empoisonne l'ordre de l'historique pour toujours")
                    .isEqualTo(AGORA);
        }
    }

    @Nested
    @DisplayName("le contrat d'observateur")
    class Observador {

        @Test
        @DisplayName("★★★ registrar écrit en REQUIRES_NEW — un registre qui tombe n'emporte personne")
        void requiresNew() throws Exception {
            Transactional tx = CdiAlertService.class
                    .getMethod("registrar", String.class, String.class, String.class,
                            String.class, LocalDateTime.class, String.class, String.class)
                    .getAnnotation(Transactional.class);
            assertThat(tx).as("registrar sans @Transactional").isNotNull();
            assertThat(tx.propagation())
                    .as("le motif des registres de soutien : REQUIRES_NEW + catch chez l'appelant. "
                            + "Aujourd'hui l'appelant est un endpoint dédié ; le jour où le webhook "
                            + "appellera, cette annotation est ce qui empêche un registre en panne "
                            + "d'emporter l'access_log d'un passage réel.")
                    .isEqualTo(Propagation.REQUIRES_NEW);
        }
    }

    @Nested
    @DisplayName("le miroir TIPOS ↔ CHECK de la V026")
    class Espelho {

        @Test
        @DisplayName("★★★ CdiAlertService.TIPOS et le CHECK de V026 listent EXACTEMENT les mêmes valeurs")
        void espelhoDoCheck() throws Exception {
            // La troisième fois que ce piège mordrait par choix : le Java gagne
            // un type, H2 recrée tout et reste vert, et l'INSERT échoue SÓ NA
            // VM (V009, V015). Ce test lit le SQL — pas de Postgres requis.
            Path sql = Path.of("..", "deploy", "migrations", "V026__cdi_alert_events.sql");
            String texto = Files.readString(sql);
            Matcher m = Pattern.compile(
                    "ck_cdi_alert_events_tipo CHECK \\(tipo IN \\(([^)]+)\\)\\)").matcher(texto);
            assertThat(m.find()).as("le CHECK ck_cdi_alert_events_tipo n'est plus dans V026").isTrue();

            Set<String> noSql = new LinkedHashSet<>();
            Matcher v = Pattern.compile("'([A-Z_]+)'").matcher(m.group(1));
            while (v.find()) noSql.add(v.group(1));

            assertThat(CdiAlertService.TIPOS)
                    .as("un type ajouté d'un seul côté = INSERT qui échoue só na VM")
                    .containsExactlyInAnyOrderElementsOf(noSql);
        }
    }
}
