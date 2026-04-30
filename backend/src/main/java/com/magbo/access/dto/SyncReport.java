package com.magbo.access.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SyncReport {
    @Builder.Default
    private int created = 0;
    @Builder.Default
    private int updated = 0;
    @Builder.Default
    private int deactivated = 0;
    @Builder.Default
    private int errors = 0;
    @Builder.Default
    private List<String> errorMessages = new ArrayList<>();
    private LocalDateTime syncedAt;
    private String filePath;

    public void incrementCreated() { this.created++; }
    public void incrementUpdated() { this.updated++; }
    public void incrementDeactivated() { this.deactivated++; }
    public void addError(String message) {
        this.errors++;
        if (this.errorMessages.size() < 10) {
            this.errorMessages.add(message);
        }
    }
}
