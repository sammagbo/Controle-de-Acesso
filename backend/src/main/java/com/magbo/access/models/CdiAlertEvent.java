package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * UMA ALERTA MOSTRADA NO ECRA DO CDI — o registro de que ela existiu.
 *
 * A reserva n.1 da noite de 26/08, decidida pelo Sam a 27: uma alerta de
 * exclusao que soava no balcao nao deixava rasto nenhum. Se uma familia
 * pergunta seis semanas depois porque o filho foi sinalizado, nao havia
 * resposta — nem quantas vezes, nem quando. Um sinal que ninguem consegue
 * contar depois nao pode ser melhorado (a doutrina de REGIME_TO_VERIFY).
 *
 * ⚠️ `tipo` e String, NAO enum Java. Com @Enumerated o Hibernate geraria um
 * CHECK proprio ao criar a tabela no PC (ddl-auto) que divergiria do CHECK
 * manual da V026 na VM — a armadilha V009/V014 outra vez. A validacao vive no
 * {@link com.magbo.access.services.CdiAlertService}, com teste.
 *
 * ⚠️ `eventTime` e a hora do BADGE, nunca a do processamento. `criadoEm` e so
 * a metadata da insercao — as duas podem divergir por minutos (fila offline)
 * e e exatamente por isso que as duas existem.
 */
@Entity
@Table(name = "cdi_alert_events")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CdiAlertEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** EXCLUSION | CAPACITE | FERME — validado no service, CHECK manual na V026. */
    @Column(nullable = false, length = 16)
    private String tipo;

    /** Nulo para alerta de sala (capacidade/fermé sem pessoa precisa). */
    @Column(name = "user_id", length = 64)
    private String userId;

    /** O nome no momento do fato (precedente: access_attempts.nome_snapshot). */
    @Column(name = "nome_snapshot")
    private String nomeSnapshot;

    @Column(name = "point_id", nullable = false, length = 32)
    private String pointId;

    /** ⚠️ A hora do BADGE que disparou a alerta. */
    @Column(name = "event_time", nullable = false)
    private LocalDateTime eventTime;

    /**
     * O que o ecra mostrava («12/10 capacité», «exclusion de classe 6E1»).
     * ⚠️ NUNCA o motivo da exclusao — ele fica em cdi_exclusions, atras da
     * porta dele.
     */
    @Column(length = 255)
    private String detalhe;

    @Column(name = "criado_em", nullable = false)
    private LocalDateTime criadoEm;
}
