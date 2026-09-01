// =====================================================================
// MAGBO Access Control — OUTIL D'ÉMISSION DE LICENCE
// =====================================================================
// Fichier source UNIQUE, exécutable sans Maven et sans compilation :
//
//     java tools/licence/MagboLicence.java <commande> [options]
//
// (Java 11+ exécute un fichier source directement — JEP 330. Aucune
// dépendance, aucun `mvn`, aucun réseau. Sam doit pouvoir émettre une clé
// depuis n'importe quel poste où un JDK est installé, en deux minutes.)
//
// ⚠️⚠️ LA CLÉ PRIVÉE N'ENTRE JAMAIS DANS LE DÉPÔT NI DANS LE JAR.
// Elle reste chez Sam. Quiconque la détient peut émettre une licence
// perpétuelle : c'est le seul secret du mécanisme. Le dépôt est PUBLIC
// (github.com/sammagbo/Controle-de-Acesso) — un `git add` distrait de
// `magbo-licence-privee.pem` publie le droit d'émettre à tout internet.
// La racine du dépôt ignore déjà `*.pem` et `*.magbo`, mais un fichier
// rangé ailleurs n'est protégé par rien : gardez la clé HORS du dépôt.
//
// ⚠️ POURQUOI Ed25519 ET PAS RSA. Le JDK 17 signe et vérifie Ed25519 nativement
// (JEP 339, depuis Java 15) : ZÉRO dépendance ajoutée au `pom.xml`, donc zéro
// bibliothèque à auditer, et — ce qui compte le plus ici — l'émetteur et le
// vérificateur partagent le MÊME fournisseur cryptographique. Un encodage de
// clé ou de signature qui diverge entre deux bibliothèques est le bug qu'on ne
// découvre que le jour où la licence doit être renouvelée à distance.
//
// ⚠️ CE QUE CE MÉCANISME NE PROTÈGE PAS : quelqu'un qui recompile le backend
// depuis les sources peut le retirer. C'est une licence, pas une forteresse,
// et c'est assumé — voir ADR-006.
// =====================================================================

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.SignatureException;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class MagboLicence {

    // -----------------------------------------------------------------
    // LA FORME CANONIQUE — les octets qui sont signés
    // -----------------------------------------------------------------
    // ⚠️ CETTE CHAÎNE EST UN CONTRAT AVEC LE BACKEND. Le vérificateur
    // (backend/.../services/licence/LicenceFichier.java) contient la MÊME
    // ligne, mot pour mot, et `LicenceOutilContratTest` compare les deux
    // fichiers : une divergence d'un seul caractère rendrait toute licence
    // émise ici invalide sur la VM, et on ne le découvrirait que le jour du
    // renouvellement — depuis la France, sans pouvoir rien corriger.
    //
    // L'ordre des champs fait partie de la signature : permuter deux lignes
    // change les octets signés. Le marqueur de version en tête empêche
    // qu'un format futur soit relu comme celui-ci.
    static final String FORME_CANONIQUE =
            "MAGBO-LICENCE-V1\netablissement=%s\nlicence_id=%s\nemis_le=%s\nexpire_le=%s";

    static final String ALGO = "Ed25519";

    // -----------------------------------------------------------------

    public static void main(String[] args) {
        // ⚠️ SORTIE EN UTF-8. Sans cela, la console Windows rend « Lyc?e
        // Moli?re » alors que le FICHIER est parfaitement correct — et la ligne
        // de confirmation est ce que l'opérateur croira. Faire douter de la
        // seule chose qui soit juste est le pire résultat possible pour une
        // commande qu'on lance une fois par an. (Panel de revue, 31/08/2026.)
        try {
            System.setOut(new java.io.PrintStream(
                    new java.io.FileOutputStream(java.io.FileDescriptor.out),
                    true, StandardCharsets.UTF_8));
            System.setErr(new java.io.PrintStream(
                    new java.io.FileOutputStream(java.io.FileDescriptor.err),
                    true, StandardCharsets.UTF_8));
        } catch (Exception ignore) {
            // Console exotique : on continue avec la sortie par défaut.
        }
        try {
            if (args.length == 0) {
                aide();
                System.exit(2);
            }
            Map<String, String> o = options(args);
            switch (args[0]) {
                case "generer-cles" -> genererCles(o);
                case "emettre" -> emettre(o);
                case "verifier" -> verifier(o);
                case "aide", "-h", "--help" -> aide();
                default -> {
                    erreur("commande inconnue : " + args[0]);
                    aide();
                    System.exit(2);
                }
            }
        } catch (Erreur e) {
            erreur(e.getMessage());
            System.exit(1);
        } catch (Exception e) {
            erreur(e.getClass().getSimpleName() + " : " + e.getMessage());
            System.exit(1);
        }
    }

    // -- 1. generer-cles ----------------------------------------------

    static void genererCles(Map<String, String> o) throws Exception {
        Path dir = Path.of(o.getOrDefault("sortie", "."));
        Files.createDirectories(dir);
        Path privee = dir.resolve("magbo-licence-privee.pem");
        Path publique = dir.resolve("magbo-licence-publique.txt");

        // ⚠️ REFUS D'ÉCRASER. Écraser une clé privée existante, c'est rendre
        // INVALIDES d'un coup toutes les licences déjà émises avec elle — y
        // compris celle qui tourne à l'école en ce moment. Une commande qui
        // détruit ça en silence n'a pas sa place dans un outil qu'on lance
        // une fois par an, de mémoire.
        if (Files.exists(privee)) {
            throw new Erreur("il existe deja une cle privee ici : " + privee.toAbsolutePath()
                    + "\n  L'ecraser INVALIDERAIT toutes les licences deja emises (celle de"
                    + " l'ecole comprise).\n  Choisissez un autre --sortie, ou deplacez"
                    + " l'ancienne cle a la main si vous voulez vraiment repartir de zero.");
        }

        KeyPairGenerator g = KeyPairGenerator.getInstance(ALGO);
        KeyPair kp = g.generateKeyPair();

        String b64Privee = Base64.getEncoder().encodeToString(kp.getPrivate().getEncoded());
        String b64Publique = Base64.getEncoder().encodeToString(kp.getPublic().getEncoded());

        Files.writeString(privee, pem("PRIVATE KEY", b64Privee), StandardCharsets.UTF_8);
        Files.writeString(publique, b64Publique + "\n", StandardCharsets.UTF_8);
        durcirPermissions(privee);

        System.out.println("Paire de cles Ed25519 generee.");
        System.out.println();
        System.out.println("  CLE PRIVEE   -> " + privee.toAbsolutePath());
        System.out.println("     /!\\  NE JAMAIS committer, ne jamais deposer sur la VM, ne jamais");
        System.out.println("          envoyer par courriel. Sauvegardez-la HORS du depot.");
        System.out.println("          Perdue = plus aucune licence emissible : il faudrait");
        System.out.println("          recompiler le backend avec une nouvelle cle publique.");
        System.out.println();
        System.out.println("  CLE PUBLIQUE -> " + publique.toAbsolutePath());
        System.out.println();
        System.out.println("Collez la ligne ci-dessous dans le backend, a la place de la");
        System.out.println("constante CLE_PUBLIQUE de :");
        System.out.println("  backend/src/main/java/com/magbo/access/services/licence/LicenceVerifier.java");
        System.out.println();
        System.out.println("    public static final String CLE_PUBLIQUE =");
        System.out.println("            \"" + b64Publique + "\";");
        System.out.println();
    }

    // -- 2. emettre ---------------------------------------------------

    static void emettre(Map<String, String> o) throws Exception {
        String etablissement = exige(o, "etablissement");
        Path clePrivee = Path.of(exige(o, "cle-privee"));

        LocalDate emisLe = o.containsKey("emis-le") ? date(o.get("emis-le")) : LocalDate.now();
        LocalDate expireLe;
        if (o.containsKey("jusqu-au")) {
            expireLe = date(o.get("jusqu-au"));
        } else if (o.containsKey("mois")) {
            int mois;
            try {
                mois = Integer.parseInt(o.get("mois").trim());
            } catch (NumberFormatException e) {
                throw new Erreur("--mois doit etre un entier");
            }
            if (mois <= 0) throw new Erreur("--mois doit etre superieur a zero");
            expireLe = emisLe.plusMonths(mois);
        } else {
            throw new Erreur("indiquez --mois <n> ou --jusqu-au AAAA-MM-JJ");
        }
        if (expireLe.isBefore(emisLe)) {
            throw new Erreur("la date d'expiration (" + expireLe + ") precede l'emission (" + emisLe + ")");
        }

        String id = o.getOrDefault("id", idParDefaut(etablissement, expireLe));
        verifieChamp("etablissement", etablissement);
        verifieChamp("licence_id", id);

        PrivateKey pk = lireClePrivee(clePrivee);
        String canonique = String.format(FORME_CANONIQUE, etablissement, id, emisLe, expireLe);

        Signature s = Signature.getInstance(ALGO);
        s.initSign(pk);
        s.update(canonique.getBytes(StandardCharsets.UTF_8));
        String signature = Base64.getEncoder().encodeToString(s.sign());

        String fichier = enTete(etablissement, emisLe, expireLe)
                + canonique + "\n"
                + "signature=" + signature + "\n";

        if (o.containsKey("sortie")) {
            Path p = Path.of(o.get("sortie"));
            if (p.getParent() != null) Files.createDirectories(p.getParent());
            Files.writeString(p, fichier, StandardCharsets.UTF_8);
            System.out.println("Licence ecrite : " + p.toAbsolutePath());
        } else {
            System.out.print(fichier);
        }
        System.out.println();
        System.out.println("  etablissement : " + etablissement);
        System.out.println("  identifiant   : " + id);
        System.out.println("  emise le      : " + emisLe);
        System.out.println("  expire le     : " + expireLe + "   (utilisable CE jour-la inclus)");
        System.out.println();
        System.out.println("Deposez ce fichier sur la VM en tant que  deploy/licence/licence.magbo");
        System.out.println("puis :  docker restart magbo-backend");
        System.out.println("   ou :  POST /api/admin/licence/recharger  (compte ADMIN, sans redemarrage)");
    }

    // -- 3. verifier --------------------------------------------------

    static void verifier(Map<String, String> o) throws Exception {
        Path fichier = Path.of(exige(o, "fichier"));
        String b64Pub = clePubliqueDepuis(exige(o, "cle-publique"));

        String texte = Files.readString(fichier, StandardCharsets.UTF_8);
        // ⚠️ Le BOM UTF-8 : la redirection `>` de PowerShell et le Bloc-notes en
        // ajoutent un. Meme retrait que le verificateur du backend — sinon
        // l'outil dirait « format inattendu » pour trois octets qu'aucun
        // editeur n'affiche.
        if (!texte.isEmpty() && texte.charAt(0) == '﻿') texte = texte.substring(1);

        List<String> lignes = new ArrayList<>();
        for (String l : texte.split("\n", -1)) {
            String sansCr = l.endsWith("\r") ? l.substring(0, l.length() - 1) : l;
            if (sansCr.isBlank() || sansCr.startsWith("#")) continue;
            lignes.add(sansCr);
        }
        if (lignes.size() != 6 || !"MAGBO-LICENCE-V1".equals(lignes.get(0))) {
            throw new Erreur("format inattendu (attendu : le marqueur, 4 champs, puis la signature)");
        }
        String etab = valeur(lignes.get(1), "etablissement");
        String id = valeur(lignes.get(2), "licence_id");
        String emis = valeur(lignes.get(3), "emis_le");
        String expire = valeur(lignes.get(4), "expire_le");
        String sig = valeur(lignes.get(5), "signature");

        String canonique = String.format(FORME_CANONIQUE, etab, id, emis, expire);
        PublicKey pub = KeyFactory.getInstance(ALGO)
                .generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(b64Pub)));
        Signature s = Signature.getInstance(ALGO);
        s.initVerify(pub);
        s.update(canonique.getBytes(StandardCharsets.UTF_8));

        // ⚠️ TOUTE ANOMALIE DE SIGNATURE VAUT « INVALIDE », jamais une pile
        // d'appels. Une base64 tronquee, une signature de la mauvaise longueur,
        // un fichier bricole a la main : ce sont exactement les cas que cette
        // commande existe pour diagnostiquer. Laisser remonter une
        // SignatureException donnerait a Sam un message Java au lieu de la
        // reponse qu'il cherche — et c'est le meme choix que fait le backend,
        // qui repond SIGNATURE_INVALIDE au lieu de tomber.
        boolean ok;
        try {
            ok = s.verify(Base64.getDecoder().decode(sig));
        } catch (IllegalArgumentException | SignatureException e) {
            ok = false;
        }
        System.out.println("  etablissement : " + etab);
        System.out.println("  identifiant   : " + id);
        System.out.println("  emise le      : " + emis);
        System.out.println("  expire le     : " + expire);
        System.out.println("  signature     : " + (ok ? "VALIDE" : "*** INVALIDE ***"));
        if (!ok) {
            System.out.println();
            System.out.println("  Soit le fichier a ete modifie apres emission, soit il a ete signe");
            System.out.println("  avec une AUTRE cle privee que celle qui correspond a --cle-publique.");
            System.exit(1);
        }
        long jours = ChronoUnit.DAYS.between(LocalDate.now(), date(expire));
        System.out.println("  aujourd'hui   : " + (jours >= 0
                ? "encore " + jours + " jour(s)"
                : "expiree depuis " + (-jours) + " jour(s)"));
    }

    // -- outillage ----------------------------------------------------

    /** Une erreur d'usage : message lisible, sans pile d'appels. */
    static final class Erreur extends RuntimeException {
        Erreur(String m) {
            super(m);
        }
    }

    static String enTete(String etab, LocalDate emis, LocalDate expire) {
        return "# =====================================================================\n"
                + "# MAGBO Access Control - fichier de licence\n"
                + "# =====================================================================\n"
                + "# NE PAS MODIFIER : toute alteration d'un champ invalide la signature,\n"
                + "# et le backend traite alors la licence comme absente.\n"
                + "#\n"
                + "# Ce fichier n'est pas un secret : il n'autorise que cet etablissement,\n"
                + "# jusqu'a la date indiquee. Il ne contient aucune donnee personnelle.\n"
                + "#\n"
                + "# Emis pour : " + etab + "\n"
                + "# Periode   : du " + emis + " au " + expire + " inclus\n"
                + "# Renouvellement : sammagbo@gmail.com\n"
                + "# =====================================================================\n";
    }

    static String idParDefaut(String etab, LocalDate expire) {
        StringBuilder sb = new StringBuilder();
        for (char c : java.text.Normalizer.normalize(etab, java.text.Normalizer.Form.NFD).toCharArray()) {
            if (Character.isLetterOrDigit(c) && c < 128) sb.append(Character.toUpperCase(c));
            if (sb.length() >= 6) break;
        }
        if (sb.length() == 0) sb.append("MAGBO");
        return sb + "-" + expire.toString().replace("-", "");
    }

    /**
     * ⚠️ Un `=` ou un saut de ligne dans une valeur casserait la relecture du
     * fichier — le vérificateur découpe sur le PREMIER `=` et sur les fins de
     * ligne. Refuser à l'émission plutôt qu'émettre une licence que la VM
     * déclarera illisible, à un moment où personne ne pourra la corriger.
     */
    /**
     * ⚠️ LE PIÈGE DE LA CONSOLE WINDOWS, et il coûterait cher.
     *
     * Selon le terminal, {@code --etablissement "Lycée Molière"} peut arriver
     * à la JVM DÉJÀ abîmé : « LycÃ©e MoliÃ¨re » (UTF-8 relu en latin-1), ou
     * « Lyc?e Moli?re » (caractère non représentable dans la page de codes).
     * L'outil signerait alors ce nom-là — la signature serait parfaitement
     * VALIDE, et l'école aurait pour toujours un bandeau au nom abîmé, sans
     * moyen de le corriger autrement qu'en réémettant.
     *
     * On refuse plutôt que d'émettre. Le contournement, écrit dans le message :
     * {@code --etablissement} sans accent, ou une console en UTF-8
     * ({@code chcp 65001}, ou Git Bash / Windows Terminal / PowerShell 7).
     */
    static void verifieEncodage(String nom, String valeur) {
        if (valeur.indexOf('�') >= 0 || valeur.indexOf('?') >= 0) {
            throw new Erreur(nom + " contient un caractere que votre console n'a pas su transmettre : « "
                    + valeur + " »\n  Le nom serait SIGNE tel quel et resterait abime dans"
                    + " l'application.\n  Utilisez une console en UTF-8 (chcp 65001, Git Bash,"
                    + " Windows Terminal),\n  ou passez le nom sans accent.");
        }
        if (valeur.contains("Ã") || valeur.contains("Â")) {
            throw new Erreur(nom + " semble avoir ete mal encode par la console : « " + valeur + " »"
                    + "\n  (motif typique d'un UTF-8 relu en latin-1 : « LycÃ©e » au lieu de"
                    + " « Lycée »)\n  Utilisez une console en UTF-8, ou passez le nom sans accent.");
        }
    }

    static void verifieChamp(String nom, String valeur) {
        if (valeur.isBlank()) throw new Erreur(nom + " ne peut pas etre vide");
        verifieEncodage(nom, valeur);
        if (valeur.contains("=") || valeur.contains("\n") || valeur.contains("\r")) {
            throw new Erreur(nom + " ne peut contenir ni '=' ni saut de ligne : " + valeur);
        }
        if (!valeur.equals(valeur.strip())) {
            throw new Erreur(nom + " ne peut pas commencer ou finir par une espace");
        }
    }

    static String valeur(String ligne, String cle) {
        int i = ligne.indexOf('=');
        if (i < 0 || !ligne.substring(0, i).equals(cle)) {
            throw new Erreur("ligne attendue « " + cle + "=... », trouve : " + ligne);
        }
        return ligne.substring(i + 1);
    }

    static PrivateKey lireClePrivee(Path p) throws Exception {
        if (!Files.exists(p)) throw new Erreur("cle privee introuvable : " + p.toAbsolutePath());
        String pem = Files.readString(p, StandardCharsets.UTF_8)
                .replaceAll("-----[A-Z ]+-----", "").replaceAll("\\s", "");
        try {
            return KeyFactory.getInstance(ALGO)
                    .generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(pem)));
        } catch (Exception e) {
            throw new Erreur("ce fichier n'est pas une cle privee Ed25519 au format PKCS#8 : "
                    + p.toAbsolutePath());
        }
    }

    /** Accepte soit un chemin de fichier, soit la base64 collée directement. */
    static String clePubliqueDepuis(String arg) throws IOException {
        Path p = Path.of(arg);
        if (Files.exists(p)) return Files.readString(p, StandardCharsets.UTF_8).trim();
        return arg.trim();
    }

    static String pem(String type, String b64) {
        StringBuilder sb = new StringBuilder("-----BEGIN " + type + "-----\n");
        for (int i = 0; i < b64.length(); i += 64) {
            sb.append(b64, i, Math.min(i + 64, b64.length())).append('\n');
        }
        return sb.append("-----END ").append(type).append("-----\n").toString();
    }

    /** Best effort : sur NTFS il n'y a pas de permissions POSIX — on n'echoue pas pour ca. */
    static void durcirPermissions(Path p) {
        try {
            Files.setPosixFilePermissions(p,
                    java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
        } catch (Exception ignore) {
            // Windows : l'avertissement affiche suffit, c'est a l'humain de ranger la cle.
        }
    }

    static LocalDate date(String s) {
        try {
            return LocalDate.parse(s.trim());
        } catch (DateTimeParseException e) {
            throw new Erreur("date attendue au format AAAA-MM-JJ : " + s);
        }
    }

    static String exige(Map<String, String> o, String cle) {
        String v = o.get(cle);
        if (v == null || v.isBlank()) throw new Erreur("option obligatoire manquante : --" + cle);
        return v;
    }

    static Map<String, String> options(String[] args) {
        Map<String, String> o = new LinkedHashMap<>();
        for (int i = 1; i < args.length; i++) {
            if (!args[i].startsWith("--")) throw new Erreur("option inattendue : " + args[i]);
            String cle = args[i].substring(2);
            if (i + 1 >= args.length || args[i + 1].startsWith("--")) {
                throw new Erreur("l'option --" + cle + " attend une valeur");
            }
            o.put(cle, args[++i]);
        }
        return o;
    }

    static void erreur(String m) {
        System.err.println("ERREUR : " + m);
    }

    static void aide() {
        System.out.println();
        System.out.println("MAGBO Access Control - outil de licence");
        System.out.println();
        System.out.println("  java tools/licence/MagboLicence.java generer-cles [--sortie <repertoire>]");
        System.out.println("      Cree la paire Ed25519 et affiche la constante a coller dans le backend.");
        System.out.println("      A FAIRE UNE SEULE FOIS. La cle privee ne quitte jamais votre poste.");
        System.out.println();
        System.out.println("  java tools/licence/MagboLicence.java emettre");
        System.out.println("         --etablissement \"Lycee Moliere\"");
        System.out.println("         (--mois 3 | --jusqu-au 2026-11-30)");
        System.out.println("         --cle-privee <chemin/magbo-licence-privee.pem>");
        System.out.println("         [--id LM-20261130] [--emis-le AAAA-MM-JJ] [--sortie licence.magbo]");
        System.out.println("      Emet une licence signee. Sans --sortie, elle est affichee a l'ecran.");
        System.out.println();
        System.out.println("  java tools/licence/MagboLicence.java verifier");
        System.out.println("         --fichier licence.magbo");
        System.out.println("         --cle-publique <chemin/magbo-licence-publique.txt | base64>");
        System.out.println("      Relit un fichier et dit si la signature tient. A faire AVANT d'envoyer.");
        System.out.println();
    }
}
