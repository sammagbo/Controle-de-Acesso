package com.magbo.access;

import com.magbo.access.repositories.DoorMappingRepository;
import com.magbo.access.repositories.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import javax.sql.DataSource;
import java.sql.Connection;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Portao de risco da Fase I. Roda antes de tudo e prova que a infraestrutura
 * de teste esta correta ANTES de qualquer asercao de negocio depender dela.
 *
 * Risco CRITICO coberto: application.properties aponta para o PostgreSQL de
 * desenvolvimento (923 alunos reais). Se o perfil test nao sobrescrever
 * datasource url + driver, a suite inteira roda contra o banco real.
 */
@SpringBootTest(properties = {
        // MESMA properties do AbstractIT, de proposito: chave de cache de
        // contexto identica -> um unico contexto Spring para a suite toda.
        // Um segundo contexto apontaria para a MESMA URL H2 (DB_CLOSE_DELAY=-1)
        // e o create-drop do segundo boot droparia as tabelas do primeiro.
        "magbo.webhook.token=" + TestFixtures.WEBHOOK_TOKEN
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ContextLoadsIT {

    @Autowired
    private DataSource dataSource;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private DoorMappingRepository doorMappingRepository;

    @Test
    void datasourceIsH2InMemoryAndNotPostgres() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            String url = c.getMetaData().getURL();
            String product = c.getMetaData().getDatabaseProductName();

            assertThat(product).isEqualTo("H2");
            assertThat(url).startsWith("jdbc:h2:mem:magbotest");
            assertThat(url).doesNotContain("postgresql");
        }
    }

    /**
     * data.sql e seed de QA em sintaxe H2 (MERGE ... KEY) que semeia 11 users.
     * O base tem spring.sql.init.mode=always; o perfil test poe never.
     * Se esta asercao cair, toda contagem da suite herda usuarios fantasma.
     */
    @Test
    void dataSqlDidNotRun() {
        assertThat(userRepository.count()).isZero();
    }

    /**
     * DoorMappingBootstrap e CommandLineRunner: roda UMA vez por contexto e
     * so semeia se count()==0. Os ITs dependem desse seed continuar intacto,
     * por isso nenhum teste pode dar deleteAll() em door_mappings.
     */
    @Test
    void bootstrapsRan() {
        assertThat(doorMappingRepository.count()).isEqualTo(14);
    }
}
