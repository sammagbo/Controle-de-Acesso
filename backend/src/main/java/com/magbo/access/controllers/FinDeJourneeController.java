package com.magbo.access.controllers;

import com.magbo.access.dto.FinDeJournee;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.User;
import com.magbo.access.repositories.UserRepository;
import com.magbo.access.services.PresenceAutoCloseService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * "QUEM ESTÁ DENTRO E A JORNADA JÁ ACABOU?" — antes de o sistema fechar.
 *
 * O fechamento automático grava uma SAIDA sintética às 17:00 para quem ficou
 * com a presença aberta no CDI. Ele funciona, é idempotente, e faz tudo isso
 * SEM QUE NINGUÉM VEJA: até 15/08/2026 o cálculo de quem seria fechado só
 * existia dentro da chamada que já gravava, e não havia rota nenhuma expondo
 * qualquer parte disso.
 *
 * ⚠️ A DECISÃO DE FORMATO — tela consultável a qualquer hora, não aviso de fim
 * de dia. O trabalho roda a cada 5 minutos e fecha assim que a hora passa; um
 * aviso chegaria quando a criança já foi carimbada como tendo saído às 17:00, e
 * quem o lesse só poderia concordar. Uma tela aberta às 16h40 ainda permite ir
 * ao CDI olhar — que é o único momento em que esta informação muda alguma coisa.
 * As duas metades ficam na mesma tela porque a pergunta continua valendo depois:
 * antes das 17:00 ela é "quem vamos fechar", e no dia seguinte é "quem
 * fechamos".
 *
 * ⚠️ Guarda POR ÁREA, não ADMIN. Quem pode ir ao CDI ver se a pessoa está lá é
 * quem opera o CDI. Exigir o perfil de administrador poria o dado longe de quem
 * age — o mesmo raciocínio de `/api/access/incomplete-movements`.
 *
 * Nada é gravado aqui. A rota só lê; o fechamento continua sendo do agendador.
 */
@RestController
@RequestMapping("/api/presence")
@RequiredArgsConstructor
public class FinDeJourneeController {

    private final PresenceAutoCloseService autoCloseService;
    private final UserRepository userRepository;

    private static final DateTimeFormatter HM = DateTimeFormatter.ofPattern("HH:mm");

    /**
     * @param pointId ponto com fechamento configurado (BIBLIO, REFEI1...).
     * @param date    dia a consultar; hoje por omissão.
     */
    @PreAuthorize("hasRole('ADMIN') or @areaSecurity.can('cdi') or @areaSecurity.can('cantine')")
    @GetMapping("/auto-close/preview")
    public ResponseEntity<List<FinDeJournee>> previsao(
            @RequestParam String pointId,
            @RequestParam(required = false) String date) {

        Map<String, LocalTime> configurados = autoCloseService.pontosComFechamento();
        LocalTime fechamento = configurados.get(pointId);

        // ⚠️ Ponto sem fechamento configurado devolve 204, nunca lista vazia.
        // Vazio significa "ninguem esta aberto"; nao-configurado significa "esta
        // pergunta nao se aplica aqui". A tela precisa poder distinguir os dois
        // — senao a portaria mostraria "ninguem sera fechado" com ar de boa
        // noticia, quando na verdade nada seria fechado nunca.
        if (fechamento == null) return ResponseEntity.noContent().build();

        // ⚠️ O MESMO RELOGIO DO AGENDADOR. O job usa LocalDate.now(ZONA_ESCOLA) e
        // @Scheduled(zone="America/Sao_Paulo"); usar LocalDate.now() cru aqui leria
        // o fuso da JVM — e o container da VM roda em UTC (nao ha TZ no
        // docker-compose). As 21h10 de um dia letivo, o preview consultaria o dia
        // SEGUINTE e responderia "ninguem foi fechado hoje" sobre um dia em que
        // houve fechamento. Esta tela promete ser exatamente o que o agendador vai
        // fazer; a promessa inclui o dia. (Painel de revisao, arquiteto, 15/08.)
        LocalDate dia = (date == null || date.isBlank())
                ? LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo"))
                : LocalDate.parse(date);
        String horaFechamento = fechamento.format(HM);

        List<FinDeJournee> out = new ArrayList<>();
        for (AccessLog entrada : autoCloseService.candidatos(pointId, dia)) {
            out.add(monta(entrada, pointId, horaFechamento, entrada.getTimestamp().format(HM), false));
        }
        for (AccessLog saida : autoCloseService.jaFechadas(pointId, dia)) {
            // A hora da ENTRADA original nao esta na linha sintetica; o que a
            // tela mostra dela e' a hora do fechamento, que e' o carimbo dela.
            out.add(monta(saida, pointId, horaFechamento, null, true));
        }
        return ResponseEntity.ok(out);
    }

    private FinDeJournee monta(AccessLog log, String pointId, String horaFechamento,
                               String horaEntrada, boolean jaFechado) {
        String userId = log.getUserId();
        User u = userId == null ? null : userRepository.findById(userId).orElse(null);
        return FinDeJournee.builder()
                .userId(userId)
                .nome(u != null ? u.getNome() : null)
                .turma(u != null ? u.getTurma() : "")
                .tipo(u != null && u.getTipo() != null ? u.getTipo().name() : null)
                .pointId(pointId)
                .horaEntrada(horaEntrada)
                .horaFechamento(horaFechamento)
                .jaFechado(jaFechado)
                .build();
    }
}
