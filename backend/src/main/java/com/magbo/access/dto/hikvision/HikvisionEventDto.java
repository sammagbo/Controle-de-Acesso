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

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class EventNotificationAlert {
        @JsonProperty("ipAddress")
        private String ipAddress;
        
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
    }
}
