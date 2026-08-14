package com.magbo.access.dto;

import com.magbo.access.models.RegimeGeneral;
import com.magbo.access.models.RegimeSortie;
import com.magbo.access.models.RegimeVerdict;

import java.time.LocalDateTime;

/**
 * O veredicto do regime PARA UMA PASSAGEM QUE JA ACONTECEU, no portao.
 *
 * ⚠️ Existe porque o modulo do regime, na primeira entrega, so registrava depois
 * do fato: `avaliarRegime` estava construido, ligado ao window.api, e nenhum
 * componente o chamava. Quatro dos nove agentes do painel apontaram a mesma
 * coisa — o AED continuava decidindo de memoria com o aluno na frente dele, que
 * e exatamente o problema que este modulo existe para resolver.
 *
 * ⚠️ CADA LINHA E AVALIADA NA HORA DA PASSAGEM, nao na hora da consulta. A tela
 * mostra as ultimas passagens; consultar "agora" faria a linha das 10h ser
 * julgada as 16h e mudar de cor sozinha ao longo do dia — inclusive de vermelha
 * para verde, quando o fim da jornada chegasse. E a mesma regra do relogio que
 * governa a gravacao (ver RegimeSortieService#avaliar).
 *
 * @param logId     id da linha de access_logs — e a chave com que a tela casa
 *                  este veredicto com a passagem que ela ja esta mostrando
 * @param momento   hora da passagem, e do julgamento
 * @param motivo    chave i18n, nunca frase pronta (a tela e bilingue)
 */
public record GateVerdict(
        Long logId,
        String userId,
        String nome,
        String turma,
        LocalDateTime momento,
        RegimeVerdict verdict,
        String motivo,
        RegimeSortie regimeSortie,
        RegimeGeneral regimeGeneral,
        boolean dependeDeGrade) {
}
