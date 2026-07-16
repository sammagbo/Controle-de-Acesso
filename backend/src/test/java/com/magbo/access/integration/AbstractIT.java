package com.magbo.access.integration;

import com.magbo.access.models.AccessAction;
import com.magbo.access.models.DoorMapping;
import com.magbo.access.repositories.AccessAttemptRepository;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.repositories.DoorMappingRepository;
import com.magbo.access.repositories.MealEntitlementEventRepository;
import com.magbo.access.repositories.MealEntitlementRepository;
import com.magbo.access.repositories.StudentExitPermissionRepository;
import com.magbo.access.repositories.UserRepository;
import com.magbo.access.TestFixtures;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Base dos testes de integracao da Fase I.
 *
 * As anotacoes vivem AQUI de proposito: a chave do cache de contexto do Spring
 * inclui anotacoes e @MockBean. Mantendo-as identicas e herdadas, os 17 ITs
 * compartilham UM unico contexto (~8s de boot uma vez, em vez de 17 vezes).
 * Nao adicionar @MockBean nem @TestPropertySource em subclasse sem saber que
 * isso forka o contexto.
 *
 * Isolamento — duas regras que nao sao intercambiaveis:
 *
 * 1. NAO usar @Transactional. MealEntitlementService.upsert e REQUIRES_NEW:
 *    commita numa transacao suspensa que o rollback do teste nao alcanca. O
 *    isolamento seria FALSO e falharia em silencio so nos testes de
 *    entitlement. AreaSecurity tambem le SystemUser do banco, exigindo commit.
 *
 * 2. deleteAll() SO nas tabelas mutaveis. door_mappings e semeada pelo
 *    DoorMappingBootstrap, que e CommandLineRunner: roda UMA vez por contexto
 *    e so se count()==0. Limpar essa tabela numa classe deixaria as seguintes
 *    (mesmo contexto cacheado) sem o seed, com falha dependente da ordem do
 *    surefire. Mappings de teste sao ADITIVOS, em IPs sinteticos 10.10.0.x.
 */
@SpringBootTest(properties = {
        // O PC principal tem MAGBO_WEBHOOK_TOKEN gravado via setx, e env var
        // VENCE application-test.properties na precedencia do Spring — o token
        // efetivo viraria o do setx e todo POST de webhook responderia 401.
        // Properties de anotacao de teste vencem env vars; fixamos aqui.
        "magbo.webhook.token=" + TestFixtures.WEBHOOK_TOKEN
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class AbstractIT {

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected UserRepository userRepository;

    @Autowired
    protected AccessLogRepository accessLogRepository;

    @Autowired
    protected AccessAttemptRepository accessAttemptRepository;

    @Autowired
    protected MealEntitlementRepository mealEntitlementRepository;

    @Autowired
    protected MealEntitlementEventRepository mealEntitlementEventRepository;

    @Autowired
    protected StudentExitPermissionRepository exitPermissionRepository;

    @Autowired
    protected DoorMappingRepository doorMappingRepository;

    @BeforeEach
    void limparTabelasMutaveis() {
        accessLogRepository.deleteAll();
        accessAttemptRepository.deleteAll();
        mealEntitlementEventRepository.deleteAll();
        mealEntitlementRepository.deleteAll();
        exitPermissionRepository.deleteAll();
        userRepository.deleteAll();
        limparMappingsSinteticos();
    }

    /**
     * Remove apenas os mappings 10.10.0.x criados por testes. Os 14 do
     * DoorMappingBootstrap ficam intactos.
     */
    private void limparMappingsSinteticos() {
        doorMappingRepository.deleteAll(
                doorMappingRepository.findAll().stream()
                        .filter(m -> m.getTerminalIp() != null && m.getTerminalIp().startsWith("10.10.0."))
                        .toList());
    }

    /**
     * Semeia um mapping IP-only para o cenario. Um IP por cenario garante que
     * findIpOnlyMatch(ip) retorne exatamente 1 linha — o .get(0) do
     * DoorMappingService deixa de ser ambiguo.
     */
    protected DoorMapping seedMapping(String terminalIp, String pointId, AccessAction action) {
        return doorMappingRepository.save(TestFixtures.ipOnly(terminalIp, pointId, action));
    }
}
