package com.magbo.access.services.licence;

import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/**
 * LA VÉRIFICATION DE SIGNATURE — Ed25519, hors ligne, sans dépendance.
 *
 * <h3>Signature, pas mot de passe</h3>
 * Un mot de passe embarqué dans le backend serait le même secret des deux
 * côtés : quiconque lit le JAR pourrait émettre. Ici la clé PRIVÉE reste chez
 * Sam et n'entre <b>jamais</b> dans le dépôt ni dans le JAR ; seule la clé
 * PUBLIQUE est embarquée, et une clé publique ne permet que de <i>vérifier</i>.
 * Toute altération d'un champ du fichier invalide la signature — c'est le seul
 * point du mécanisme qui repose sur des mathématiques et non sur de la
 * discipline.
 *
 * <h3>Ed25519 et pas RSA-2048</h3>
 * Le JDK 17 le fournit nativement (JEP 339, depuis Java 15) : <b>aucune
 * dépendance ajoutée au {@code pom.xml}</b>, donc aucune bibliothèque de plus à
 * auditer et à mettre à jour sur une VM que personne n'administrera après le
 * départ de Sam. Et surtout, l'outil d'émission tourne sur le même fournisseur
 * cryptographique : encodages de clé et de signature identiques des deux côtés,
 * ce qui supprime la classe de bug qu'on ne découvre que le jour du
 * renouvellement à distance. Signatures de 64 octets, clés publiques de 32.
 *
 * <h3>⚠️ Aucune propriété ne peut remplacer la clé publique</h3>
 * La constante ci-dessous est <b>compilée</b>. Il n'existe volontairement ni
 * {@code magbo.licence.public-key}, ni variable d'environnement, ni fichier de
 * ressource pour la remplacer : ce serait une porte dérobée d'une seule ligne
 * dans un {@code .env} — signer ses propres licences avec sa propre clé. Les
 * tests injectent une clé de test par le constructeur, jamais par une
 * propriété, et {@code LicenceOutilContratTest} vérifie que cette porte
 * n'apparaît pas.
 */
public class LicenceVerifier {

    static final String ALGO = "Ed25519";

    /**
     * LA CLÉ PUBLIQUE DE MAGBO STUDIO — X.509 / SubjectPublicKeyInfo, base64.
     *
     * ⚠️ La clé privée correspondante a été générée hors du dépôt et reste chez
     * Sam. La remplacer ici (paire régénérée) invalide d'un coup TOUTES les
     * licences déjà émises, y compris celle qui tourne à l'école.
     *
     * Pour la régénérer : {@code java tools/licence/MagboLicence.java generer-cles}
     * — la commande affiche la ligne à coller ici.
     */
    public static final String CLE_PUBLIQUE =
            "MCowBQYDK2VwAyEA5IR9HEdtabuZlCN9QOoUuj1FaZyQI/U98XJk4EfybKY=";

    private final PublicKey cle;

    /** Le vérificateur de production : la clé compilée ci-dessus. */
    public LicenceVerifier() {
        this(CLE_PUBLIQUE);
    }

    /**
     * ⚠️ Réservé aux TESTS (clé jetable générée à la volée). Ce constructeur
     * n'est appelé nulle part en production : le bean Spring passe par le
     * constructeur sans argument. C'est le seul chemin d'injection, et il est
     * en Java — pas dans une propriété qu'un {@code .env} pourrait fixer.
     */
    public LicenceVerifier(String clePubliqueBase64) {
        this.cle = charger(clePubliqueBase64);
    }

    private static PublicKey charger(String base64) {
        try {
            byte[] der = Base64.getDecoder().decode(base64.trim());
            return KeyFactory.getInstance(ALGO).generatePublic(new X509EncodedKeySpec(der));
        } catch (Exception e) {
            // ⚠️ Ici, et seulement ici, on lève : une clé publique illisible est
            // une erreur de BUILD, pas un état d'exécution. Le backend qui monte
            // avec une clé cassée déclarerait toutes les licences invalides et
            // fermerait la gestion, en silence, pour une faute de frappe dans une
            // constante. Mieux vaut que ça saute au démarrage, une bonne fois.
            throw new IllegalStateException(
                    "cle publique de licence illisible (constante CLE_PUBLIQUE) : " + e.getMessage(), e);
        }
    }

    /**
     * La signature du contenu tient-elle ?
     *
     * ⚠️ NE LÈVE JAMAIS : une base64 malformée, une signature de la mauvaise
     * longueur, un contenu falsifié — tout cela répond {@code false}. Un
     * fichier abîmé ne doit pas pouvoir faire tomber le backend qui enregistre
     * les passages.
     */
    public boolean signatureValide(LicenceFichier.Contenu contenu) {
        if (contenu == null) return false;
        try {
            Signature s = Signature.getInstance(ALGO);
            s.initVerify(cle);
            s.update(contenu.octetsSignes());
            return s.verify(Base64.getDecoder().decode(contenu.signature()));
        } catch (Exception e) {
            return false;
        }
    }
}
