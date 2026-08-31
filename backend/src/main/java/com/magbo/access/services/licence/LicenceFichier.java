package com.magbo.access.services.licence;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

/**
 * LE FICHIER DE LICENCE — lecture et forme canonique. Pur : aucun Spring,
 * aucun disque, aucune horloge. Il se teste sans monter de contexte.
 *
 * <h3>Le format</h3>
 * <pre>
 * # commentaires libres, ignorés
 * MAGBO-LICENCE-V1
 * etablissement=Lycée Molière
 * licence_id=LM-20261130
 * emis_le=2026-08-31
 * expire_le=2026-11-30
 * signature=&lt;base64 Ed25519&gt;
 * </pre>
 *
 * ⚠️ TEXTE LISIBLE, PAS UN BLOB. Sur la VM, quelqu'un doit pouvoir faire
 * {@code cat licence.magbo} et comprendre ce qu'il regarde sans outil. Un JSON
 * compact signé aurait été plus court et aurait transformé chaque diagnostic en
 * « envoyez-moi le fichier, je vous dirai ». C'est l'inverse de ce dont on a
 * besoin quand l'émetteur est en France.
 *
 * ⚠️ LA STRICTESSE EST DÉLIBÉRÉE. Un champ inconnu, un champ en trop, un ordre
 * différent : {@link LicenceMotif#ILLISIBLE}. Tolérer des lignes inconnues
 * laisserait croire qu'on peut ajouter un champ au fichier — alors qu'un champ
 * hors de la forme canonique n'est PAS signé, donc pas protégé, donc modifiable
 * par n'importe qui. Mieux vaut refuser que faire semblant d'honorer.
 *
 * ⚠️ LES COMMENTAIRES, EUX, NE SONT PAS SIGNÉS et c'est assumé : ils n'ont
 * aucun effet. Quelqu'un peut réécrire l'en-tête sans invalider la licence, et
 * il n'obtient rien de plus qu'un fichier au commentaire menteur. Le prix de
 * pouvoir écrire « ne pas modifier » en haut du fichier.
 */
public final class LicenceFichier {

    // -----------------------------------------------------------------
    // LA FORME CANONIQUE — les octets qui sont signés
    // -----------------------------------------------------------------
    // ⚠️ CETTE CHAÎNE EST UN CONTRAT AVEC L'OUTIL D'ÉMISSION. Le fichier
    // `tools/licence/MagboLicence.java` contient la MÊME ligne, mot pour mot,
    // et `LicenceOutilContratTest` compare les deux : une divergence d'un seul
    // caractère rendrait toute licence émise invalide sur la VM, et on ne le
    // découvrirait que le jour du renouvellement — depuis la France, sans
    // pouvoir rien corriger.
    //
    // L'ordre des champs fait partie de la signature : permuter deux lignes
    // change les octets signés. Le marqueur de version en tête empêche qu'un
    // format futur soit relu comme celui-ci.
    public static final String FORME_CANONIQUE =
            "MAGBO-LICENCE-V1\netablissement=%s\nlicence_id=%s\nemis_le=%s\nexpire_le=%s";

    /** Le marqueur attendu en première ligne utile. */
    static final String MARQUEUR = "MAGBO-LICENCE-V1";

    /** Les quatre champs signés, dans l'ordre. L'ordre EST le contrat. */
    static final List<String> CHAMPS = List.of("etablissement", "licence_id", "emis_le", "expire_le");

    private LicenceFichier() {
    }

    /**
     * Le contenu d'une licence lue. {@code signature} est en base64, telle
     * qu'elle figure dans le fichier.
     */
    public record Contenu(String etablissement, String licenceId,
                          LocalDate emisLe, LocalDate expireLe, String signature) {

        /** Les octets exacts sur lesquels porte la signature. */
        public byte[] octetsSignes() {
            return String.format(FORME_CANONIQUE, etablissement, licenceId, emisLe, expireLe)
                    .getBytes(StandardCharsets.UTF_8);
        }
    }

    /** Une lecture qui a échoué, avec la raison — jamais une exception. */
    public record Lecture(Contenu contenu, LicenceMotif motif, String detail) {
        public boolean ok() {
            return contenu != null;
        }

        static Lecture echec(String detail) {
            return new Lecture(null, LicenceMotif.ILLISIBLE, detail);
        }
    }

