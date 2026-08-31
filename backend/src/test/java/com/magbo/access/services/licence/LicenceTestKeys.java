package com.magbo.access.services.licence;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.time.LocalDate;
import java.util.Base64;

/**
 * Une paire de clés JETABLE pour les tests, plus de quoi fabriquer un fichier
 * de licence signé.
 *
 * ⚠️ AUCUNE CLÉ DE PRODUCTION ICI, et c'est structurel : la paire est générée à
 * chaque exécution, en mémoire. Un test qui aurait besoin de la vraie clé
 * privée serait un test qui exige que la clé privée soit dans le dépôt — c'est
 * exactement ce que le mécanisme interdit.
 *
 * ⚠️ CE FICHIER EST UNE TROISIÈME IMPLÉMENTATION DE LA SIGNATURE, et il ne
 * prouve donc RIEN sur l'outil d'émission. Une version antérieure de ce
 * commentaire affirmait qu'il « permet de prouver l'aller-retour complet sans
 * jamais lancer l'outil » — c'était une affirmation à l'œil, pas une preuve, et
 * exactement le précédent que le projet s'est déjà infligé une fois (un
 * commentaire qui promettait une couverture inexistante).
 *
 * Ce qui prouve réellement l'aller-retour est
 * {@link LicenceOutilBoutEnBoutTest}, qui LANCE l'outil et fait relire sa
 * sortie par les classes de production. Ici on ne fabrique que des fixtures.
 */
final class LicenceTestKeys {

    final String clePubliqueBase64;
    private final KeyPair paire;

    LicenceTestKeys() {
        try {
            paire = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
            clePubliqueBase64 = Base64.getEncoder().encodeToString(paire.getPublic().getEncoded());
        } catch (Exception e) {
            throw new IllegalStateException("Ed25519 indisponible dans ce JDK", e);
        }
    }

    /** Le vérificateur qui accepte les licences signées par cette paire. */
    LicenceVerifier verifier() {
        return new LicenceVerifier(clePubliqueBase64);
    }

    /** Le texte complet d'un fichier de licence valide, signé par cette paire. */
    String fichier(String etablissement, String licenceId, LocalDate emisLe, LocalDate expireLe) {
        String canonique = String.format(LicenceFichier.FORME_CANONIQUE,
                etablissement, licenceId, emisLe, expireLe);
        return "# licence de test\n" + canonique + "\nsignature=" + signer(canonique) + "\n";
    }

    /** Un contenu signé, sans passer par le texte du fichier. */
    LicenceFichier.Contenu contenu(String etablissement, String licenceId,
                                   LocalDate emisLe, LocalDate expireLe) {
        String canonique = String.format(LicenceFichier.FORME_CANONIQUE,
                etablissement, licenceId, emisLe, expireLe);
        return new LicenceFichier.Contenu(etablissement, licenceId, emisLe, expireLe, signer(canonique));
    }

    String signer(String canonique) {
        try {
            Signature s = Signature.getInstance("Ed25519");
            s.initSign(paire.getPrivate());
            s.update(canonique.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(s.sign());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
