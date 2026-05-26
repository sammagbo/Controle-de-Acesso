package com.magbo.access.bootstrap;

import com.magbo.access.models.ClassSchedule;
import com.magbo.access.repositories.ClassScheduleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@Order(30)
@RequiredArgsConstructor
@Slf4j
public class ClassScheduleBootstrap implements CommandLineRunner {

    private final ClassScheduleRepository repository;

    @Override
    public void run(String... args) {
        if (repository.count() > 0) {
            log.info("ClassSchedule bootstrap: existing schedules found, skipping seed");
            return;
        }

        List<ClassSchedule> defaults = List.of(
                s("1E1","12H30","13H00","N","13H00","12H30"),
                s("2E1","12H30","13H00","N","13H00","13H00"),
                s("3E1","12H30","13H00","N","13H00","13H00"),
                s("4E1","13H00","13H00","13H00","12H30","13H00"),
                s("5E1","13H00","12H30","12H30","13H00","13H00"),
                s("6E1","13H00","12H30","13H00","13H00","12H30"),
                s("1E2","13H00","12H30","N","13H00","12H30"),
                s("2E2","13H00","13H00","N","13H00","13H00"),
                s("3E2","12H30","13H00","N","13H00","13H00"),
                s("4E2","13H00","13H00","13H00","13H00","13H00"),
                s("5E2","13H00","13H00","13H00","13H00","13H00"),
                s("6E2","13H00","13H00","13H00","13H00","13H00"),
                s("1E3","11H00","11H00","11H00","11H00","11H00"),
                s("2E3","11H00","11H00","11H00","11H00","11H00"),
                s("3E3","11H00","11H00","11H00","11H00","11H00"),
                s("4E3","11H00","11H00","11H00","11H00","11H00"),
                s("6E3","11H00","11H00","11H00","11H00","11H00"),
                s("CPA","11H00","11H00","N","11H00","11H00"),
                s("CPB","11H00","11H00","N","11H00","11H00"),
                s("CPC","11H00","11H00","N","11H00","11H00"),
                s("CE1A","11H00","11H00","N","11H00","11H00"),
                s("CE1B","11H00","11H00","N","11H00","11H00"),
                s("CE1C","11H00","11H00","N","11H00","11H00"),
                s("CE1D","11H00","11H00","N","11H00","11H00"),
                s("CE2A","11H00","11H00","N","11H00","11H00"),
                s("CE2B","11H00","11H00","N","11H00","11H00"),
                s("CE2C","11H00","11H00","N","11H00","11H00"),
                s("CE2D","11H00","11H00","N","11H00","11H00"),
                s("CM1A","11H00","11H00","N","11H00","11H00"),
                s("CM1B","11H00","11H00","N","11H00","11H00"),
                s("CM1C","11H00","11H00","N","11H00","11H00"),
                s("CM2A","11H00","11H00","N","11H00","11H00"),
                s("CM2B","11H00","11H00","N","11H00","11H00"),
                s("CM2C","11H00","11H00","N","11H00","11H00"),
                s("GSA","11H00","11H00","N","11H00","11H00"),
                s("GSB","11H00","11H00","N","11H00","11H00"),
                s("GSC","11H00","11H00","N","11H00","11H00"),
                s("MSA","11H00","11H00","N","11H00","11H00"),
                s("MSB","11H00","11H00","N","11H00","11H00"),
                s("T1","13H00","13H00","13H00","13H00","13H00"),
                s("T2","13H00","13H00","13H00","13H00","13H00"),
                s("TPS/PS A","11H00","11H00","N","11H00","11H00"),
                s("TPS/PS B","11H00","11H00","N","11H00","11H00")
        );

        repository.saveAll(defaults);
        log.info("ClassSchedule bootstrap: {} class schedules seeded", defaults.size());
    }

    private ClassSchedule s(String classe, String lun, String mar, String mer, String jeu, String ven) {
        return ClassSchedule.builder()
                .classe(classe).lunMidi(lun).marMidi(mar).merMidi(mer).jeuMidi(jeu).venMidi(ven)
                .build();
    }
}
