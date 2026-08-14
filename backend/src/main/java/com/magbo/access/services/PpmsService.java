package com.magbo.access.services;

import com.magbo.access.config.AreaMapping;
import com.magbo.access.dto.PpmsSnapshot;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.User;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;

/**
 * PPMS — "quem está dentro, por zona, agora".
 *
 * ⚠️ COMPUTADO EM JAVA, e não numa consulta esperta, de propósito.
 *
 * Existe uma consulta que faria isto num SELECT: `currentOccupancyByPoint`, com
 * DISTINCT ON. Ela é PostgreSQL-only, está @Disabled na suíte porque o H2 não a
 * roda, e depende de conferência manual (seção 6-bis do checklist). Para uma
 * tela de EVACUAÇÃO isso não serve: o número que diz se ainda há criança lá
 * dentro não pode vir de uma consulta que nenhum teste executa.
 *
 * O caminho daqui usa um método derivado do Spring Data — que o H2 roda — e
 * emparelha em memória. São ~2000 linhas num dia; o custo é irrelevante e a
 * prova é integral.
 *
 * ⚠️ A REGRA DE EXCLUSAO E ASSIMETRICA, como em todo lugar deste sistema onde
 * se olha o par entrada/saída: descarta a ENTRADA marcada como repetição
 * (POSTO_FIXO, JA_PRESENTE), NUNCA a SAÍDA. Exclusão simétrica deixaria quem
 * tem posto fixo preso na primeira entrada do dia e "dentro" até a meia-noite,
 * defeito já pago em 10/08/2026.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PpmsService {

    private final AccessLogRepository accessLogRepository;
    private final UserRepository userRepository;

    /** Marcas que significam "esta linha não abre visita nova". */
    private static final Set<String> REPETICOES = Set.of("POSTO_FIXO", "JA_PRESENTE");

    public PpmsSnapshot snapshot(LocalDateTime agora) {
        LocalDateTime inicioDoDia = agora.toLocalDate().atStartOfDay();

        List<String> pontos = new ArrayList<>(AreaMapping.pointToArea().keySet());
        List<AccessLog> logs = accessLogRepository
                .findByPointIdInAndTimestampBetweenOrderByTimestampDesc(pontos, inicioDoDia, agora);

        // Ordem cronológica CRESCENTE para emparelhar; a consulta devolve
        // decrescente (é a que existe e é testada), então inverte-se aqui.
        List<AccessLog> emOrdem = new ArrayList<>(logs);
        emOrdem.sort(Comparator.comparing(AccessLog::getTimestamp));

        // Estado do PORTAO por pessoa: dentro da escola ou não.
        Map<String, AccessLog> noPortao = new HashMap<>();
        // Visitas abertas por (pessoa, ponto interno).
        Map<String, Map<String, AccessLog>> abertasPorPessoa = new HashMap<>();
        // Último evento de qualquer natureza — é o "visto por último".
        Map<String, AccessLog> ultimoEvento = new HashMap<>();

        for (AccessLog l : emOrdem) {
            String uid = l.getUserId();
            if (uid == null) continue;
            ultimoEvento.put(uid, l);

            String pid = l.getPointId() == null ? "" : l.getPointId().toUpperCase();
            boolean ehPortao = pid.startsWith("PORT");
            boolean repeticao = l.getFlag() != null && REPETICOES.contains(l.getFlag());

            if (l.getAction() == AccessAction.ENTRADA) {
                // Assimetria: a ENTRADA marcada não abre nada.
                if (repeticao) continue;
                if (ehPortao) {
                    noPortao.put(uid, l);
                } else {
                    abertasPorPessoa.computeIfAbsent(uid, k -> new HashMap<>()).put(pid, l);
                }
            } else if (l.getAction() == AccessAction.SAIDA) {
                // SAÍDA sempre fecha, marcada ou não.
                if (ehPortao) {
                    noPortao.remove(uid);
                    // Saiu da escola: nenhuma visita interna faz mais sentido.
                    abertasPorPessoa.remove(uid);
                } else {
                    Map<String, AccessLog> abertas = abertasPorPessoa.get(uid);
                    if (abertas != null) abertas.remove(pid);
                }
            }
        }

        // Quem está dentro: com entrada de portão aberta, OU sem evento de
        // portão nenhum hoje mas com visita interna aberta (a leitura do portão
        // falhou, ou a pessoa entrou por uma porta sem leitor — e é justamente
        // quem uma evacuação não pode perder).
        Set<String> dentro = new LinkedHashSet<>(noPortao.keySet());
        for (Map.Entry<String, Map<String, AccessLog>> e : abertasPorPessoa.entrySet()) {
            if (!e.getValue().isEmpty()) dentro.add(e.getKey());
        }

        Map<String, User> pessoas = new HashMap<>();
        for (User u : userRepository.findAllById(dentro)) pessoas.put(u.getId(), u);

        // Agrupa pelo ponto onde a pessoa foi vista por último.
        Map<String, List<PpmsSnapshot.Pessoa>> porPonto = new LinkedHashMap<>();
        for (String uid : dentro) {
            AccessLog ultimo = ultimoEvento.get(uid);
            AccessLog entrada = noPortao.get(uid);
            User u = pessoas.get(uid);
            String ponto = ultimo == null ? "?" : ultimo.getPointId();

            porPonto.computeIfAbsent(ponto, k -> new ArrayList<>())
                    .add(PpmsSnapshot.Pessoa.builder()
                            .id(uid)
                            .nome(u == null ? uid : u.getNome())
                            .turma(u == null ? null : u.getTurma())
                            .tipo(u == null || u.getTipo() == null ? null : u.getTipo().name())
                            .ultimoPonto(ponto)
                            .ultimaHora(ultimo == null ? null : ultimo.getTimestamp())
                            .entrouAs(entrada == null ? null : entrada.getTimestamp())
                            .build());
        }

        List<PpmsSnapshot.Zona> zonas = new ArrayList<>();
        for (Map.Entry<String, List<PpmsSnapshot.Pessoa>> e : porPonto.entrySet()) {
            // Nome dentro da zona: a lista é lida em voz alta numa chamada.
            e.getValue().sort(Comparator.comparing(
                    p -> p.getNome() == null ? "" : p.getNome().toLowerCase()));
            zonas.add(PpmsSnapshot.Zona.builder()
                    .area(AreaMapping.areaForPoint(e.getKey()))
                    .pointId(e.getKey())
                    .total(e.getValue().size())
                    .pessoas(e.getValue())
                    .build());
        }
        zonas.sort(Comparator.comparingInt(PpmsSnapshot.Zona::getTotal).reversed());

        return PpmsSnapshot.builder()
                .geradoEm(agora)
                .totalDentro(dentro.size())
                .zonas(zonas)
                // ⚠️ Os avisos não são disclaimer jurídico: são a diferença
                // entre uma lista que ajuda e uma lista em que se confia
                // demais. Numa evacuação, acreditar que a contagem é a chamada
                // faz alguém parar de procurar.
                .avisos(List.of("ppms.aviso.leitores", "ppms.aviso.nao.chamada"))
                .build();
    }
}
