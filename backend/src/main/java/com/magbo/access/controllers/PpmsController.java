package com.magbo.access.controllers;

import com.magbo.access.dto.PpmsSnapshot;
import com.magbo.access.services.PpmsService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;

/**
 * PPMS — "quem está dentro, agora".
 *
 * ⚠️ A PERMISSAO E `PPMS_READ`, e a decisão do Sam (14/08/2026) foi RESTRINGIR,
 * NAO FECHAR.
 *
 * A lista continua NOMINATIVA, e isso é deliberado: numa evacuação é o nome que
 * permite achar uma criança, e uma contagem anônima não serve para procurar
 * ninguém. O que mudou é QUEM a alcança — Vie Scolaire, direção e enfermaria.
 *
 * A versão anterior era `isAuthenticated()`, com o argumento de que numa
 * evacuação quem estiver com o telefone na mão precisa da lista inteira. O
 * argumento continua verdadeiro e não bastava: a leitura da ENFERMARIA é murada
 * por `@areaSecurity.can('infirmerie')` em todo o resto do sistema, e a rota
 * mostrava, a qualquer conta autenticada, qual criança está na enfermaria agora.
 * Um operador da cantina não tem por que saber isso, e alargar esse alcance não
 * podia ser efeito colateral de uma tela de emergência. O painel apanhou a
 * contradição; o dono decidiu por escrito.
 *
 * ⚠️ CONSEQUÊNCIA OPERACIONAL, e ela é real: a permissão precisa estar concedida
 * ANTES do dia em que importa. Um AED que descobre no pátio que não tem
 * `PPMS_READ` é o pior momento possível para o sistema ter razão — por isso a
 * permissão é de PERFIL (Vie Scolaire inteira), não de pessoa, e entra no
 * procedimento de comissionamento.
 *
 * O que a rota devolve são nomes, turmas e zona — nenhum dado de saúde, nenhuma
 * biometria. Nada é gravado: o retrato é calculado no momento e morre na
 * resposta.
 */
@RestController
@RequestMapping("/api/ppms")
@RequiredArgsConstructor
public class PpmsController {

    private final PpmsService ppmsService;

    @GetMapping("/inside")
    @PreAuthorize("hasRole('ADMIN') or @areaSecurity.hasPermission('PPMS_READ')")
    public ResponseEntity<PpmsSnapshot> quemEstaDentro() {
        return ResponseEntity.ok(ppmsService.snapshot(LocalDateTime.now()));
    }
}
