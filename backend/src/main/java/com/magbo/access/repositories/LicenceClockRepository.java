package com.magbo.access.repositories;

import com.magbo.access.models.LicenceClock;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Le temoin d'horloge de la licence. Une seule ligne, id = 1.
 *
 * Pas de methode derivee : {@code findById((short) 1)} et {@code save} suffisent.
 * Voir {@link com.magbo.access.services.licence.LicenceHorloge}.
 */
public interface LicenceClockRepository extends JpaRepository<LicenceClock, Short> {
}
