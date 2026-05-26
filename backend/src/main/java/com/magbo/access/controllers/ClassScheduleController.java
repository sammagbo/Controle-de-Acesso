package com.magbo.access.controllers;

import com.magbo.access.models.ClassSchedule;
import com.magbo.access.repositories.ClassScheduleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/class-schedules")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class ClassScheduleController {

    private final ClassScheduleRepository repository;

    @GetMapping
    public List<ClassSchedule> list() {
        return repository.findAll();
    }

    @GetMapping("/{classe}")
    public ResponseEntity<ClassSchedule> get(@PathVariable String classe) {
        return repository.findById(classe)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{classe}")
    public ResponseEntity<ClassSchedule> upsert(@PathVariable String classe, @RequestBody ClassSchedule body) {
        body.setClasse(classe);
        return ResponseEntity.ok(repository.save(body));
    }

    @DeleteMapping("/{classe}")
    public ResponseEntity<Void> delete(@PathVariable String classe) {
        if (!repository.existsById(classe)) {
            return ResponseEntity.notFound().build();
        }
        repository.deleteById(classe);
        return ResponseEntity.noContent().build();
    }
}
