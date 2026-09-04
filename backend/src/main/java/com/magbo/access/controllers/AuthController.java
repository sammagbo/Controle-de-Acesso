package com.magbo.access.controllers;

import com.magbo.access.dto.auth.LoginRequest;
import com.magbo.access.dto.auth.LoginResponse;
import com.magbo.access.models.SystemUser;
import com.magbo.access.repositories.SystemUserRepository;
import com.magbo.access.security.JwtService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    private final AuthenticationManager authManager;
    private final SystemUserRepository userRepo;
    private final JwtService jwtService;

    @Value("${magbo.jwt.expiration-ms:28800000}")
    private long expirationMs;

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest req) {
        try {
            authManager.authenticate(
                    new UsernamePasswordAuthenticationToken(req.getUsername(), req.getPassword())
            );
        } catch (Exception e) {
            // ⚠️ LE JOURNAL DIT POURQUOI ; LA RÉPONSE, JAMAIS. Voir
            // RaisonEchecLogin : trois causes distinctes arrivaient ici avec le
            // même visage, parce que Spring aplatit UsernameNotFoundException en
            // BadCredentialsException avant le contrôleur. Sans cette ligne, un
            // compte désactivé et un mot de passe faux sont indiscernables — y
            // compris pour l'exploitant, y compris dans les journaux. C'est ce
            // qui a coûté la nuit du 3 au 4 septembre 2026.
            log.warn("Tentativa de login inválida: username={} raison={} excecao={}",
                    pourLeJournal(req.getUsername()), diagnostiquer(req.getUsername()),
                    e.getClass().getSimpleName());

            Map<String, String> error = new HashMap<>();
            error.put("error", "Credenciais inválidas");
            return ResponseEntity.status(401).body(error);
        }

        SystemUser user = userRepo.findByUsernameFlexivel(req.getUsername()).orElseThrow();
        user.setLastLogin(LocalDateTime.now());
        userRepo.save(user);

        String token = jwtService.generateToken(user);
        log.info("Login bem-sucedido: {} ({})", user.getUsername(), user.getRole());

        return ResponseEntity.ok(LoginResponse.builder()
                .token(token)
                .username(user.getUsername())
                .nomeCompleto(user.getNomeCompleto())
                .role(user.getRole().name())
                .setoresPermitidos(user.getSetoresPermitidos())
                .permissoes(user.getPermissoes())
                .expiresInMs(expirationMs)
                .build());
    }

    /**
     * POURQUOI cette connexion a échoué — et la garantie que le fait de le
     * demander ne puisse jamais changer la réponse.
     *
     * <p>⚠️ CE {@code try} INTERNE N'EST PAS DE LA PRUDENCE DÉCORATIVE.
     * Classer, c'est interroger la base ; on est déjà dans le {@code catch}, et
     * si la panne EST la base, cette interrogation relève à son tour. Rien ne
     * la rattraperait : ce projet n'a aucun {@code @ControllerAdvice}
     * (vérifié). La réponse cesserait d'être le 401 uniforme que
     * {@code LoginReponseUniformeIT} garde et deviendrait un 500 — et un 500
     * pour certains noms seulement, ce qui rendrait justement l'oracle
     * d'existence de compte que tout le reste du chantier interdit.
     *
     * <p>⚠️ ET LE JOURNAL S'ÉCRIT QUAND MÊME. Une panne de base est
     * précisément le moment où quelqu'un lit les journaux : rendre
     * {@code INDETERMINABLE} plutôt que rien, c'est la différence entre
     * « le diagnostic n'a pas pu aboutir » et le silence d'avant ce chantier.
     *
     * <p>⚠️ LES DEUX APPELS AU DÉPÔT SONT VOLONTAIRES, et non une requête à
     * économiser : l'arbitrage « exact &gt; un seul insensible à la casse &gt;
     * refus » est une règle de SÉCURITÉ, et elle vit à UN seul endroit,
     * {@code findByUsernameFlexivel}. La recopier ici pour épargner un SELECT
     * créerait une seconde source de vérité sur qui a le droit d'entrer.
     */
    private String diagnostiquer(String username) {
        try {
            RaisonEchecLogin raison = RaisonEchecLogin.classer(
                    userRepo.findByUsernameFlexivel(username),
                    userRepo.findAllByUsernameIgnoreCase(
                            username == null ? "" : username.trim()).size());
            return raison.name() + " (" + raison.explication() + ")";
        } catch (Exception diagnostic) {
            return RaisonEchecLogin.INDETERMINABLE.name()
                    + " (" + RaisonEchecLogin.INDETERMINABLE.explication()
                    + " : " + diagnostic.getClass().getSimpleName() + ")";
        }
    }

    /**
     * Le nom d'utilisateur tel qu'il a le droit d'entrer dans une ligne de
     * journal.
     *
     * <p>⚠️ IL VIENT DE L'APPELANT, ET LE JOURNAL EST DÉSORMAIS L'INSTRUMENT
     * DE DIAGNOSTIC. Un nom qui contient un saut de ligne y écrit une SECONDE
     * ligne, qu'on peut faire ressembler trait pour trait à une vraie —
     * {@code raison=COMPTE_DESACTIVE} sur le compte de quelqu'un d'autre, par
     * exemple. Qui lit le journal le lendemain matin n'a aucun moyen de
     * distinguer la ligne forgée de celle qu'a écrite ce contrôleur : le
     * chantier livrerait un instrument que son propre appelant peut truquer.
     *
     * <p>On neutralise donc les caractères de contrôle et on borne la longueur.
     * {@code SystemUser.username} fait au plus 50 caractères : au-delà de 64,
     * aucun compte réel n'est en jeu. La troncature est ANNONCÉE — un nom
     * coupé en silence enverrait chercher un compte que personne n'a tapé.
     *
     * <p>Pas de {@code replaceAll} ici : une expression régulière écrite dans
     * un littéral Java, c'est un antislash de plus ou de moins, et ce projet a
     * déjà payé ce prix (voir 4146dd5). {@code isISOControl} dit la même
     * chose sans rien à échapper.
     */
    private static String pourLeJournal(String username) {
        if (username == null) return "(null)";
        StringBuilder propre = new StringBuilder(username.length());
        for (char c : username.toCharArray()) {
            propre.append(Character.isISOControl(c) ? '?' : c);
        }
        if (propre.length() > 64) {
            return propre.substring(0, 64) + "[tronque]";
        }
        return propre.toString();
    }

    @GetMapping("/me")
    public ResponseEntity<?> me() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return ResponseEntity.status(401).build();
        }
        SystemUser user = userRepo.findByUsername(auth.getName()).orElseThrow();
        return ResponseEntity.ok(Map.of(
                "username", user.getUsername(),
                "nomeCompleto", user.getNomeCompleto(),
                "role", user.getRole().name(),
                "setoresPermitidos", user.getSetoresPermitidos() != null ? user.getSetoresPermitidos() : "",
                "permissoes", user.getPermissoes() != null ? user.getPermissoes() : ""
        ));
    }
}
