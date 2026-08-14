package com.magbo.access.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * O LINK para o prontuário no TOTVS — nunca uma cópia dele.
 *
 * ⚠️ O MAGBO NÃO GUARDA DADO DE SAÚDE, e isto não é uma escolha de arquitetura:
 * é a linha que separa este sistema de um que precisaria de outra base legal,
 * outro consentimento e outro regime de retenção. Quando a enfermeira precisa do
 * prontuário de um aluno, o MAGBO monta uma URL e abre; quem autentica no TOTVS
 * é ela, com a credencial dela, exatamente como faz hoje.
 *
 * ⚠️ NASCE DESLIGADO. `url-pattern` vazio = funcionalidade ausente: nenhum botão
 * aparece, nenhuma rota responde. O padrão de URL e o identificador que o TOTVS
 * espera são DESCONHECIDOS nesta data (13/08/2026) — as perguntas exatas para a
 * DSI estão em docs/integracao/totvs.md. No dia em que forem respondidas, isto é
 * uma linha de properties, não uma reescrita.
 *
 * Fichas para o padrão, substituídas literalmente:
 *   {matricula}  — app_users.id (Pronote, com zeros à esquerda)
 *   {hikvision}  — app_users.hikvision_employee_id
 *   {nome}       — app_users.nome, url-encoded
 *
 * ⚠️ Zeros à esquerda: {matricula} é substituída como TEXTO. Se o TOTVS esperar
 * o número sem zeros, isso é uma ficha NOVA e explícita — nunca um trim
 * silencioso, que é como a matrícula 0001764 vira 1764 e abre a ficha de outra
 * criança.
 */
@Component
@ConfigurationProperties(prefix = "magbo.totvs")
@Getter
@Setter
public class TotvsProperties {

    /**
     * Padrão da URL da ficha. Vazio = desligado.
     * Ex.: https://totvs.exemplo.local/rm/ficha?ra={matricula}
     */
    private String urlPattern = "";

    /** Rótulo do botão, caso a escola chame o sistema de outro jeito. */
    private String rotulo = "TOTVS";

    public boolean configurado() {
        return urlPattern != null && !urlPattern.isBlank();
    }
}
