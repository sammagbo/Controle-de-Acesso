package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * PEDIDO DE REDEFINIÇÃO DE SENHA — o "esqueci a senha" de um sistema OFFLINE.
 *
 * Não há e-mail: o sistema roda na rede interna da escola. O fluxo é humano —
 * o operador registra o pedido na tela de login, o ADMIN o vê na área
 * administrativa, redefine a senha pela gestão de operadores que já existe e
 * marca o pedido como tratado. Esta tabela é o bilhete entre os dois.
 *
 * ⚠️ O username é O QUE FOI DIGITADO, não uma FK: o pedido nasce de quem NÃO
 * conseguiu entrar — inclusive com o nome escrito errado, e esse erro é
 * informação útil para o admin ("três pedidos de 'viescolar' = alguém não
 * sabe o nome da conta"). Validar contra system_users aqui destruiria
 * justamente esses casos, e um endpoint sem autenticação que responde
 * diferente para username existente/inexistente entregaria a lista de contas
 * a quem perguntasse.
 */
@Entity
@Table(name = "password_reset_requests")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PasswordResetRequest {

    public enum Status { PENDING, HANDLED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Como foi digitado (trim aplicado). Mesmo teto do username real (50). */
    @Column(nullable = false, length = 50)
    private String username;

    @Column(name = "requested_at", nullable = false)
    private LocalDateTime requestedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status;

    /** Quem tratou (username do admin), preenchido ao marcar HANDLED. */
    @Column(name = "handled_by", length = 50)
    private String handledBy;

    @Column(name = "handled_at")
    private LocalDateTime handledAt;
}
