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
    private final com.magbo.access.config.PresenceAutoCloseProperties autoCloseProps;

    /** Marcas que significam "esta linha não abre visita nova". */
    /**
     * Zona de quem esta na escola mas nao dentro de nenhum ponto com leitor.
     *
     * ⚠️ NAO e "sem informacao": e a informacao correta. A escola tem corredores,
     * patio e salas de aula sem leitor, e a esmagadora maioria das pessoas esta
     * neles a maior parte do tempo. Dizer "CDI" porque foi o ultimo lugar por
     * onde passou mandaria a equipe procurar no lugar errado.
     */
    public static final String ZONA_EM_TRANSITO = "EM_TRANSITO";

    /**
     * As flags que dizem "esta linha nao abre visita nova".
     *
     * ⚠️ Montado a partir das CONSTANTES dos services, como o VisitStatsService
     * ja fazia — nao com os nomes escritos a mao. A primeira versao repetia
     * "POSTO_FIXO"/"JA_PRESENTE" como literais: terceira copia da mesma lista
     * num projeto onde ela vive UMA vez (AccessLogRepository.REPETICOES para as
     * @Query, espelhada em js/utils/postoFixo.js), exatamente porque uma copia
     * esquecida envelhece em silencio na proxima flag nova.
     *
     * ⚠️ O teste de guarda do repositorio NAO alcanca este Set (ele le @Query,
     * e isto e Java) — mesma ressalva escrita no VisitStatsService. Flag nova de
     * repeticao exige entrar aqui tambem.
     */
    private static final Set<String> REPETICOES = Set.of(
            PostoFixoService.FLAG_POSTO_FIXO,
            PresencaAbertaService.FLAG_JA_PRESENTE);

    /**
     * O que este retrato NAO cobre. Chaves i18n, nunca frases prontas.
     *
     * ⚠️ Os dois primeiros avisos sao sempre verdade. O terceiro so aparece
     * quando ha alguem num ponto SEM fechamento automatico configurado — hoje a
     * enfermaria, cujo registro e manual e cuja saida quase nunca e lancada.
     * O PPMS acredita naquele ponto como acredita nos outros, e sem o aviso a
     * lista afirmaria que alguem esta na enfermaria desde as 9h da manha quando
     * a pessoa saiu e ninguem registrou (objecao da enfermeira, painel 14/08).
     *
     * Mostra-lo SEMPRE seria ruido; mostra-lo quando ha gente nesses pontos e
     * dizer a coisa certa no momento em que ela importa.
     */
    private List<String> avisos(java.util.Set<String> pontosComGente) {
        List<String> out = new ArrayList<>(
                List.of("ppms.aviso.leitores", "ppms.aviso.nao.chamada"));
        java.util.Set<String> comFechamento = autoCloseProps.parsedTimes().keySet();
        boolean algumSemFechamento = pontosComGente.stream()
                .anyMatch(p -> !ZONA_EM_TRANSITO.equals(p) && !comFechamento.contains(p));
        if (algumSemFechamento) out.add("ppms.aviso.sem.fechamento");
        return out;
    }

    public PpmsSnapshot snapshot(LocalDateTime agora) {
        LocalDateTime inicioDoDia = agora.toLocalDate().atStartOfDay();

        // ⚠️ SEM LISTA BRANCA DE PONTOS. A primeira versao filtrava por
        // AreaMapping.pointToArea(), um Map.of de SETE pontos escritos a mao —
        // e CANTINA1, que AccessController e AccessAttemptController ja tratam
        // como ponto de primeira classe, nao esta nele. O aluno da cantina
        // sumia da lista de evacuacao, em silencio, e nenhum teste via porque o
        // estubo respondia a anyList(). Apanhado pelo painel de revisao
        // (qualidade) em 14/08/2026, com sonda que honra o IN (...).
        //
        // Numa lista onde um nome que falta e uma crianca que ninguem procura,
        // nao existe filtro seguro senao nenhum: um ponto novo comissionado em
        // door_mappings entra sozinho.
        List<AccessLog> emOrdem = new ArrayList<>(
                accessLogRepository.findByTimestampBetweenOrderByTimestampAsc(inicioDoDia, agora));

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

        // ⚠️ A ZONA E A VISITA ABERTA, NAO O ULTIMO EVENTO.
        //
        // A primeira versao agrupava pelo ponto do ultimo evento — inclusive
        // quando esse evento era uma SAIDA daquele ponto. Quem entrou no CDI as
        // 10h e saiu as 10h30 aparecia sob "CDI", num card com contador que se
        // le como ocupacao: a equipe de evacuacao era mandada procurar numa sala
        // que a pessoa acabara de deixar. Cinco dos nove agentes do painel
        // apontaram a mesma coisa.
        //
        // A resposta honesta quando o ultimo evento e uma SAIDA interna e que a
        // pessoa esta NA ESCOLA e a zona e DESCONHECIDA — ela esta em algum
        // corredor, patio ou sala sem leitor. Inventar uma zona seria mandar
        // alguem procurar no lugar errado; omiti-la seria perder a pessoa. Vai
        // para uma zona propria, EM_TRANSITO, com o ultimo lugar onde foi vista.
        Map<String, List<PpmsSnapshot.Pessoa>> porPonto = new LinkedHashMap<>();
        for (String uid : dentro) {
            AccessLog ultimo = ultimoEvento.get(uid);
            AccessLog entrada = noPortao.get(uid);
            User u = pessoas.get(uid);

            Map<String, AccessLog> abertas = abertasPorPessoa.get(uid);
            String pontoAberto = (abertas == null || abertas.isEmpty())
                    ? null
                    // Visita aberta mais recente: e onde a pessoa esta de fato.
                    : abertas.values().stream()
                        .max(Comparator.comparing(AccessLog::getTimestamp))
                        .map(AccessLog::getPointId).orElse(null);

            String ponto = pontoAberto != null ? pontoAberto : ZONA_EM_TRANSITO;

            porPonto.computeIfAbsent(ponto, k -> new ArrayList<>())
                    .add(PpmsSnapshot.Pessoa.builder()
                            .id(uid)
                            .nome(u == null ? uid : u.getNome())
                            .turma(u == null ? null : u.getTurma())
                            .tipo(u == null || u.getTipo() == null ? null : u.getTipo().name())
                            // ⚠️ Onde foi VISTA, que nao e a zona: a zona diz
                            // onde ela esta (ou EM_TRANSITO, quando nao se
                            // sabe), e isto diz o ultimo lugar por onde passou.
                            // Numa evacuacao, e por aqui que se comeca a
                            // procurar quem esta em transito.
                            .ultimoPonto(ultimo == null ? null : ultimo.getPointId())
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
                    .area(ZONA_EM_TRANSITO.equals(e.getKey())
                            ? ZONA_EM_TRANSITO : AreaMapping.areaForPoint(e.getKey()))
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
                .avisos(avisos(porPonto.keySet()))
                .build();
    }
}
