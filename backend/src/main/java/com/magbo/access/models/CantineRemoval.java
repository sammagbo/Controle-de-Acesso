package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * RETIRADA MANUAL DE UMA LINHA DO MONITEUR CANTINE — quem tirou, e quando.
 *
 * O operador ao balcao ve uma linha em «Dans la cantine» ou «Doit sortir» que
 * ele SABE estar errada: a pessoa saiu e o leitor da saida nao a viu. Ate aqui
 * so havia o botao «Vider l'ecran», que escondia TUDO, em memoria, sem
 * registar nada e sem sobreviver a um F5.
 *
 * ⚠️ ISTO E UM GESTO DE ECRA, E CONTINUA A SER UM GESTO DE ECRA. Nada aqui
 * toca em `access_logs`: nenhuma SAIDA sintetica e gravada, a presenca do PPMS
 * NAO e fechada, e os relatorios de visita nao mudam. Foi a alternativa
 * recusada — reaproveitar o mecanismo do `FECHAMENTO_AUTO` custava zero
 * migracoes (a coluna `flag` nao tem CHECK) e teria feito o ecra de evacuacao
 * afirmar que uma crianca saiu da escola porque alguem limpou uma coluna. Numa
 * evacuacao esse ecra e aberto num patio, e a lista dele tem de continuar a
 * responder a uma pergunta so: quem pode ainda estar la dentro.
 *
 * ⚠️ E POR ISSO NAO E PROVA SOBRE UMA CRIANCA, e sim sobre um OPERADOR: diz
 * que uma pessoa carimbou uma linha como resolvida. `removido_por` e
 * `removido_em` existem para que a pergunta «porque e que esta pessoa sumiu do
 * ecra?» tenha resposta amanha. Sem eles, a retirada seria indistinguivel de
 * um defeito do sistema — e o sistema ja perdeu 95 entradas num dia sem
 * ninguem perceber.
 *
 * ⚠️ NENHUMA COLUNA DE ENUM, de proposito. `tests/migrations.test.js` exige
 * CHECK para toda coluna @Enumerated(STRING) de tabela criada por migracao, e
 * a licao da V014 e que a migracao passa a ser a AUTORA do schema naquele
 * ambiente (o `ddl-auto=update` nunca corrige um CHECK depois). Sem enum nao
 * ha CHECK a divergir entre uma VM atualizada pelo procedimento e uma VM nova
 * criada pelo Hibernate. O campo livre e `motivo`, que e texto humano.
 */
@Entity
@Table(
        name = "cantine_removals",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_cantine_removals_pessoa_ponto_dia",
                columnNames = {"user_id", "point_id", "dia"}),
        indexes = @Index(name = "idx_cantine_removals_dia", columnList = "dia")
)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CantineRemoval {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * A pessoa cuja linha foi retirada.
     *
     * ⚠️ SEM FK para `app_users`, como `access_logs`. A camera da portaria e os
     * terminais gravam por identificador, e um cadastro apagado nao pode fazer
     * falhar o INSERT de um registo operacional.
     */
    @Column(name = "user_id", nullable = false, length = 64)
    private String userId;

    /**
     * O PONTO da linha retirada — e a metade da chave que impede um operador de
     * um sitio de apagar a linha de outro.
     *
     * O Moniteur Cantine mostra REFEI1, REFEI2 e CANTINA1 na mesma tela, e a
     * mesma pessoa pode ter linha em mais do que um. Retirar «a pessoa» em vez
     * de «a linha» esconderia a passagem que ninguem pediu para esconder.
     */
    @Column(name = "point_id", nullable = false, length = 32)
    private String pointId;

    /**
     * O dia a que a retirada se aplica.
     *
     * O monitor reinicia a meia-noite (o piso do dia, no cliente), entao uma
     * retirada nunca deve atravessar o dia: amanha as linhas sao outras. E o
     * unico jeito de a tabela nao crescer para sempre em significado — sem o
     * `dia`, uma retirada de setembro continuaria a esconder alguem em junho.
     */
    @Column(name = "dia", nullable = false)
    private LocalDate dia;

    /**
     * O INSTANTE da retirada — e ele nao e decoracao, e a regra.
     *
     * ⚠️ A retirada esconde A LINHA COMO ELA ESTAVA, nunca A PESSOA PELO DIA.
     * So sao escondidas as passagens ANTERIORES a este instante: se a pessoa
     * voltar a entrar as 13h depois de ter sido retirada as 12h30, a entrada
     * nova reaparece. Uma retirada que calasse tambem o que ainda nao
     * aconteceu transformaria um gesto de limpeza numa ordem para o ecra mentir
     * pelo resto do dia — e o operador que carregou no × as 12h30 nao sabia
     * nada sobre as 13h.
     */
    @Column(name = "removido_em", nullable = false)
    private LocalDateTime removidoEm;

    /** Username de quem retirou (SystemUser.username, teto igual ao de la). */
    @Column(name = "removido_por", nullable = false, length = 50)
    private String removidoPor;

    /** Texto livre e opcional. Nao ha lista de motivos: nao se conhece ainda. */
    @Column(name = "motivo", length = 255)
    private String motivo;

    /**
     * Desfazer e SOFT, como toda revogacao neste projeto.
     *
     * ⚠️ Existe porque sem ele um clique errado esconde uma pessoa ate a
     * meia-noite, num ecra cuja unica funcao e dizer quem ainda esta no
     * refeitorio. A confirmacao protege do clique distraido; isto protege do
     * clique confirmado por engano.
     *
     * A linha NAO e apagada ao desfazer, e uma retirada nova sobre a mesma
     * pessoa/ponto/dia REUTILIZA esta linha (a UNIQUE garante uma so). O que
     * se perde e o historico de varios «retirar/desfazer» seguidos no mesmo
     * dia — aceite de propósito: isto e um gesto de ecra, e uma tabela de
     * eventos para registar hesitacao ao balcao seria pesar o sistema com
     * informacao que ninguem vai ler.
     */
    @Column(name = "desfeito_em")
    private LocalDateTime desfeitoEm;

    @Column(name = "desfeito_por", length = 50)
    private String desfeitoPor;

    /** Uma retirada so conta enquanto nao for desfeita. */
    @Transient
    public boolean isAtiva() {
        return desfeitoEm == null;
    }
}
