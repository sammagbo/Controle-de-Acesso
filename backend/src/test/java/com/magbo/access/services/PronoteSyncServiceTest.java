package com.magbo.access.services;

import com.magbo.access.TestFixtures;
import com.magbo.access.dto.SyncReport;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.ResponsavelRepository;
import com.magbo.access.repositories.UserRepository;
import com.magbo.access.services.pronote.PronoteDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationContext;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Importacao Pronote: a matricula precisa chegar tambem em
 * hikvision_employee_id.
 *
 * Por que este teste existe: o AccessDecisionService resolve a pessoa por
 * userRepository.findByHikvisionEmployeeId(employeeNoRaw). Enquanto o sync
 * gravava so o id, os alunos importados existiam no banco e mesmo assim todo
 * evento de terminal caia em UNKNOWN_USER (comprovado em producao em 27/07/2026
 * com a matricula 0002336). O sync e a UNICA porta de entrada dos ~923 alunos,
 * entao a regressao aqui derruba o sistema inteiro em silencio.
 *
 * O campo pronoteSource (@Value) fica null no teste unitario, e
 * "api".equalsIgnoreCase(null) e false — dataSource() resolve para
 * "csvPronoteDataSource", que e o caminho de producao.
 */
@ExtendWith(MockitoExtension.class)
class PronoteSyncServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private ResponsavelRepository responsavelRepository;

    @Mock
    private ApplicationContext applicationContext;

    @Mock
    private PronoteDataSource dataSource;

    @InjectMocks
    private PronoteSyncService service;

    /** Estado inicial do banco simulado, indexado por id. */
    private final Map<String, User> banco = new HashMap<>();

    private static final String CSV = "import-basico.csv";
    private static final String ID_ZERO_PADDED = "0003614";
    private static final String ID_INCIDENTE = "0002336";
    private static final String ID_SEM_ZEROS = "9999999";

    @BeforeEach
    void ligarFonteDeDados() throws Exception {
        when(applicationContext.getBean("csvPronoteDataSource", PronoteDataSource.class))
                .thenReturn(dataSource);
        when(dataSource.isAvailable()).thenReturn(true);
        when(dataSource.fetchLines()).thenReturn(TestFixtures.pronoteCsv(CSV));

        when(userRepository.existsById(anyString()))
                .thenAnswer(inv -> banco.containsKey(inv.getArgument(0)));
        when(userRepository.findById(anyString()))
                .thenAnswer(inv -> Optional.ofNullable(banco.get(inv.getArgument(0))));
        when(responsavelRepository.findById(anyString())).thenReturn(Optional.empty());
    }

    @Test
    @DisplayName("importacao preenche hikvisionEmployeeId com a matricula em TODOS os criados")
    void importacaoPreencheHikvisionEmployeeId() {
        SyncReport report = service.syncPronoteData();

        assertThat(report.getErrors()).isZero();
        assertThat(report.getCreated()).isEqualTo(3);

        Map<String, User> salvos = usuariosSalvos();
        assertThat(salvos).containsOnlyKeys(ID_ZERO_PADDED, ID_INCIDENTE, ID_SEM_ZEROS);
        assertThat(salvos.values())
                .as("sem hikvisionEmployeeId o aluno e invisivel ao AccessDecisionService")
                .allSatisfy(u -> assertThat(u.getHikvisionEmployeeId()).isEqualTo(u.getId()));
    }

    @Test
    @DisplayName("zeros a esquerda da matricula sobrevivem ao mapeamento (0003614, nao 3614)")
    void zerosAEsquerdaSaoPreservados() {
        service.syncPronoteData();

        User zeroPadded = usuariosSalvos().get(ID_ZERO_PADDED);
        assertThat(zeroPadded.getId()).isEqualTo("0003614");
        assertThat(zeroPadded.getHikvisionEmployeeId())
                .as("o terminal manda employeeNoString com os zeros; truncar quebra o match")
                .isEqualTo("0003614");
    }

    /**
     * Mapeamento manual do HikvisionMappingController: quando a matricula
     * Pronote e o id do aparelho divergem, alguem casou os dois a mao. A
     * reimportacao anual nao pode desfazer isso.
     */
    @Test
    @DisplayName("mapeamento manual existente NAO e sobrescrito pela reimportacao")
    void mapeamentoManualEhPreservado() {
        banco.put(ID_ZERO_PADDED, existente(ID_ZERO_PADDED, "1000042"));

        SyncReport report = service.syncPronoteData();

        assertThat(report.getUpdated()).isEqualTo(1);
        assertThat(report.getCreated()).isEqualTo(2);

        Map<String, User> salvos = usuariosSalvos();
        assertThat(salvos.get(ID_ZERO_PADDED).getHikvisionEmployeeId())
                .as("id do aparelho casado a mao deve sobreviver ao sync")
                .isEqualTo("1000042");
        assertThat(salvos.get(ID_INCIDENTE).getHikvisionEmployeeId()).isEqualTo(ID_INCIDENTE);
        assertThat(salvos.get(ID_SEM_ZEROS).getHikvisionEmployeeId()).isEqualTo(ID_SEM_ZEROS);
    }

    /**
     * Estado dos 923 de producao antes do UPDATE manual na VM: linha existente
     * com a coluna vazia. A reimportacao repara.
     */
    @Test
    @DisplayName("usuario existente com hikvisionEmployeeId nulo ou em branco e reparado")
    void existenteSemMapeamentoEhPreenchido() {
        banco.put(ID_ZERO_PADDED, existente(ID_ZERO_PADDED, null));
        banco.put(ID_INCIDENTE, existente(ID_INCIDENTE, "   "));

        service.syncPronoteData();

        Map<String, User> salvos = usuariosSalvos();
        assertThat(salvos.get(ID_ZERO_PADDED).getHikvisionEmployeeId()).isEqualTo(ID_ZERO_PADDED);
        assertThat(salvos.get(ID_INCIDENTE).getHikvisionEmployeeId()).isEqualTo(ID_INCIDENTE);
    }

    @Test
    @DisplayName("o cabecalho do CSV nao vira usuario")
    void cabecalhoNaoViraUsuario() {
        service.syncPronoteData();

        assertThat(usuariosSalvos()).doesNotContainKey("userId");
    }

    /** Usuarios passados a userRepository.save durante o sync, indexados por id. */
    private Map<String, User> usuariosSalvos() {
        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository, atLeastOnce()).save(captor.capture());
        Map<String, User> salvos = new HashMap<>();
        for (User u : captor.getAllValues()) {
            salvos.put(u.getId(), u);
        }
        return salvos;
    }

    /** Linha ja presente no banco, como numa reimportacao de ano letivo. */
    private User existente(String id, String hikvisionEmployeeId) {
        return User.builder()
                .id(id)
                .nome("Nome Antigo " + id)
                .tipo(UserType.ALUNO)
                .turma("1A")
                .ativo(true)
                .hikvisionEmployeeId(hikvisionEmployeeId)
                .build();
    }

    /** Guarda contra regressao de assinatura: o sync le linhas, nao um File. */
    @Test
    @DisplayName("o sync consome as linhas da fonte de dados configurada")
    void sincronizaAPartirDaFonteConfigurada() throws Exception {
        service.syncPronoteData();

        verify(dataSource).fetchLines();
        verify(dataSource).onSyncComplete();
    }
}