    /**
     * Lit le texte d'un fichier de licence.
     *
     * ⚠️ NE LÈVE JAMAIS. Un fichier abîmé doit produire un état, pas une
     * exception qui remonterait au démarrage : le backend doit monter et
     * enregistrer les passages même avec une licence illisible. C'est le
     * principe entier du paquet, appliqué à sa porte d'entrée.
     */
    public static Lecture lire(String texte) {
        if (texte == null || texte.isBlank()) return Lecture.echec("fichier vide");

        // ⚠️ LE BOM UTF-8, ET IL ARRIVERA. Sur Windows, la redirection `>` de
        // PowerShell et « Enregistrer en UTF-8 avec BOM » du Bloc-notes
        // ajoutent U+FEFF en tête de fichier — et la procédure de secours dit
        // justement de recopier la licence à la main. Sans ce retrait, la
        // première ligne devient « ﻿# ... », ne compte plus comme un
        // commentaire, et le fichier est déclaré ILLISIBLE pour trois octets
        // qu'aucun éditeur n'affiche. Diagnostiquer ça à distance, depuis la
        // France, coûterait une soirée.
        //
        // Le retrait est sans ambiguïté : le BOM n'appartient à aucun champ, et
        // les octets signés sont reconstruits À PARTIR DES VALEURS LUES, jamais
        // du texte brut du fichier — la signature n'en est donc pas affectée.
        if (!texte.isEmpty() && texte.charAt(0) == '﻿') {
            texte = texte.substring(1);
        }

        List<String> lignes = new ArrayList<>();
        // ⚠️ split("\n", -1) puis retrait d'un \r final : un fichier édité sous
        // Windows arrive en CRLF, et un \r resté collé à la valeur changerait
        // les octets signés — la signature ne tiendrait plus, pour une raison
        // invisible à l'œil dans un `cat`.
        for (String brute : texte.split("\n", -1)) {
            String l = brute.endsWith("\r") ? brute.substring(0, brute.length() - 1) : brute;
            if (l.isBlank() || l.startsWith("#")) continue;
            lignes.add(l);
        }

        int attendu = CHAMPS.size() + 2; // marqueur + champs + signature
        if (lignes.size() != attendu) {
            return Lecture.echec("attendu " + attendu + " lignes utiles, trouve " + lignes.size());
        }
        if (!MARQUEUR.equals(lignes.get(0))) {
            return Lecture.echec("premiere ligne utile attendue « " + MARQUEUR + " », trouve « "
                    + lignes.get(0) + " »");
        }

        String[] valeurs = new String[CHAMPS.size()];
        for (int i = 0; i < CHAMPS.size(); i++) {
            String cle = CHAMPS.get(i);
            String v = valeurDe(lignes.get(i + 1), cle);
            if (v == null) {
                return Lecture.echec("ligne " + (i + 2) + " : attendue « " + cle + "=... »");
            }
            if (v.isBlank()) return Lecture.echec("le champ « " + cle + " » est vide");
            valeurs[i] = v;
        }

        String signature = valeurDe(lignes.get(lignes.size() - 1), "signature");
        if (signature == null || signature.isBlank()) {
            return Lecture.echec("derniere ligne attendue « signature=... »");
        }

        LocalDate emisLe;
        LocalDate expireLe;
        try {
            emisLe = LocalDate.parse(valeurs[2]);
            expireLe = LocalDate.parse(valeurs[3]);
        } catch (DateTimeParseException e) {
            return Lecture.echec("date non conforme a AAAA-MM-JJ : " + e.getParsedString());
        }
        // ⚠️ Une licence qui expire avant d'être émise n'est pas une licence :
        // c'est un fichier construit à la main, ou un outil cassé. Refuser ici
        // évite d'avoir à raisonner sur des durées négatives partout après.
        if (expireLe.isBefore(emisLe)) {
            return Lecture.echec("expire_le (" + expireLe + ") precede emis_le (" + emisLe + ")");
        }

        return new Lecture(new Contenu(valeurs[0], valeurs[1], emisLe, expireLe, signature),
                LicenceMotif.OK, null);
    }

    /**
     * La valeur d'une ligne {@code cle=valeur}, ou {@code null} si la clé ne
     * correspond pas.
     *
     * ⚠️ Découpe sur le PREMIER {@code =} : le nom d'un établissement pourrait
     * contenir le caractère. L'outil d'émission le refuse à l'écriture, mais un
     * lecteur qui découpe au dernier {@code =} tronquerait silencieusement une
     * valeur, et la signature échouerait sans que personne comprenne pourquoi.
     */
    private static String valeurDe(String ligne, String cle) {
        int i = ligne.indexOf('=');
        if (i < 0) return null;
        if (!ligne.substring(0, i).equals(cle)) return null;
        return ligne.substring(i + 1);
    }
}
