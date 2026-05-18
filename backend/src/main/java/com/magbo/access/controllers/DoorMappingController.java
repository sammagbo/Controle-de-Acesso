package com.magbo.access.controllers;

import com.magbo.access.models.DoorMapping;
import com.magbo.access.repositories.DoorMappingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/door-mappings")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class DoorMappingController {

    private final DoorMappingRepository repository;

    @GetMapping
    public List<DoorMapping> list() {
        return repository.findAllByOrderByDoorNoAscReaderNoAsc();
    }

    @GetMapping("/{id}")
    public ResponseEntity<DoorMapping> get(@PathVariable Long id) {
        return repository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<DoorMapping> create(@RequestBody DoorMapping mapping) {
        mapping.setId(null);
        if (mapping.getAtivo() == null) mapping.setAtivo(true);
        return ResponseEntity.ok(repository.save(mapping));
    }

    @PutMapping("/{id}")
    public ResponseEntity<DoorMapping> update(@PathVariable Long id, @RequestBody DoorMapping mapping) {
        return repository.findById(id).map(existing -> {
            existing.setTerminalIp(mapping.getTerminalIp());
            existing.setDoorNo(mapping.getDoorNo());
            existing.setReaderNo(mapping.getReaderNo());
            existing.setPointId(mapping.getPointId());
            existing.setAction(mapping.getAction());
            existing.setLabel(mapping.getLabel());
            if (mapping.getAtivo() != null) existing.setAtivo(mapping.getAtivo());
            return ResponseEntity.ok(repository.save(existing));
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        return repository.findById(id)
                .map(existing -> {
                    existing.setAtivo(false);
                    repository.save(existing);
                    return ResponseEntity.noContent().<Void>build();
                })
                .orElse(ResponseEntity.notFound().<Void>build());
    }
}
