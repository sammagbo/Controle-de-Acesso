package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * UM REGLAGE MODIFICADO A ECRA — a surcouche de uma property.
 *
 * ⚠️ Linha AUSENTE = o default do codigo aplica-se. Uma linha so existe quando
 * alguem MUDOU o valor pelo ecra de configuracao, e ela carrega QUEM e QUANDO —
 * que e o que o ecra mostra ao lado de cada reglage.
 *
 * ⚠️ VALOR EM TEXTO, sem coluna tipada nem enum (licao V014/V017: nenhum CHECK
 * a divergir entre instalacoes). O typage vive no {@link
 * com.magbo.access.services.SettingsService}, ao lado do default — um unico
 * sitio sabe que uma chave e um inteiro, e e o mesmo que conhece o repli.
 *
 * ⚠️ NUNCA UM SEGREDO AQUI. Tokens, senhas e PIN ficam no ambiente: uma tabela
 * legivel pelo ecra de configuracao e exatamente onde um segredo nao pode viver.
 */
@Entity
@Table(name = "system_settings")
@Getter @Setter @ToString @NoArgsConstructor @AllArgsConstructor @Builder
public class SystemSetting {

    @Id
    @Column(name = "chave", length = 128)
    private String chave;

    @Column(name = "valor", nullable = false, length = 512)
    private String valor;

    @Column(name = "updated_by", nullable = false, length = 50)
    private String updatedBy;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
