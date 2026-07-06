package com.magbo.access.bootstrap;

import com.magbo.access.models.AccessAction;
import com.magbo.access.models.DoorMapping;
import com.magbo.access.repositories.DoorMappingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@Order(20)
@RequiredArgsConstructor
@Slf4j
public class DoorMappingBootstrap implements CommandLineRunner {

    private final DoorMappingRepository repository;

    @Override
    public void run(String... args) {
        if (repository.count() > 0) {
            log.info("DoorMapping bootstrap: existing mappings found, skipping seed");
            return;
        }

        List<DoorMapping> defaults = List.of(
                build(1, 1, "PORT1", AccessAction.ENTRADA, "Portail Principal - Entrée"),
                build(1, 2, "PORT1", AccessAction.SAIDA,   "Portail Principal - Sortie"),
                build(2, 1, "PORT2", AccessAction.ENTRADA, "Portail Terrain - Entrée"),
                build(2, 2, "PORT2", AccessAction.SAIDA,   "Portail Terrain - Sortie"),
                build(3, 1, "PORT3", AccessAction.ENTRADA, "Garage - Entrée"),
                build(3, 2, "PORT3", AccessAction.SAIDA,   "Garage - Sortie"),
                build(4, 1, "BIBLIO", AccessAction.ENTRADA, "CDI Bibliothèque - Entrée"),
                build(4, 2, "BIBLIO", AccessAction.SAIDA,   "CDI Bibliothèque - Sortie"),
                build(5, 1, "ENFERM", AccessAction.ENTRADA, "Infirmerie - Entrée"),
                build(5, 2, "ENFERM", AccessAction.SAIDA,   "Infirmerie - Sortie"),
                build(6, 1, "REFEI1", AccessAction.ENTRADA, "Cantine Principale - Entrée"),
                build(6, 2, "REFEI1", AccessAction.SAIDA,   "Cantine Principale - Sortie"),
                // Cameras DeepinView do Portail Principal — mapeadas por IP,
                // uma por sentido (confirmado no HikCentral em 06/07/2026)
                buildIpOnly("192.168.1.167", "PORT1", AccessAction.ENTRADA,
                        "Portail Principal - Caméra Entrée (ENTRADA-INTERNA-01)"),
                buildIpOnly("192.168.1.166", "PORT1", AccessAction.SAIDA,
                        "Portail Principal - Caméra Sortie (ENTRADA-INTERNA-02)")
        );

        repository.saveAll(defaults);
        log.info("DoorMapping bootstrap: {} default mappings seeded", defaults.size());
    }

    private DoorMapping build(Integer doorNo, Integer readerNo, String pointId, AccessAction action, String label) {
        return DoorMapping.builder()
                .doorNo(doorNo)
                .readerNo(readerNo)
                .pointId(pointId)
                .action(action)
                .label(label)
                .ativo(true)
                .build();
    }

    private DoorMapping buildIpOnly(String terminalIp, String pointId, AccessAction action, String label) {
        return DoorMapping.builder()
                .terminalIp(terminalIp)
                .pointId(pointId)
                .action(action)
                .label(label)
                .ativo(true)
                .build();
    }
}
