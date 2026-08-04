package com.magbo.access.dto.hikvision;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class HikvisionEventDto {

    @JsonProperty("EventNotificationAlert")
    private EventNotificationAlert eventNotificationAlert;

    @JsonProperty("AccessControllerEvent")
    private AccessControllerEvent accessControllerEvent;

    /**
     * Hora do EVENTO segundo o aparelho, ISO 8601 com offset
     * (ex.: "2026-07-14T11:33:19+08:00" — +08:00 e o fuso de fabrica dos
     * MinMoe da escola). Vive no ENVELOPE, nao dentro do AccessControllerEvent.
     *
     * E o que distingue quando a pessoa passou de quando o pacote chegou: os
     * MinMoe enfileiram e reenviam quando o destino cai, e uma fila esvaziada
     * entrega eventos de horas atras. Ver EventTimeResolver.
     */
    @JsonProperty("dateTime")
    private String dateTime;

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class EventNotificationAlert {
        @JsonProperty("ipAddress")
        private String ipAddress;

        /** Mesmo papel do dateTime da raiz; no ramo camera o envelope e este. */
        @JsonProperty("dateTime")
        private String dateTime;

        @JsonProperty("AccessControllerEvent")
        private AccessControllerEvent accessControllerEvent;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class AccessControllerEvent {
        @JsonProperty("employeeNoString")
        private String employeeNoString;

        @JsonProperty("name")
        private String name;

        @JsonProperty("majorEventType")
        private Integer majorEventType;

        @JsonProperty("subEventType")
        private Integer subEventType;

        @JsonProperty("doorNo")
        private Integer doorNo;

        @JsonProperty("readerNo")
        private Integer readerNo;

        /**
         * Numerador do log de eventos do aparelho (payload real: 123, 127...).
         * Reentregas do MESMO evento repetem o serialNo — e a chave do dedup
         * de ingestao junto com o IP de origem. Campo aditivo: antes era
         * simplesmente ignorado pelo @JsonIgnoreProperties.
         */
        @JsonProperty("serialNo")
        private Long serialNo;
    }
}
