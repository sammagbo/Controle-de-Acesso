package com.magbo.access.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final LicenceGate licenceGate;

    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/api/**")
                        .allowedOrigins("*")
                        .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                        .allowedHeaders("*");
            }
        };
    }

    /**
     * La grille de licence, posée sur tout {@code /api/**}.
     *
     * ⚠️ ELLE PASSE APRÈS L'AUTHENTIFICATION : les filtres de Spring Security
     * s'exécutent avant le DispatcherServlet, donc une requête sans jeton reçoit
     * son 401/403 et n'arrive jamais ici. Une licence expirée ne peut donc pas
     * transformer un problème d'authentification en message commercial trompeur.
     *
     * ⚠️ MAIS ELLE PASSE AVANT L'AUTORISATION DE MÉTHODE. {@code @PreAuthorize}
     * est appliqué à l'invocation du proxy, donc APRÈS {@code preHandle} — une
     * version antérieure de ce commentaire disait « après la sécurité » tout
     * court, et c'était faux (panel de revue — sécurité, 31/08/2026).
     * Conséquence assumée : un OPERATOR sans {@code CONFIG_WRITE} qui appelle
     * {@code /api/admin/settings} sous licence expirée reçoit 402 (« renouvelez »)
     * au lieu de 403 (« vous n'avez pas le droit »). Aucune donnée n'est
     * exposée — la grille ne peut qu'AJOUTER un refus — mais le message n'est
     * pas celui de son vrai problème. Inverser l'ordre demanderait de faire
     * l'autorisation dans l'intercepteur, c'est-à-dire de dupliquer
     * {@code AreaSecurity} : le remède serait pire.
     *
     * ⚠️ L'inventaire de ce qui se ferme vit dans
     * {@link com.magbo.access.services.licence.LicencePortee}, PAS ici : ce
     * fichier ne sait que « poser la grille sur les routes de l'API ».
     */
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(licenceGate).addPathPatterns("/api/**");
    }
}
