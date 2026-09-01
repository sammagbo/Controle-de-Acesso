package com.magbo.access.models;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * LE TÉMOIN D'HORLOGE — la date la plus récente que ce système ait jamais vue.
 *
 * ⚠️ UNE SEULE LIGNE, id = 1. Ce n'est pas un journal : c'est une borne. La
 * table existe parce qu'une borne gardée en mémoire disparaîtrait au premier
 * {@code docker restart}, et reculer l'horloge puis redémarrer serait le
 * contournement le plus évident du monde.
 *
 * <h3>Pourquoi une DATE et pas un TIMESTAMP</h3>
 * La licence expire un JOUR. Une borne à la seconde rendrait le mécanisme
 * sensible au bruit — corrections NTP, dérive, ordre des requêtes — sans rien
 * protéger de plus. À la journée, il y a au plus une écriture par jour et la
 * comparaison est franche.
 *
 * <h3>⚠️ Le piège que cette table crée, et il est réel</h3>
 * La borne ne recule jamais. Si quelqu'un avance l'horloge de la VM (pour un
 * test, pour une manipulation) puis la remet à l'heure, la borne reste dans le
 * futur et le recul est détecté <b>en permanence</b> : la gestion se ferme et
 * ne se rouvre pas toute seule. La sortie est documentée et volontairement
 * manuelle — un {@code UPDATE} en base, décrit dans
 * {@code docs/operacional/procedimento-licence.md}. Elle demande le même accès
 * que remplacer le JAR ; en faire un bouton dans l'écran d'administration
 * aurait fait de l'anti-recul une décoration.
 *
 * @see com.magbo.access.services.licence.LicenceHorloge
 */
@Entity
@Table(name = "licence_clock")
@Getter
@Setter
@ToString
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LicenceClock {

    /** Toujours 1 — ligne unique. Le CHECK vit dans la V027, côté PostgreSQL. */
    @Id
    @Column(name = "id")
    private Short id;

    /** La date la plus récente jamais observée. N'est mise à jour que vers l'avant. */
    @Column(name = "date_max_vue", nullable = false)
    private LocalDate dateMaxVue;

    /** Quand cette borne a été avancée pour la dernière fois. */
    @Column(name = "observe_le", nullable = false)
    private LocalDateTime observeLe;

    /**
     * Dernier recul détecté, ou {@code null}. Conservé même après retour à la
     * normale : un incident d'horloge qu'on ne peut plus constater après coup
     * est un incident qu'on n'expliquera jamais.
     */
    @Column(name = "recul_detecte_le")
    private LocalDateTime reculDetecteLe;

    /** Amplitude du dernier recul, en jours. {@code null} si jamais détecté. */
    @Column(name = "recul_jours")
    private Long reculJours;
}
