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
 * ⚠️ A PERMISSAO E `isAuthenticated()`, e isso é uma decisão, não um esquecimento.
 *
 * Toda outra leitura deste sistema é por ÁREA: quem opera a cantina vê a
 * cantina. Aqui não pode ser: numa evacuação, quem estiver com o telefone na
 * mão no pátio precisa da lista inteira, e um operador da portaria descobrir que
 * "não tem permissão para ver o CDI" enquanto a escola é evacuada seria o pior
 * momento possível para o sistema ter razão.
 *
 * O que a rota devolve são nomes, turmas e zona — nenhum dado de saúde, nenhuma
 * biometria, nada que o operador já não veja na tela do seu setor. Não há versão
 * pública: `isAuthenticated()` continua sendo uma porta fechada, só que com uma
 * chave que todo adulto da escola tem.
 *
 * Nada é gravado: o retrato é calculado no momento e morre na resposta.
 */
@RestController
@RequestMapping("/api/ppms")
@RequiredArgsConstructor
public class PpmsController {

    private final PpmsService ppmsService;

    @GetMapping("/inside")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PpmsSnapshot> quemEstaDentro() {
        return ResponseEntity.ok(ppmsService.snapshot(LocalDateTime.now()));
    }
}
