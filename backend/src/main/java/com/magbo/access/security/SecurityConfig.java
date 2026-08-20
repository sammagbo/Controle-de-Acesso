package com.magbo.access.security;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthFilter;
    private final UserDetailsService userDetailsService;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(
                    "/api/auth/login",
                    // "Esqueci a senha": quem pede é quem NÃO consegue entrar.
                    // O controller responde genérico sempre, deduplica e tem
                    // teto de pendentes — ver PasswordResetRequestController.
                    "/api/auth/password-reset-request",
                    "/api/health",
                    "/api/hikvision/webhook",
                    "/api/hikvision/webhook/capture",
                    // Token no caminho, para a camera DeepinView que descarta a
                    // query string. O guard do proprio controller valida o token.
                    "/api/hikvision/webhook/t/**",
                    "/h2-console/**",
                    // ⚠️ /error PRECISA ESTAR AQUI, e a ausencia dele mentia para
                    // o operador. Quando um controller falha, o Spring ENCAMINHA
                    // internamente para /error; com a rota autenticada, essa
                    // segunda passagem pela seguranca vira 403 de CORPO VAZIO — e
                    // o status e a mensagem reais nunca chegam ao front.
                    //
                    // Dois casos medidos em 20-21/08/2026, ambos com token valido:
                    //   • 500 do PostgreSQL em /api/access/overview  -> front via 403
                    //   • 400 "Cannot deserialize LocalDate" no bulk -> front via 403
                    //
                    // O segundo era o pior: o front trata 403 como sessao expirada,
                    // entao a importacao de direitos de refeicao falhava dizendo
                    // "Session expirée. Reconnectez-vous." — a pessoa reconectava e
                    // falhava de novo, sem nunca ver qual linha da planilha estava
                    // errada. Um erro que MENTE sobre a sua causa custa mais que o
                    // erro.
                    //
                    // ⚠️ Nao abre nada: /error so devolve o erro da requisicao que
                    // ja aconteceu, e nenhum dado protegido passa por ele. O que
                    // ele publica e o motivo da falha, que e exatamente o que o
                    // operador precisa ler.
                    "/error"
                ).permitAll()
                .anyRequest().authenticated()
            )
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authenticationProvider(authenticationProvider())
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
            .headers(h -> h.frameOptions(f -> f.disable())); // p/ H2 console

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(List.of("*"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    @Bean
    public AuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder());
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
